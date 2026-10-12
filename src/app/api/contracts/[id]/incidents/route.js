import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import incidentController from '../../../../../server/controllers/incident';

export async function GET(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        return NextResponse.json(await incidentController.listIncidents(user, id));
    } catch (error) {
        return apiError(error);
    }
}
