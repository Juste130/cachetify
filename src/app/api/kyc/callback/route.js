import { NextResponse } from 'next/server';
import { apiError } from '../../../../server/http';
import kycService from '../../../../server/services/kyc';
import logger from '../../../../server/utils/logger';

/**
 * Smile ID's webhook — deliberately public (no Cachetify session; Smile ID's servers can't
 * send one), gated instead by verifyCallbackSignature. Always responds 200 once the
 * signature check has run, even on a business-logic no-op (unknown job id, already logged
 * inside handleCallback) — Smile ID retries a non-2xx response, and retrying a legitimately
 * unmatched job id would never succeed differently the second time.
 */
export async function POST(request) {
    try {
        const body = await request.json();
        if (!kycService.verifyCallbackSignature(body)) {
            logger.warn('[KYC] Rejected callback with invalid signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        await kycService.handleCallback(body);
        return NextResponse.json({ received: true });
    } catch (error) {
        return apiError(error);
    }
}
