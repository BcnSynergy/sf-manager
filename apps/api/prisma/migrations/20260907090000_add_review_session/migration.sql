-- Hand-written migration (design.md Interfaces/Contracts, File Changes).
-- Written directly rather than via `prisma migrate dev --create-only` + edit
-- — same rationale as 20260903072531_add_review_template/migration.sql: the
-- local dev database now carries a growing set of hand-written objects
-- Prisma cannot see, and `migrate dev` would offer a shadow-database reset
-- rather than a clean diff. Applied via `prisma migrate deploy`.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- any of the 6 FKs, the partial unique index or the CHECK constraint below,
-- or any of the 12 pre-existing hand-written objects from earlier
-- migrations (7 FKs + 5 indexes) — Prisma has no knowledge of any of them.
-- Guarded by an integration test asserting their continued presence in
-- pg_indexes/pg_constraint (tasks.md 3.3).

-- CreateEnum
CREATE TYPE "ReviewSessionStatus" AS ENUM ('draft', 'completed');

-- CreateEnum
CREATE TYPE "AnswerValue" AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id"            UUID NOT NULL,
    "communityId"   UUID NOT NULL,
    "templateId"    UUID NOT NULL,
    "performedById" UUID NOT NULL,
    "status"        "ReviewSessionStatus" NOT NULL,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"   TIMESTAMP(3),

    CONSTRAINT "ReviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementReviewEntry" (
    "id"                   UUID NOT NULL,
    "reviewSessionId"      UUID NOT NULL,
    "inspectableElementId" UUID NOT NULL,
    "observations"         TEXT,
    "recordedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElementReviewEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id"                   UUID NOT NULL,
    "elementReviewEntryId" UUID NOT NULL,
    "questionId"           UUID NOT NULL,
    "answer"               "AnswerValue" NOT NULL,

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Postgres does not
-- auto-index FK-referencing columns; the by-community and by-performer read
-- paths filter on exactly these columns.
CREATE INDEX "ReviewSession_communityId_idx" ON "ReviewSession"("communityId");
CREATE INDEX "ReviewSession_performedById_idx" ON "ReviewSession"("performedById");

-- CreateIndex: Prisma-VISIBLE compound unique (@@unique in schema.prisma).
CREATE UNIQUE INDEX "ElementReviewEntry_reviewSessionId_inspectableElementId_key"
  ON "ElementReviewEntry"("reviewSessionId", "inspectableElementId");

-- CreateIndex: Prisma-VISIBLE compound unique (@@unique in schema.prisma).
CREATE UNIQUE INDEX "QuestionAnswer_elementReviewEntryId_questionId_key"
  ON "QuestionAnswer"("elementReviewEntryId", "questionId");

-- Hand-written: Prisma's schema DSL has no `WHERE` clause on `@@unique`, so
-- this partial unique index cannot be expressed in schema.prisma and is
-- therefore INVISIBLE to Prisma's migration diffing (design.md
-- Interfaces/Contracts). Sole enforcement of "at most one open draft per
-- (community, template, performer)" (spec.md "At Most One Open Draft Per
-- Community, Template and User").
CREATE UNIQUE INDEX "ReviewSession_open_draft_key"
  ON "ReviewSession"("communityId", "templateId", "performedById")
  WHERE "status" = 'draft';

-- Hand-written, Prisma-invisible backstop for the intra-row half of the
-- `answers XOR observations` invariant (design.md Decision 1) — a table
-- CHECK cannot see child rows in "QuestionAnswer", so it guards only that
-- "observations", when present, is not blank; the domain layer
-- (ElementReviewEntry.reviewed()/.unreviewed()) is the primary enforcement.
ALTER TABLE "ElementReviewEntry" ADD CONSTRAINT "ElementReviewEntry_observations_not_blank"
  CHECK ("observations" IS NULL OR btrim("observations") <> '');

-- Hand-written cross-module FKs (design.md File Changes, ADR-013): no
-- `@relation` fields in schema.prisma, so all 6 are INVISIBLE to Prisma's
-- migration diffing — same WARNING as above.
--
-- `ON DELETE RESTRICT` (the default) for the 4 FKs whose referenced rows
-- are never hard-deleted (Community/ReviewTemplate/User/InspectableElement
-- — all soft-delete-only, ADR-010).
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ReviewTemplate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ElementReviewEntry" ADD CONSTRAINT "ElementReviewEntry_inspectableElementId_fkey"
  FOREIGN KEY ("inspectableElementId") REFERENCES "InspectableElement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- `ON DELETE CASCADE` — the two FKs rooted at ReviewSession, chained through
-- ElementReviewEntry to QuestionAnswer (design.md Interfaces/Contracts,
-- `discardDraft`): a discarded draft's recorded entries and their answers
-- must be removed with it, not orphaned. ReviewSession has NO deletedAt
-- (Decision 8), so a hard delete of the session row is the only removal
-- path, and these two FKs are what make it a real cascade rather than a
-- constraint violation.
ALTER TABLE "ElementReviewEntry" ADD CONSTRAINT "ElementReviewEntry_reviewSessionId_fkey"
  FOREIGN KEY ("reviewSessionId") REFERENCES "ReviewSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_elementReviewEntryId_fkey"
  FOREIGN KEY ("elementReviewEntryId") REFERENCES "ElementReviewEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
