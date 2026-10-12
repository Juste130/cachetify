import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../../server/http';
import userController from '../../../../server/controllers/user';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        return NextResponse.json(await userController.getUsersSummary());
    } catch (error) {
        return apiError(error);
    }
}
