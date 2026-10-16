-- Full-stack Next.js migration: escrow-scheduler.js and sync-health.js were both dropped
-- (no more setInterval-based schedulers; see nextjs-fullstack migration). Their backing
-- tables become unused. blockchain-sync.js's polling cursor moves from an in-memory
-- instance property to this table, so it survives between Netlify Scheduled Function
-- invocations (each a fresh process).

DROP TABLE "scheduler_locks";
DROP TABLE "sync_health_checks";

CREATE TABLE "sync_cursors" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_scanned_block" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("id")
);
