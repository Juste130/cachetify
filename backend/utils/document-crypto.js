const crypto = require('crypto');
const { config } = require('../config');

// Chiffrement des documents au repos (AES-256-GCM), avec une clé propre à chaque document
// protégée par la clé maître — voir mémoire, chapitre 2, section Sécurité et protection des
// données. MASTER_ENCRYPTION_KEY peut être n'importe quelle chaîne non vide ; elle est
// toujours réduite par hachage à une clé AES-256 valide de 32 octets, plutôt que d'exiger un
// format précis (hexadécimal, base64...) qui ferait planter le serveur au démarrage sur une
// valeur mal formée.
function masterKey() {
    return crypto.createHash('sha256').update(String(config.masterEncryptionKey)).digest();
}

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // taille recommandee pour GCM

function encryptBuffer(plainBuffer, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext, iv, authTag };
}

function decryptBuffer(ciphertext, key, iv, authTag) {
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Chiffre un document avec une clé aléatoire propre à ce document, puis chiffre cette clé
 * avec la clé maître ("enveloppe"). Retourne tout ce qu'il faut stocker pour le déchiffrer
 * plus tard, plus une référence de stockage locale dérivée du contenu chiffré (remplace le
 * CID IPFS, avec la même propriété d'idempotence : chiffrer deux fois le même fichier avec
 * la même clé de document donnerait un IV différent donc un chiffré différent — la référence
 * est donc calculée sur le texte clair, pas sur le chiffré, pour rester idempotente comme
 * l'ancien comportement IPFS).
 */
function encryptDocument(plainBuffer) {
    const documentKey = crypto.randomBytes(32);
    const { ciphertext, iv, authTag } = encryptBuffer(plainBuffer, documentKey);

    const keyIv = crypto.randomBytes(IV_LENGTH);
    const keyCipher = crypto.createCipheriv(ALGO, masterKey(), keyIv);
    const wrappedKey = Buffer.concat([keyCipher.update(documentKey), keyCipher.final()]);
    const keyAuthTag = keyCipher.getAuthTag();

    const reference = `local-${crypto.createHash('sha256').update(plainBuffer).digest('hex')}`;

    return {
        reference,
        ciphertext,
        iv,
        authTag,
        wrappedKey,
        keyIv,
        keyAuthTag,
    };
}

function decryptDocument({ ciphertext, iv, authTag, wrappedKey, keyIv, keyAuthTag }) {
    const documentKey = decryptBuffer(wrappedKey, masterKey(), keyIv, keyAuthTag);
    return decryptBuffer(ciphertext, documentKey, iv, authTag);
}

module.exports = { encryptDocument, decryptDocument };
