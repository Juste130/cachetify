import apiClient, { handleApiError } from './client';
import type { IncidentType, IncidentReason, IncidentStatus } from '@/lib/contract-incidents';

export interface Incident {
    id: string;
    contractCacheId: string;
    type: IncidentType;
    reason: IncidentReason;
    customReason: string | null;
    description: string;
    proofIpfsHash: string | null;
    requiresConsent: boolean;
    status: IncidentStatus;
    raisedByUserId: string;
    respondedByUserId: string | null;
    respondedAt: string | null;
    resolution: string | null;
    resolvedByUserId: string | null;
    resolvedAt: string | null;
    onchainTxHash: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminIncident extends Incident {
    contract: { id: string; contractId: number | null; title: string };
}

export const incidentsApi = {
    /** Every incident still awaiting mediation, across every contract (admin only). */
    async listOpen(): Promise<{ incidents: AdminIncident[] }> {
        try {
            const response = await apiClient.get('/api/contracts/admin/incidents');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async list(contractId: string): Promise<{ incidents: Incident[] }> {
        try {
            const response = await apiClient.get(`/api/contracts/${contractId}/incidents`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async raiseDispute(contractId: string, data: {
        reason: IncidentReason;
        customReason?: string;
        description: string;
        proofIpfsHash?: string;
        onchainTxHash?: string;
    }): Promise<{ incident: Incident }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/incidents/dispute`, data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async proposeHold(contractId: string, data: {
        description: string;
        customReason?: string;
        proofIpfsHash?: string;
        onchainTxHash?: string;
    }): Promise<{ incident: Incident }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/incidents/hold`, data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async respondToHold(contractId: string, incidentId: string, accept: boolean): Promise<{ incident: Incident }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/incidents/${incidentId}/respond`, { accept });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    async withdraw(contractId: string, incidentId: string): Promise<{ incident: Incident }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/incidents/${incidentId}/withdraw`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /** ADMIN only — the mediator/support role in the current design. */
    async resolve(contractId: string, incidentId: string, resolution: string): Promise<{ incident: Incident }> {
        try {
            const response = await apiClient.post(`/api/contracts/${contractId}/incidents/${incidentId}/resolve`, { resolution });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
