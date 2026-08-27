-- Hand-edited migration (design.md Open Questions: "confirm at apply time
-- that `prisma migrate dev` does not emit a `DROP INDEX`/`DROP CONSTRAINT`
-- for the hand-written partial index or FK" — CONFIRMED, and it was worse
-- than feared: `prisma migrate dev --create-only` generated 4 `DropForeignKey`
-- statements below for CommunityRepresentative/CommunityTechnician's
-- hand-written FKs, because those FKs have no `@relation` in schema.prisma
-- (ADR-013) and are therefore fully invisible to Prisma's diff engine. Those
-- 4 statements have been DELETED from this migration — applying them would
-- have silently dropped referential integrity added in
-- 20260825120000_add_community_and_assignments. This is the concrete
-- "Prisma-invisible schema objects" risk design.md warned about; the
-- pg_indexes/pg_constraint integration test below guards against a future
-- `prisma migrate dev` doing this again without being caught.

-- AlterTable: nullable, so it cannot fail on a non-empty User table
-- (proposal Risks, "pre-existing maintenance-role users"). No @default —
-- same reasoning as the Role column (schema.prisma).
ALTER TABLE "User" ADD COLUMN "maintenanceCompanyId" UUID;

-- CreateTable
CREATE TABLE "MaintenanceCompany" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Postgres does not
-- auto-index FK-referencing columns, and countActiveByMaintenanceCompany
-- (design.md Decision 4) filters on exactly this column on every delete
-- attempt.
CREATE INDEX "User_maintenanceCompanyId_idx" ON "User"("maintenanceCompanyId");

-- Hand-edited migration: Prisma's schema DSL has no `WHERE` clause on
-- `@@unique`, so this partial unique index cannot be expressed in
-- schema.prisma and is therefore INVISIBLE to Prisma's migration diffing.
-- Precedent: 20260825120000_add_community_and_assignments/migration.sql.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- this index — Prisma has no knowledge of it. Guarded by an integration test
-- asserting its continued presence in `pg_indexes`.
--
-- `WHERE "deletedAt" IS NULL` is the whole point (design.md Decision 2): a
-- soft-deleted company frees its taxId for a re-onboarded instance of the
-- same legal entity, while two ACTIVE companies can never share one. This
-- index is the SOLE enforcement — there is no read-check.
CREATE UNIQUE INDEX "MaintenanceCompany_taxId_active_key"
  ON "MaintenanceCompany"("taxId") WHERE "deletedAt" IS NULL;

-- Hand-edited migration: schema.prisma has no `@relation` field here
-- (ADR-013, mirroring the community assignment tables), so this FK is also
-- INVISIBLE to Prisma's migration diffing — same WARNING as above.
--
-- `ON DELETE RESTRICT` (the default) is correct and, by design, never fires:
-- MaintenanceCompany rows are never hard-deleted (ADR-010 soft delete). It
-- matches the invariant rather than enforcing it — which is exactly why the
-- has-active-users rule needs a domain policy (design.md Decision 4), not
-- this FK.
ALTER TABLE "User" ADD CONSTRAINT "User_maintenanceCompanyId_fkey"
  FOREIGN KEY ("maintenanceCompanyId") REFERENCES "MaintenanceCompany"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
