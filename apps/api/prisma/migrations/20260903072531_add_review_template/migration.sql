-- Hand-written migration (design.md Decision 3, File Changes). Written
-- directly rather than via `prisma migrate dev --create-only` + edit: the
-- local dev database's `_prisma_migrations` checksum for
-- 20260902121258_add_checklist_question no longer matches the committed
-- file (comment-only drift from PR1's own hand-edit — `migrate status`
-- confirms "Database schema is up to date", so this is not a structural
-- issue), which makes `migrate dev` refuse to run non-interactively without
-- offering a schema reset. Applying via `prisma migrate deploy` instead
-- avoids that shadow-database diff entirely and never touches existing
-- data. Precedent for the two hand-written partial unique indexes and the
-- FK below: 20260827091950_add_maintenance_company/migration.sql
-- (`MaintenanceCompany_taxId_active_key`) and
-- 20260825120000_add_community_and_assignments/migration.sql
-- (`CommunityRepresentative`'s one-active-per-community index).

-- CreateEnum
CREATE TYPE "ReviewTemplateStatus" AS ENUM ('draft', 'active', 'retired');

-- CreateTable
CREATE TABLE "ReviewTemplate" (
    "id"               UUID NOT NULL,
    "elementType"      "ElementType" NOT NULL,
    "frequency"        "ReviewFrequency" NOT NULL,
    "name"             TEXT NOT NULL,
    "version"          INTEGER,
    "status"           "ReviewTemplateStatus" NOT NULL,
    "draftQuestionIds" UUID[],
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"        TIMESTAMP(3),

    CONSTRAINT "ReviewTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTemplateQuestion" (
    "id"           UUID NOT NULL,
    "templateId"   UUID NOT NULL,
    "questionId"   UUID NOT NULL,
    "order"        INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,

    CONSTRAINT "ReviewTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Postgres does not
-- auto-index FK-referencing columns; the frozen read path (design.md
-- Decision 5) filters on exactly this column.
CREATE INDEX "ReviewTemplateQuestion_templateId_idx" ON "ReviewTemplateQuestion"("templateId");

-- Hand-written: Prisma's schema DSL has no `WHERE` clause on `@@unique`, so
-- these three partial/compound unique indexes cannot be expressed in
-- schema.prisma and are therefore INVISIBLE to Prisma's migration diffing
-- (design.md Decision 3).
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- any of the three indexes below, or the six pre-existing hand-written
-- FKs/indexes from earlier migrations — Prisma has no knowledge of any of
-- them. Guarded by an integration test asserting their continued presence
-- in `pg_indexes` (PR9).
CREATE UNIQUE INDEX "ReviewTemplate_one_active_per_lineage"
  ON "ReviewTemplate"("elementType","frequency") WHERE "status" = 'active';
CREATE UNIQUE INDEX "ReviewTemplate_one_draft_per_lineage"
  ON "ReviewTemplate"("elementType","frequency")
  WHERE "status" = 'draft' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ReviewTemplate_lineage_version_key"
  ON "ReviewTemplate"("elementType","frequency","version");

-- Hand-written: schema.prisma has no `@relation` field on
-- ReviewTemplateQuestion.templateId (ADR-013, mirroring every other
-- cross-module/cross-table FK in this schema), so this FK is also INVISIBLE
-- to Prisma's migration diffing — same WARNING as above.
--
-- `ON DELETE RESTRICT` (the default): ReviewTemplate rows are never hard-
-- deleted once frozen (design.md — frozen versions are undeletable), and a
-- draft with snapshot rows never happens (Decision 2/4), so this never fires
-- in practice; it matches the invariant rather than enforcing new behaviour.
ALTER TABLE "ReviewTemplateQuestion" ADD CONSTRAINT "ReviewTemplateQuestion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ReviewTemplate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
