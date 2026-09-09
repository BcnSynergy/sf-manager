-- Hand-written migration (review-history-company-scope/design.md Decision
-- 2), same convention as every other migration in this schema (ADR-013):
-- written directly rather than via `prisma migrate dev --create-only` + edit,
-- because Prisma cannot see the hand-written FKs/indexes this schema already
-- carries and `migrate dev` would offer a shadow-database reset instead of a
-- clean diff. Applied via `prisma migrate deploy`.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- this column, its index, its FK, or any of the pre-existing hand-written
-- objects from earlier migrations. Guarded by
-- review-session-migration.integration.spec.ts.

-- AlterTable
ALTER TABLE "ReviewSession" ADD COLUMN "performedByCompanyId" UUID;

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Filters the
-- manager's company-wide read path (review-history-company-scope Decision
-- 3/9).
CREATE INDEX "ReviewSession_performedByCompanyId_idx"
  ON "ReviewSession"("performedByCompanyId");

-- Hand-written cross-module FK, INVISIBLE to Prisma (no `@relation`,
-- ADR-013). ON DELETE RESTRICT like the other four session-rooted FKs:
-- MaintenanceCompany is soft-delete-only (ADR-010), never hard-deleted.
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_performedByCompanyId_fkey"
  FOREIGN KEY ("performedByCompanyId") REFERENCES "MaintenanceCompany"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Best-effort backfill (design.md Decision 2, settled decision): covers
-- EVERY pre-existing row — draft AND completed alike, NOT filtered by
-- status. Decision 1 writes this column only at session creation; a draft
-- that already exists when this migration runs was created before that code
-- shipped, so filtering by `status = 'completed'` here would leave that
-- draft PERMANENTLY unattributed once it later completes, with no path to
-- ever fix it — exactly the bug this slice exists to prevent.
-- `u."maintenanceCompanyId"` may itself be NULL (representatives,
-- grandfathered users); those rows stay NULL, the fail-closed answer. The
-- column stays nullable forever — no closing `SET NOT NULL` step.
UPDATE "ReviewSession" rs
   SET "performedByCompanyId" = u."maintenanceCompanyId"
  FROM "User" u
 WHERE u."id" = rs."performedById"
   AND rs."performedByCompanyId" IS NULL;
