import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import prisma from '../../../../server/db';
import { config } from '../../../../server/config';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { kycStatus: true, kycVerifiedAt: true, kycCountry: true, hasSeenKycPrompt: true },
        });
        // Surfaced so the UI can visibly flag a simulated verification instead of letting a
        // mock "VERIFIED" look indistinguishable from a real one.
        return NextResponse.json({ ...dbUser, mockMode: config.kyc.mockMode });
    } catch (error) {
        return apiError(error);
    }
}
