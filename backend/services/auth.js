const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../models/prisma');
const emailService = require('./email');
const notificationService = require('./notification');
const logger = require('../utils/logger');
const { config } = require('../config');
const { UserRole } = require('@prisma/client');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

/**
 * Vérifie si un email fait partie de la whitelist des administrateurs.
 * La liste est définie dans la variable d'env ADMIN_EMAILS (séparées par des virgules).
 * Exemple : ADMIN_EMAILS=admin@cachetify.io,cto@cachetify.io
 * @param {string} email
 * @returns {boolean}
 */
function isAdminEmail(email) {
    const adminEmails = process.env.ADMIN_EMAILS || '';
    if (!adminEmails.trim()) return false;
    const list = adminEmails.split(',').map((e) => e.trim().toLowerCase());
    return list.includes(email.toLowerCase());
}

class AuthService {
    // NOTE: les anciens flux register/login/googleAuth (email+mot de passe et Google OAuth
    // maison) ont été retirés — Privy gère désormais entièrement l'authentification, la
    // création de wallet et le financement MATIC. Seul `privyAuth` reste le point d'entrée.

    async privyAuth(privyId, email, walletAddress, profileData, requestMeta = {}) {
        try {
            // Déterminer si cet email est dans la whitelist admin (variable serveur uniquement)
            const shouldBeAdmin = isAdminEmail(email);

            let user = await prisma.user.findUnique({ where: { privyId } });

            if (!user) {
                // Check if user exists by email
                const existingUser = await prisma.user.findUnique({ where: { email } });
                
                if (existingUser) {
                    // Link Privy to existing user and promote to ADMIN if applicable
                    const updateData = { privyId, profileData };
                    if (shouldBeAdmin && existingUser.role !== UserRole.ADMIN) {
                        updateData.role = UserRole.ADMIN;
                        logger.info(`[Auth] Auto-promotion ADMIN pour email whitelist: ${email}`);
                    }

                    user = await prisma.user.update({
                        where: { id: existingUser.id },
                        data: updateData,
                    });

                    // Si l'utilisateur existant n'a pas de wallet et que Privy en fournit un, l'associer
                    if (walletAddress) {
                        const existingWallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
                        if (!existingWallet) {
                            await prisma.userWallet.create({
                                data: {
                                    userId: user.id,
                                    publicAddress: walletAddress,
                                    encryptedPrivateKey: null,
                                    encryptionIv: null,
                                    encryptionAuthTag: null,
                                    encryptionSalt: null,
                                    isAdminWallet: shouldBeAdmin,
                                },
                            });
                        }
                    }
                } else {
                    // Créer un nouvel utilisateur avec Privy
                    const assignedRole = shouldBeAdmin ? UserRole.ADMIN : UserRole.USER;

                    try {
                        const created = await prisma.$transaction(async (tx) => {
                            const u = await tx.user.create({
                                data: {
                                    email,
                                    privyId,
                                    role: assignedRole,
                                    profileData,
                                },
                            });

                            if (walletAddress) {
                                await tx.userWallet.create({
                                    data: {
                                        userId: u.id,
                                        publicAddress: walletAddress,
                                        encryptedPrivateKey: null,
                                        encryptionIv: null,
                                        encryptionAuthTag: null,
                                        encryptionSalt: null,
                                        isAdminWallet: shouldBeAdmin,
                                    },
                                });
                            }

                            return u;
                        });

                        user = created;

                        if (shouldBeAdmin) {
                            logger.info(`[Auth] Nouveau compte ADMIN créé via Privy: ${email}`);
                        } else {
                            await emailService.sendWelcomeEmail(email, profileData?.name || email.split('@')[0]);
                        }
                    } catch (createError) {
                        // P2002 = violation de contrainte unique sur `email` — deux requêtes
                        // concurrentes pour le même nouvel utilisateur (deux onglets, un double
                        // appel client) ont toutes les deux passé le `findUnique` ci-dessus avant
                        // que l'une des deux ne crée la ligne. Plutôt que de faire échouer cette
                        // connexion, on récupère l'utilisateur que l'autre requête vient de créer.
                        if (createError.code === 'P2002') {
                            const raceWinner = await prisma.user.findUnique({ where: { email } });
                            if (!raceWinner) throw createError;
                            user = raceWinner;
                        } else {
                            throw createError;
                        }
                    }
                }
            } else {
                // Utilisateur existant — resync wallet + promotion admin si nécessaire
                const updateData = {};

                if (shouldBeAdmin && user.role !== UserRole.ADMIN) {
                    updateData.role = UserRole.ADMIN;
                    logger.info(`[Auth] Re-promotion ADMIN (connexion Privy) pour: ${email}`);
                }

                if (walletAddress) {
                    const existingWallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
                    
                    if (!existingWallet) {
                        // Créer le wallet pour un utilisateur existant qui n'en avait pas
                        await prisma.userWallet.create({
                            data: {
                                userId: user.id,
                                publicAddress: walletAddress,
                                encryptedPrivateKey: null,
                                encryptionIv: null,
                                encryptionAuthTag: null,
                                encryptionSalt: null,
                                isAdminWallet: shouldBeAdmin,
                            },
                        });
                        logger.info(`[Auth] Nouveau wallet Privy assigné à l'utilisateur existant: ${email}`);
                    } else if (existingWallet.publicAddress !== walletAddress && !existingWallet.encryptedPrivateKey) {
                        // Mettre à jour l'adresse si elle a changé et que ce n'est pas un wallet auto-géré avec clé privée
                        await prisma.userWallet.update({
                            where: { userId: user.id },
                            data: { publicAddress: walletAddress },
                        });
                        logger.info(`[Auth] Adresse wallet mise à jour pour: ${email}`);
                    }
                }

                if (Object.keys(updateData).length > 0) {
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: updateData,
                    });
                }
            }

            if (walletAddress) {
                await this.resolvePendingDrafts(email, walletAddress);
            }

            const token = this.generateToken(user.id, user.email, user.role);
            const refreshToken = this.generateRefreshToken(user.id);

            await this.saveRefreshToken(user.id, refreshToken, requestMeta);

            logger.info(`User authenticated via Privy: ${email} [role=${user.role}]`);

            return {
                user: this.sanitizeUser(user),
                token,
                refreshToken,
            };
        } catch (error) {
            logger.error('Error with Privy auth:', error);
            throw error;
        }
    }

    /**
     * Résout les signataires en attente dans les contrats DRAFT.
     * Appelé dès qu'on a la certitude qu'un email est associé à un wallet.
     */
    async resolvePendingDrafts(email, walletAddress) {
        try {
            // 1. Trouver les signataires en attente pour cet email
            const pendingSignatories = await prisma.contractSignatory.findMany({
                where: {
                    email: email,
                    isRegistered: false
                }
            });

            if (pendingSignatories.length === 0) return;

            logger.info(`[Drafts] Résolution de ${pendingSignatories.length} invitations pour l'email: ${email}`);

            // 2. Mettre à jour ces signataires
            await prisma.contractSignatory.updateMany({
                where: { email: email, isRegistered: false },
                data: { isRegistered: true, walletAddress }
            });

            // 3. Vérifier chaque contrat concerné
            const draftIds = [...new Set(pendingSignatories.map(s => s.contractCacheId))];
            
            for (const draftId of draftIds) {
                // Vérifier s'il reste des signataires non inscrits sur ce contrat
                const pendingCount = await prisma.contractSignatory.count({
                    where: { contractCacheId: draftId, isRegistered: false }
                });

                if (pendingCount === 0) {
                    // Tous les signataires ont un wallet ! Le contrat est prêt.
                    const draft = await prisma.contractCache.update({
                        where: { id: draftId },
                        data: { status: 'READY_TO_DEPLOY' },
                        include: { user: { select: { id: true, email: true } } },
                    });
                    logger.info(`[Drafts] Le brouillon ${draftId} est maintenant READY_TO_DEPLOY !`);

                    // Without this, the creator has no way to know it's their turn to deploy —
                    // they'd have to remember to come back and check the contract page themselves.
                    if (draft.user) {
                        await notificationService.create(draft.user.id, {
                            type: 'CONTRACT_READY_TO_DEPLOY',
                            title: 'Contrat prêt à être déployé',
                            message: `Tous les signataires de "${draft.title}" ont désormais un compte. Vous pouvez déployer le contrat sur la blockchain.`,
                            contractCacheId: draft.id,
                        });
                        if (draft.user.email) {
                            emailService.sendGenericNotification(
                                draft.user.email,
                                'Contrat prêt à être déployé',
                                `Tous les signataires de "${draft.title}" ont désormais un compte sur Cachetify. Vous pouvez déployer le contrat sur la blockchain pour lancer les signatures.`,
                                draft.id
                            ).catch(err => logger.error(`[Email] Failed to send ready-to-deploy notice for draft ${draftId}:`, err));
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Error resolving pending drafts:', error);
        }
    }

    async refreshAccessToken(refreshToken, requestMeta = {}) {
        try {
            const payload = jwt.verify(refreshToken, config.jwt.refreshSecret);

            const tokenHash = this.hashToken(refreshToken);
            const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

            if (!stored || stored.revoked) {
                throw new UnauthorizedError('Refresh token revoked or not found');
            }

            if (new Date(stored.expiresAt) <= new Date()) {
                throw new UnauthorizedError('Refresh token expired');
            }

            const user = await prisma.user.findUnique({ where: { id: payload.userId } });
            if (!user) {
                throw new UnauthorizedError('User not found');
            }

            // A suspended account must not be able to mint a fresh access token just
            // because its refresh token is still technically valid — otherwise
            // "Suspendre" only ever slows a user down until their next refresh, never
            // actually stops them. Revoke the refresh token too, so this isn't a one-time
            // check they can simply retry past.
            if (!user.isActive) {
                await prisma.refreshToken.update({ where: { tokenHash }, data: { revoked: true } });
                throw new ForbiddenError('Ce compte a été suspendu');
            }

            // Rotation: create new refresh token, persist it, revoke old one
            const newRefreshToken = this.generateRefreshToken(user.id);
            const saved = await this.saveRefreshToken(user.id, newRefreshToken, requestMeta);

            await prisma.refreshToken.update({
                where: { tokenHash },
                data: { revoked: true, replacedBy: saved.id },
            });

            const token = this.generateToken(user.id, user.email, user.role);

            return { token, refreshToken: newRefreshToken };
        } catch (error) {
            logger.error('Error refreshing token:', error);
            // Preserve a typed error thrown above (e.g. UnauthorizedError, ForbiddenError)
            // instead of stomping it into a generic one — only wrap truly unexpected
            // failures (jwt.verify throwing its own error, a DB error) into the same 401,
            // since either way the client's refresh token isn't usable.
            if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw error;
            throw new UnauthorizedError('Invalid refresh token');
        }
    }

    // Hash the refresh token for storage (one-way)
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // Persist a refresh token in DB (stores hash and expiry)
    async saveRefreshToken(userId, refreshToken, meta = {}) {
        try {
            const decoded = jwt.decode(refreshToken);
            const expiresAt = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const tokenHash = this.hashToken(refreshToken);

            const created = await prisma.refreshToken.create({
                data: {
                    tokenHash,
                    userId,
                    expiresAt,
                    ipAddress: meta.ip,
                    userAgent: meta.ua,
                },
            });

            return created;
        } catch (error) {
            logger.error('Error saving refresh token:', error);
            // Do not prevent login if token persisting fails, but log
            return null;
        }
    }

    // Revoke a refresh token (used on logout)
    async revokeRefreshToken(refreshToken) {
        try {
            const tokenHash = this.hashToken(refreshToken);
            await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
        } catch (error) {
            logger.error('Error revoking refresh token:', error);
        }
    }

    generateToken(userId, email, role) {
        return jwt.sign({ userId, email, role }, config.jwt.secret, {
            expiresIn: config.jwt.expiresIn,
        });
    }

    generateRefreshToken(userId) {
        return jwt.sign({ userId }, config.jwt.refreshSecret, {
            expiresIn: config.jwt.refreshExpiresIn,
        });
    }

    verifyToken(token) {
        try {
            return jwt.verify(token, config.jwt.secret);
        } catch (error) {
            throw new UnauthorizedError('Invalid token');
        }
    }

    sanitizeUser(user) {
        const { passwordHash, ...sanitized } = user;
        return sanitized;
    }
}

module.exports = new AuthService();