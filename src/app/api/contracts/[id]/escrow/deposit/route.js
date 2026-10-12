import { NextResponse } from 'next/server';
import { authenticate, apiError, requireFeature } from '../../../../../../server/http';
import escrowController, { PaymentsUnavailableError } from '../../../../../../server/controllers/escrow';

export async function POST(request, { params }) {
    try {
        requireFeature('escrow');
        const user = await authenticate(request);
        const { id } = await params;
        return NextResponse.json(await escrowController.requestDeposit(user, id));
    } catch (error) {
        if (error instanceof PaymentsUnavailableError) {
            return NextResponse.json({ error: error.message, available: false }, { status: 503 });
        }
        return apiError(error);
    }
}
