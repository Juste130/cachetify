import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../../server/http';
import userController from '../../../../server/controllers/user';

export async function DELETE(request, { params }) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        const { userId } = await params;
        return NextResponse.json(await userController.deactivateUser(user, userId));
    } catch (error) {
        return apiError(error);
    }
}
