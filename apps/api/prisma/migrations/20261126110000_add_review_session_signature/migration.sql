-- reviewer-signature: the session-owned copy of the performer's signature,
-- taken when the session is signed. The file lives in FILE_STORAGE under
-- "signatureStorageKey" (review-signatures/<sessionId>.<ext>). Null for a
-- draft and for sessions completed before this change.

-- AlterTable
ALTER TABLE "ReviewSession" ADD COLUMN "signatureStorageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSession_signatureStorageKey_key" ON "ReviewSession"("signatureStorageKey");
