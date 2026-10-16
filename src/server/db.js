const { PrismaClient } = require('@prisma/client');
const logger = require('./utils/logger');

// Next.js dev mode hot-reloads server modules on every edit (webpack/Turbopack re-evaluates
// this file), which would otherwise instantiate a brand new PrismaClient — and its own
// connection pool — on every single save, quickly exhausting Postgres' connection limit.
// Caching the instance on `globalThis` (which survives module re-evaluation, unlike a plain
// module-level variable re-created each time this file reloads) keeps dev mode to one client
// for the life of the process. In production there is exactly one module evaluation anyway,
// so this is a no-op there.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__cachetifyPrisma || new PrismaClient({
    log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
    ],
});

// The listener must be registered once too: the client above is reused across reloads, so
// re-registering it here on every evaluation would pile up listeners (each one keeping its
// own logger instance alive) and grow the dev server's memory with every save.
if (process.env.NODE_ENV === 'development' && !globalForPrisma.__cachetifyPrisma) {
    globalForPrisma.__cachetifyPrisma = prisma;
    prisma.$on('query', (e) => {
        logger.debug('Query: ' + e.query);
        logger.debug('Duration: ' + e.duration + 'ms');
    });
}

module.exports = prisma;
