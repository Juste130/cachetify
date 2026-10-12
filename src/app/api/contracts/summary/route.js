import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import contractController from '../../../../server/controllers/contract';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        return NextResponse.json(await contractController.getContractsSummary(user));
    } catch (error) {
        return apiError(error);
    }
}
