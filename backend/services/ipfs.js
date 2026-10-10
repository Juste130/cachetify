const prisma = require('../models/prisma');
const logger = require('../utils/logger');
const { config } = require('../config');
const { AppError, NotFoundError } = require('../utils/errors');
const { encryptDocument, decryptDocument } = require('../utils/document-crypto');

// Nom de fichier et service conservés depuis la version Pinata/IPFS, pour ne pas devoir
// modifier tous les appelants existants (contrôleurs, smart contract, colonnes de base de
// données qui parlent tous d'un "ipfsHash"/"cid"). Depuis le chiffrement local (mémoire,
// chapitre 2, section Sécurité et protection des données), plus aucun document n'est envoyé
// à un service tiers : `cid` est une référence locale ("local-<sha256 du texte clair>"), et
// `fileData` contient le document chiffré (AES-256-GCM), jamais le texte clair.
class IPFSService {
    async uploadDocument(fileBuffer, fileName, mimeType, uploadedBy) {
        try {
            const encrypted = encryptDocument(fileBuffer);

            // upsert, pas create : chiffrer deux fois le même fichier produit la même
            // référence (dérivée du texte clair), donc un nouvel appel sur un document déjà
            // stocké doit rester un no-op plutôt qu'un conflit d'unicité — même comportement
            // qu'avec un CID IPFS.
            await prisma.ipfsDocument.upsert({
                where: { cid: encrypted.reference },
                create: {
                    cid: encrypted.reference,
                    fileName,
                    fileSize: fileBuffer.length,
                    mimeType,
                    uploadedBy,
                    fileData: encrypted.ciphertext,
                    encryptionIv: encrypted.iv,
                    encryptionAuthTag: encrypted.authTag,
                    wrappedKey: encrypted.wrappedKey,
                    keyIv: encrypted.keyIv,
                    keyAuthTag: encrypted.keyAuthTag,
                },
                update: {},
            });

            logger.info(`Document chiffré et stocké : ${encrypted.reference}`);

            return { cid: encrypted.reference, url: this.getPublicUrl(encrypted.reference) };
        } catch (error) {
            logger.error('Error encrypting/storing document:', error);
            throw new AppError('Failed to upload document', 500);
        }
    }

    async uploadJSON(data, name, uploadedBy) {
        try {
            const buffer = Buffer.from(JSON.stringify(data), 'utf-8');
            return await this.uploadDocument(buffer, `${name}.json`, 'application/json', uploadedBy);
        } catch (error) {
            logger.error('Error encrypting/storing JSON:', error);
            throw new AppError('Failed to upload JSON', 500);
        }
    }

    async getDocumentMetadata(cid) {
        try {
            const document = await prisma.ipfsDocument.findUnique({
                where: { cid },
            });

            if (!document) {
                throw new NotFoundError('Document not found');
            }

            return document;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Error getting document metadata:', error);
            throw new AppError('Failed to get document metadata', 500);
        }
    }

    /**
     * Déchiffre et renvoie le texte clair d'un document. Une ligne créée avant le passage au
     * chiffrement (colonnes de chiffrement NULL, import Pinata historique) est traitée comme
     * non déchiffrable plutôt que de planter : ce cas ne devrait plus se produire pour un
     * document déposé après ce changement.
     */
    async decryptStoredDocument(document) {
        if (!document.fileData || !document.encryptionIv || !document.wrappedKey) {
            throw new AppError('Document non déchiffrable (déposé avant le passage au chiffrement)', 410);
        }
        return decryptDocument({
            ciphertext: document.fileData,
            iv: document.encryptionIv,
            authTag: document.encryptionAuthTag,
            wrappedKey: document.wrappedKey,
            keyIv: document.keyIv,
            keyAuthTag: document.keyAuthTag,
        });
    }

    async unpinDocument(cid) {
        try {
            await prisma.ipfsDocument.delete({
                where: { cid },
            });

            logger.info(`Document supprimé : ${cid}`);
        } catch (error) {
            logger.error('Error deleting document:', error);
            throw new AppError('Failed to unpin document', 500);
        }
    }

    /**
     * Ancien nom conservé pour les appelants existants : ne pointe plus vers une passerelle
     * publique (il n'y en a plus, le document est chiffré), mais vers notre propre route
     * authentifiée qui le déchiffre à la volée.
     */
    getPublicUrl(cid) {
        return `${config.apiBaseUrl}/api/ipfs/proxy/${cid}`;
    }
}

module.exports = new IPFSService();
