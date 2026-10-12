/*
  Warnings:

  - A unique constraint covering the columns `[privy_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "privy_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_privy_id_key" ON "users"("privy_id");
