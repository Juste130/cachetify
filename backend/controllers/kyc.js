const prisma = require('../models/prisma');
const kycService = require('../services/kyc');
const logger = require('../utils/logger');
const { config } = require('../config');
const { BadRequestError } = require('../utils/errors');

/**
 * Current user's verification status — polled by the frontend while PENDING (the result
 * arrives asynchronously, via handleCallback below), and read once to decide what the
 * "Vérifier mon identité" surfaces (dashboard card, sidebar badge, signing gate) should show.
 */
exports.getStatus = async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { kycStatus: true, kycVerifiedAt: true, kycCountry: true, hasSeenKycPrompt: true },
        });
        // Surfaced so the UI can visibly flag a simulated verification instead of letting a
        // mock "VERIFIED" look indistinguishable from a real one (see IdentityVerificationModal).
        res.json({ ...user, mockMode: config.kyc.mockMode });
    } catch (error) {
        next(error);
    }
};

/**
 * Submits a document + selfie already captured client-side (base64, no data: URI prefix).
 * Covered by the app-wide 10mb JSON body limit (server.js) — two compressed photos
 * comfortably fit well under that.
 */
exports.submit = async (req, res, next) => {
    try {
        const { country, idType, selfieBase64, idFrontBase64 } = req.body;
        if (!country || !idType || !selfieBase64 || !idFrontBase64) {
            throw new BadRequestError('country, idType, selfieBase64 et idFrontBase64 sont requis');
        }

        const result = await kycService.submitVerification({
            userId: req.user.userId,
            country,
            idType,
            selfieBase64,
            idFrontBase64,
        });

        res.status(202).json({ message: 'Vérification soumise', ...result });
    } catch (error) {
        next(error);
    }
};

/** Marks the one-time post-signup invitation modal as seen, whether the user verified or hit
 *  "Passer" — either way, it must never reappear on its own after this. */
exports.dismissPrompt = async (req, res, next) => {
    try {
        await prisma.user.update({
            where: { id: req.user.userId },
            data: { hasSeenKycPrompt: true },
        });
        res.json({ message: 'ok' });
    } catch (error) {
        next(error);
    }
};

/**
 * Smile ID's webhook — deliberately NOT behind `authenticate` (Smile ID's servers have no
 * Cachetify session), gated instead by verifyCallbackSignature. Always responds 200 once
 * the signature check has run, even on a business-logic no-op (unknown job id already
 * logged inside handleCallback) — Smile ID retries a non-2xx response, and retrying a
 * legitimately-unmatched job id would never succeed differently the second time.
 */
exports.callback = async (req, res, next) => {
    try {
        if (!kycService.verifyCallbackSignature(req.body)) {
            logger.warn('[KYC] Rejected callback with invalid signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }
        await kycService.handleCallback(req.body);
        res.status(200).json({ received: true });
    } catch (error) {
        next(error);
    }
};
