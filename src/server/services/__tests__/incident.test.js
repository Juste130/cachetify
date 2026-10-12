/**
 * Starter test suite for the incident (dispute/hold) state machine — flagged by an audit
 * as sensitive business logic with zero automated coverage. Prisma, notifications and
 * email are mocked: these are unit tests of the SERVICE'S OWN decision-making (which
 * transitions are allowed, which errors get thrown, and why), not integration tests
 * against a real database. That's a deliberate scope choice, not full coverage — see the
 * project's audit notes for the rest of what's still uncovered (escrow, auth).
 */
const { BadRequestError, ConflictError, NotFoundError, ForbiddenError } = require('../../utils/errors');

jest.mock('../../db', () => ({
    contractIncident: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
    },
    contractCache: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
}));
jest.mock('../notification', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../email', () => ({ sendGenericNotification: jest.fn().mockResolvedValue(undefined) }));

const prisma = require('../../db');
const incidentService = require('../incident');

const CONTRACT_ID = 'contract-1';
const RAISER_ID = 'user-raiser';
const OTHER_ID = 'user-other';
const INCIDENT_ID = 'incident-1';

beforeEach(() => {
    jest.clearAllMocks();
    // hasOpenIncident() runs inside _notifyParticipants's caller paths too, but by default
    // no contract lookup succeeds unless a test configures it — keeps notification
    // side-effects a no-op unless a test cares about them.
    prisma.contractCache.findUnique.mockResolvedValue(null);
});

describe('raiseDispute', () => {
    it('rejects a dispute with no description', async () => {
        await expect(incidentService.raiseDispute(CONTRACT_ID, RAISER_ID, { description: '  ' }))
            .rejects.toBeInstanceOf(BadRequestError);
        expect(prisma.contractIncident.create).not.toHaveBeenCalled();
    });

    it('refuses a second dispute while one is already open (anti-spam)', async () => {
        prisma.contractIncident.count.mockResolvedValue(1); // hasOpenIncident() -> true
        await expect(
            incidentService.raiseDispute(CONTRACT_ID, RAISER_ID, { description: 'Non paye' })
        ).rejects.toBeInstanceOf(ConflictError);
        expect(prisma.contractIncident.create).not.toHaveBeenCalled();
    });

    it('creates an OPEN dispute that takes effect immediately, no consent required', async () => {
        prisma.contractIncident.count.mockResolvedValue(0);
        prisma.contractIncident.create.mockResolvedValue({ id: INCIDENT_ID, status: 'OPEN' });

        await incidentService.raiseDispute(CONTRACT_ID, RAISER_ID, { description: 'Non paye', reason: 'NON_PAYMENT' });

        expect(prisma.contractIncident.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'DISPUTE',
                status: 'OPEN',
                requiresConsent: false,
                raisedByUserId: RAISER_ID,
            }),
        }));
    });
});

describe('proposeHold', () => {
    it('requires consent from the other party (does not take effect on creation)', async () => {
        prisma.contractIncident.count.mockResolvedValue(0);
        prisma.contractIncident.create.mockResolvedValue({ id: INCIDENT_ID, status: 'OPEN' });

        await incidentService.proposeHold(CONTRACT_ID, RAISER_ID, { description: 'Pause amiable' });

        expect(prisma.contractIncident.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ type: 'HOLD', requiresConsent: true, status: 'OPEN' }),
        }));
    });
});

describe('respondToHold', () => {
    const baseHold = { id: INCIDENT_ID, type: 'HOLD', status: 'OPEN', raisedByUserId: RAISER_ID, contractCacheId: CONTRACT_ID };

    it('rejects responding to a non-existent incident', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue(null);
        await expect(incidentService.respondToHold(INCIDENT_ID, OTHER_ID, true)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects responding to a DISPUTE as if it were a HOLD', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ ...baseHold, type: 'DISPUTE' });
        await expect(incidentService.respondToHold(INCIDENT_ID, OTHER_ID, true)).rejects.toBeInstanceOf(BadRequestError);
    });

    it('rejects responding to a hold that is no longer pending', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ ...baseHold, status: 'ACCEPTED_ACTIVE' });
        await expect(incidentService.respondToHold(INCIDENT_ID, OTHER_ID, true)).rejects.toBeInstanceOf(ConflictError);
    });

    it('forbids the proposer from responding to their own hold', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue(baseHold);
        await expect(incidentService.respondToHold(INCIDENT_ID, RAISER_ID, true)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('accepting sets ACCEPTED_ACTIVE (this is what actually freezes the escrow deadline)', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue(baseHold);
        prisma.contractIncident.update.mockResolvedValue({ ...baseHold, status: 'ACCEPTED_ACTIVE' });

        await incidentService.respondToHold(INCIDENT_ID, OTHER_ID, true);

        expect(prisma.contractIncident.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'ACCEPTED_ACTIVE', respondedByUserId: OTHER_ID }),
        }));
    });

    it('rejecting sets REJECTED (hold never took effect)', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue(baseHold);
        prisma.contractIncident.update.mockResolvedValue({ ...baseHold, status: 'REJECTED' });

        await incidentService.respondToHold(INCIDENT_ID, OTHER_ID, false);

        expect(prisma.contractIncident.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'REJECTED' }),
        }));
    });
});

describe('resolve (admin mediation)', () => {
    it('requires an explanation', async () => {
        await expect(incidentService.resolve(INCIDENT_ID, 'admin-1', ''))
            .rejects.toBeInstanceOf(BadRequestError);
    });

    it('rejects resolving an incident that is already closed', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: 'RESOLVED', contractCacheId: CONTRACT_ID });
        await expect(incidentService.resolve(INCIDENT_ID, 'admin-1', 'Regle a l\'amiable'))
            .rejects.toBeInstanceOf(ConflictError);
    });

    it('resolves an open incident and records who closed it', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: 'OPEN', type: 'DISPUTE', contractCacheId: CONTRACT_ID });
        prisma.contractIncident.update.mockResolvedValue({ id: INCIDENT_ID, status: 'RESOLVED' });

        await incidentService.resolve(INCIDENT_ID, 'admin-1', 'Paiement effectue, litige clos.');

        expect(prisma.contractIncident.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'RESOLVED', resolvedByUserId: 'admin-1' }),
        }));
    });
});

describe('withdraw', () => {
    it('only the original raiser can withdraw their own incident', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID, raisedByUserId: RAISER_ID, status: 'OPEN' });
        await expect(incidentService.withdraw(INCIDENT_ID, OTHER_ID)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('cannot withdraw an incident that is already closed', async () => {
        prisma.contractIncident.findUnique.mockResolvedValue({ id: INCIDENT_ID, raisedByUserId: RAISER_ID, status: 'WITHDRAWN' });
        await expect(incidentService.withdraw(INCIDENT_ID, RAISER_ID)).rejects.toBeInstanceOf(ConflictError);
    });
});

describe('hasOpenIncident', () => {
    it('counts an OPEN dispute or an ACCEPTED_ACTIVE hold as blocking, nothing else', async () => {
        prisma.contractIncident.count.mockResolvedValue(1);
        expect(await incidentService.hasOpenIncident(CONTRACT_ID)).toBe(true);

        expect(prisma.contractIncident.count).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                contractCacheId: CONTRACT_ID,
                OR: [
                    { type: 'DISPUTE', status: 'OPEN' },
                    { type: 'HOLD', status: 'ACCEPTED_ACTIVE' },
                ],
            }),
        }));
    });
});
