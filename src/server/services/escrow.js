const prisma = require('../db');
const logger = require('../utils/logger');
const { config } = require('../config');
const { paymentProvider } = require('./payments');
const notificationService = require('./notification');
const emailService = require('./email');
const incidentService = require('./incident');
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../utils/errors');

/**
 * Escrow is deliberately off-chain and fiat-only (see prisma/schema.prisma for the "why").
 * Money movement (deposit/payout) waits on a real payment provider — see services/payments.
 * There is no automatic reminder/release scheduler (dropped as part of the Next.js
 * migration — hors périmètre du mémoire, and no scheduler meant one less background job to
 * carry over): release before this is always manual, via releaseNow/resolveDispute below.
 */
class EscrowService {
    /**
     * Declares escrow terms at contract-creation time. Does not move any money — just
     * records what the creator intends to deposit later. No-op if no amount was declared.
     */
    async declareTerms(contractCacheId, { amount, currency, penaltyPercent, deadline }) {
        if (!amount || Number(amount) <= 0) return null;
        if (!deadline) {
            throw new BadRequestError('Une date limite est requise pour déclarer un séquestre.');
        }

        return prisma.contractEscrow.create({
            data: {
                contractCacheId,
                amount,
                currency: currency || 'XOF',
                penaltyPercent: penaltyPercent || 0,
                deadline: new Date(deadline),
                status: 'PENDING_DEPOSIT',
            },
        });
    }

    /** Creator starts a deposit. Throws PaymentsUnavailableError while no provider is wired. */
    async requestDeposit(contractCacheId, userId) {
        const escrow = await this._getOwnedEscrow(contractCacheId, userId);
        if (escrow.status !== 'PENDING_DEPOSIT') {
            throw new ConflictError(`Ce séquestre n'est plus en attente de dépôt (statut: ${escrow.status}).`);
        }

        const checkout = await paymentProvider.createDepositCheckout({
            amount: Number(escrow.amount),
            currency: escrow.currency,
            reference: escrow.id,
            description: `Séquestre — contrat ${contractCacheId}`,
            returnUrl: `${config.frontendUrl}/contract-details?id=${contractCacheId}`,
        });

        await prisma.contractEscrow.update({
            where: { id: escrow.id },
            data: { payerUserId: userId, providerRef: checkout.providerRef },
        });

        return checkout;
    }

    /** Called once a real payment provider confirms a deposit (webhook, future). */
    async markDeposited(contractCacheId, { provider, providerRef }) {
        const escrow = await this._getEscrow(contractCacheId);
        return prisma.contractEscrow.update({
            where: { id: escrow.id },
            data: { status: 'DEPOSITED', depositedAt: new Date(), provider, providerRef },
        });
    }

    /**
     * Creator explicitly releases early, before the deadline. Blocked while any
     * participant has an open dispute or an accepted hold on the contract — not just the
     * creator's own blockRelease flag — so a beneficiary who raised a dispute can't have
     * the creator quietly release funds out from under them.
     */
    async releaseNow(contractCacheId, userId) {
        const escrow = await this._getOwnedEscrow(contractCacheId, userId);
        if (escrow.status !== 'DEPOSITED') {
            throw new ConflictError(`Impossible de libérer : le séquestre est au statut ${escrow.status}.`);
        }
        if (await incidentService.hasOpenIncident(contractCacheId)) {
            throw new ConflictError('Impossible de libérer : un litige ou une pause est actif sur ce contrat. Résolvez-le d\'abord.');
        }
        return this._release(escrow);
    }

    /** Creator blocks the release before the deadline, flagging a problem. */
    async blockRelease(contractCacheId, userId, reason) {
        const escrow = await this._getOwnedEscrow(contractCacheId, userId);
        if (escrow.status !== 'DEPOSITED') {
            throw new ConflictError('Le séquestre ne peut être bloqué que tant que les fonds sont déposés et non encore libérés.');
        }
        if (escrow.deadline <= new Date()) {
            throw new ConflictError("L'échéance est déjà passée — la libération automatique a peut-être déjà eu lieu, réessayez dans un instant.");
        }

        const updated = await prisma.contractEscrow.update({
            where: { id: escrow.id },
            data: { status: 'DISPUTED', disputedAt: new Date(), disputeReason: reason || null },
        });

        await this._notifyParties(updated, {
            type: 'ESCROW_DISPUTED',
            title: 'Séquestre bloqué',
            message: 'Le créateur a signalé un problème avant la date de libération du séquestre. La libération automatique est annulée en attente de résolution.',
        });

        return updated;
    }

    /**
     * Resolves a DISPUTED escrow (one the creator previously blocked via blockRelease) —
     * the only way out of that status until now: nothing else in this service could ever
     * move a DISPUTED escrow anywhere else, so a blocked escrow stayed blocked forever.
     *
     * `applyPenalty: true` releases `amount` reduced by `penaltyPercent` — this is the actual
     * implementation of the delay-penalty clause the generated contract text promises
     * (`buildEscrowClause`, create-contract-page.tsx): until this method existed, that clause
     * was never backed by any code path that could apply it. `releasedAmount` records
     * whichever figure actually applied, distinct from the originally declared `amount`.
     */
    async resolveDispute(contractCacheId, userId, applyPenalty) {
        const escrow = await this._getOwnedEscrow(contractCacheId, userId);
        if (escrow.status !== 'DISPUTED') {
            throw new ConflictError(`Ce séquestre n'est pas en litige (statut: ${escrow.status}).`);
        }
        if (applyPenalty && Number(escrow.penaltyPercent) <= 0) {
            throw new BadRequestError("Aucune pénalité n'a été déclarée pour ce séquestre.");
        }

        const releasedAmount = applyPenalty
            ? Number(escrow.amount) * (1 - Number(escrow.penaltyPercent) / 100)
            : Number(escrow.amount);

        const updated = await prisma.contractEscrow.update({
            where: { id: escrow.id },
            data: {
                status: 'RELEASED',
                releasedAt: new Date(),
                releasedAmount,
                penaltyApplied: applyPenalty,
            },
        });

        await this._notifyParties(updated, {
            type: 'ESCROW_RELEASED',
            title: 'Litige résolu — séquestre libéré',
            message: applyPenalty
                ? `Le litige a été résolu avec application de la pénalité de retard (${escrow.penaltyPercent}%) : ${releasedAmount.toLocaleString('fr-FR')} ${escrow.currency} libérés sur ${Number(escrow.amount).toLocaleString('fr-FR')} ${escrow.currency} initialement séquestrés.`
                : `Le litige a été résolu sans pénalité : le montant intégral (${releasedAmount.toLocaleString('fr-FR')} ${escrow.currency}) a été libéré.`,
        });

        return updated;
    }

    async _release(escrow) {
        const updated = await prisma.contractEscrow.update({
            where: { id: escrow.id },
            // No penalty on this path by construction: releaseNow is the creator releasing
            // early/on-time by choice. A delay penalty only makes sense once a problem was
            // actually flagged — that's resolveDispute, not this method.
            data: { status: 'RELEASED', releasedAt: new Date(), releasedAmount: escrow.amount },
        });

        await this._notifyParties(updated, {
            type: 'ESCROW_RELEASED',
            title: 'Séquestre libéré',
            message: 'Le créateur a validé et libéré les fonds du séquestre par anticipation.',
        });

        return updated;
    }

    async _getEscrow(contractCacheId) {
        const escrow = await prisma.contractEscrow.findUnique({ where: { contractCacheId } });
        if (!escrow) throw new NotFoundError("Aucun séquestre déclaré pour ce contrat.");
        return escrow;
    }

    async _getOwnedEscrow(contractCacheId, userId) {
        const contract = await prisma.contractCache.findUnique({ where: { id: contractCacheId } });
        if (!contract) throw new NotFoundError('Contrat introuvable.');
        if (contract.userId !== userId) throw new ForbiddenError('Seul le créateur du contrat peut gérer son séquestre.');
        return this._getEscrow(contractCacheId);
    }

    async _notifyParties(escrow, { type, title, message }) {
        const contract = await prisma.contractCache.findUnique({
            where: { id: escrow.contractCacheId },
            include: { signatories: true, user: true },
        });
        if (!contract) return;

        const recipients = new Map(); // userId -> email, deduplicated
        if (contract.user) recipients.set(contract.userId, contract.user.email);
        for (const s of contract.signatories) {
            if (!s.isRegistered) continue;
            const user = await prisma.user.findUnique({ where: { email: s.email } });
            if (user) recipients.set(user.id, user.email);
        }

        for (const [userId, email] of recipients) {
            await notificationService.create(userId, { type, title, message, contractCacheId: escrow.contractCacheId });
            emailService.sendGenericNotification(email, title, message, escrow.contractCacheId)
                .catch((err) => logger.error('[Escrow] Failed to send notification email:', err));
        }
    }
}

module.exports = new EscrowService();
