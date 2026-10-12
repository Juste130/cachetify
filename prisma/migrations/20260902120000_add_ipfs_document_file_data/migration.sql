-- Verified local cache of a pinned document's bytes, so the app can serve it from its own
-- database instead of depending on a third-party IPFS gateway's cooperation for every view.
-- Nullable: existing rows have no cached copy yet (backfilled opportunistically on next
-- read/upload) and this is never the canonical record — IPFS (the cid) and the on-chain
-- sha256Hash remain the source of truth; see the model comment in schema.prisma.
ALTER TABLE "ipfs_documents" ADD COLUMN "file_data" BYTEA;
