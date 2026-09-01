-- Hand-edited migration (design.md Open Questions: "confirm at apply time
-- that `prisma migrate dev --create-only` does not emit DropForeignKey for
-- any of the five existing `@relation`-less FKs" — CONFIRMED, and it
-- reproduced exactly: `prisma migrate dev --create-only` generated 5
-- DropForeignKey statements below (CommunityRepresentative x2,
-- CommunityTechnician x2, User_maintenanceCompanyId), because none of those
-- FKs have a `@relation` in schema.prisma (ADR-013) and are therefore fully
-- invisible to Prisma's diff engine. Those 5 statements have been DELETED
-- from this migration — applying them would have silently dropped
-- referential integrity added in 20260825120000_add_community_and_assignments
-- and 20260827091950_add_maintenance_company. Precedent for this exact
-- incident: 20260827091950_add_maintenance_company/migration.sql (4
-- DropForeignKey statements that time, one fewer FK existed yet). The
-- pg_constraint integration test (Phase 6.3) is the guard against a future
-- `prisma migrate dev` doing this again without being caught.

-- CreateEnum
CREATE TYPE "ElementType" AS ENUM ('EXTINGUISHER');

-- CreateTable
CREATE TABLE "InspectableElement" (
    "id"           UUID NOT NULL,
    "communityId"  UUID NOT NULL,
    "elementType"  "ElementType" NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "location"     TEXT NOT NULL,
    "installedAt"  DATE NOT NULL,          -- design.md Decision 3, not TIMESTAMP(3)
    "serialNumber" TEXT,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "InspectableElement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Postgres does not
-- auto-index FK columns, and every list query plus the community delete
-- guard's NOT EXISTS (design.md Decision 6) filters on exactly this column.
CREATE INDEX "InspectableElement_communityId_idx" ON "InspectableElement"("communityId");

-- Hand-edited: schema.prisma has no `@relation` here (ADR-013), so this FK is
-- INVISIBLE to Prisma's migration diffing, same as every other cross-module
-- FK in this schema. ON DELETE RESTRICT is correct and never fires —
-- Community rows are never hard-deleted (ADR-010). It matches the invariant
-- rather than enforcing it, which is exactly why the has-active-elements
-- rule needs a domain policy + atomic UPDATE (design.md Decision 6), not
-- this FK.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- migration file or diff schema.prisma against the database in a way that
-- could DROP this constraint — Prisma has no knowledge of it. Guarded by an
-- integration test asserting its continued presence in `pg_constraint`
-- (design.md Testing Strategy, Phase 6.3).
ALTER TABLE "InspectableElement" ADD CONSTRAINT "InspectableElement_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
