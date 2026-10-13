-- TD-35: ThrottleCounter cleanup filters on a single column. expiresAt is the
-- later of windowEndsAt and blockedUntil, so "deletable" is one indexed range
-- condition instead of a windowEndsAt scan that filters out blocked rows.
-- Existing rows are backfilled before the column becomes NOT NULL.

-- AlterTable
ALTER TABLE "ThrottleCounter" ADD COLUMN "expiresAt" TIMESTAMPTZ(3);

UPDATE "ThrottleCounter"
SET "expiresAt" = GREATEST("windowEndsAt", COALESCE("blockedUntil", "windowEndsAt"));

ALTER TABLE "ThrottleCounter" ALTER COLUMN "expiresAt" SET NOT NULL;

-- DropIndex
DROP INDEX "ThrottleCounter_windowEndsAt_idx";

-- CreateIndex
CREATE INDEX "ThrottleCounter_expiresAt_idx" ON "ThrottleCounter"("expiresAt");
