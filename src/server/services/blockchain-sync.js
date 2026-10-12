const { ethers } = require('ethers');
const prisma = require('../db');
const logger = require('../utils/logger');
const { config } = require('../config');
const { ContractStatus } = require('@prisma/client');
const notificationService = require('./notification');
const { AppError, BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');
const { buildContractTitle } = require('../utils/contract-naming');

const CONTRACT_MANAGER_ABI = [
    'function getUserContracts(address user) external view returns (uint256[])',
    'function getContractDetails(uint256 contractId) external view returns (tuple(uint256 id, address creator, uint40 createdAt, uint40 expiresAt, uint40 effectiveDate, uint8 status, string sha256Hash) contractData, tuple(address signer, uint8 role, string customRole, bool hasSignedContract, uint40 signedAt)[] signers, bool allSigned)',
    'event ContractCreated(uint256 indexed contractId, address indexed creator, uint40 createdAt, address[] additionalSigners)',
    'event ContractFinalized(uint256 indexed contractId, uint40 effectiveDate)',
    'function getTotalContracts() external view returns (uint256)',
];

class BlockchainSyncService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(config.polygonRpcUrl);

        if (ethers.isAddress(config.contractManagerAddress)) {
            this.contractManager = new ethers.Contract(
                config.contractManagerAddress,
                CONTRACT_MANAGER_ABI,
                this.provider
            );
        } else {
            logger.warn(`Invalid Contract Manager Address: ${config.contractManagerAddress}. Blockchain sync disabled.`);
            this.contractManager = null;
        }
    }

    async syncUserContracts(userAddress, userId) {
        if (!this.contractManager) {
            logger.warn('Skipping user contract sync: No valid contract manager');
            return 0;
        }

        try {
            const contractIds = await this.contractManager.getUserContracts(userAddress);

            await Promise.all(
                contractIds.map((contractId) => this.syncContract(contractId.toString(), userId))
            );

            const syncedCount = contractIds.length;
            logger.info(`Synced ${syncedCount} contracts for user ${userAddress}`);

            return syncedCount;
        } catch (error) {
            logger.error('Error syncing user contracts:', error);
            // Don't throw to avoid blocking the main flow
            return 0;
        }
    }

    async syncContract(contractId, userId) {
        if (!this.contractManager) return;

        try {
            const details = await this.contractManager.getContractDetails(contractId);

            const contractData = details.contractData;
            const signers = details.signers;

            const status = this.mapContractStatus(contractData.status);

            // The name typed into THIS contract's own signatory form (ContractSignatory.name —
            // e.g. "Jean Dupont", or "Ma Société SAS" for Partie A) is what the creator meant
            // by this person's name on this specific document. The same wallet can be a
            // different name on a different contract (a company rep signing under their title
            // here, their own name there) — the signer's account-wide profile name is neither
            // of those, and previously always won post-deployment, silently replacing whatever
            // the form actually said with the account's global (and often email-derived) name.
            const draftSignatories = await prisma.contractSignatory.findMany({
                where: { contract: { contractId: parseInt(contractId, 10) } },
            });

            // Lookup each signer's address in our database to resolve their name and email
            // (case-insensitive: on-chain addresses may be checksummed differently than stored)
            const enrichedSigners = await Promise.all(signers.map(async (s) => {
                const wallet = await prisma.userWallet.findFirst({
                    where: { publicAddress: { equals: s.signer, mode: 'insensitive' } },
                    include: { user: true }
                });
                const draftMatch = draftSignatories.find(
                    (ds) => ds.walletAddress && ds.walletAddress.toLowerCase() === s.signer.toLowerCase()
                );

                return {
                    address: s.signer,
                    name: draftMatch?.name || wallet?.user?.profileData?.name || wallet?.user?.email || null,
                    email: draftMatch?.email || wallet?.user?.email || null,
                    role: Number(s.role),
                    customRole: s.customRole,
                    hasSigned: s.hasSignedContract,
                    signedAt: Number(s.signedAt),
                };
            }));

            const metadata = {
                creator: contractData.creator,
                createdAt: Number(contractData.createdAt),
                expiresAt: Number(contractData.expiresAt),
                effectiveDate: Number(contractData.effectiveDate),
                sha256Hash: contractData.sha256Hash,
                signers: enrichedSigners,
                allSigned: details.allSigned,
            };

            let finalUserId = userId;
            if (!finalUserId) {
                const creatorWallet = await prisma.userWallet.findFirst({
                    where: { publicAddress: { equals: contractData.creator, mode: 'insensitive' } }
                });
                finalUserId = creatorWallet?.userId || null;
            }

            if (!finalUserId) {
                logger.warn(`Could not resolve userId for creator: ${contractData.creator}. Skipping cache upsert.`);
                return;
            }

            // Merge onto whatever off-chain metadata already exists (content, parties,
            // country/city, escrow declaration, deploymentTxHash...) instead of replacing
            // it wholesale — a plain `metadata: metadata` update here would silently wipe
            // the draft's document content the moment this runs post-deployment, since this
            // upsert matches the same row by the contractId that markDraftDeployed just set.
            const existingRow = await prisma.contractCache.findUnique({
                where: { contractId: parseInt(contractId) },
                select: { metadata: true },
            });
            const mergedMetadata = { ...(existingRow?.metadata || {}), ...metadata };

            await prisma.contractCache.upsert({
                where: { contractId: parseInt(contractId) },
                update: {
                    status,
                    metadata: mergedMetadata,
                    lastSync: new Date(),
                },
                create: {
                    contractId: parseInt(contractId),
                    userId: finalUserId,
                    // This row's own draft never went through saveDraft (a contract deployed
                    // outside this app's normal flow, or a race the event listener caught
                    // first) — no form-entered party names to draw on, so this falls back to
                    // whatever name each signer resolves to (see enrichedSigners above:
                    // wallet's profile name, else email, else the bare address). Built with
                    // the same shared naming rules as everywhere else rather than a generic,
                    // permanent English placeholder ("Contract #N") that never gets fixed up.
                    title: buildContractTitle({
                        documentType: 'Contrat',
                        partyNames: enrichedSigners.map((s) => s.name || s.address),
                        createdAt: new Date(Number(contractData.createdAt) * 1000),
                    }),
                    ipfsHash: '',
                    status,
                    metadata,
                    lastSync: new Date(),
                },
            });

            logger.info(`Contract ${contractId} synced successfully`);
        } catch (error) {
            logger.error(`Error syncing contract ${contractId}:`, error);
            // Don't throw
        }
    }

    /**
     * One tick of the event sync — called by the Netlify Scheduled Function
     * (netlify/functions/blockchain-sync-tick.ts) roughly once a minute. Used to be a
     * setInterval loop polling every 15s inside a long-lived Express process; a Scheduled
     * Function has no such process, so this runs to completion and exits, and the
     * last-scanned block is persisted in the `sync_cursors` table (see schema.prisma)
     * instead of an in-memory instance property — otherwise every invocation would forget
     * where the previous one left off.
     */
    async runSyncTick() {
        if (!this.contractManager) {
            logger.warn('Blockchain sync tick skipped: No valid contract manager');
            return;
        }

        // Use polling via queryFilter instead of contract.on() which relies on
        // server-side eth_newFilter with a short TTL (~5min) causing "filter not found" errors.
        let lastScannedBlock;
        try {
            const cursor = await prisma.syncCursor.findUnique({ where: { id: 1 } });
            if (cursor) {
                lastScannedBlock = cursor.lastScannedBlock;
            } else {
                // First tick ever: nothing to catch up on, start from the current block.
                lastScannedBlock = await this.provider.getBlockNumber();
                await prisma.syncCursor.create({ data: { id: 1, lastScannedBlock } });
            }
        } catch (error) {
            logger.error('Could not read/initialize sync cursor, tick skipped:', error);
            return;
        }

        // Free tier RPC plans (Alchemy, etc.) limit eth_getLogs to 10 blocks per request.
        // We use 9 as a safe ceiling to stay under that limit.
        const MAX_BLOCK_CHUNK = 9;

        const processChunk = async (fromBlock, toBlock) => {
            // Every event body below is wrapped in its own try/catch. Without this, a single
            // hiccup partway through (e.g. the DB connection pool exhaustion / RPC timeouts
            // seen in production logs) throws out of processChunk entirely — which aborts the
            // whole block-range scan before the cursor is advanced for this chunk. The next
            // tick then re-queries the *same* block range from scratch via
            // queryFilter, which returns the *same* on-chain events again (they're permanent
            // log entries), and re-runs every side effect for them — including re-sending
            // emails and re-creating in-app notifications for signers who were already
            // successfully notified moments earlier. That silent full-chunk retry, not a
            // literal duplicate emission on-chain, is what produced duplicate notifications.
            // Catching per-event means one contract's hiccup no longer nukes every other
            // contract's already-completed notifications in the same chunk.

            // ContractCreated
            const createdEvents = await this.contractManager.queryFilter(
                this.contractManager.filters.ContractCreated(),
                fromBlock, toBlock
            );
            for (const event of createdEvents) {
                try {
                    const [contractId, creator] = event.args;
                    logger.info(`New contract created: ${contractId} by ${creator}`);
                    const wallet = await prisma.userWallet.findFirst({
                        where: { publicAddress: { equals: creator, mode: 'insensitive' } },
                    });
                    if (wallet) {
                        await this.syncContract(contractId.toString(), wallet.userId);
                    }
                } catch (err) {
                    logger.error(`Error processing ContractCreated for tx ${event.transactionHash}:`, err);
                }
            }

            // ContractFinalized
            const finalizedEvents = await this.contractManager.queryFilter(
                this.contractManager.filters.ContractFinalized(),
                fromBlock, toBlock
            );
            for (const event of finalizedEvents) {
                try {
                    const [contractId] = event.args;
                    logger.info(`Contract finalized: ${contractId}`);

                    // First sync contract details to keep cache accurate
                    await this.syncContract(contractId.toString(), null);

                    const contract = await prisma.contractCache.findUnique({
                        where: { contractId: Number(contractId) }
                    });

                    if (contract && contract.metadata && contract.metadata.signers) {
                        const emailService = require('./email');
                        for (const signer of contract.metadata.signers) {
                            if (!signer.email) continue;
                            emailService.sendContractFinalizedNotification(
                                signer.email,
                                contract.title,
                                contractId.toString()
                            ).catch(err => logger.error(`[Email] Failed to send finalized notification to ${signer.email}:`, err));
                        }

                        // In-app notification too, not just email — this is the moment every
                        // signature has been collected and the contract goes live; missing it
                        // in the bell because it only ever went out by email was the bulk of why
                        // the in-app notification system looked completely dead in practice.
                        // Each signer is its own try/catch: one signer's lookup failing (e.g. a
                        // momentary DB pool exhaustion) must not stop the others in this same
                        // event from being notified, nor abort the chunk and force a full retry.
                        for (const signer of contract.metadata.signers) {
                            if (!signer.email) continue;
                            try {
                                const notifyUser = await prisma.user.findUnique({ where: { email: signer.email } });
                                if (!notifyUser) continue;
                                await notificationService.create(notifyUser.id, {
                                    type: 'GENERIC',
                                    title: 'Contrat actif',
                                    message: `Toutes les signatures ont été collectées : le contrat "${contract.title}" est maintenant actif.`,
                                    contractCacheId: contract.id,
                                });
                            } catch (err) {
                                logger.error(`[Notification] Failed to notify ${signer.email} of finalization:`, err);
                            }
                        }
                    }
                } catch (err) {
                    logger.error(`Error processing ContractFinalized for tx ${event.transactionHash}:`, err);
                }
            }

        };

        const withTimeout = (promise, ms, label) => {
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            });
            return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
        };

        try {
            const currentBlock = await withTimeout(this.provider.getBlockNumber(), 20_000, 'getBlockNumber');
            if (currentBlock <= lastScannedBlock) return;

            let from = lastScannedBlock + 1;
            const to = currentBlock;

            // Process in chunks of MAX_BLOCK_CHUNK to respect free tier block range limits
            while (from <= to) {
                const chunkTo = Math.min(from + MAX_BLOCK_CHUNK - 1, to);
                await withTimeout(processChunk(from, chunkTo), 20_000, 'processChunk');
                // Advance cursor after each successful chunk so progress is never lost even
                // if a later chunk in this same tick fails.
                await prisma.syncCursor.update({ where: { id: 1 }, data: { lastScannedBlock: chunkTo } });
                from = chunkTo + 1;
            }
        } catch (error) {
            // Log but don't crash — next tick will retry from where we left off
            logger.error('Blockchain event sync tick error:', error);
        }
    }

    /**
     * Verifies that a transaction hash reported by the client actually corresponds to a
     * successful on-chain `createContract` call, before the backend trusts it enough to
     * flip a draft's status. Without this, a buggy or malicious client could report an
     * arbitrary contractId/txHash pair and create a phantom contract that never syncs.
     * Returns the verified contractId, as reported by the ContractCreated event itself,
     * not by the client. Does not sync the cache itself — see the note below.
     */
    async verifyDeploymentTx(transactionHash, expectedCreatorUserId) {
        if (!this.contractManager) {
            throw new AppError('Blockchain sync unavailable: no valid contract manager configured', 503);
        }
        if (!transactionHash || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
            throw new BadRequestError('Invalid transaction hash');
        }

        const receipt = await this.provider.getTransactionReceipt(transactionHash);
        if (!receipt) {
            throw new NotFoundError('Transaction not found or not yet mined');
        }
        if (receipt.status !== 1) {
            throw new BadRequestError('Transaction failed on-chain');
        }

        // Privy's native gas sponsorship routes this transaction through Privy's own
        // infrastructure rather than sending it directly to the Contract Manager, so
        // receipt.to is no longer a reliable signal (it used to be, back when the frontend
        // called a plain ethers signer.sendTransaction straight to that address). The
        // meaningful check is below instead: a genuine ContractCreated event actually
        // emitted BY the Contract Manager contract — verified via each log's own `address`,
        // not merely by successfully decoding it against the ABI (any contract could emit a
        // same-shaped log otherwise).
        const event = receipt.logs
            .filter((log) => log.address?.toLowerCase() === config.contractManagerAddress?.toLowerCase())
            .map((log) => {
                try { return this.contractManager.interface.parseLog(log); }
                catch { return null; }
            })
            .find((e) => e && e.name === 'ContractCreated');

        if (!event) {
            throw new BadRequestError('No ContractCreated event found in this transaction');
        }

        const contractId = event.args.contractId.toString();
        const creatorAddress = event.args.creator;

        if (expectedCreatorUserId) {
            const creatorWallet = await prisma.userWallet.findFirst({
                where: { publicAddress: { equals: creatorAddress, mode: 'insensitive' } },
            });
            if (!creatorWallet || creatorWallet.userId !== expectedCreatorUserId) {
                throw new ForbiddenError('On-chain creator does not match the authenticated user');
            }
        }

        // Note: intentionally does NOT call syncContract() here. syncContract() upserts by
        // contractId, and at this point the draft row (found by its UUID, not by contractId)
        // still has contractId=null — an upsert here would create a *second*, duplicate cache
        // row instead of updating the draft, and the caller's subsequent update to the draft's
        // contractId would then collide with it (contractId is @unique). Callers must first
        // persist contractId onto the existing draft row, then call syncContract() themselves.

        return { contractId: parseInt(contractId, 10), creatorAddress };
    }

    mapContractStatus(blockchainStatus) {
        const statusMap = {
            0: ContractStatus.PENDING_SIGNATURES,
            1: ContractStatus.ACTIVE,
        };

        return statusMap[blockchainStatus] || ContractStatus.DRAFT;
    }

    async getCachedContract(contractId) {
        return await prisma.contractCache.findUnique({
            where: { contractId },
            include: { signatories: true },
        });
    }

    async searchContracts(query, userId) {
        const where = {
            OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { ipfsHash: { contains: query, mode: 'insensitive' } },
            ],
        };

        if (userId) {
            where.userId = userId;
        }

        return await prisma.contractCache.findMany({
            where,
            orderBy: { lastSync: 'desc' },
            take: 20,
        });
    }
}

module.exports = new BlockchainSyncService();
