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

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

const BASE_CONTRACT = { id: 'row-1', userId: 'user-1', contractId: 42, metadata: {}, signatories: [] };

beforeEach(() => jest.clearAllMocks());

describe('storeCertificate', () => {
    it('dépose le certificat et renvoie alreadyExisted=false quand cette requête est la première', async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);
        ipfsService.uploadDocument.mockResolvedValue({ cid: 'local-abc' });
        prisma.$executeRaw.mockResolvedValue(1); // une ligne affectée : on a gagné la course

        const req = {
            params: { contractId: '42' },
            user: { userId: 'user-1', role: 'USER' },
            file: { buffer: Buffer.from('certificat pdf'), originalname: 'cert.pdf', mimetype: 'application/pdf' },
        };
        const res = mockRes();
        await storeCertificate(req, res, jest.fn());

        expect(ipfsService.uploadDocument).toHaveBeenCalledTimes(1);
        const payload = res.json.mock.calls[0][0];
        expect(payload.alreadyExisted).toBe(false);
        expect(payload.cid).toBe('local-abc');
        expect(payload.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("renvoie alreadyExisted=true sans rien stocker si le contrat a déjà un certificat", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue({
            ...BASE_CONTRACT,
            metadata: { certificateCid: 'local-existant', certificateSha256Hash: 'hash-existant' },
        });

        const req = {
            params: { contractId: '42' },
            user: { userId: 'user-1', role: 'USER' },
            file: { buffer: Buffer.from('certificat pdf'), originalname: 'cert.pdf', mimetype: 'application/pdf' },
        };
        const res = mockRes();
        await storeCertificate(req, res, jest.fn());

        expect(ipfsService.uploadDocument).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ cid: 'local-existant', sha256Hash: 'hash-existant', alreadyExisted: true });
    });

    it("gère la course : si l'UPDATE conditionnel n'affecte aucune ligne, renvoie la version du gagnant", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);
        ipfsService.uploadDocument.mockResolvedValue({ cid: 'local-nous' });
        prisma.$executeRaw.mockResolvedValue(0); // quelqu'un d'autre a déjà posé le sien entre-temps
        prisma.contractCache.findUnique.mockResolvedValue({
            metadata: { certificateCid: 'local-gagnant', certificateSha256Hash: 'hash-gagnant' },
        });

        const req = {
            params: { contractId: '42' },
            user: { userId: 'user-1', role: 'USER' },
            file: { buffer: Buffer.from('certificat pdf'), originalname: 'cert.pdf', mimetype: 'application/pdf' },
        };
        const res = mockRes();
        await storeCertificate(req, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.alreadyExisted).toBe(true);
        expect(payload.cid).toBe('local-gagnant');
    });

    it("refuse un utilisateur qui n'a pas accès à ce contrat", async () => {
        blockchainSyncService.getCachedContract.mockResolvedValue(BASE_CONTRACT);

        const req = {
            params: { contractId: '42' },
            user: { userId: 'quelqu-un-dautre', role: 'USER' },
            file: { buffer: Buffer.from('certificat pdf'), originalname: 'cert.pdf', mimetype: 'application/pdf' },
        };
        const res = mockRes();
        await storeCertificate(req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(ipfsService.uploadDocument).not.toHaveBeenCalled();
    });

    it('rejette une requête sans fichier', async () => {
        const req = { params: { contractId: '42' }, user: { userId: 'user-1', role: 'USER' }, file: undefined };
        const res = mockRes();
        await storeCertificate(req, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
    });
});
