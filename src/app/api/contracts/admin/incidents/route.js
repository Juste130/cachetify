import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import incidentController from '../../../../../server/controllers/incident';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        return NextResponse.json(await incidentController.listOpenIncidents(user));
    } catch (error) {
        return apiError(error);
    }
}
