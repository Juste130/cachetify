import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import ipfsController from '../../../../server/controllers/ipfs';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        const formData = await request.formData();
        const file = formData.get('file');
        return NextResponse.json(await ipfsController.uploadDocument(user, file));
    } catch (error) {
        return apiError(error);
    }
}
