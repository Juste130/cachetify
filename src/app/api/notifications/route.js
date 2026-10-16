import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../server/http';
import notificationService from '../../../server/services/notification';

export async function GET(request) {
    try {
        const user = await authenticate(request);
        const notifications = await notificationService.listForUser(user.userId);
        const unreadCount = await notificationService.countUnread(user.userId);
        return NextResponse.json({ notifications, unreadCount });
    } catch (error) {
        return apiError(error);
    }
}
