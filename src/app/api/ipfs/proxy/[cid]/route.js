import { NextResponse } from 'next/server';
import { authenticate, apiError } from '../../../../../server/http';
import ipfsController from '../../../../../server/controllers/ipfs';

export async function GET(request, { params }) {
    try {
        const user = await authenticate(request);
        const { cid } = await params;
        const { buffer, mimeType, fileName } = await ipfsController.proxyDocument(user, cid);

        // "inline" par défaut, pour l'aperçu dans l'application. `?download=1` bascule sur
        // "attachment" : c'est le fichier original, octet pour octet, celui dont l'empreinte
        // est ancrée sur la blockchain. Ne jamais transformer ces octets ici : toute
        // transformation casserait la correspondance avec l'empreinte vérifiable plus tard.
        const isDownload = new URL(request.url).searchParams.get('download') === '1';
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': isDownload ? `attachment; filename="${fileName}"` : 'inline',
            },
        });
    } catch (error) {
        return apiError(error);
    }
}
