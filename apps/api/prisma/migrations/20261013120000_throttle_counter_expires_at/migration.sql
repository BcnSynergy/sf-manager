-- TD-35: ThrottleCounter cleanup filters on a single column. expiresAt is the
-- later of windowEndsAt and blockedUntil, so "deletable" is one indexed range
-- condition instead of a windowEndsAt scan that filters out blocked rows.
--
-- A BEFORE INSERT OR UPDATE trigger owns the value, so writers that do not know
-- the column (the previous adapter version during a rolling deploy or a
-- code-only rollback) keep working and never leave a stale expiresAt behind.
-- NOT NULL is checked after BEFORE triggers, so inserts that omit it succeed.

-- AlterTable
ALTER TABLE "ThrottleCounter" ADD COLUMN "expiresAt" TIMESTAMPTZ(3);

CREATE FUNCTION "throttle_counter_set_expires_at"() RETURNS trigger AS $$
BEGIN
  NEW."expiresAt" := GREATEST(NEW."windowEndsAt", COALESCE(NEW."blockedUntil", NEW."windowEndsAt"));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ThrottleCounter_set_expires_at"
BEFORE INSERT OR UPDATE ON "ThrottleCounter"
FOR EACH ROW EXECUTE FUNCTION "throttle_counter_set_expires_at"();

-- Backfill through the trigger.
UPDATE "ThrottleCounter" SET "windowEndsAt" = "windowEndsAt";

ALTER TABLE "ThrottleCounter" ALTER COLUMN "expiresAt" SET NOT NULL;

-- DropIndex
DROP INDEX "ThrottleCounter_windowEndsAt_idx";

-- CreateIndex
CREATE INDEX "ThrottleCounter_expiresAt_idx" ON "ThrottleCounter"("expiresAt");
