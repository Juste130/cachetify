import { NextResponse } from 'next/server';
import { authenticate, apiError, requireFeature } from '../../../../../../server/http';
import escrowController from '../../../../../../server/controllers/escrow';

export async function POST(request, { params }) {
    try {
        requireFeature('escrow');
        const user = await authenticate(request);
        const { id } = await params;
        const { reason } = await request.json().catch(() => ({}));
        return NextResponse.json(await escrowController.blockRelease(user, id, reason));
    } catch (error) {
        return apiError(error);
    }
}
