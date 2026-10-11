import apiClient, { handleApiError } from './client';

export type KycStatus = 'NOT_VERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED';

export interface KycStatusResponse {
    kycStatus: KycStatus;
    kycVerifiedAt: string | null;
    kycCountry: string | null;
    hasSeenKycPrompt: boolean;
    /** True when no real Smile ID credentials are configured server-side — the verification
     *  is simulated and auto-approved rather than actually checked. */
    mockMode: boolean;
}

export const kycApi = {
    async getStatus(): Promise<KycStatusResponse> {
        try {
            const response = await apiClient.get('/api/kyc/status');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * `selfieBase64`/`idFrontBase64` are plain base64 (no "data:image/...;base64," prefix —
     * strip it before calling this, see the capture component).
     */
    async submit(data: {
        country: string;
        idType: string;
        selfieBase64: string;
        idFrontBase64: string;
    }): Promise<{ message: string; status: string; jobId: string }> {
        try {
            const response = await apiClient.post('/api/kyc/submit', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async dismissPrompt(): Promise<void> {
        try {
            await apiClient.post('/api/kyc/dismiss-prompt');
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
