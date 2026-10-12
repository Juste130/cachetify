const prisma = require('../db');
const walletService = require('../services/wallet');
const emailService = require('../services/email');
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../utils/errors');

/** Get current user profile */
async function getProfile(user) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, include: { wallet: true } });
    if (!dbUser) throw new NotFoundError('User not found');
    const { passwordHash, ...userProfile } = dbUser;
    return { user: userProfile };
}

/** Update user profile */
async function updateProfile(user, body) {
    const { profileData } = body;

    // `data: { profileData }` alone would REPLACE the whole JSON column, not patch it — see
    // original comment: merging on top of the existing value is what "update the profile"
    // is actually supposed to mean.
    const existing = await prisma.user.findUnique({ where: { id: user.userId }, select: { profileData: true } });
    const mergedProfileData = { ...(existing?.profileData || {}), ...(profileData || {}) };

    const updatedUser = await prisma.user.update({ where: { id: user.userId }, data: { profileData: mergedProfileData } });
    const { passwordHash, ...userProfile } = updatedUser;
    return { message: 'Profile updated successfully', user: userProfile };
}

/** Get user wallet */
async function getWallet(user) {
    const wallet = await walletService.getUserWallet(user.userId);
    if (!wallet) throw new NotFoundError('Wallet not found');
    const balance = await walletService.getWalletBalance(wallet.publicAddress);
    return {
        wallet: {
            address: wallet.publicAddress,
            balance,
            isAdminWallet: wallet.isAdminWallet,
            createdAt: wallet.createdAt,
            fundedAt: wallet.fundedAt,
        },
    };
}

/** Get all users (admin only) */
async function getAllUsers(query) {
    const page = parseInt(query.get('page') || '1', 10);
    const limit = parseInt(query.get('limit') || '20', 10);
    const role = query.get('role');
    const search = query.get('search');
    const kycStatus = query.get('kycStatus');

    const where = {};
    if (role) where.role = role;
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) where.email = { contains: search, mode: 'insensitive' };

    const users = await prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { wallet: true, _count: { select: { contracts: true } } },
        orderBy: { createdAt: 'desc' },
    });
    const total = await prisma.user.count({ where });
    const sanitizedUsers = users.map(({ passwordHash, ...u }) => u);

    return { users: sanitizedUsers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

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

/** Platform-wide user counts for the admin dashboard stat cards — exact totals, never
 *  truncated by the paginated list above. */
async function getUsersSummary() {
    const [total, active, admins] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
    ]);
    return { total, active, suspended: total - active, admins };
}

/** Update user role (admin only) */
async function updateUserRole(user, userId, body) {
    const { role } = body;
    if (!['ADMIN', 'USER', 'VIEWER'].includes(role)) throw new BadRequestError('Invalid role');

    // No self-service role changes: an admin (or anyone) editing their own privilege level
    // is a classic privilege-escalation/self-lockout footgun — require a different admin to
    // make the change instead.
    if (userId === user.userId) {
        throw new ForbiddenError('Vous ne pouvez pas modifier votre propre rôle — demandez à un autre administrateur');
    }

    if (role !== 'ADMIN') {
        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        await assertNotLastActiveAdmin(targetUser, userId);
    }

    const updatedUser = await prisma.user.update({ where: { id: userId }, data: { role } });
    const { passwordHash, ...userProfile } = updatedUser;
    return { message: 'User role updated successfully', user: userProfile };
}

/** Deactivate ("suspend") a user (admin only). Access is cut immediately: authenticate()
 *  and the refresh-token flow both re-check isActive on every request, so this isn't just
 *  a cosmetic flag — the account genuinely loses access right away. */
async function deactivateUser(user, userId) {
    if (userId === user.userId) throw new ForbiddenError('Vous ne pouvez pas suspendre votre propre compte');

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundError('Utilisateur introuvable');
    await assertNotLastActiveAdmin(targetUser, userId);

    const updatedUser = await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    const { passwordHash, ...userProfile } = updatedUser;
    return { message: 'User deactivated successfully', user: userProfile };
}

/** Reactivate a previously suspended user (admin only). */
async function activateUser(userId) {
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundError('Utilisateur introuvable');

    const updatedUser = await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    const { passwordHash, ...userProfile } = updatedUser;
    return { message: 'User activated successfully', user: userProfile };
}

/** Invite someone who doesn't have a Cachetify account yet, by email. Available to any
 *  authenticated user (not just admins). Privy handles the actual signup; this just sends
 *  the email and keeps a lightweight record to throttle repeat invites. */
async function inviteUser(user, body) {
    const { email } = body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestError('Adresse email invalide');
    }
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) throw new ConflictError('Cette personne a déjà un compte Cachetify');

    // Throttle: at most one invitation to a given address every 24h, regardless of who
    // sends it — prevents this becoming a spam vector against a third party's inbox.
    const recentInvite = await prisma.invitation.findFirst({
        where: { email: normalizedEmail, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recentInvite) throw new ConflictError('Une invitation a déjà été envoyée à cette adresse dans les dernières 24h');

    const inviter = await prisma.user.findUnique({ where: { id: user.userId } });
    const inviterName = inviter?.profileData?.name || inviter?.email || 'Un utilisateur Cachetify';

    await emailService.sendInvitationEmail(normalizedEmail, inviterName);
    await prisma.invitation.create({ data: { email: normalizedEmail, invitedById: user.userId } });

    return { message: 'Invitation envoyée avec succès' };
}

module.exports = {
    getProfile, updateProfile, getWallet, getAllUsers, getUsersSummary,
    updateUserRole, deactivateUser, activateUser, inviteUser,
};
