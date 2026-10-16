import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../server/http';
import notificationService from '../../../../server/services/notification';

export async function POST(request) {
    try {
        const user = await authenticate(request);
        await notificationService.markAllRead(user.userId);
        return NextResponse.json({ message: 'Notifications marquées comme lues' });
    } catch (error) {
        return apiError(error);
    }
}
