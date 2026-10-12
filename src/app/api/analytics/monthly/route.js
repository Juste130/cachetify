import { NextResponse } from 'next/server';
import { authenticate, requireAdmin, apiError } from '../../../../server/http';
import analyticsController from '../../../../server/controllers/analytics';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        requireAdmin(user);
        const { searchParams } = new URL(request.url);
        return NextResponse.json(await analyticsController.getMonthlyStats(searchParams.get('months')));
    } catch (error) {
        return apiError(error);
    }
}
