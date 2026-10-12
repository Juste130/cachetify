import { NextResponse } from 'next/server';
import { authenticate, apiError, requireFeature } from '../../../../../server/http';
import escrowController from '../../../../../server/controllers/escrow';

export async function GET(request, { params }) {
    try {
        requireFeature('escrow');
        const user = await authenticate(request);
        const { id } = await params;
        return NextResponse.json(await escrowController.getEscrow(user, id));
    } catch (error) {
        return apiError(error);
    }
}
