import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import contractController from '../../../../server/controllers/contract';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        const body = await request.json();
        return NextResponse.json(await contractController.saveDraft(user, body), { status: 201 });
    } catch (error) {
        return apiError(error);
    }
}
