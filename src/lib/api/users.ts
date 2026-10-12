import apiClient, { handleApiError } from './client';

export interface User {
    id: string;
    email: string;
    role: 'ADMIN' | 'USER' | 'VIEWER';
    isActive: boolean;
    createdAt: string;
    profileData?: any;
    kycStatus: 'NOT_VERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED';
    kycVerifiedAt: string | null;
    hasSeenKycPrompt: boolean;
}

export interface Wallet {
    id: string;
    publicAddress: string;
    isAdminWallet: boolean;
    createdAt: string;
    fundedAt?: string;
}

export interface UserWithWallet extends User {
    wallet: Wallet;
}

export interface AdminUser extends User {
    wallet: Wallet | null;
    _count: { contracts: number };
}

export const usersApi = {
    /**
     * Get current user profile
     */
    async getProfile(): Promise<{ user: UserWithWallet }> {
        try {
            const response = await apiClient.get('/api/users/me');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Update current user profile
     */
    async updateProfile(profileData: any): Promise<{ user: User }> {
        try {
            const response = await apiClient.put('/api/users/me', { profileData });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get user wallet info
     */
    async getWallet(): Promise<{
        wallet: {
            address: string;
            balance: string;
            isAdminWallet: boolean;
            createdAt: string;
            fundedAt?: string;
        };
    }> {
        try {
            const response = await apiClient.get('/api/users/wallet');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get all users (admin only)
     */
    async getAllUsers(params?: {
        page?: number;
        limit?: number;
        role?: string;
        search?: string;
        kycStatus?: string;
    }): Promise<{
        users: AdminUser[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }> {
        try {
            const response = await apiClient.get('/api/users', { params });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Platform-wide user counts, not truncated by pagination (admin only)
     */
    async getUsersSummary(): Promise<{ total: number; active: number; suspended: number; admins: number }> {
        try {
            const response = await apiClient.get('/api/users/summary');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Update user role (admin only)
     */
    async updateUserRole(
        userId: string,
        role: 'ADMIN' | 'USER' | 'VIEWER'
    ): Promise<{ user: User }> {
        try {
            const response = await apiClient.put(`/api/users/${userId}/role`, {
                role,
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Deactivate ("suspend") a user (admin only)
     */
    async deactivateUser(userId: string): Promise<{ user: User }> {
        try {
            const response = await apiClient.delete(`/api/users/${userId}`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Reactivate a previously suspended user (admin only)
     */
    async activateUser(userId: string): Promise<{ user: User }> {
        try {
            const response = await apiClient.post(`/api/users/${userId}/activate`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Invite someone who doesn't have a Cachetify account yet, by email
     */
    async inviteUser(email: string): Promise<{ message: string }> {
        try {
            const response = await apiClient.post('/api/users/invite', { email });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
