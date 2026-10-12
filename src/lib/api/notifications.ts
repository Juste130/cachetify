import apiClient, { handleApiError } from './client';

export interface AppNotification {
    id: string;
    type: string;
    title: string;
    message: string;
    contractCacheId: string | null;
    read: boolean;
    createdAt: string;
}

export const notificationsApi = {
    async list(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
        try {
            const response = await apiClient.get('/api/notifications');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async markRead(id: string): Promise<void> {
        try {
            await apiClient.post(`/api/notifications/${id}/read`);
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async markAllRead(): Promise<void> {
        try {
            await apiClient.post('/api/notifications/read-all');
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
