import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import { checkRateLimit } from '../../../../server/rate-limit';
import aiController from '../../../../server/controllers/ai';

export async function POST(request) {
    try {
        await authenticate(request);
        checkRateLimit(request, 'ai');
        const body = await request.json();
        return NextResponse.json(await aiController.suggestClauses(body));
    } catch (error) {
        return apiError(error);
    }
}
