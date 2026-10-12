const crypto = require('crypto');
const blockchainSyncService = require('../services/blockchain-sync');
const prisma = require('../db');
const logger = require('../utils/logger');
const emailService = require('../services/email');
const escrowService = require('../services/escrow');
const notificationService = require('../services/notification');
const ipfsService = require('../services/ipfs');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../utils/errors');

// Jeton public de vérification (128 bits, non devinable) : c'est vers `/verify/<jeton>` que
// pointe le code QR du certificat, jamais vers l'identifiant numérique séquentiel du contrat
// ni vers l'UUID interne du brouillon — voir mémoire, chapitre 2, section Sécurité et
// protection des données ("Devinette de l'adresse de vérification").
function generatePublicToken() {
    return crypto.randomBytes(16).toString('base64url');
}

const MAX_SIGNATORIES = 20;

/**
 * A user can access a contract (draft or deployed) if they created it, if they are one of
 * its signatories (matched by email, since a draft signatory may not have a wallet yet — or
 * by wallet address, since that's what a deployed contract's on-chain signer list uses), or
 * if they are an admin. Centralized here so drafts and deployed contracts apply the exact
 * same rule instead of two independently-drifting checks.
 */
async function hasContractAccess(contract, user, signatories) {
    if (contract.userId === user.userId || user.role === 'ADMIN') return true;

    const sigs = signatories || contract.signatories || [];
    if (sigs.some(s => s.email && s.email === user.email)) return true;

    const wallet = await prisma.userWallet.findUnique({ where: { userId: user.userId } });
    if (wallet) {
        const addr = wallet.publicAddress.toLowerCase();
        if (sigs.some(s => s.walletAddress && s.walletAddress.toLowerCase() === addr)) return true;
        if (contract.metadata?.signers?.some(s => s.address?.toLowerCase() === addr)) return true;
    }

    return false;
}

/** Save a new contract draft (Option 1 workflow) */
async function saveDraft(user, body) {
    const userId = user.userId;
    const creatorEmail = user.email;
    const { title, metadata, signatories, ipfsHash } = body;

    if (!title || !title.trim()) throw new BadRequestError('Title is required');
    // Not a full schema (this JSON blob legitimately varies a lot by flow — AI-generated vs
    // imported PDF, signer enrichment added later by blockchain-sync...), but the client
    // should never be able to hand this endpoint something that isn't even a plain object.
    if (metadata !== undefined && metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
        throw new BadRequestError('metadata must be a plain object');
    }
    if (!Array.isArray(signatories) || signatories.length === 0) {
        throw new BadRequestError('At least one signatory is required');
    }
    if (signatories.length > MAX_SIGNATORIES) {
        throw new BadRequestError(`Too many signatories (max ${MAX_SIGNATORIES})`);
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set();
    for (const s of signatories) {
        if (!s.email || !emailPattern.test(s.email)) {
            throw new BadRequestError(`Invalid signatory email: ${s.email || '(empty)'}`);
        }
        const normalized = s.email.toLowerCase();
        if (seenEmails.has(normalized)) throw new BadRequestError(`Duplicate signatory email: ${s.email}`);
        seenEmails.add(normalized);
        if (!Number.isInteger(s.role) || s.role < 0 || s.role > 3) {
            throw new BadRequestError(`Invalid signatory role for ${s.email}`);
        }
    }

    // Automatically resolve signatories that are already registered on the platform
    const processedSignatories = await Promise.all(signatories.map(async s => {
        const matchedUser = await prisma.user.findUnique({ where: { email: s.email }, include: { wallet: true } });
        const walletAddress = s.walletAddress || (matchedUser?.wallet?.publicAddress) || null;
        const isRegistered = !!walletAddress;

        // Role 0 (Créateur) reflects a fact — this signatory is the account that submitted
        // the draft — not a form slot the client can claim. Derived here from the
        // authenticated session, overriding whatever role the client sent for this entry.
        const isDraftCreator = creatorEmail && s.email.toLowerCase() === creatorEmail.toLowerCase();
        const role = isDraftCreator ? 0 : s.role;

        return { email: s.email, name: s.name || null, role, walletAddress, isRegistered };
    }));

    // Create the draft and, if every signatory is already registered, flip it straight to
    // READY_TO_DEPLOY in the same transaction — avoids a window where a crash between the
    // two calls would leave the draft stuck in DRAFT_WAITING_SIGNERS despite being ready.
    const allRegistered = processedSignatories.every(s => s.isRegistered);
    const contract = await prisma.$transaction(async (tx) => {
        return tx.contractCache.create({
            data: {
                userId,
                title,
                ipfsHash: ipfsHash || null,
                publicToken: generatePublicToken(),
                status: allRegistered ? 'READY_TO_DEPLOY' : 'DRAFT_WAITING_SIGNERS',
                metadata,
                lastSync: new Date(),
                signatories: {
                    create: processedSignatories.map(s => ({
                        email: s.email, name: s.name, role: s.role,
                        walletAddress: s.walletAddress, isRegistered: s.isRegistered,
                    })),
                },
            },
            include: { signatories: true },
        });
    });

    // Declare escrow terms if the creator asked for one. This only records intent — no
    // money moves until a payment provider is wired (see services/escrow.js).
    if (metadata?.escrow?.amount) {
        try {
            await escrowService.declareTerms(contract.id, metadata.escrow);
        } catch (err) {
            logger.error(`Failed to declare escrow terms for contract ${contract.id}:`, err);
        }
    }

    // Invite not-yet-registered signatories to create an account now — they need lead
    // time, since deployment can't happen until every signatory has a wallet. Signatories
    // already registered are deliberately NOT emailed "please sign" here: nobody can
    // actually sign until the contract is deployed on-chain, which only happens later when
    // the creator deploys. That email is sent from markDraftDeployed instead.
    const notRegisteredSignatories = contract.signatories.filter(s => !s.isRegistered);
    for (const signatory of notRegisteredSignatories) {
        emailService.sendDraftInvitationEmail(signatory.email, signatory.name || signatory.email, contract.title, contract.id)
            .catch(err => logger.error(`[Email] Failed to send invitation to ${signatory.email}:`, err));
    }

    return { message: 'Draft saved successfully', contract };
}

/** Get draft details by UUID */
async function getDraftDetails(user, id) {
    const contract = await prisma.contractCache.findUnique({
        where: { id },
        include: { signatories: true, user: { select: { email: true, id: true } } },
    });
    if (!contract) throw new NotFoundError('Draft not found');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Unauthorized');
    return { contract };
}

/**
 * Mark draft as deployed (called after a client-reported on-chain transaction). The
 * contractId/transactionHash are only a claim from the client at this point — they are
 * verified on-chain (tx succeeded, sent to our Contract Manager, ContractCreated event
 * present, creator resolves to this user) before we trust them, otherwise a buggy or
 * malicious client could flip a draft to PENDING_SIGNATURES for a contract that was never
 * actually created.
 */
async function markDraftDeployed(user, id, body) {
    const { transactionHash } = body;
    const userId = user.userId;
    if (!transactionHash) throw new BadRequestError('transactionHash is required');

    const contract = await prisma.contractCache.findUnique({ where: { id }, include: { signatories: true } });
    if (!contract) throw new NotFoundError('Draft not found');
    if (contract.userId !== userId) throw new ForbiddenError('Unauthorized');

    let verified;
    try {
        verified = await blockchainSyncService.verifyDeploymentTx(transactionHash, userId);
    } catch (verifyError) {
        logger.error(`Deployment verification failed for draft ${id}:`, verifyError);
        throw new BadRequestError(`Could not verify on-chain deployment: ${verifyError.message}`);
    }

    // The background sync (Netlify Scheduled Function) polls the chain independently and,
    // on catching this same ContractCreated event before this request finishes, may have
    // already upserted a placeholder ContractCache row for this contractId — with no
    // storage reference and no signatories, since it only knows what's on-chain. contractId
    // is unique, so whichever write loses this race must reconcile with whatever already
    // claimed it, instead of throwing and leaving two rows for the same on-chain contract.
    const dropStalePlaceholder = () => prisma.contractCache.deleteMany({
        where: { contractId: verified.contractId, id: { not: id } },
    });
    const claimContractId = () => prisma.contractCache.update({
        where: { id },
        data: {
            contractId: verified.contractId,
            status: 'PENDING_SIGNATURES',
            metadata: { ...contract.metadata, deploymentTxHash: transactionHash },
        },
    });

    await dropStalePlaceholder();
    let updatedContract;
    try {
        updatedContract = await claimContractId();
    } catch (err) {
        if (err.code !== 'P2002') throw err;
        // Lost a tighter race: the placeholder was (re-)created between the delete above
        // and this update. One more attempt is enough.
        await dropStalePlaceholder();
        updatedContract = await claimContractId();
    }

    // Now that the draft row owns this contractId, pull the authoritative on-chain details
    // (signers, escrow, dates...) into it.
    await blockchainSyncService.syncContract(verified.contractId.toString(), userId);

    // Signing only becomes possible now (status PENDING_SIGNATURES) — this is the right
    // moment to tell every OTHER signatory it's their turn. The creator (role 0) is
    // excluded: createContract() auto-signs them on-chain as part of deployment itself.
    const signatoriesToNotify = contract.signatories.filter((s) => s.role !== 0);
    for (const signatory of signatoriesToNotify) {
        emailService.sendSignatureRequest(signatory.email, contract.title, contract.id, signatory.name || signatory.email)
            .catch(err => logger.error(`[Email] Failed to send sign request to ${signatory.email}:`, err));

        prisma.user.findUnique({ where: { email: signatory.email } })
            .then((notifyUser) => {
                if (!notifyUser) return;
                return notificationService.create(notifyUser.id, {
                    type: 'GENERIC',
                    title: 'Signature requise',
                    message: `Le contrat "${contract.title}" est prêt : c'est à vous de le signer.`,
                    contractCacheId: contract.id,
                });
            })
            .catch((err) => logger.error(`[Notification] Failed to notify ${signatory.email}:`, err));
    }

    return { message: 'Contract marked as deployed', contract: updatedContract };
}

/** Resend an invitation/signature request email to a signatory who has not signed yet */
async function resendSignatureRequest(user, id, body) {
    const { signatoryId } = body;
    if (!signatoryId) throw new BadRequestError('signatoryId requis');

    const contract = isNaN(Number(id))
        ? await prisma.contractCache.findUnique({ where: { id }, include: { signatories: true } })
        : await prisma.contractCache.findUnique({ where: { contractId: parseInt(id) }, include: { signatories: true } });

    if (!contract) throw new NotFoundError('Contrat introuvable');
    if (contract.userId !== user.userId && user.role !== 'ADMIN') throw new ForbiddenError('Non autorisé');

    const signatory = contract.signatories.find(s => s.id === signatoryId);
    if (!signatory) throw new NotFoundError('Signataire introuvable');

    let hasSigned = false;
    if (contract.contractId && contract.metadata?.signers && signatory.walletAddress) {
        const onChainSigner = contract.metadata.signers.find(
            s => s.address?.toLowerCase() === signatory.walletAddress.toLowerCase()
        );
        hasSigned = !!onChainSigner?.hasSigned;
    }
    if (hasSigned) throw new BadRequestError('Ce signataire a déjà signé le contrat');

    if (!signatory.isRegistered) {
        await emailService.sendDraftInvitationEmail(signatory.email, signatory.name || signatory.email, contract.title, contract.id);
    } else if (contract.contractId) {
        // A registered signatory can only actually sign once the contract is deployed —
        // before that, there is nothing to remind them of.
        await emailService.sendSignatureRequest(signatory.email, contract.title, contract.contractId, signatory.name || signatory.email);
    } else {
        throw new BadRequestError("Ce contrat n'est pas encore déployé — il n'y a rien à relancer pour ce signataire pour le moment.");
    }

    logger.info(`[Email] Signature reminder resent to ${signatory.email} for contract ${contract.id}`);
    return { message: 'Email de relance envoyé avec succès' };
}

/**
 * A signatory (added by the creator at draft time, matched by email) had view access but
 * no way to discover the contract's existence: the dashboard and "Mes contrats" list both
 * filtered strictly on `userId` (the creator) — only via a direct link otherwise.
 */
function visibleToUserWhere(user) {
    return {
        OR: [
            { userId: user.userId },
            ...(user.email ? [{ signatories: { some: { email: user.email } } }] : []),
        ],
    };
}

/** Accurate contract counts for the current user, grouped by status, plus how many have a
 *  stored document. Unlike /cached, never limited to a single page. */
async function getContractsSummary(user) {
    const visibleWhere = visibleToUserWhere(user);
    const [statusGroups, total, withIpfs] = await Promise.all([
        prisma.contractCache.groupBy({ by: ['status'], where: visibleWhere, _count: { _all: true } }),
        prisma.contractCache.count({ where: visibleWhere }),
        prisma.contractCache.count({ where: { ...visibleWhere, AND: [{ ipfsHash: { not: null } }, { ipfsHash: { not: '' } }] } }),
    ]);
    const byStatus = statusGroups.reduce((acc, row) => { acc[row.status] = row._count._all; return acc; }, {});
    return { total, byStatus, withIpfs };
}

async function getCachedContracts(user, query) {
    const page = parseInt(query.get('page') || '1', 10);
    const limit = parseInt(query.get('limit') || '20', 10);
    const status = query.get('status');

    const where = { ...visibleToUserWhere(user), ...(status ? { status } : {}) };
    const contracts = await prisma.contractCache.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { lastSync: 'desc' },
    });
    const total = await prisma.contractCache.count({ where });

    return { contracts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function syncContract(user, contractId) {
    await blockchainSyncService.syncContract(contractId, user.userId);
    const contract = await blockchainSyncService.getCachedContract(parseInt(contractId));
    return { message: 'Contract synced successfully', contract };
}

async function syncAllContracts(user) {
    const wallet = await prisma.userWallet.findUnique({ where: { userId: user.userId } });
    if (!wallet) throw new NotFoundError('Wallet not found');
    const syncedCount = await blockchainSyncService.syncUserContracts(wallet.publicAddress, user.userId);
    return { message: 'Contracts synced successfully', syncedCount };
}

async function searchContracts(user, query) {
    const q = query.get('query');
    if (!q) throw new BadRequestError('Search query is required');
    const contracts = await blockchainSyncService.searchContracts(q, user.userId);
    return { contracts, count: contracts.length };
}

async function getContractDetails(user, contractId) {
    const contract = await blockchainSyncService.getCachedContract(parseInt(contractId));
    if (!contract) throw new NotFoundError('Contract not found');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Unauthorized to view this contract');
    return { contract };
}

/**
 * Dépose le certificat officiel (le document complet, signatures et QR code inclus) — une
 * seule fois par contrat, jamais régénéré ensuite. La première requête qui arrive « gagne » :
 * la mise à jour de `metadata` est conditionnée par une clause WHERE qui échoue si
 * `certificateCid` est déjà renseigné, ce qui règle la course si deux participants
 * chargeaient la page au même moment.
 */
async function storeCertificate(user, contractId, file) {
    if (!file) throw new BadRequestError('No file provided');

    const contract = await blockchainSyncService.getCachedContract(parseInt(contractId));
    if (!contract) throw new NotFoundError('Contract not found');
    if (!(await hasContractAccess(contract, user))) throw new ForbiddenError('Unauthorized');

    if (contract.metadata?.certificateCid) {
        return { cid: contract.metadata.certificateCid, sha256Hash: contract.metadata.certificateSha256Hash, alreadyExisted: true };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const { cid } = await ipfsService.uploadDocument(buffer, file.name, file.type, user.userId);

    const updated = await prisma.$executeRaw`
        UPDATE contract_cache
        SET metadata = jsonb_set(
            jsonb_set(metadata, '{certificateCid}', to_jsonb(${cid}::text)),
            '{certificateSha256Hash}', to_jsonb(${sha256Hash}::text)
        )
        WHERE id = ${contract.id} AND metadata->>'certificateCid' IS NULL
    `;

    if (updated === 0) {
        // Quelqu'un d'autre a gagné la course entre-temps — on relit sa version, la nôtre
        // reste stockée mais orpheline (inoffensif, jamais référencée nulle part).
        const winner = await prisma.contractCache.findUnique({ where: { id: contract.id }, select: { metadata: true } });
        return { cid: winner.metadata.certificateCid, sha256Hash: winner.metadata.certificateSha256Hash, alreadyExisted: true };
    }

    logger.info(`Certificat officiel déposé pour le contrat ${contractId} : ${cid}`);
    return { cid, sha256Hash, alreadyExisted: false };
}

// Initiales d'un nom complet, pour la page publique : "Jean DOSSOU" -> "J.D.". Jamais le nom
// entier — voir mémoire, chapitre 2, section Sécurité et protection des données.
function toInitials(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    const initials = fullName.trim().split(/\s+/).map((part) => part[0]?.toUpperCase()).filter(Boolean).join('.');
    return initials ? `${initials}.` : null;
}

/**
 * Vérification publique, sans authentification — ce que le code QR d'un certificat pointe.
 * Un tiers qui le scanne n'a pas de compte Cachetify : référence, statut, empreinte, ancrage
 * blockchain, et les signataires réduits à leurs initiales — jamais le titre, un nom complet,
 * un courriel, le contenu ni la référence de stockage.
 */
async function getPublicVerification(token) {
    const contract = await prisma.contractCache.findUnique({ where: { publicToken: token }, include: { signatories: true } });
    if (!contract) throw new NotFoundError('Contract not found');

    // The one read path that deliberately bypasses the cache: the point of a *public*
    // verification page is to let a stranger confirm a claim independently of our own
    // database. When deployed, re-derive status/hash/signatures from the chain and let it
    // override the cache; fall back to the cache on RPC failure, but say so via
    // verifiedOnChain so the UI stays honest about which source answered.
    let status = contract.status;
    let sha256Hash = contract.metadata?.sha256Hash || null;
    let signedAddresses = new Set(
        (contract.metadata?.signers || []).filter((s) => s.hasSigned).map((s) => s.address?.toLowerCase()).filter(Boolean)
    );
    let verifiedOnChain = false;

    if (contract.contractId != null && blockchainSyncService.contractManager) {
        try {
            const details = await blockchainSyncService.contractManager.getContractDetails(contract.contractId);
            const contractData = details.contractData;
            status = blockchainSyncService.mapContractStatus(contractData.status);
            sha256Hash = contractData.sha256Hash || sha256Hash;
            signedAddresses = new Set(
                details.signers.filter((s) => s.hasSignedContract).map((s) => s.signer?.toLowerCase()).filter(Boolean)
            );
            verifiedOnChain = true;
        } catch (error) {
            logger.warn(`Public verification: on-chain read failed for contract ${contract.contractId}, falling back to cache:`, error.message);
        }
    }

    return {
        reference: contract.reference,
        status,
        createdAt: contract.createdAt,
        contractId: contract.contractId,
        sha256Hash,
        certificateSha256Hash: contract.metadata?.certificateSha256Hash || null,
        isExternalPdf: !!contract.metadata?.isExternalPdf,
        verifiedOnChain,
        signatories: contract.signatories.map((s) => ({
            initials: toInitials(s.name),
            hasSigned: s.walletAddress ? signedAddresses.has(s.walletAddress.toLowerCase()) : false,
        })),
    };
}

async function getAllContracts(query) {
    const page = parseInt(query.get('page') || '1', 10);
    const limit = parseInt(query.get('limit') || '20', 10);
    const status = query.get('status');
    const email = query.get('email');
    const search = query.get('search');

    const where = {};
    if (status) where.status = status;
    if (email) where.user = { email: { equals: email, mode: 'insensitive' } };
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const contracts = await prisma.contractCache.findMany({
        where, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { lastSync: 'desc' },
    });
    const total = await prisma.contractCache.count({ where });

    return { contracts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/** Platform-wide contract counts, never truncated by the paginated /admin/all list. */
async function getAdminContractsSummary() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [statusGroups, total, thisMonth] = await Promise.all([
        prisma.contractCache.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.contractCache.count(),
        prisma.contractCache.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);
    const byStatus = statusGroups.reduce((acc, row) => { acc[row.status] = row._count._all; return acc; }, {});
    return { total, byStatus, thisMonth };
}

module.exports = {
    hasContractAccess, toInitials,
    saveDraft, getDraftDetails, markDraftDeployed, resendSignatureRequest,
    getContractsSummary, getCachedContracts, syncContract, syncAllContracts,
    searchContracts, getContractDetails, storeCertificate, getPublicVerification,
    getAllContracts, getAdminContractsSummary,
};
