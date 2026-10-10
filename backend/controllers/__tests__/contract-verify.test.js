/**
 * Tests de la vérification publique (essai E3, garde-fous de confidentialité de la page
 * publique — mémoire, chapitre 2 et chapitre 3). Deux choses testées séparément : la fonction
 * pure toInitials(), et la réponse de getPublicVerification, dont on vérifie qu'elle ne
 * contient jamais le titre ni un nom complet, et qu'elle échoue sur un ancien identifiant
 * numérique (l'énumération que le jeton public est censé empêcher).
 */
jest.mock('../../models/prisma', () => ({
    contractCache: { findUnique: jest.fn() },
}));
jest.mock('../../services/blockchain-sync', () => ({ contractManager: null, mapContractStatus: jest.fn() }));
jest.mock('../../services/email', () => ({}));
jest.mock('../../services/escrow', () => ({}));
jest.mock('../../services/notification', () => ({}));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const prisma = require('../../models/prisma');
const { getPublicVerification, toInitials } = require('../contract');

describe('toInitials', () => {
    it('réduit un nom complet à ses initiales', () => {
        expect(toInitials('Jean DOSSOU')).toBe('J.D.');
    });

    it('gère un nom composé de plusieurs mots', () => {
        expect(toInitials('Jean-Pierre Marie DOSSOU')).toBe('J.M.D.');
    });

    it('renvoie null pour un nom absent', () => {
        expect(toInitials(null)).toBeNull();
        expect(toInitials('')).toBeNull();
    });
});

function mockRes() {
    return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe('getPublicVerification', () => {
    beforeEach(() => jest.clearAllMocks());

    it("ne renvoie ni le titre ni un nom complet, seulement les initiales", async () => {
        prisma.contractCache.findUnique.mockResolvedValue({
            id: 'draft-1',
            contractId: null,
            reference: 42,
            title: 'Contrat de prestation — Jean DOSSOU',
            status: 'PENDING_SIGNATURES',
            createdAt: new Date('2026-01-01'),
            metadata: { sha256Hash: 'abc123', signers: [] },
            signatories: [{ name: 'Jean DOSSOU', walletAddress: null }],
        });

        const req = { params: { token: 'un-jeton-non-devinable' } };
        const res = mockRes();
        await getPublicVerification(req, res, jest.fn());

        const payload = res.json.mock.calls[0][0];
        expect(payload.title).toBeUndefined();
        expect(payload.signatories[0].initials).toBe('J.D.');
        expect(payload.signatories[0].name).toBeUndefined();
        expect(JSON.stringify(payload)).not.toContain('Jean DOSSOU');
    });

    it("recherche uniquement par jeton public, jamais par identifiant numérique", async () => {
        prisma.contractCache.findUnique.mockResolvedValue(null);
        const req = { params: { token: '42' } }; // un ancien identifiant numérique
        const res = mockRes();
        await getPublicVerification(req, res, jest.fn());

        expect(prisma.contractCache.findUnique).toHaveBeenCalledWith({
            where: { publicToken: '42' },
            include: { signatories: true },
        });
        expect(res.status).toHaveBeenCalledWith(404);
    });
});
