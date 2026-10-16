const prisma = require('../db');
const escrowService = require('../services/escrow');
const { PaymentsUnavailableError } = require('../services/payments/provider');
const { hasContractAccess } = require('./contract');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * The route param can be either a draft's UUID or a deployed contract's numeric on-chain
 * id (same dual lookup as resendSignatureRequest/getDraftDetails vs getContractDetails) —
 * the frontend passes through whichever id the details page currently has.
 */
async function findContractByRouteParam(id) {
    return isNaN(Number(id))
        ? prisma.contractCache.findUnique({ where: { id }, include: { signatories: true } })
        : prisma.contractCache.findUnique({ where: { contractId: parseInt(id, 10) }, include: { signatories: true } });
}

async function findOwnedContract(id, userId) {
    const contract = await findContractByRouteParam(id);
    if (!contract) throw new NotFoundError('Contrat introuvable');
    if (contract.userId !== userId) throw new ForbiddenError('Seul le créateur du contrat peut gérer son séquestre');
    return contract;
}

/** Anyone with access to the contract (creator, a signatory, or an admin) can view it. */
async function getEscrow(user, id) {
    const contract = await findContractByRouteParam(id);
    if (!contract) throw new NotFoundError('Contrat introuvable');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Non autorisé');

    const escrow = await prisma.contractEscrow.findUnique({ where: { contractCacheId: contract.id } });
    return { escrow };
}

/** Creator starts a deposit. Throws PaymentsUnavailableError (-> 503) while no provider is
 *  wired (PAYMENTS_ENABLED=false) — this is the expected response today, not an error. */
async function requestDeposit(user, id) {
    const contract = await findOwnedContract(id, user.userId);
    const checkout = await escrowService.requestDeposit(contract.id, user.userId);
    return { message: 'Dépôt initié', ...checkout };
}

/** Creator explicitly releases the escrow — either early or during the post-deadline
 *  validation window instead of waiting for an automatic release (there is none). */
async function releaseNow(user, id) {
    const contract = await findOwnedContract(id, user.userId);
    const escrow = await escrowService.releaseNow(contract.id, user.userId);
    return { message: 'Séquestre libéré', escrow };
}

/** Creator blocks the release, flagging a problem with contract performance. Holds the
 *  escrow in DISPUTED pending manual resolution. */
async function blockRelease(user, id, reason) {
    const contract = await findOwnedContract(id, user.userId);
    const escrow = await escrowService.blockRelease(contract.id, user.userId, reason);
    return { message: 'Libération bloquée', escrow };
}

/** Creator resolves a DISPUTED escrow — the only way out of that status. applyPenalty:true
 *  releases the declared amount minus the declared delay penalty; otherwise the full amount. */
async function resolveDispute(user, id, applyPenalty) {
    const contract = await findOwnedContract(id, user.userId);
    const escrow = await escrowService.resolveDispute(contract.id, user.userId, applyPenalty === true);
    return { message: 'Litige résolu', escrow };
}

module.exports = { getEscrow, requestDeposit, releaseNow, blockRelease, resolveDispute, PaymentsUnavailableError };
