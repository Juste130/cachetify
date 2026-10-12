const crypto = require('crypto');
const ipfsService = require('../services/ipfs');
const logger = require('../utils/logger');
const prisma = require('../db');
const { isLikelyPdf } = require('../utils/pdf-signature');
const { hasContractAccess } = require('./contract');
const { AppError, BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

// 'application/pdf' — the "J'ai déjà un contrat (PDF)" import flow.
// 'text/html' — the AI-generated contract, rendered as a self-contained styled document so
// opening it shows an actual formatted document instead of a raw JSON blob or plain text.
// 'text/plain' kept for compatibility with anything still uploading raw text.
const ALLOWED_MIME_TYPES = ['application/pdf', 'text/html', 'text/plain'];

/** Dépose et chiffre un document. `file` is a web standard File from formData(). */
async function uploadDocument(user, file) {
    if (!file) throw new BadRequestError('No file provided');

    // Browsers can send "text/plain;charset=utf-8" — compare on the type only. This replaces
    // multer's fileFilter (client-declared Content-Type, trivially spoofable).
    const baseType = (file.type || '').split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.includes(baseType)) {
        throw new BadRequestError('Type de fichier non autorisé. Seuls les PDF et les fichiers texte sont acceptés.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // The content-type check above only looked at the client-declared value — a file
    // claiming to be a PDF gets its actual bytes checked here too, before it's stored and
    // served back through an unsandboxed iframe.
    if (baseType === 'application/pdf' && !isLikelyPdf(buffer)) {
        throw new BadRequestError('Le fichier fourni ne semble pas être un PDF valide.');
    }

    const result = await ipfsService.uploadDocument(buffer, file.name, file.type, user.userId);
    return { message: 'Document uploaded successfully', cid: result.cid, url: result.url };
}

async function uploadJSON(user, body) {
    const { data, name } = body;
    if (!data || !name) throw new BadRequestError('Data and name are required');
    const result = await ipfsService.uploadJSON(data, name, user.userId);
    return { message: 'JSON uploaded successfully', cid: result.cid, url: result.url };
}

async function getDocumentMetadata(user, cid) {
    const metadata = await ipfsService.getDocumentMetadata(cid);

    // Known limitation: `uploadedBy` on IpfsDocument is nullable (legacy uploads recorded
    // before this field existed). When it's null this comparison denies everyone but an
    // admin — including the document's real owner, who has no other way to prove ownership
    // here. Deliberately left deny-by-default: there is no reliable alternate source of
    // truth to confirm the real owner, and a permissive fallback would open every such
    // document to any authenticated user instead.
    if (metadata.uploadedBy !== user.userId && user.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized to access this document');
    }

    return { metadata, url: ipfsService.getPublicUrl(cid) };
}

/**
 * Sert un document déchiffré à la volée, depuis notre propre origine. Returns
 * { buffer, mimeType, fileName } — the route handler builds the actual binary Response.
 *
 * Gardé de la même façon que la consultation du contrat lui-même (créateur, signataire ou
 * admin — voir hasContractAccess), et non par IpfsDocument.uploadedBy : un signataire qui
 * n'est pas l'auteur du dépôt doit quand même pouvoir prévisualiser le document qu'il
 * s'apprête à signer.
 */
async function proxyDocument(user, cid) {
    const contract = await prisma.contractCache.findFirst({ where: { ipfsHash: cid }, include: { signatories: true } });
    if (!contract) throw new NotFoundError('Document not found');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Unauthorized to access this document');

    const document = await prisma.ipfsDocument.findUnique({ where: { cid } });
    if (!document) throw new NotFoundError('Document not found');

    const buffer = await ipfsService.decryptStoredDocument(document);

    // L'empreinte SHA-256 du texte clair déchiffré est recomparée à celle certifiée par le
    // contrat avant d'être servie (utile pour un document importé — isExternalPdf).
    const expectedHash = contract.metadata?.isExternalPdf ? contract.metadata?.sha256Hash : null;
    if (expectedHash) {
        const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (actualHash !== expectedHash) {
            logger.error(`[IPFS proxy] Document déchiffré pour ${cid} ne correspond pas au hash certifié (attendu ${expectedHash}, obtenu ${actualHash})`);
            throw new AppError('Le document stocké ne correspond plus à son empreinte certifiée', 409);
        }
    }

    return { buffer, mimeType: document.mimeType || 'application/octet-stream', fileName: document.fileName || 'document' };
}

async function unpinDocument(user, cid) {
    const metadata = await ipfsService.getDocumentMetadata(cid);
    if (metadata.uploadedBy !== user.userId && user.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized to unpin this document');
    }
    await ipfsService.unpinDocument(cid);
    return { message: 'Document unpinned successfully', cid };
}

module.exports = { uploadDocument, uploadJSON, getDocumentMetadata, proxyDocument, unpinDocument };
