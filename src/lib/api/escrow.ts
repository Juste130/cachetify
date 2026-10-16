import apiClient, { handleApiError } from './client';

export type EscrowStatus =
    | 'PENDING_DEPOSIT'
    | 'DEPOSITED'
    | 'RELEASED'
    | 'DISPUTED'
    | 'REFUNDED';

export interface Escrow {
    id: string;
    contractCacheId: string;
    amount: string;
    currency: string;
    penaltyPercent: number;
    deadline: string;
    status: EscrowStatus;
    payerUserId: string | null;
    provider: string | null;
    providerRef: string | null;
    depositedAt: string | null;
    reminder72SentAt: string | null;
    reminder48SentAt: string | null;
    reminder24SentAt: string | null;
    releasedAt: string | null;
    disputedAt: string | null;
    disputeReason: string | null;
    refundedAt: string | null;
    /** The amount actually released — null until RELEASED. Equal to `amount` unless
     *  penaltyApplied, in which case it's `amount` reduced by `penaltyPercent`. */
    releasedAmount: string | null;
    penaltyApplied: boolean;
}

export const escrowApi = {
    async getEscrow(contractId: string): Promise<{ escrow: Escrow | null }> {
        try {
            const response = await apiClient.get(`/api/contracts/${contractId}/escrow`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Starts a deposit. Rejects with a clear message while no payment provider is wired
     * (backend responds 503) — callers should surface that message as-is, it's already
     * written for end users.
     */
    async requestDeposit(contractId: string): Promise<{ checkoutUrl: string }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/escrow/deposit`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async releaseNow(contractId: string): Promise<{ escrow: Escrow }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/escrow/release`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async blockRelease(contractId: string, reason: string): Promise<{ escrow: Escrow }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/escrow/block`, { reason });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /** Resolves a DISPUTED escrow — the only way out of that status. */
    async resolveDispute(contractId: string, applyPenalty: boolean): Promise<{ escrow: Escrow }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/escrow/resolve-dispute`, { applyPenalty });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
