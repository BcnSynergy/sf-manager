-- Hand-written migration (same convention as every other migration in this
-- schema, ADR-013): written directly rather than via `prisma migrate dev
-- --create-only` + edit, because Prisma cannot see the hand-written
-- FKs/partial indexes this schema already carries and `migrate dev` would
-- offer a shadow-database reset instead of a clean diff. Applied via
-- `prisma migrate deploy`.
--
-- review-history-manager-capability/design.md Decision 1 (first
-- implementation of ADR-011 Decision 2's `User.managerCapabilities`
-- signature): a Prisma enum with exactly ONE member, and a NOT NULL array
-- column defaulting to empty. Additive only — no backfill, no `SET NOT
-- NULL` closing step, because the default already covers every pre-existing
-- row.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- this column/type or any pre-existing hand-written object from earlier
-- migrations (see review-session-migration.integration.spec.ts and this
-- migration's own guard test for the full pre-existing-object allowlist).

-- CreateEnum
CREATE TYPE "ManagerCapability" AS ENUM ('VIEW_ALL_REVIEWS');

-- AlterTable: NOT NULL from the start — a Prisma scalar list cannot be
-- null, and the default is the zero-privilege value, correct for every
-- existing row (design.md Decision 1).
ALTER TABLE "User" ADD COLUMN "managerCapabilities" "ManagerCapability"[]
  NOT NULL DEFAULT ARRAY[]::"ManagerCapability"[];
