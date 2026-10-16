import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import { checkRateLimit } from '../../../../server/rate-limit';
import userController from '../../../../server/controllers/user';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        checkRateLimit(request, 'wallet');
        return NextResponse.json(await userController.getWallet(user));
    } catch (error) {
        return apiError(error);
    }
}
