import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../server/http';
import userController from '../../../server/controllers/user';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        const { searchParams } = new URL(request.url);
        return NextResponse.json(await userController.getAllUsers(searchParams));
    } catch (error) {
        return apiError(error);
    }
}
