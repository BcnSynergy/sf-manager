-- Hand-written migration (same convention as every other migration in this
-- schema, ADR-013): written directly rather than via `prisma migrate dev
-- --create-only` + edit, because Prisma cannot see the hand-written
-- FKs/indexes this schema already carries and `migrate dev` would offer a
-- shadow-database reset instead of a clean diff. Applied via
-- `prisma migrate deploy`.
--
-- review-history-admin-scope PR1 fix-up (4R fresh-context review CRITICAL
-- #1, post-b8fb5a9): `findCompletedAcrossInstallation` /
-- `findCompletedByIdAcrossInstallation` (design.md Decision 1/2) filter on
-- `status = 'completed'` ONLY — no FK conjunct, unlike the three sibling
-- scope methods (`InCommunities`/`ForPerformer`/`ForCompany`), each backed
-- by an indexed FK. Without this, the installation-wide read is a full
-- table scan PLUS a filesort on `completedAt DESC, id DESC` at every call.
-- This composite index lets Postgres satisfy both the filter and the sort
-- in a single index scan.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- this index or any pre-existing hand-written object from earlier
-- migrations.

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma).
CREATE INDEX "ReviewSession_status_completedAt_id_idx"
  ON "ReviewSession"("status", "completedAt", "id");
