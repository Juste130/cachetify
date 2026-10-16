const prisma = require('../db');
const logger = require('../utils/logger');
const notificationService = require('./notification');
const emailService = require('./email');
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Litiges et pauses entièrement hors-chaîne — ContractManager.sol n'a aucun mécanisme de
 * litige (hors périmètre du mémoire). `onchainTxHash` reste un champ optionnel côté schéma
 * pour compatibilité avec d'anciens incidents déjà journalisés, mais n'est plus jamais
 * renseigné par le frontend.
 */
class IncidentService {
    /** DISPUTE : prend effet immédiatement, pas besoin de l'accord de l'autre partie. */
    async raiseDispute(contractCacheId, userId, { reason, customReason, description, proofIpfsHash, onchainTxHash }) {
        if (!description || !description.trim()) {
            throw new BadRequestError('Une description du litige est requise.');
        }
        // Un litige déjà ouvert bloque déjà la libération du séquestre (voir hasOpenIncident) —
        // en ouvrir un second sur le même contrat n'ajoute rien de fonctionnel et permettrait
        // à une partie de spammer des litiges pour prolonger indéfiniment ce blocage.
        if (await this.hasOpenIncident(contractCacheId)) {
            throw new ConflictError('Un litige ou une pause est déjà actif sur ce contrat. Attendez sa résolution avant d\'en signaler un nouveau.');
        }
        const incident = await prisma.contractIncident.create({
            data: {
                contractCacheId,
                type: 'DISPUTE',
                reason,
                customReason: customReason || null,
                description,
                proofIpfsHash: proofIpfsHash || null,
                requiresConsent: false,
                status: 'OPEN',
                raisedByUserId: userId,
                onchainTxHash: onchainTxHash || null,
            },
        });

        await this._notifyParticipants(contractCacheId, userId, {
            type: 'CONTRACT_DISPUTE_OPENED',
            title: 'Litige ouvert',
            message: 'Un litige a été signalé sur ce contrat. La libération du séquestre (le cas échéant) est suspendue en attente de résolution.',
        });

        return incident;
    }

    /** HOLD : ne gèle rien tant que l'autre partie ne l'a pas explicitement acceptée. */
    async proposeHold(contractCacheId, userId, { reason, customReason, description, proofIpfsHash, onchainTxHash }) {
        if (!description || !description.trim()) {
            throw new BadRequestError('Une description de la pause proposée est requise.');
        }
        if (await this.hasOpenIncident(contractCacheId)) {
            throw new ConflictError('Un litige ou une pause est déjà actif sur ce contrat. Attendez sa résolution avant d\'en proposer une nouvelle.');
        }
        const incident = await prisma.contractIncident.create({
            data: {
                contractCacheId,
                type: 'HOLD',
                reason: reason || 'MUTUAL_TIMEOUT',
                customReason: customReason || null,
                description,
                proofIpfsHash: proofIpfsHash || null,
                requiresConsent: true,
                status: 'OPEN',
                raisedByUserId: userId,
                onchainTxHash: onchainTxHash || null,
            },
        });

        await this._notifyParticipants(contractCacheId, userId, {
            type: 'CONTRACT_HOLD_PROPOSED',
            title: 'Pause proposée',
            message: 'Une pause a été proposée sur ce contrat. Elle ne prendra effet que si toutes les autres parties l\'acceptent.',
        });

        return incident;
    }

    /** L'autre partie (pas le déclarant) accepte ou refuse un HOLD proposé. */
    async respondToHold(incidentId, userId, accept) {
        const incident = await prisma.contractIncident.findUnique({ where: { id: incidentId } });
        if (!incident) throw new NotFoundError('Incident introuvable.');
        if (incident.type !== 'HOLD') throw new BadRequestError('Seule une pause proposée peut être acceptée ou refusée.');
        if (incident.status !== 'OPEN') throw new ConflictError(`Cette pause n'est plus en attente de réponse (statut : ${incident.status}).`);
        if (incident.raisedByUserId === userId) throw new ForbiddenError('Vous ne pouvez pas répondre à votre propre proposition.');

        const updated = await prisma.contractIncident.update({
            where: { id: incidentId },
            data: {
                status: accept ? 'ACCEPTED_ACTIVE' : 'REJECTED',
                respondedByUserId: userId,
                respondedAt: new Date(),
            },
        });

        await this._notifyParticipants(incident.contractCacheId, userId, {
            type: accept ? 'CONTRACT_HOLD_ACCEPTED' : 'CONTRACT_HOLD_REJECTED',
            title: accept ? 'Pause acceptée' : 'Pause refusée',
            message: accept
                ? 'La pause proposée a été acceptée par toutes les parties : la libération automatique du séquestre (le cas échéant) est suspendue jusqu\'à sa levée.'
                : 'La pause proposée a été refusée. Le contrat continue normalement.',
        });

        return updated;
    }

    /** Résolution — réservée à l'équipe (rôle ADMIN), au sens d'un médiateur/support désigné. */
    async resolve(incidentId, adminUserId, resolution) {
        if (!resolution || !resolution.trim()) {
            throw new BadRequestError('Une explication de la résolution est requise.');
        }
        const incident = await prisma.contractIncident.findUnique({ where: { id: incidentId } });
        if (!incident) throw new NotFoundError('Incident introuvable.');
        if (incident.status === 'RESOLVED' || incident.status === 'WITHDRAWN') {
            throw new ConflictError(`Cet incident est déjà clos (statut : ${incident.status}).`);
        }

        const updated = await prisma.contractIncident.update({
            where: { id: incidentId },
            data: { status: 'RESOLVED', resolution, resolvedByUserId: adminUserId, resolvedAt: new Date() },
        });

        await this._notifyParticipants(incident.contractCacheId, null, {
            type: 'CONTRACT_INCIDENT_RESOLVED',
            title: incident.type === 'DISPUTE' ? 'Litige résolu' : 'Pause levée',
            message: resolution,
        });

        return updated;
    }

    /** Le déclarant peut retirer son propre incident tant qu'il n'est pas déjà résolu. */
    async withdraw(incidentId, userId) {
        const incident = await prisma.contractIncident.findUnique({ where: { id: incidentId } });
        if (!incident) throw new NotFoundError('Incident introuvable.');
        if (incident.raisedByUserId !== userId) throw new ForbiddenError('Seul le déclarant peut retirer cet incident.');
        if (incident.status === 'RESOLVED' || incident.status === 'WITHDRAWN') {
            throw new ConflictError(`Cet incident est déjà clos (statut : ${incident.status}).`);
        }
        return prisma.contractIncident.update({ where: { id: incidentId }, data: { status: 'WITHDRAWN' } });
    }

    async listForContract(contractCacheId) {
        return prisma.contractIncident.findMany({
            where: { contractCacheId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Every incident still awaiting mediation, across every contract — what the admin
     * "Litiges" screen lists. Includes HOLD proposals still OPEN (awaiting the other
     * party's response) alongside genuinely active ones (OPEN disputes, ACCEPTED_ACTIVE
     * holds) so an admin can see the full unresolved queue, not just what's blocking
     * escrow right now (that narrower set is what hasOpenIncident checks).
     */
    async listOpen() {
        return prisma.contractIncident.findMany({
            where: { status: { in: ['OPEN', 'ACCEPTED_ACTIVE'] } },
            include: { contract: { select: { id: true, contractId: true, title: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Un litige ouvert, ou une pause acceptée, doit bloquer toute libération d'escrow
     * (manuelle ou automatique) même si l'incident ne concerne pas directement le
     * paiement (ex: litige de propriété intellectuelle) — le principe est qu'aucun
     * argent ne bouge tant qu'un désaccord actif existe sur le contrat.
     */
    async hasOpenIncident(contractCacheId) {
        const count = await prisma.contractIncident.count({
            where: {
                contractCacheId,
                OR: [
                    { type: 'DISPUTE', status: 'OPEN' },
                    { type: 'HOLD', status: 'ACCEPTED_ACTIVE' },
                ],
            },
        });
        return count > 0;
    }

    async _notifyParticipants(contractCacheId, excludeUserId, { type, title, message }) {
        const contract = await prisma.contractCache.findUnique({
            where: { id: contractCacheId },
            include: { signatories: true, user: true },
        });
        if (!contract) return;

        const recipients = new Map(); // userId -> email
        if (contract.user && contract.userId !== excludeUserId) recipients.set(contract.userId, contract.user.email);
        for (const s of contract.signatories) {
            if (!s.isRegistered) continue;
            const user = await prisma.user.findUnique({ where: { email: s.email } });
            if (user && user.id !== excludeUserId) recipients.set(user.id, user.email);
        }

        for (const [userId, email] of recipients) {
            await notificationService.create(userId, { type, title, message, contractCacheId });
            emailService.sendGenericNotification(email, title, message, contractCacheId)
                .catch((err) => logger.error('[Incident] Failed to send notification email:', err));
        }
    }
}

module.exports = new IncidentService();
