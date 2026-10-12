import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import kycService from '../../../../server/services/kyc';
import { BadRequestError } from '../../../../server/utils/errors';

/** Submits a document + selfie already captured client-side (base64, no data: URI prefix). */
export async function POST(request) {
    try {
        const user = await authenticate(request);
        const { country, idType, selfieBase64, idFrontBase64 } = await request.json();
        if (!country || !idType || !selfieBase64 || !idFrontBase64) {
            throw new BadRequestError('country, idType, selfieBase64 et idFrontBase64 sont requis');
        }

        const result = await kycService.submitVerification({
            userId: user.userId, country, idType, selfieBase64, idFrontBase64,
        });

        return NextResponse.json({ message: 'Vérification soumise', ...result }, { status: 202 });
    } catch (error) {
        return apiError(error);
    }
}
