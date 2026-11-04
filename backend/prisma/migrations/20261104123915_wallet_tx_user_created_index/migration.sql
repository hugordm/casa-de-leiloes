-- DropIndex
DROP INDEX "WalletTransaction_userId_idx";

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
