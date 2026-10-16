import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import { checkRateLimit } from '../../../../server/rate-limit';
import aiController from '../../../../server/controllers/ai';

export async function POST(request) {
    try {
        await authenticate(request);
        checkRateLimit(request, 'ai');
        const formData = await request.formData();
        const file = formData.get('file');
        return NextResponse.json(await aiController.analyzeImportedPdf(file));
    } catch (error) {
        return apiError(error);
    }
}
