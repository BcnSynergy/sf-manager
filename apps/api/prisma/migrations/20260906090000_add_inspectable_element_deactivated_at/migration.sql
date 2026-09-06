-- review-session/design.md Decision 3: `deactivatedAt`, not `deletedAt` —
-- domain state (decommissioned), orthogonal to the administrative
-- soft-delete already carried by `deletedAt` (ADR-010). NULL = active,
-- mirrors the shipped CommunityTechnician/CommunityRepresentative
-- precedent verbatim (20260825120000_add_community_and_assignments).
--
-- No backfill, unlike the `code` column's migration
-- (20260904090000_add_inspectable_element_code): this column has no
-- NOT NULL/UNIQUE constraint, so a plain nullable ADD COLUMN leaves every
-- pre-existing row NULL — i.e. active — by construction. The proposal's
-- "hand-written backfill marking every existing row active" is therefore
-- NOT needed and intentionally not written here (design.md Decision 3,
-- "Migration consequence — the backfill disappears").

-- AlterTable
ALTER TABLE "InspectableElement" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
