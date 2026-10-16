import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../../../server/http';
import incidentController from '../../../../../../../server/controllers/incident';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { incidentId } = await params;
        const body = await request.json();
        return NextResponse.json(await incidentController.resolveIncident(user, incidentId, body));
    } catch (error) {
        return apiError(error);
    }
}
