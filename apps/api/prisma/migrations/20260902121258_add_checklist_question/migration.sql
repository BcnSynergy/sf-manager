-- Hand-edited migration (design.md Open Questions: "confirm at apply time
-- that `prisma migrate dev --create-only` does not emit `DropForeignKey`
-- for any of the six existing `@relation`-less FKs" — CONFIRMED, and it
-- reproduced exactly: `prisma migrate dev --create-only` generated 6
-- DropForeignKey statements (CommunityRepresentative x2,
-- CommunityTechnician x2, InspectableElement_communityId,
-- User_maintenanceCompanyId), because none of those FKs have a `@relation`
-- in schema.prisma (ADR-013) and are therefore fully invisible to Prisma's
-- diff engine. Those 6 statements have been DELETED from this migration —
-- applying them would have silently dropped referential integrity added in
-- 20260825120000_add_community_and_assignments, 20260827091950_add_
-- maintenance_company and 20260901094525_add_inspectable_element.
-- Precedent for this exact incident: 20260827091950_add_maintenance_company
-- and 20260901094525_add_inspectable_element (one fewer FK existed each
-- time). The pg_constraint integration test (later PR) is the guard against
-- a future `prisma migrate dev` doing this again without being caught.

-- CreateEnum
CREATE TYPE "ReviewFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateTable
CREATE TABLE "ChecklistQuestion" (
    "id"          UUID NOT NULL,
    "elementType" "ElementType" NOT NULL,
    "frequencies" "ReviewFrequency"[],
    "text"        TEXT NOT NULL,
    "deletedAt"   TIMESTAMP(3),

    CONSTRAINT "ChecklistQuestion_pkey" PRIMARY KEY ("id")
);
