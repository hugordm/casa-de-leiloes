-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "auctioneerNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "auctioneerNotifiedBidCount" INTEGER NOT NULL DEFAULT 0;
