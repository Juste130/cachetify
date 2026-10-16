import apiClient, { handleApiError } from './client';

export interface MonthlyStat {
    key: string;
    label: string;
    users: number;
    contractsCreated: number;
    contractsSigned: number;
    logins: number;
}

export const analyticsApi = {
    /**
     * Real monthly trends (new users, contracts created/signed, logins) for the admin
     * Analytics dashboard (admin only)
     */
    async getMonthlyStats(months = 6): Promise<{
        months: MonthlyStat[];
        userGrowthPercent: number | null;
    }> {
        try {
            const response = await apiClient.get('/api/analytics/monthly', { params: { months } });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
