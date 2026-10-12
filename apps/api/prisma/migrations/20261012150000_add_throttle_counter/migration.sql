-- login-rate-limit-hardening/design.md Decision 4: persisted counters for the
-- login ThrottlerStorage. Purely additive: one new table and one index, no
-- change to existing data. Generated with `prisma migrate diff` (offline,
-- previous schema -> current schema), so no dev database was touched.

-- CreateTable
CREATE TABLE "ThrottleCounter" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "windowEndsAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "ThrottleCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ThrottleCounter_windowEndsAt_idx" ON "ThrottleCounter"("windowEndsAt");
