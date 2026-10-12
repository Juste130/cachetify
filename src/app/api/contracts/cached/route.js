import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import contractController from '../../../../server/controllers/contract';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        const { searchParams } = new URL(request.url);
        return NextResponse.json(await contractController.getCachedContracts(user, searchParams));
    } catch (error) {
        return apiError(error);
    }
}
