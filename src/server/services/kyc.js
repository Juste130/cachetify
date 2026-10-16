const crypto = require('crypto');
// JOB_TYPE/IMAGE_TYPE come straight from the installed SDK (verified by inspecting its real
// exports: DOCUMENT_VERIFICATION === 6, SELFIE_IMAGE_BASE64 === 2, ID_CARD_IMAGE_BASE64 ===
// 3) — authoritative, not a guess from documentation this codebase couldn't fully fetch.
const { WebApi, Signature, JOB_TYPE, IMAGE_TYPE } = require('smile-identity-core');
const { config } = require('../config');
const prisma = require('../db');
const logger = require('../utils/logger');

/**
 * Identity verification (KYC) — one check per human being, ever, reused across every
 * future contract once VERIFIED. Provider: Smile ID, chosen for confirmed document
 * coverage across all four countries this platform currently operates in (Bénin, Togo,
 * Côte d'Ivoire, Sénégal) with a single integration, rather than one provider per country.
 *
 * Data minimization by construction, not by policy: the raw ID photo and selfie are
 * forwarded to Smile ID and never written to our own database or disk — only the
 * provider's own job reference id is kept (see User.kycReferenceId), which is meaningless
 * to anyone without Smile ID account access. If this app is ever asked to prove it isn't
 * storing biometric data, the honest answer is that it structurally can't — there is no
 * column for it.
 *
 * MOCK MODE (config.kyc.mockMode, on by default until real Smile ID partner credentials
 * are configured — same "disabled until wired" pattern as payments/escrow elsewhere in
 * this codebase): simulates an async approval so the surrounding product (UI, the
 * creator's "require verified signers" toggle, the signing gate) can be built and
 * demonstrated before the Smile ID partner account is finalized. Nothing about the mock
 * path is reachable once real credentials are set — see _getWebApi().
 */
class KycService {
    constructor() {
        this._webApi = null;
        this._signature = null;
    }

    _getWebApi() {
        if (this._webApi) return this._webApi;
        const { partnerId, apiKey, server, callbackUrl } = config.kyc.smileId;
        if (!partnerId || !apiKey) {
            throw new Error('Smile ID credentials are not configured (SMILE_ID_PARTNER_ID / SMILE_ID_API_KEY)');
        }
        this._webApi = new WebApi(partnerId, callbackUrl, apiKey, server);
        return this._webApi;
    }

    _getSignature() {
        if (this._signature) return this._signature;
        const { partnerId, apiKey } = config.kyc.smileId;
        this._signature = new Signature(partnerId, apiKey);
        return this._signature;
    }

    /**
     * Submits a document + selfie for verification. `selfieBase64`/`idFrontBase64` are plain
     * base64 strings (no data: URI prefix) captured by the frontend — passed straight through
     * to Smile ID in this same call, never persisted here first.
     */
    async submitVerification({ userId, country, idType, selfieBase64, idFrontBase64 }) {
        if (config.kyc.mockMode) {
            return this._submitMock({ userId, country });
        }

        const webApi = this._getWebApi();
        const jobId = crypto.randomUUID();

        await prisma.user.update({
            where: { id: userId },
            data: { kycStatus: 'PENDING', kycProvider: 'smile_id', kycReferenceId: jobId, kycCountry: country },
        });

        const partner_params = {
            job_id: jobId,
            user_id: userId,
            job_type: JOB_TYPE.DOCUMENT_VERIFICATION,
        };
        const image_details = [
            { image_type_id: IMAGE_TYPE.SELFIE_IMAGE_BASE64, image: selfieBase64 },
            { image_type_id: IMAGE_TYPE.ID_CARD_IMAGE_BASE64, image: idFrontBase64 },
        ];
        const id_info = { country, id_type: idType };
        const options = {
            return_job_status: true,
            return_history: false,
            return_image_links: false,
            signature: true,
        };

        try {
            const result = await webApi.submit_job(partner_params, image_details, id_info, options);
            // return_job_status:true may already hand back a synchronous result — apply it
            // immediately rather than only waiting on the callback that's also on its way.
            if (result) await this._applyResult(userId, jobId, result);
            return { status: 'submitted', jobId };
        } catch (error) {
            logger.error(`[KYC] Smile ID submission failed for user ${userId}:`, error);
            await prisma.user.update({ where: { id: userId }, data: { kycStatus: 'FAILED' } });
            throw error;
        }
    }

    async _submitMock({ userId, country }) {
        const jobId = `mock-${crypto.randomUUID()}`;
        await prisma.user.update({
            where: { id: userId },
            data: { kycStatus: 'PENDING', kycProvider: 'smile_id_mock', kycReferenceId: jobId, kycCountry: country },
        });
        // Simulated delay: a real Smile ID result takes seconds to minutes, not milliseconds
        // — resolving instantly would leave the "vérification en cours" UI state untested.
        setTimeout(() => {
            prisma.user.update({
                where: { id: userId, kycReferenceId: jobId },
                data: { kycStatus: 'VERIFIED', kycVerifiedAt: new Date() },
            }).catch((err) => logger.error('[KYC] Mock verification update failed:', err));
        }, 5000);
        return { status: 'submitted', jobId };
    }

    /**
     * Applies a job result — from either the synchronous submit_job response or the async
     * callback, same shape. Anything not explicitly a recognized success code is treated as
     * NOT verified: a check that fails open (defaults to VERIFIED on an unrecognized
     * response) is a far worse failure mode than one that fails closed (FAILED, retryable).
     */
    async _applyResult(userId, jobId, result) {
        const resultCode = String(result?.result?.ResultCode ?? result?.ResultCode ?? '');
        // "1012" = Smile ID's code for a fully successful Document/Enhanced KYC match —
        // CONFIRM against your Smile ID dashboard/docs; unverifiable without live credentials.
        const isVerified = resultCode === '1012';
        await prisma.user.update({
            where: { id: userId },
            data: {
                kycStatus: isVerified ? 'VERIFIED' : 'FAILED',
                kycVerifiedAt: isVerified ? new Date() : null,
            },
        });
        logger.info(`[KYC] Job ${jobId} for user ${userId} resolved: ${isVerified ? 'VERIFIED' : 'FAILED'} (code ${resultCode || 'n/a'})`);
    }

    /**
     * Verifies the callback actually came from Smile ID before trusting it — an
     * unauthenticated webhook that can flip anyone's kycStatus to VERIFIED on request would
     * defeat the entire point of this feature. Uses smile-identity-core's own Signature
     * class (HMAC, timing-safe comparison) rather than a bespoke check.
     */
    verifyCallbackSignature(payload) {
        if (config.kyc.mockMode) return true; // no real signature to check in mock mode
        const { timestamp, signature } = payload || {};
        if (!timestamp || !signature) return false;
        try {
            return this._getSignature().confirm_signature(timestamp, signature);
        } catch (error) {
            logger.error('[KYC] Callback signature check failed:', error);
            return false;
        }
    }

    /** Called by the Smile ID webhook (see routes/kyc.js) once signature verification passed. */
    async handleCallback(payload) {
        const jobId = payload?.job_id || payload?.JobID;
        if (!jobId) {
            logger.warn('[KYC] Callback received with no job_id', payload);
            return;
        }
        const user = await prisma.user.findFirst({ where: { kycReferenceId: jobId } });
        if (!user) {
            logger.warn(`[KYC] Callback for unknown job_id ${jobId}`);
            return;
        }
        await this._applyResult(user.id, jobId, payload);
    }
}

module.exports = new KycService();
