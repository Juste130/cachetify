const crypto = require('crypto');
const ipfsService = require('../services/ipfs');
const logger = require('../utils/logger');
const prisma = require('../models/prisma');
const { isLikelyPdf } = require('../utils/pdf-signature');
const { hasContractAccess } = require('./contract');
const { AppError } = require('../utils/errors');

/**
 * Dépose et chiffre un document (plus d'upload vers un service tiers)
 */
exports.uploadDocument = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const { originalname, mimetype, buffer } = req.file;
        const uploadedBy = req.user.userId;

        // The route's multer fileFilter only checked the client-declared Content-Type
        // (trivially spoofable) — a file claiming to be a PDF gets its actual bytes checked
        // here too, before it's pinned to IPFS and served back through an unsandboxed
        // iframe (contract-details-page.tsx / contract-view-page.tsx).
        const baseType = mimetype.split(';')[0].trim();
        if (baseType === 'application/pdf' && !isLikelyPdf(buffer)) {
            return res.status(400).json({ error: 'Le fichier fourni ne semble pas être un PDF valide.' });
        }

        const result = await ipfsService.uploadDocument(
            buffer,
            originalname,
            mimetype,
            uploadedBy
        );

        res.json({
            message: 'Document uploaded successfully',
            cid: result.cid,
            url: result.url,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Upload JSON to IPFS
 */
exports.uploadJSON = async (req, res, next) => {
    try {
        const { data, name } = req.body;

        if (!data || !name) {
            return res.status(400).json({ error: 'Data and name are required' });
        }

        const uploadedBy = req.user.userId;

        const result = await ipfsService.uploadJSON(data, name, uploadedBy);

        res.json({
            message: 'JSON uploaded successfully',
            cid: result.cid,
            url: result.url,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get document metadata
 */
exports.getDocumentMetadata = async (req, res, next) => {
    try {
        const { cid } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;

        const metadata = await ipfsService.getDocumentMetadata(cid);

        // Known limitation: `uploadedBy` on IpfsDocument is nullable (legacy uploads recorded
        // before this field existed). When it's null this comparison denies everyone but an
        // admin — including the document's real owner, who has no other way to prove ownership
        // here. Deliberately left deny-by-default rather than guessing a fallback: there is no
        // reliable alternate source of truth in this codebase to confirm the real owner, and a
        // permissive fallback would open every such document to any authenticated user instead.
        if (metadata.uploadedBy !== userId && userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized to access this document' });
        }

        res.json({
            metadata,
            url: ipfsService.getPublicUrl(cid),
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Sert un document déchiffré à la volée, depuis notre propre origine. Notre base de données
 * chiffrée EST la source canonique désormais (plus de service tiers ni de repli) : un
 * document manquant ou qui ne se déchiffre pas est une vraie erreur, pas un cas à contourner.
 *
 * L'empreinte SHA-256 du texte clair déchiffré est recomparée à celle certifiée par le
 * contrat avant d'être servie (utile pour un document importé — voir isExternalPdf — dont le
 * texte clair correspond exactement à ce hash ; pour un contrat rédigé par l'IA, le hash
 * porte sur le texte brut, pas sur ce document mis en forme, donc rien à comparer ici).
 *
 * Gardé de la même façon que la consultation du contrat lui-même (créateur, signataire ou
 * admin — voir hasContractAccess), et non par IpfsDocument.uploadedBy : un signataire qui
 * n'est pas l'auteur du dépôt doit quand même pouvoir prévisualiser le document qu'il
 * s'apprête à signer.
 */
exports.proxyDocument = async (req, res, next) => {
    try {
        const { cid } = req.params;

        const contract = await prisma.contractCache.findFirst({
            where: { ipfsHash: cid },
            include: { signatories: true },
        });
        if (!contract) return res.status(404).json({ error: 'Document not found' });
        if (!(await hasContractAccess(contract, req.user))) {
            return res.status(403).json({ error: 'Unauthorized to access this document' });
        }

        const document = await prisma.ipfsDocument.findUnique({ where: { cid } });
        if (!document) return res.status(404).json({ error: 'Document not found' });

        const buffer = await ipfsService.decryptStoredDocument(document);

        const expectedHash = contract.metadata?.isExternalPdf ? contract.metadata?.sha256Hash : null;
        if (expectedHash) {
            const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (actualHash !== expectedHash) {
                logger.error(`[IPFS proxy] Document déchiffré pour ${cid} ne correspond pas au hash certifié (attendu ${expectedHash}, obtenu ${actualHash})`);
                return next(new AppError('Le document stocké ne correspond plus à son empreinte certifiée', 409));
            }
        }

        res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
        // "inline" par défaut, pour l'aperçu dans l'application. `?download=1` bascule sur
        // "attachment" : c'est le fichier original, octet pour octet, celui dont l'empreinte
        // est ancrée sur la blockchain — voir "Document à conserver pour la vérification" côté
        // frontend. Ne jamais changer ces octets ici : toute transformation casserait la
        // correspondance avec l'empreinte que l'utilisateur pourra recomparer plus tard.
        const isDownload = req.query.download === '1';
        res.setHeader('Content-Disposition', isDownload ? `attachment; filename="${document.fileName || 'document'}"` : 'inline');
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

/**
 * Unpin document (delete)
 */
exports.unpinDocument = async (req, res, next) => {
    try {
        const { cid } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;

        const metadata = await ipfsService.getDocumentMetadata(cid);

        // See the same check in getDocumentMetadata above for why a null uploadedBy denies
        // by default (including to the real owner) rather than guessing a fallback.
        if (metadata.uploadedBy !== userId && userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Unauthorized to unpin this document' });
        }

        await ipfsService.unpinDocument(cid);

        res.json({
            message: 'Document unpinned successfully',
            cid,
        });
    } catch (error) {
        next(error);
    }
};
