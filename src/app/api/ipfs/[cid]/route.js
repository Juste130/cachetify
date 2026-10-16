import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import ipfsController from '../../../../server/controllers/ipfs';

export async function GET(request, { params }) {
    try {
        const user = await authenticate(request);
        const { cid } = await params;
        return NextResponse.json(await ipfsController.getDocumentMetadata(user, cid));
    } catch (error) {
        return apiError(error);
    }
}

export async function DELETE(request, { params }) {
    try {
        const user = await authenticate(request);
        const { cid } = await params;
        return NextResponse.json(await ipfsController.unpinDocument(user, cid));
    } catch (error) {
        return apiError(error);
    }
}
