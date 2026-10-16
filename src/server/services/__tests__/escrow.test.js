/**
 * Starter test suite for the escrow status-transition guards — flagged by an audit as
 * sensitive business logic (real money, eventually) with zero automated coverage. Prisma,
 * notifications, email, incidents and the payment provider are all mocked: these are unit
 * tests of the SERVICE'S OWN guard conditions, not integration tests against a real
 * database or a real payment provider.
 */
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../../utils/errors');

jest.mock('../../db', () => ({
    contractEscrow: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    contractCache: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
}));
jest.mock('../notification', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../email', () => ({ sendGenericNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../incident', () => ({ hasOpenIncident: jest.fn().mockResolvedValue(false) }));
jest.mock('../payments', () => ({ paymentProvider: { createDepositCheckout: jest.fn() } }));

const prisma = require('../../db');
const incidentService = require('../incident');
const escrowService = require('../escrow');

const CONTRACT_ID = 'contract-1';
const CREATOR_ID = 'creator-1';
const OTHER_ID = 'other-1';
const ESCROW_ID = 'escrow-1';

beforeEach(() => {
    jest.clearAllMocks();
    incidentService.hasOpenIncident.mockResolvedValue(false);
    prisma.contractCache.findUnique.mockResolvedValue(null);
});

describe('declareTerms', () => {
    it('is a no-op when no amount is declared (nothing to escrow)', async () => {
        expect(await escrowService.declareTerms(CONTRACT_ID, { amount: '0' })).toBeNull();
        expect(await escrowService.declareTerms(CONTRACT_ID, {})).toBeNull();
        expect(prisma.contractEscrow.create).not.toHaveBeenCalled();
    });

    it('requires a deadline once a real amount is declared', async () => {
        await expect(escrowService.declareTerms(CONTRACT_ID, { amount: '50000' }))
            .rejects.toBeInstanceOf(BadRequestError);
    });

    it('starts a declared escrow at PENDING_DEPOSIT — no money moved yet', async () => {
        prisma.contractEscrow.create.mockResolvedValue({ id: ESCROW_ID, status: 'PENDING_DEPOSIT' });

        await escrowService.declareTerms(CONTRACT_ID, { amount: '50000', deadline: '2026-12-31' });

        expect(prisma.contractEscrow.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'PENDING_DEPOSIT', amount: '50000' }),
        }));
    });
});

describe('_getOwnedEscrow guard (used by requestDeposit/releaseNow/blockRelease)', () => {
    it('rejects a contract that does not exist', async () => {
        prisma.contractCache.findUnique.mockResolvedValue(null);
        await expect(escrowService.releaseNow(CONTRACT_ID, CREATOR_ID)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects anyone who is not the contract creator', async () => {
        prisma.contractCache.findUnique.mockResolvedValue({ id: CONTRACT_ID, userId: CREATOR_ID });
        await expect(escrowService.releaseNow(CONTRACT_ID, OTHER_ID)).rejects.toBeInstanceOf(ForbiddenError);
    });
});

describe('releaseNow', () => {
    beforeEach(() => {
        prisma.contractCache.findUnique.mockResolvedValue({ id: CONTRACT_ID, userId: CREATOR_ID });
    });

    it('refuses to release an escrow that is not DEPOSITED', async () => {
        prisma.contractEscrow.findUnique.mockResolvedValue({ id: ESCROW_ID, status: 'PENDING_DEPOSIT' });
        await expect(escrowService.releaseNow(CONTRACT_ID, CREATOR_ID)).rejects.toBeInstanceOf(ConflictError);
    });

    it('blocks release while an open dispute/accepted hold exists on the contract', async () => {
        prisma.contractEscrow.findUnique.mockResolvedValue({ id: ESCROW_ID, status: 'DEPOSITED', contractCacheId: CONTRACT_ID });
        incidentService.hasOpenIncident.mockResolvedValue(true);

        await expect(escrowService.releaseNow(CONTRACT_ID, CREATOR_ID)).rejects.toBeInstanceOf(ConflictError);
        expect(prisma.contractEscrow.update).not.toHaveBeenCalled();
    });

    it('releases a DEPOSITED escrow with no open incident', async () => {
        prisma.contractEscrow.findUnique.mockResolvedValue({ id: ESCROW_ID, status: 'DEPOSITED', contractCacheId: CONTRACT_ID });
        prisma.contractEscrow.update.mockResolvedValue({ id: ESCROW_ID, status: 'RELEASED', contractCacheId: CONTRACT_ID });
        // Two distinct contractCache.findUnique calls happen along this path: the ownership
        // check in _getOwnedEscrow (outer beforeEach's plain userId/id shape), then a second,
        // differently-shaped one inside _notifyParties (needs signatories/user for the
        // notification fan-out) — mockResolvedValueOnce lets each call get its own shape.
        prisma.contractCache.findUnique.mockResolvedValueOnce({ id: CONTRACT_ID, userId: CREATOR_ID });
        prisma.contractCache.findUnique.mockResolvedValueOnce({ id: CONTRACT_ID, userId: CREATOR_ID, user: null, signatories: [] });

        await escrowService.releaseNow(CONTRACT_ID, CREATOR_ID);

        expect(prisma.contractEscrow.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'RELEASED' }),
        }));
    });
});

describe('blockRelease', () => {
    beforeEach(() => {
        prisma.contractCache.findUnique.mockResolvedValue({ id: CONTRACT_ID, userId: CREATOR_ID });
    });

    it('only blocks a DEPOSITED escrow', async () => {
        prisma.contractEscrow.findUnique.mockResolvedValue({ id: ESCROW_ID, status: 'PENDING_DEPOSIT' });
        await expect(escrowService.blockRelease(CONTRACT_ID, CREATOR_ID, 'raison')).rejects.toBeInstanceOf(ConflictError);
    });

    it('refuses to block after the deadline has already passed', async () => {
        prisma.contractEscrow.findUnique.mockResolvedValue({
            id: ESCROW_ID, status: 'DEPOSITED', deadline: new Date(Date.now() - 1000),
        });
        await expect(escrowService.blockRelease(CONTRACT_ID, CREATOR_ID, 'raison')).rejects.toBeInstanceOf(ConflictError);
    });
});
