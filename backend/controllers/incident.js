const prisma = require('../models/prisma');
const incidentService = require('../services/incident');
const { hasContractAccess } = require('./contract');

/** Same dual lookup (draft UUID or on-chain numeric id) used across the other contract routes. */
async function findContractByRouteParam(id) {
    return isNaN(Number(id))
        ? prisma.contractCache.findUnique({ where: { id }, include: { signatories: true } })
        : prisma.contractCache.findUnique({ where: { contractId: parseInt(id, 10) }, include: { signatories: true } });
}

async function requireParticipant(req, res) {
    const { id } = req.params;
    const contract = await findContractByRouteParam(id);
    if (!contract) {
        res.status(404).json({ error: 'Contrat introuvable' });
        return null;
    }
    if (!(await hasContractAccess(contract, req.user))) {
        res.status(403).json({ error: 'Non autorisé' });
        return null;
    }
    return contract;
}

exports.listIncidents = async (req, res, next) => {
    try {
        const contract = await requireParticipant(req, res);
        if (!contract) return;
        const incidents = await incidentService.listForContract(contract.id);
        res.json({ incidents });
    } catch (error) {
        next(error);
    }
};

exports.raiseDispute = async (req, res, next) => {
    try {
        const contract = await requireParticipant(req, res);
        if (!contract) return;
        const { reason, customReason, description, proofIpfsHash, onchainTxHash } = req.body;
        if (!reason) return res.status(400).json({ error: 'reason est requis' });

        const incident = await incidentService.raiseDispute(contract.id, req.user.userId, {
            reason, customReason, description, proofIpfsHash, onchainTxHash,
        });
        res.status(201).json({ message: 'Litige ouvert', incident });
    } catch (err) {
        next(err);
    }
};

exports.proposeHold = async (req, res, next) => {
    try {
        const contract = await requireParticipant(req, res);
        if (!contract) return;
        const { reason, customReason, description, proofIpfsHash, onchainTxHash } = req.body;

        const incident = await incidentService.proposeHold(contract.id, req.user.userId, {
            reason, customReason, description, proofIpfsHash, onchainTxHash,
        });
        res.status(201).json({ message: 'Pause proposée', incident });
    } catch (err) {
        next(err);
    }
};

exports.respondToHold = async (req, res, next) => {
    try {
        const contract = await requireParticipant(req, res);
        if (!contract) return;
        const { incidentId } = req.params;
        const { accept } = req.body;
        if (typeof accept !== 'boolean') return res.status(400).json({ error: 'accept (booléen) est requis' });

        const incident = await incidentService.respondToHold(incidentId, req.user.userId, accept);
        res.json({ message: accept ? 'Pause acceptée' : 'Pause refusée', incident });
    } catch (err) {
        next(err);
    }
};

exports.withdrawIncident = async (req, res, next) => {
    try {
        const contract = await requireParticipant(req, res);
        if (!contract) return;
        const { incidentId } = req.params;

        const incident = await incidentService.withdraw(incidentId, req.user.userId);
        res.json({ message: 'Incident retiré', incident });
    } catch (err) {
        next(err);
    }
};

/**
 * All incidents still awaiting mediation, across every contract — backs the admin
 * "Litiges" screen. There was previously no way to even see this queue: resolveIncident
 * existed but had no listing to work from.
 */
exports.listOpenIncidents = async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Réservé aux administrateurs.' });
        }
        const incidents = await incidentService.listOpen();
        res.json({ incidents });
    } catch (error) {
        next(error);
    }
};

/** Résolution réservée à l'équipe (rôle ADMIN) — au sens du médiateur/support désigné. */
exports.resolveIncident = async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Seule l\'équipe Cachetify peut résoudre un incident.' });
        }
        const { incidentId } = req.params;
        const { resolution } = req.body;

        const incident = await incidentService.resolve(incidentId, req.user.userId, resolution);
        res.json({ message: 'Incident résolu', incident });
    } catch (err) {
        next(err);
    }
};
