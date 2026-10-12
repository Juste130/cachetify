-- Platform-wide sequential reference number ("CTF-000042" once formatted) — the only thing
-- the app relies on for guaranteed uniqueness between documents. `title` can (and does)
-- collide: same type, same signatories, same day. A Postgres sequence never hands out the
-- same value twice, even under concurrent inserts.
--
-- Existing rows get backfilled by the sequence in whatever order Postgres processes them —
-- fine, since nothing about that order matters for the uniqueness guarantee itself.
CREATE SEQUENCE "contract_cache_reference_seq";
ALTER TABLE "contract_cache" ADD COLUMN "reference" INTEGER NOT NULL DEFAULT nextval('contract_cache_reference_seq');
ALTER SEQUENCE "contract_cache_reference_seq" OWNED BY "contract_cache"."reference";
CREATE UNIQUE INDEX "contract_cache_reference_key" ON "contract_cache"("reference");
