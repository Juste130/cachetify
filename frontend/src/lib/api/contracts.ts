import apiClient, { handleApiError } from './client';

export interface Contract {
    id: string;
    contractId: number;
    userId: string;
    title: string;
    /** Platform-wide sequential number (Postgres autoincrement) — the only thing guaranteed
     *  unique between two contracts. Format for display with formatReference() from
     *  lib/utils/contractNaming.ts ("CTF-000042"), never render the bare integer. */
    reference: number;
    ipfsHash: string;
    /** Jeton public non devinable vers lequel pointe le code QR du certificat — voir
     *  /verify/[id]/page.tsx et pdfGenerator.ts. */
    publicToken?: string;
    status:
    | 'DRAFT_WAITING_SIGNERS'
    | 'READY_TO_DEPLOY'
    | 'DRAFT'
    | 'PENDING_SIGNATURES'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'DISPUTED'
    | 'TERMINATED'
    | 'RESIGNED';
    metadata: any;
    lastSync: string;
    createdAt: string;
    signatories?: ContractSignatory[];
}

export interface ContractSignatory {
    id: string;
    email: string;
    name: string | null;
    role: number;
    walletAddress: string | null;
    isRegistered: boolean;
}

export const contractsApi = {
    /**
     * Save a draft contract and wait for signers (Option 1)
     */
    async saveDraft(data: any): Promise<{ contract: Contract }> {
        try {
            const response = await apiClient.post('/api/contracts/draft', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get details of a draft contract
     */
    async getDraftDetails(id: string): Promise<{ contract: Contract & { signatories?: any[] } }> {
        try {
            const response = await apiClient.get(`/api/contracts/draft/${id}`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Mark draft as deployed on chain. The backend independently verifies the transaction
     * hash on-chain and resolves the real contractId itself — it does not trust a
     * client-supplied contractId, so none is sent here.
     */
    async markDraftDeployed(id: string, data: { transactionHash: string }): Promise<{ contract: Contract }> {
        try {
            const response = await apiClient.post(`/api/contracts/draft/${id}/deploy`, data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get cached contracts for current user
     */
    async getCachedContracts(params?: {
        page?: number;
        limit?: number;
        status?: string;
    }): Promise<{
        contracts: Contract[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }> {
        try {
            const response = await apiClient.get('/api/contracts/cached', { params });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Sync specific contract from blockchain
     */
    async syncContract(contractId: number): Promise<{ contract: Contract }> {
        try {
            const response = await apiClient.post(`/api/contracts/sync/${contractId}`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Sync all user contracts from blockchain
     */
    async syncAllContracts(): Promise<{ syncedCount: number }> {
        try {
            const response = await apiClient.post('/api/contracts/sync-all');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Search contracts
     */
    async searchContracts(query: string): Promise<{
        contracts: Contract[];
        count: number;
    }> {
        try {
            const response = await apiClient.get('/api/contracts/search', {
                params: { query },
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get contract details
     */
    async getContractDetails(contractId: number): Promise<{ contract: Contract }> {
        try {
            const response = await apiClient.get(`/api/contracts/${contractId}`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get accurate per-status contract counts for the current user (not limited to one page)
     */
    async getContractsSummary(): Promise<{
        total: number;
        byStatus: Record<string, number>;
        withIpfs: number;
    }> {
        try {
            const response = await apiClient.get('/api/contracts/summary');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Resend an invitation/signature request email to a signatory who hasn't signed yet
     */
    async resendSignatureRequest(id: string, signatoryId: string): Promise<{ message: string }> {
        try {
            const response = await apiClient.post(`/api/contracts/${id}/resend-signature`, { signatoryId });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get all contracts (admin only)
     */
    async getAllContracts(params?: {
        page?: number;
        limit?: number;
        status?: string;
        email?: string;
        search?: string;
    }): Promise<{
        contracts: (Contract & { user?: { id: string; email: string; role: string } })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }> {
        try {
            const response = await apiClient.get('/api/contracts/admin/all', {
                params,
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Public, unauthenticated verification lookup — what the QR code on a downloaded
     * certificate points to. Accepts either the on-chain numeric contractId or the draft
     * UUID. Deliberately returns only what's needed to verify authenticity, never the
     * contract's actual content or a signatory's contact details.
     */
    /** id est le jeton public non devinable (publicToken), jamais un identifiant numérique
     *  ni un UUID de brouillon — voir mémoire, chapitre 2, section Sécurité et protection des
     *  données. Ni titre ni nom complet dans la réponse : voir toInitials côté serveur. */
    async getPublicVerification(id: string): Promise<{
        reference: number;
        status: string;
        createdAt: string;
        contractId: number | null;
        sha256Hash: string | null;
        isExternalPdf: boolean;
        /** True when status/hash/signatures below were just re-read live from the smart
         *  contract rather than served from the cache — false means the on-chain read failed
         *  and the response fell back to the (still trustworthy, just not freshly-verified) cache. */
        verifiedOnChain: boolean;
        signatories: { initials: string | null; hasSigned: boolean }[];
        /** Empreinte SHA-256 du certificat officiel (le PDF avec code QR, ou pour un import
         *  le document original fusionné avec ce certificat) — déposée une seule fois par
         *  contrat via storeCertificate ci-dessous, servie ici depuis le cache. Distincte de
         *  sha256Hash (celle du contenu brut) : la page publique doit pouvoir reconnaître
         *  l'une ou l'autre des deux versions qu'un utilisateur peut redéposer. */
        certificateSha256Hash: string | null;
    }> {
        try {
            const response = await apiClient.get(`/api/contracts/verify/${id}`);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Dépose le certificat officiel (le PDF avec code QR) pour qu'il devienne, lui aussi,
     * vérifiable plus tard sur la page publique — idempotent côté serveur : si un autre
     * appel (un autre participant qui ouvrait la page au même moment) a déjà déposé le sien,
     * `alreadyExisted` vaut `true` et c'est SA version qui est renvoyée, jamais la nôtre.
     * Voir contract-details-page.tsx (dépôt et ancrage automatiques dès la page ouverte).
     */
    async storeCertificate(contractId: string, file: Blob, fileName = "certificate.pdf"): Promise<{
        cid: string;
        sha256Hash: string;
        alreadyExisted: boolean;
    }> {
        try {
            const formData = new FormData();
            formData.append('file', file, fileName);
            const response = await apiClient.post(`/api/contracts/${contractId}/certificate`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Platform-wide contract counts by status, not truncated by pagination (admin only)
     */
    async getAdminContractsSummary(): Promise<{
        total: number;
        byStatus: Record<string, number>;
        thisMonth: number;
    }> {
        try {
            const response = await apiClient.get('/api/contracts/admin/summary');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
