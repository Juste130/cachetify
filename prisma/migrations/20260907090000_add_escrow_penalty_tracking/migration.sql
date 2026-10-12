-- Tracks the actual amount released (may differ from the declared `amount` once a delay
-- penalty is applied when resolving a DISPUTED escrow) and whether a penalty was applied.
ALTER TABLE "contract_escrows"
  ADD COLUMN "released_amount" DECIMAL(14,2),
  ADD COLUMN "penalty_applied" BOOLEAN NOT NULL DEFAULT false;
