-- Hand-written migration (same convention as every other migration in this
-- schema, ADR-013): written directly rather than via `prisma migrate dev
-- --create-only` + edit, because Prisma's DSL cannot express CHECK
-- constraints and `migrate dev` would offer a shadow-database reset instead
-- of a clean diff.
--
-- organization-profile/design.md Decision 1: the singleton is enforced by
-- the database. `singleton BOOLEAN NOT NULL DEFAULT true` plus
-- `UNIQUE("singleton")` (Prisma-visible, schema.prisma) plus a hand-written
-- CHECK ("singleton") make a second row STRUCTURALLY IMPOSSIBLE: `true`
-- collides on the unique index, `false` is refused by the CHECK.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- the CHECK below, or any pre-existing hand-written object from earlier
-- migrations (see organization-profile-migration.integration.spec.ts and
-- review-session-migration.integration.spec.ts for the full pre-existing-
-- object allowlist). The CHECK is INVISIBLE to Prisma's migration diffing —
-- precedent: ElementReviewEntry_observations_not_blank.

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id"          UUID    NOT NULL,
    "name"        TEXT    NOT NULL,
    "legalName"   TEXT    NOT NULL,
    "taxId"       TEXT    NOT NULL,
    "address"     TEXT    NOT NULL,
    "phone"       TEXT    NOT NULL,
    "email"       TEXT    NOT NULL,
    "logoAssetId" TEXT,                                  -- reserved, ADR-012
    "singleton"   BOOLEAN NOT NULL DEFAULT true,         -- design Decision 1
    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (`singleton Boolean @unique @default(true)`).
-- The name matches Prisma's canonical name exactly so the schema cannot
-- drift.
CREATE UNIQUE INDEX "OrganizationProfile_singleton_key"
  ON "OrganizationProfile"("singleton");

-- Hand-written CHECK: Prisma's DSL cannot express CHECK constraints, so this
-- is INVISIBLE to Prisma's migration diffing (precedent:
-- ElementReviewEntry_observations_not_blank). Together with the index above,
-- a second row is STRUCTURALLY IMPOSSIBLE: `true` collides, `false` is
-- refused.
ALTER TABLE "OrganizationProfile"
  ADD CONSTRAINT "OrganizationProfile_singleton_true" CHECK ("singleton");

-- Seed the one row, BLANK not NULL (spec.md "The Profile Row Exists Before
-- Any Request"): the row is valid to read and incomplete to look at.
-- Hand-picked v7-shaped literal (version nibble 7, variant bits 10,
-- ADR-009) — fixed forever, never regenerated, and deliberately NOT
-- referenced from application code (design.md Decision 1). Bare ON CONFLICT
-- DO NOTHING covers both the PK and the sentinel index, so re-running the
-- migration is a no-op (spec.md "The seed does not duplicate the row").
INSERT INTO "OrganizationProfile"
  ("id","name","legalName","taxId","address","phone","email","logoAssetId","singleton")
VALUES
  ('01997a00-0000-7000-8000-000000000001'::uuid,'','','','','','',NULL,true)
ON CONFLICT DO NOTHING;
