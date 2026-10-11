import apiClient, { handleApiError } from './client';

export const aiApi = {
    /**
     * Correct input using AI
     */
    async correctInput(data: {
        text: string;
        context: string;
    }): Promise<{
        corrected: string;
    }> {
        try {
            const response = await apiClient.post('/api/ai/correct-input', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Generate contract using AI
     */
    async generateContract(data: {
        templateType: string;
        partyAData: Record<string, any>;
        partyBData: Record<string, any>;
        additionalClauses?: string[];
        context?: string;
    }): Promise<{
        contract: string;
        suggestions: string[];
    }> {
        try {
            const response = await apiClient.post('/api/ai/generate-contract', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Improve a specific clause
     */
    async improveClause(data: {
        clause: string;
        context?: string;
    }): Promise<{
        improved: string;
        explanation: string;
    }> {
        try {
            const response = await apiClient.post('/api/ai/improve-clause', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Get clause suggestions for contract type
     */
    async suggestClauses(data: {
        contractType: string;
        specificNeeds?: string[];
    }): Promise<{
        clauses: string[];
    }> {
        try {
            const response = await apiClient.post('/api/ai/suggest-clauses', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Validate contract compliance. partyAData/partyBData sont optionnels : quand ils sont
     * fournis (le formulaire de création les a déjà), le serveur masque les champs
     * personnels (nom, courriel, adresse...) avant d'envoyer le texte au service d'IA.
     */
    async validateContract(
        contractText: string,
        parties?: { partyAData?: Record<string, any>; partyBData?: Record<string, any> }
    ): Promise<{
        isValid: boolean;
        issues: string[];
        suggestions: string[];
    }> {
        try {
            const response = await apiClient.post('/api/ai/validate', {
                contractText,
                partyAData: parties?.partyAData,
                partyBData: parties?.partyBData,
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Asks which known jurisdiction seat city actually covers a city the user typed by
     * hand (e.g. a satellite town of a bigger city's court). Best-effort suggestion only —
     * never a source of truth, the caller must let the user accept or ignore it.
     */
    async resolveJurisdictionCity(data: {
        city: string;
        country: string;
        knownCities: string[];
    }): Promise<{
        coveringCity: string | null;
        confidence: "high" | "medium" | "low";
    }> {
        try {
            const response = await apiClient.post('/api/ai/resolve-jurisdiction-city', data);
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Best-effort analysis of an imported PDF before it's saved: extracted parties (name +
     * email, only when the email genuinely appears in the document), whether it looks like
     * a contract, and whether it appears already signed. Every field here is a suggestion
     * for the UI to surface and let the user confirm or dismiss — never a fact to act on
     * silently. Gracefully returns neutral values for a scanned PDF with no text layer.
     */
    async analyzeImportedPdf(file: File): Promise<{
        parties: {
            name: string;
            email: string;
            /** Best-effort classification from the document's own wording (mentions of
             *  "société"/RCCM vs. "Monsieur/Madame") — null when not determinable. */
            type: "company" | "individual" | null;
            /** These four are only ever populated for a "company" party, and only when the
             *  exact value was found verbatim in the extracted text (see analyzeImportedContract
             *  server-side) — never guessed. */
            rccm: string;
            ifu: string;
            legalRepName: string;
            legalRepTitle: string;
            /** ISO (yyyy-mm-dd), only for an "individual" party, only when found verbatim. */
            dateOfBirth: string;
        }[];
        looksLikeContract: boolean | null;
        looksLikeContractConfidence: "high" | "medium" | "low";
        mentionsExistingSignature: boolean;
        signatureConfidence: "high" | "medium" | "low";
        signatureExcerpt: string | null;
        hasDigitalSignature: boolean;
        hasExtractedText: boolean;
        /** Best-effort document type classification, unified with the same template ids used
         *  by the AI-generation flow (see contract-templates.ts) — `knownType` when the text
         *  matches one of those, else a short free-text `suggestedLabel`. Always a suggestion
         *  to confirm/edit, never applied silently. */
        documentType: { knownType: string | null; suggestedLabel: string | null };
    }> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await apiClient.post('/api/ai/analyze-imported-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },
};
