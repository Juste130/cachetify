import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../../../server/http';
import contractController from '../../../../../server/controllers/contract';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        return NextResponse.json(await contractController.getAdminContractsSummary());
    } catch (error) {
        return apiError(error);
    }
}
