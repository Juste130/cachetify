import apiClient, { handleApiError } from './client';

// NOTE: les anciens flux register/login/google (email+mot de passe et Google OAuth
// maison) ont été retirés — Privy gère désormais entièrement l'authentification.

export interface AuthResponse {
    user: {
        id: string;
        email: string;
        role: string;
        isActive: boolean;
        createdAt: string;
    };
    token: string;
    refreshToken: string;
}

export const authApi = {
    /**
     * Logout user
     * Supprime le cookie httpOnly côté serveur
     */
    async logout(): Promise<void> {
        try {
            await apiClient.post('/api/auth/logout');
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Refresh access token
     * Utilise le refresh token dans le cookie httpOnly
     */
    async refreshToken(): Promise<{ token: string }> {
        try {
            const response = await apiClient.post('/api/auth/refresh');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Privy authentication
     */
    async privyAuth(
        data: {
            privyId?: string;
            email: string;
            walletAddress?: string;
            profileData?: any;
        },
        token: string
    ): Promise<AuthResponse> {
        try {
            const response = await apiClient.post('/api/auth/privy', data, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};