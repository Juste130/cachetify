import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import { checkRateLimit } from '../../../../server/rate-limit';
import userController from '../../../../server/controllers/user';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        checkRateLimit(request, 'invite');
        const body = await request.json();
        return NextResponse.json(await userController.inviteUser(user, body));
    } catch (error) {
        return apiError(error);
    }
}
