import { NextResponse } from 'next/server';
import { authenticate, apiError, requireFeature } from '../../../../../../server/http';
import escrowController from '../../../../../../server/controllers/escrow';

export async function POST(request, { params }) {
    try {
        requireFeature('escrow');
        const user = await authenticate(request);
        const { id } = await params;
        const { applyPenalty } = await request.json().catch(() => ({}));
        return NextResponse.json(await escrowController.resolveDispute(user, id, applyPenalty));
    } catch (error) {
        return apiError(error);
    }
}
