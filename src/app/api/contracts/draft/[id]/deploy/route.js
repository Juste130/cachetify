import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../../server/http';
import contractController from '../../../../../../server/controllers/contract';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        const body = await request.json();
        return NextResponse.json(await contractController.markDraftDeployed(user, id, body));
    } catch (error) {
        return apiError(error);
    }
}
