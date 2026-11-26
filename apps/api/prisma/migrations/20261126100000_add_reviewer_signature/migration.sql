-- reviewer-signature: one row per user who registered a signature image.
-- The file itself lives in FILE_STORAGE under "storageKey".

-- CreateTable
CREATE TABLE "ReviewerSignature" (
    "userId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReviewerSignature_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerSignature_storageKey_key" ON "ReviewerSignature"("storageKey");

-- AddForeignKey (hand-written, invisible to Prisma: ADR-013).
-- Users are soft-deleted (ADR-010), so a hard delete of a user with a
-- signature is refused rather than leaving the row behind.
ALTER TABLE "ReviewerSignature" ADD CONSTRAINT "ReviewerSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
