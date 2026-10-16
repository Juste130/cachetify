-- AlterTable: Add encryption_salt column to user_wallets
-- This column was added to the Prisma schema but never migrated to the database.
-- It is NULLABLE (String?) to stay backward compatible with existing custodial wallets
-- that were created before this field was introduced (they use a static 'salt' fallback
-- in WalletService.decryptPrivateKey).

ALTER TABLE "user_wallets" ADD COLUMN "encryption_salt" VARCHAR(32);
