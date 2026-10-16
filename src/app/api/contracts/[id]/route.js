import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import contractController from '../../../../server/controllers/contract';

export async function GET(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        return NextResponse.json(await contractController.getContractDetails(user, id));
    } catch (error) {
        return apiError(error);
    }
}
