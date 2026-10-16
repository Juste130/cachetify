jest.mock('../../config', () => ({ config: { masterEncryptionKey: 'clef-de-test-non-vide' } }));
const { encryptDocument, decryptDocument } = require('../document-crypto');

describe('document-crypto (chiffrement des documents au repos)', () => {
    it('déchiffre exactement le texte clair d\'origine', () => {
        const original = Buffer.from('Contrat entre les parties A et B...', 'utf-8');
        const encrypted = encryptDocument(original);
        const decrypted = decryptDocument(encrypted);
        expect(decrypted.equals(original)).toBe(true);
    });

    it('produit une référence stable et idempotente pour un même contenu', () => {
        const content = Buffer.from('même contenu', 'utf-8');
        const a = encryptDocument(content);
        const b = encryptDocument(content);
        expect(a.reference).toBe(b.reference);
        expect(a.reference).toMatch(/^local-[0-9a-f]{64}$/);
        // Le chiffré lui-même change à chaque appel (IV aléatoire) même si la référence est stable.
        expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    });

    it('rejette un déchiffrement avec un authTag corrompu (intégrité)', () => {
        const encrypted = encryptDocument(Buffer.from('donnee sensible'));
        encrypted.authTag = Buffer.from(encrypted.authTag);
        encrypted.authTag[0] ^= 0xff;
        expect(() => decryptDocument(encrypted)).toThrow();
    });
});
