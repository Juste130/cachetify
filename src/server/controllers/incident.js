const prisma = require('../db');
const incidentService = require('../services/incident');
const { hasContractAccess } = require('./contract');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

/** Same dual lookup (draft UUID or on-chain numeric id) used across the other contract routes. */
async function findContractByRouteParam(id) {
    return isNaN(Number(id))
        ? prisma.contractCache.findUnique({ where: { id }, include: { signatories: true } })
        : prisma.contractCache.findUnique({ where: { contractId: parseInt(id, 10) }, include: { signatories: true } });
}

async function requireParticipant(id, user) {
    const contract = await findContractByRouteParam(id);
    if (!contract) throw new NotFoundError('Contrat introuvable');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Non autorisé');
    return contract;
}

async function listIncidents(user, id) {
    const contract = await requireParticipant(id, user);
    const incidents = await incidentService.listForContract(contract.id);
    return { incidents };
}

async function raiseDispute(user, id, body) {
    const contract = await requireParticipant(id, user);
    const { reason, customReason, description, proofIpfsHash, onchainTxHash } = body;
    if (!reason) throw new BadRequestError('reason est requis');

    const incident = await incidentService.raiseDispute(contract.id, user.userId, {
        reason, customReason, description, proofIpfsHash, onchainTxHash,
    });
    return { message: 'Litige ouvert', incident };
}

async function proposeHold(user, id, body) {
    const contract = await requireParticipant(id, user);
    const { reason, customReason, description, proofIpfsHash, onchainTxHash } = body;

    const incident = await incidentService.proposeHold(contract.id, user.userId, {
        reason, customReason, description, proofIpfsHash, onchainTxHash,
    });
    return { message: 'Pause proposée', incident };
}

async function respondToHold(user, id, incidentId, body) {
    await requireParticipant(id, user);
    const { accept } = body;
    if (typeof accept !== 'boolean') throw new BadRequestError('accept (booléen) est requis');

    const incident = await incidentService.respondToHold(incidentId, user.userId, accept);
    return { message: accept ? 'Pause acceptée' : 'Pause refusée', incident };
}

async function withdrawIncident(user, id, incidentId) {
    await requireParticipant(id, user);
    const incident = await incidentService.withdraw(incidentId, user.userId);
    return { message: 'Incident retiré', incident };
}

/** All incidents still awaiting mediation, across every contract — backs the admin
 *  "Litiges" screen. */
async function listOpenIncidents(user) {
    if (user.role !== 'ADMIN') throw new ForbiddenError('Réservé aux administrateurs.');
    const incidents = await incidentService.listOpen();
    return { incidents };
}

/** Résolution réservée à l'équipe (rôle ADMIN) — au sens du médiateur/support désigné. */
async function resolveIncident(user, incidentId, body) {
    if (user.role !== 'ADMIN') throw new ForbiddenError("Seule l'équipe Cachetify peut résoudre un incident.");
    const { resolution } = body;
    const incident = await incidentService.resolve(incidentId, user.userId, resolution);
    return { message: 'Incident résolu', incident };
}

module.exports = {
    listIncidents, raiseDispute, proposeHold, respondToHold,
    withdrawIncident, listOpenIncidents, resolveIncident,
};
