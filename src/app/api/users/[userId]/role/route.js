import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../../../server/http';
import userController from '../../../../../server/controllers/user';

export async function PUT(request, { params }) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        const { userId } = await params;
        const body = await request.json();
        return NextResponse.json(await userController.updateUserRole(user, userId, body));
    } catch (error) {
        return apiError(error);
    }
}
