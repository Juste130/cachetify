-- Persists sync-drift check results (blockchain-sync health) for admin visibility.
CREATE TABLE "sync_health_checks" (
    "id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "on_chain_total" INTEGER NOT NULL,
    "cached_total" INTEGER NOT NULL,
    "drifted" BOOLEAN NOT NULL DEFAULT false,
    "drifted_contract_ids" JSONB,

    CONSTRAINT "sync_health_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_health_checks_checked_at_idx" ON "sync_health_checks"("checked_at");
