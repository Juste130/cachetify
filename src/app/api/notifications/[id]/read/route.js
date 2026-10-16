import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import notificationService from '../../../../../server/services/notification';

export async function POST(request, { params }) {
    try {
        const user = await authenticate(request);
        const { id } = await params;
        await notificationService.markRead(id, user.userId);
        return NextResponse.json({ message: 'Notification marquée comme lue' });
    } catch (error) {
        return apiError(error);
    }
}
