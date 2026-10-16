/*
  Warnings:

  - The values [CONTRACT_CREATED,CONTRACT_SIGNED,CONTRACT_FINALIZED,CONTRACT_DISPUTED,PAYMENT_RECEIVED,SIGNATURE_REQUIRED,SYSTEM_ALERT] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `metadata` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the `audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contract_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payments` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('PENDING_DEPOSIT', 'DEPOSITED', 'RELEASED', 'DISPUTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('DISPUTE', 'HOLD');

-- CreateEnum
CREATE TYPE "IncidentReason" AS ENUM ('NON_PAYMENT', 'POOR_QUALITY_WORK', 'DELAYS_IN_PERFORMANCE', 'BREACH_OF_CONFIDENTIALITY', 'INTELLECTUAL_PROPERTY_DISPUTE', 'MUTUAL_TIMEOUT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACCEPTED_ACTIVE', 'REJECTED', 'RESOLVED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContractStatus" ADD VALUE 'DRAFT_WAITING_SIGNERS';
ALTER TYPE "ContractStatus" ADD VALUE 'READY_TO_DEPLOY';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('ESCROW_REMINDER', 'ESCROW_RELEASED', 'ESCROW_DISPUTED', 'CONTRACT_READY_TO_DEPLOY', 'CONTRACT_TERMINATED', 'CONTRACT_DISPUTE_OPENED', 'CONTRACT_HOLD_PROPOSED', 'CONTRACT_HOLD_ACCEPTED', 'CONTRACT_HOLD_REJECTED', 'CONTRACT_INCIDENT_RESOLVED', 'GENERIC');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- AlterTable
ALTER TABLE "contract_cache" ALTER COLUMN "contract_id" DROP NOT NULL,
ALTER COLUMN "ipfs_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "metadata",
ADD COLUMN     "contract_cache_id" TEXT,
ALTER COLUMN "type" SET DEFAULT 'GENERIC';

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "contract_templates";

-- DropTable
DROP TABLE "payments";

-- DropEnum
DROP TYPE "AuditAction";

-- DropEnum
DROP TYPE "PaymentProvider";

-- DropEnum
DROP TYPE "PaymentStatus";

-- CreateTable
CREATE TABLE "contract_signatories" (
    "id" TEXT NOT NULL,
    "contract_cache_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" INTEGER NOT NULL DEFAULT 1,
    "wallet_address" TEXT,
    "is_registered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contract_signatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_escrows" (
    "id" TEXT NOT NULL,
    "contract_cache_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "penalty_percent" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "payer_user_id" TEXT,
    "provider" TEXT,
    "provider_ref" TEXT,
    "deposited_at" TIMESTAMP(3),
    "reminder_72_sent_at" TIMESTAMP(3),
    "reminder_48_sent_at" TIMESTAMP(3),
    "reminder_24_sent_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "disputed_at" TIMESTAMP(3),
    "dispute_reason" TEXT,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_incidents" (
    "id" TEXT NOT NULL,
    "contract_cache_id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "reason" "IncidentReason" NOT NULL,
    "custom_reason" TEXT,
    "description" TEXT NOT NULL,
    "proof_ipfs_hash" TEXT,
    "requires_consent" BOOLEAN NOT NULL DEFAULT false,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "raised_by_user_id" TEXT NOT NULL,
    "responded_by_user_id" TEXT,
    "responded_at" TIMESTAMP(3),
    "resolution" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "onchain_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_locks" (
    "name" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_locks_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "contract_signatories_contract_cache_id_idx" ON "contract_signatories"("contract_cache_id");

-- CreateIndex
CREATE INDEX "contract_signatories_email_idx" ON "contract_signatories"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contract_escrows_contract_cache_id_key" ON "contract_escrows"("contract_cache_id");

-- CreateIndex
CREATE INDEX "contract_escrows_status_idx" ON "contract_escrows"("status");

-- CreateIndex
CREATE INDEX "contract_incidents_contract_cache_id_idx" ON "contract_incidents"("contract_cache_id");

-- CreateIndex
CREATE INDEX "contract_incidents_status_idx" ON "contract_incidents"("status");

-- AddForeignKey
ALTER TABLE "contract_signatories" ADD CONSTRAINT "contract_signatories_contract_cache_id_fkey" FOREIGN KEY ("contract_cache_id") REFERENCES "contract_cache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_escrows" ADD CONSTRAINT "contract_escrows_contract_cache_id_fkey" FOREIGN KEY ("contract_cache_id") REFERENCES "contract_cache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_incidents" ADD CONSTRAINT "contract_incidents_contract_cache_id_fkey" FOREIGN KEY ("contract_cache_id") REFERENCES "contract_cache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
