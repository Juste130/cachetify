import type { Config } from '@netlify/functions';
// @ts-expect-error - plain CommonJS module, shared with the Next.js app's API routes.
import blockchainSyncService from '../../src/server/services/blockchain-sync';

/**
 * Replaces the setInterval-based polling loop that used to run inside the long-lived
 * Express process (backend/services/blockchain-sync.js's old startEventListener). Netlify
 * Functions have no equivalent of a persistent background process, so the same work now
 * runs as one tick per invocation, on a schedule, with its progress cursor persisted in the
 * `sync_cursors` table (see prisma/schema.prisma) instead of in memory.
 */
export default async () => {
    await blockchainSyncService.runSyncTick();
    return new Response('ok');
};

export const config: Config = {
    // Polygon produces a block roughly every ~2s; a new contract or signature showing up in
    // the cache within a minute is a reasonable trade-off against the previous 15s polling —
    // this is a dev-tooling tick for cache freshness, not something the UI blocks on (the
    // creator's own deploy/sign flow already force-syncs its own contract immediately).
    schedule: '*/1 * * * *',
};
