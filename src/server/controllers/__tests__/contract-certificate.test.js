/**
 * Tests du dépôt du certificat officiel (storeCertificate) : la partie la plus délicate à
 * bien tester ici est l'idempotence — le certificat ne doit être posé et ancré sur la
 * blockchain qu'une seule fois par contrat, même si deux requêtes arrivent en même temps
 * (deux participants qui chargent la page au même moment). Voir mémoire, chapitre 3.
 */
jest.mock('../../db', () => ({
    contractCache: { findUnique: jest.fn() },
    userWallet: { findUnique: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn(),
}));
jest.mock('../../services/blockchain-sync', () => ({ getCachedContract: jest.fn(), contractManager: null, mapContractStatus: jest.fn() }));
jest.mock('../../services/ipfs', () => ({ uploadDocument: jest.fn() }));
jest.mock('../../services/email', () => ({}));
jest.mock('../../services/escrow', () => ({}));
jest.mock('../../services/notification', () => ({}));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const prisma = require('../../db');
const blockchainSyncService = require('../../services/blockchain-sync');
const ipfsService = require('../../services/ipfs');
const { storeCertificate } = require('../contract');

// Depuis la fusion en une seule app Next.js, storeCertificate n'est plus un handler Express
// (req, res, next) : la route lui passe (user, contractId, file), où file est un File Web
// (FormData), et il renvoie le résultat ou lève une AppError que la route traduit en statut.
const OWNER = { userId: 'user-1', role: 'USER' };

function pdfFile() {
    return new File([Buffer.from('certificat pdf')], 'cert.pdf', { type: 'application/pdf' });
}

const BASE_CONTRACT = { id: 'row-1', userId: 'user-1', contractId: 42, metadata: {}, signatories: [] };

beforeEach(() => jest.clearAllMocks());

describe('storeCertificate', () => {
    it('dépose le certificat et renvoie alreadyExisted=false quand cette requête est la première', async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);
        ipfsService.uploadDocument.mockResolvedValue({ cid: 'local-abc' });
        prisma.$executeRaw.mockResolvedValue(1); // une ligne affectée : on a gagné la course

        const payload = await storeCertificate(OWNER, '42', pdfFile());

        expect(ipfsService.uploadDocument).toHaveBeenCalledTimes(1);
        expect(payload.alreadyExisted).toBe(false);
        expect(payload.cid).toBe('local-abc');
        expect(payload.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("renvoie alreadyExisted=true sans rien stocker si le contrat a déjà un certificat", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue({
            ...BASE_CONTRACT,
            metadata: { certificateCid: 'local-existant', certificateSha256Hash: 'hash-existant' },
        });

        const payload = await storeCertificate(OWNER, '42', pdfFile());

        expect(ipfsService.uploadDocument).not.toHaveBeenCalled();
        expect(payload).toEqual({ cid: 'local-existant', sha256Hash: 'hash-existant', alreadyExisted: true });
    });

    it("gère la course : si l'UPDATE conditionnel n'affecte aucune ligne, renvoie la version du gagnant", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);
        ipfsService.uploadDocument.mockResolvedValue({ cid: 'local-nous' });
        prisma.$executeRaw.mockResolvedValue(0); // quelqu'un d'autre a déjà posé le sien entre-temps
        prisma.contractCache.findUnique.mockResolvedValue({
            metadata: { certificateCid: 'local-gagnant', certificateSha256Hash: 'hash-gagnant' },
        });

        const payload = await storeCertificate(OWNER, '42', pdfFile());

        expect(payload.alreadyExisted).toBe(true);
        expect(payload.cid).toBe('local-gagnant');
    });

    it("refuse un utilisateur qui n'a pas accès à ce contrat", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);

        await expect(storeCertificate({ userId: 'quelqu-un-dautre', role: 'USER' }, '42', pdfFile()))
            .rejects.toMatchObject({ statusCode: 403 });
        expect(ipfsService.uploadDocument).not.toHaveBeenCalled();
    });

    it('rejette une requête sans fichier', async () => {
        await expect(storeCertificate(OWNER, '42', undefined)).rejects.toMatchObject({ statusCode: 400 });
    });
});
