import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import prisma from '../../../../server/db';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        await prisma.user.update({ where: { id: user.userId }, data: { hasSeenKycPrompt: true } });
        return NextResponse.json({ message: 'ok' });
    } catch (error) {
        return apiError(error);
    }
}
