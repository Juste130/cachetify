import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import userController from '../../../../server/controllers/user';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        return NextResponse.json(await userController.getProfile(user));
    } catch (error) {
        return apiError(error);
    }
}

export async function PUT(request) {
    try {
        const user = await authenticate(request);
        const body = await request.json();
        return NextResponse.json(await userController.updateProfile(user, body));
    } catch (error) {
        return apiError(error);
    }
}
