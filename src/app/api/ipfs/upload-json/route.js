import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import ipfsController from '../../../../server/controllers/ipfs';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        const body = await request.json();
        return NextResponse.json(await ipfsController.uploadJSON(user, body));
    } catch (error) {
        return apiError(error);
    }
}
