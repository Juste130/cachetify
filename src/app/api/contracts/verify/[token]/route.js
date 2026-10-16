import { NextResponse } from 'next/server';
import { apiError } from '../../../../../server/http';
import { checkRateLimit } from '../../../../../server/rate-limit';
import contractController from '../../../../../server/controllers/contract';

/**
 * Public, unauthenticated verification lookup, gated by a non-guessable 128-bit token
 * (never a sequential contract id). This is what the QR code on a downloaded certificate
 * points to.
 */
export async function GET(request, { params }) {
    try {
        checkRateLimit(request, 'verify');
        const { token } = await params;
        return NextResponse.json(await contractController.getPublicVerification(token));
    } catch (error) {
        return apiError(error);
    }
}
