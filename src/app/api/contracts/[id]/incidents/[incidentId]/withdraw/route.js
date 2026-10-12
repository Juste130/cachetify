import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../../../server/http';
import incidentController from '../../../../../../../server/controllers/incident';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id, incidentId } = await params;
        return NextResponse.json(await incidentController.withdrawIncident(user, id, incidentId));
    } catch (error) {
        return apiError(error);
    }
}
