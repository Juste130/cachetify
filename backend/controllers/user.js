const prisma = require('../models/prisma');
const walletService = require('../services/wallet');
const emailService = require('../services/email');
const logger = require('../utils/logger');
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Get current user profile
 */
exports.getProfile = async (req, res, next) => {
    try {
        const userId = req.user.userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallet: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Remove sensitive data
        const { passwordHash, ...userProfile } = user;

        res.json({ user: userProfile });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const { profileData } = req.body;

        // `data: { profileData }` alone would REPLACE the whole JSON column, not patch it —
        // today profileData only ever holds `name`, so it happens to be harmless, but the
        // settings form only ever sends `{ name }`. The moment any other field is added to
        // this JSON blob (avatar, locale, preferences...), saving your name here would
        // silently wipe it. Merging on top of the existing value is what "update the
        // profile" is actually supposed to mean.
        const existing = await prisma.user.findUnique({ where: { id: userId }, select: { profileData: true } });
        const mergedProfileData = { ...(existing?.profileData || {}), ...(profileData || {}) };

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { profileData: mergedProfileData },
        });

        const { passwordHash, ...userProfile } = updatedUser;

        res.json({
            message: 'Profile updated successfully',
            user: userProfile,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get user wallet
 */
exports.getWallet = async (req, res, next) => {
    try {
        const userId = req.user.userId;

        const wallet = await walletService.getUserWallet(userId);

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Get balance
        const balance = await walletService.getWalletBalance(wallet.publicAddress);

        res.json({
            wallet: {
                address: wallet.publicAddress,
                balance,
                isAdminWallet: wallet.isAdminWallet,
                createdAt: wallet.createdAt,
                fundedAt: wallet.fundedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all users (admin only)
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, role, search, kycStatus } = req.query;

        const where = {};
        if (role) where.role = role;
        if (kycStatus) where.kycStatus = kycStatus;
        if (search) {
            where.email = { contains: search, mode: 'insensitive' };
        }

        const users = await prisma.user.findMany({
            where,
            skip: (parseInt(page) - 1) * parseInt(limit),
            take: parseInt(limit),
            include: {
                wallet: true,
                _count: {
                    select: { contracts: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const total = await prisma.user.count({ where });

        // Remove sensitive data
        const sanitizedUsers = users.map(({ passwordHash, ...user }) => user);

        res.json({
            users: sanitizedUsers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
};

// Shared by role-downgrade and suspension: an ADMIN account being demoted or deactivated
// must never be the last active admin left, or the platform becomes permanently
// unmanageable (no one left who can promote anyone back, reactivate an account, or use
// the emergency pause). `excludeUserId` is the account being acted on, already excluded
// from its own count.
async function assertNotLastActiveAdmin(targetUser, excludeUserId) {
    if (targetUser?.role !== 'ADMIN' || !targetUser.isActive) return;
    const remainingAdmins = await prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: excludeUserId } },
    });
    if (remainingAdmins === 0) {
        throw new ConflictError("Impossible d'agir sur le dernier administrateur actif de la plateforme");
    }
}

/**
 * Platform-wide user counts for the admin dashboard stat cards — exact totals, never
 * truncated by the paginated list below.
 */
exports.getUsersSummary = async (req, res, next) => {
    try {
        const [total, active, admins] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isActive: true } }),
            prisma.user.count({ where: { role: 'ADMIN' } }),
        ]);
        res.json({ total, active, suspended: total - active, admins });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user role (admin only)
 */
exports.updateUserRole = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        if (!['ADMIN', 'USER', 'VIEWER'].includes(role)) {
            throw new BadRequestError('Invalid role');
        }

        // No self-service role changes: an admin (or anyone) editing their own privilege
        // level is a classic privilege-escalation/self-lockout footgun — require a
        // different admin to make the change instead. This also makes the "last admin"
        // guard below irrelevant to reason about for the self case: it can never be
        // reached with userId === req.user.userId in the first place.
        if (userId === req.user.userId) {
            throw new ForbiddenError('Vous ne pouvez pas modifier votre propre rôle — demandez à un autre administrateur');
        }

        if (role !== 'ADMIN') {
            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            await assertNotLastActiveAdmin(targetUser, userId);
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role },
        });

        const { passwordHash, ...userProfile } = updatedUser;

        res.json({
            message: 'User role updated successfully',
            user: userProfile,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Deactivate ("suspend") a user (admin only). Access is cut immediately: `authenticate`
 * and the refresh-token flow both re-check `isActive` on every request, so this isn't
 * just a cosmetic flag — the account genuinely loses access right away.
 */
exports.deactivateUser = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (userId === req.user.userId) {
            throw new ForbiddenError('Vous ne pouvez pas suspendre votre propre compte');
        }

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) {
            throw new NotFoundError('Utilisateur introuvable');
        }
        await assertNotLastActiveAdmin(targetUser, userId);

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { isActive: false },
        });

        const { passwordHash, ...userProfile } = updatedUser;

        res.json({
            message: 'User deactivated successfully',
            user: userProfile,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Reactivate a previously suspended user (admin only).
 */
exports.activateUser = async (req, res, next) => {
    try {
        const { userId } = req.params;

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) {
            throw new NotFoundError('Utilisateur introuvable');
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { isActive: true },
        });

        const { passwordHash, ...userProfile } = updatedUser;

        res.json({
            message: 'User activated successfully',
            user: userProfile,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Invite someone who doesn't have a Cachetify account yet, by email. Available to any
 * authenticated user (not just admins) — from the dashboard, to invite a future
 * counterparty, or from the admin users panel. Privy handles the actual signup; this just
 * sends the email and keeps a lightweight record to throttle repeat invites.
 */
exports.inviteUser = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new BadRequestError('Adresse email invalide');
        }
        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            throw new ConflictError('Cette personne a déjà un compte Cachetify');
        }

        // Throttle: at most one invitation to a given address every 24h, regardless of
        // who sends it — prevents this becoming a spam vector against a third party's inbox.
        const recentInvite = await prisma.invitation.findFirst({
            where: { email: normalizedEmail, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (recentInvite) {
            throw new ConflictError('Une invitation a déjà été envoyée à cette adresse dans les dernières 24h');
        }

        const inviter = await prisma.user.findUnique({ where: { id: req.user.userId } });
        const inviterName = inviter?.profileData?.name || inviter?.email || 'Un utilisateur Cachetify';

        await emailService.sendInvitationEmail(normalizedEmail, inviterName);
        await prisma.invitation.create({ data: { email: normalizedEmail, invitedById: req.user.userId } });

        res.json({ message: 'Invitation envoyée avec succès' });
    } catch (error) {
        next(error);
    }
};
