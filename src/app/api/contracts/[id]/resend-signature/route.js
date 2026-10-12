import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import { checkRateLimit } from '../../../../../server/rate-limit';
import contractController from '../../../../../server/controllers/contract';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        checkRateLimit(request, 'resend', user.userId);
        const { id } = await params;
        const body = await request.json();
        return NextResponse.json(await contractController.resendSignatureRequest(user, id, body));
    } catch (error) {
        return apiError(error);
    }
}
