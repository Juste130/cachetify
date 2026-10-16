import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../../server/http';
import incidentController from '../../../../../../server/controllers/incident';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        const body = await request.json();
        return NextResponse.json(await incidentController.raiseDispute(user, id, body), { status: 201 });
    } catch (error) {
        return apiError(error);
    }
}
