import { useState } from 'react';
import { ipfsApi } from '@/lib/api/ipfs';

export function useIPFS() {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const uploadFile = async (file: File) => {
        setUploading(true);
        setError(null);
        try {
            const result = await ipfsApi.uploadDocument(file);
            return result;
        } catch (err: any) {
            const msg = err.message || 'Erreur lors du téléversement sur IPFS';
            setError(msg);
            throw err;
        } finally {
            setUploading(false);
        }
    };

    const uploadJSON = async (data: Record<string, any>, name: string) => {
        setUploading(true);
        setError(null);
        try {
            const result = await ipfsApi.uploadJSON({ data, name });
            return result;
        } catch (err: any) {
            const msg = err.message || 'Erreur lors du téléversement JSON sur IPFS';
            setError(msg);
            throw err;
        } finally {
            setUploading(false);
        }
    };

    return {
        uploadFile,
        uploadJSON,
        getPublicUrl: ipfsApi.getPublicUrl,
        uploading,
        error,
    };
}
