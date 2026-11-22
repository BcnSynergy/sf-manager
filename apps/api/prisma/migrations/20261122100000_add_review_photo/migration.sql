-- EN-164 S1: one row per photo attached to an element of a draft review
-- session. The file itself lives in FILE_STORAGE under "storageKey".

-- CreateTable
CREATE TABLE "ReviewPhoto" (
    "id" UUID NOT NULL,
    "reviewSessionId" UUID NOT NULL,
    "inspectableElementId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewPhoto_storageKey_key" ON "ReviewPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "ReviewPhoto_reviewSessionId_inspectableElementId_idx" ON "ReviewPhoto"("reviewSessionId", "inspectableElementId");

-- CreateIndex
CREATE INDEX "ReviewPhoto_inspectableElementId_idx" ON "ReviewPhoto"("inspectableElementId");

-- AddForeignKey (hand-written, invisible to Prisma: ADR-013).
-- ON DELETE CASCADE: discarding a draft removes its photo rows (the use case
-- deletes the files). ON DELETE RESTRICT on the element, like
-- ElementReviewEntry_inspectableElementId_fkey.
ALTER TABLE "ReviewPhoto" ADD CONSTRAINT "ReviewPhoto_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "ReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewPhoto" ADD CONSTRAINT "ReviewPhoto_inspectableElementId_fkey" FOREIGN KEY ("inspectableElementId") REFERENCES "InspectableElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
