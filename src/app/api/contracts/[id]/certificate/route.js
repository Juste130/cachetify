import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import contractController from '../../../../../server/controllers/contract';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        const formData = await request.formData();
        const file = formData.get('file');
        return NextResponse.json(await contractController.storeCertificate(user, id, file));
    } catch (error) {
        return apiError(error);
    }
}
