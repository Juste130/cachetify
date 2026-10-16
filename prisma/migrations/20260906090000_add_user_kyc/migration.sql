-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_VERIFIED',
  ADD COLUMN "kyc_provider" TEXT,
  ADD COLUMN "kyc_reference_id" TEXT,
  ADD COLUMN "kyc_country" TEXT,
  ADD COLUMN "kyc_verified_at" TIMESTAMP(3),
  ADD COLUMN "has_seen_kyc_prompt" BOOLEAN NOT NULL DEFAULT false;
