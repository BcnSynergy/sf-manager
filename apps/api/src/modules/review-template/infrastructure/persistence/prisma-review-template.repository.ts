import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { SoftDeletableRepository } from '../../../../shared/infrastructure/persistence/soft-deletable.repository';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import {
  ActivationOutcome,
  ReviewTemplateRepository,
  TemplateWithQuestions,
} from '../../application/ports/review-template.repository.port';
import { ReviewTemplate } from '../../domain/review-template.entity';
import { ReviewTemplateEmptyError } from '../../domain/errors/review-template-empty.error';
import { TransactionConflictError } from '../../domain/errors/transaction-conflict.error';
import { ReviewTemplateMapper } from './review-template.mapper';

// Prisma's mapping of a Postgres SERIALIZABLE isolation abort (SQLSTATE
// 40001) — mirrors PrismaUserRepository.transactional /
// PrismaCommunityRepresentativeRepository. This is what Prisma's own typed
// query API (e.g. `.update()`) maps a serialization failure to.
const SERIALIZATION_FAILURE = 'P2034';
// Backstop: a concurrent double-activation that slips past SERIALIZABLE is
// still caught by the `ReviewTemplate_one_active_per_lineage` partial unique
// index (design.md Decision 3) — same 409 as a P2034. This is what Prisma's
// typed query API maps a unique-constraint violation to.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
// Verified empirically against real Postgres
// (prisma-review-template-activation.integration.spec.ts, tasks.md 9.3):
// EVERY statement inside activate()'s transaction is raw SQL
// ($queryRaw/$executeRaw), and under Prisma 7 + the @prisma/adapter-pg
// driver adapter, a raw statement's underlying error does NOT get mapped to
// P2034/P2002 the way the typed query API's does — it surfaces wrapped as
// `P2010` ("Raw query failed"), with the actual Postgres SQLSTATE embedded
// in the error's `message` (e.g. "Code: `40001`. Message: `could not
// serialize access due to concurrent update`"). THIS is the path that
// actually fires in production for this adapter; P2034/P2002 are kept above
// as a defensive fallback in case Prisma's raw-query error mapping ever
// changes to match the typed API's.
const RAW_QUERY_FAILED = 'P2010';
const SERIALIZATION_FAILURE_SQLSTATE = '40001';
const UNIQUE_VIOLATION_SQLSTATE = '23505';

function isActivationConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  if (
    error.code === SERIALIZATION_FAILURE ||
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  ) {
    return true;
  }
  return (
    error.code === RAW_QUERY_FAILED &&
    (error.message.includes(SERIALIZATION_FAILURE_SQLSTATE) ||
      error.message.includes(UNIQUE_VIOLATION_SQLSTATE))
  );
}

type TxClient = Prisma.TransactionClient;

interface LineageRow {
  elementType: ElementType;
  frequency: ReviewFrequency;
  draftQuestionIds: string[];
}

// Prisma adapter for the ReviewTemplateRepository port (ADR-013). design.md
// Decisions 3-5 (PR 9) — the atomic activate() transaction and the two
// distinct read paths (draft-via-live-pool vs frozen-via-snapshot) both live
// here.
@Injectable()
export class PrismaReviewTemplateRepository
  extends SoftDeletableRepository
  implements ReviewTemplateRepository
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // Plain insert — status: draft, empty draftQuestionIds, deletedAt: null
  // (spec.md "Create Draft Template").
  async create(template: ReviewTemplate): Promise<void> {
    await this.prisma.reviewTemplate.create({
      data: ReviewTemplateMapper.toPersistence(template),
    });
  }

  // Default `deletedAt: null` filter (ADR-010) — unknown id and
  // soft-deleted id both resolve to null, one indistinguishable 404.
  async findById(id: string): Promise<ReviewTemplate | null> {
    const record = await this.prisma.reviewTemplate.findFirst({
      where: this.withDefaultFilter({ id }),
    });

    return record ? ReviewTemplateMapper.toDomain(record) : null;
  }

  // Soft-deleted (drafts only) templates excluded by default (ADR-010;
  // spec.md "Soft-deleted drafts excluded"). No question join — list
  // responses carry metadata only (spec.md "List and Read Templates").
  async findAll(): Promise<ReviewTemplate[]> {
    const records = await this.prisma.reviewTemplate.findMany({
      where: this.withDefaultFilter({}),
    });

    return records.map((record) => ReviewTemplateMapper.toDomain(record));
  }

  // design.md Decision 5 — draft path: resolves ordered question text
  // through the LIVE pool (ADR-010's soft-delete filter applies for free).
  // A question id soft-deleted concurrently is simply excluded, mirroring
  // Decision 6's "the draft read path filters soft-deleted questions
  // independently" tolerance for cleanup convergence lag. `order` is
  // re-derived as a contiguous 1-based sequence over the surviving ids —
  // there is no persisted `order` column on the draft side, only the
  // ordered `draftQuestionIds` array.
  async findDraftWithLiveQuestions(
    id: string,
  ): Promise<TemplateWithQuestions | null> {
    const template = await this.prisma.reviewTemplate.findFirst({
      where: this.withDefaultFilter({ id, status: 'draft' as const }),
    });
    if (!template) {
      return null;
    }

    const liveQuestions = await this.prisma.checklistQuestion.findMany({
      where: { id: { in: template.draftQuestionIds }, deletedAt: null },
    });
    const textById = new Map(liveQuestions.map((q) => [q.id, q.text]));

    const questions = template.draftQuestionIds
      .filter((questionId) => textById.has(questionId))
      .map((questionId, index) => ({
        questionId,
        order: index + 1,
        text: textById.get(questionId) as string,
      }));

    return this.toTemplateWithQuestions(template, questions);
  }

  // design.md Decision 5 — frozen path: reads ONLY the persisted
  // ReviewTemplateQuestion snapshot rows. This query MUST NOT reference
  // "ChecklistQuestion" at all — the guarantee this method exists for.
  async findFrozenWithSnapshot(
    id: string,
  ): Promise<TemplateWithQuestions | null> {
    const template = await this.prisma.reviewTemplate.findFirst({
      where: { id, status: { in: ['active', 'retired'] } },
    });
    if (!template) {
      return null;
    }

    const snapshotRows = await this.prisma.reviewTemplateQuestion.findMany({
      where: { templateId: id },
      orderBy: { order: 'asc' },
    });
    const questions = snapshotRows.map((row) => ({
      questionId: row.questionId,
      order: row.order,
      text: row.questionText,
    }));

    return this.toTemplateWithQuestions(template, questions);
  }

  // Full-replace semantics (spec.md "Replacing the selection is a full
  // replace, not a merge") — draft only, mirrors
  // PrismaChecklistQuestionRepository.softDeleteById's affected-row-count
  // contract.
  async replaceDraftQuestions(
    id: string,
    questionIds: string[],
  ): Promise<boolean> {
    const result = await this.prisma.reviewTemplate.updateMany({
      where: this.withDefaultFilter({ id, status: 'draft' as const }),
      data: { draftQuestionIds: questionIds },
    });

    return result.count > 0;
  }

  // design.md Decisions 3/4 — ONE Serializable transaction: read the
  // lineage, assign the next version, copy the snapshot by the database via
  // INSERT...SELECT, retire the predecessor, then flip this row to active.
  // Statement order is load-bearing (Decision 3): the predecessor MUST be
  // retired before this row is flipped, because the
  // `ReviewTemplate_one_active_per_lineage` partial unique index is checked
  // per statement and is not deferrable.
  async activate(id: string, rowIds: string[]): Promise<ActivationOutcome> {
    try {
      return await this.prisma.$transaction(
        (tx) => this.runActivation(tx, id, rowIds),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isActivationConflict(error)) {
        throw new TransactionConflictError();
      }
      throw error;
    }
  }

  private async runActivation(
    tx: TxClient,
    id: string,
    rowIds: string[],
  ): Promise<ActivationOutcome> {
    // 1. read-lineage: 0 rows means this draft lost a race (already
    // activated/deleted concurrently) — the losing side of a
    // check-then-act, mapped to a retryable conflict rather than a 404
    // because the caller's own pre-flight read (application layer) already
    // saw it as a draft moments earlier.
    const lineageRows = await tx.$queryRaw<LineageRow[]>`
      SELECT "elementType", "frequency", "draftQuestionIds"
      FROM "ReviewTemplate"
      WHERE "id" = ${id}::uuid AND "status" = 'draft'
    `;
    const lineage = lineageRows[0];
    if (!lineage) {
      throw new TransactionConflictError();
    }

    // 2. read-version: next version for this (elementType, frequency)
    // lineage (design.md Decision 3) — assigned here, inside the
    // transaction, so a discarded draft never consumes a version number.
    const versionRows = await tx.$queryRaw<{ nextVersion: number }[]>`
      SELECT COALESCE(MAX("version"), 0) + 1 AS "nextVersion"
      FROM "ReviewTemplate"
      WHERE "elementType" = ${lineage.elementType} AND "frequency" = ${lineage.frequency}
    `;
    const nextVersion = versionRows[0].nextVersion;

    // 3. snapshot-insert: the database copies the wording by joining the
    // live pool inside this same transaction (design.md Decision 4) —
    // reading the pool through the application-layer port would put that
    // read outside this transaction, reintroducing the exact TOCTOU this
    // slice exists to close. A question concurrently soft-deleted simply
    // produces no row (the JOIN drops it); zero rows overall means every
    // selected question was concurrently removed, so the whole activation
    // rolls back to ReviewTemplateEmptyError instead of freezing an empty
    // version.
    const insertedRows = await tx.$executeRaw`
      INSERT INTO "ReviewTemplateQuestion" ("id","templateId","questionId","order","questionText")
      SELECT sel.rid, ${id}::uuid, q."id",
             ROW_NUMBER() OVER (ORDER BY sel.ord), q."text"
      FROM unnest(${lineage.draftQuestionIds}::uuid[], ${rowIds}::uuid[]) WITH ORDINALITY AS sel(qid, rid, ord)
      JOIN "ChecklistQuestion" q ON q."id" = sel.qid AND q."deletedAt" IS NULL
    `;
    if (insertedRows === 0) {
      throw new ReviewTemplateEmptyError();
    }

    // 4. retire-predecessor: MUST run before the flip below (statement
    // order load-bearing, design.md Decision 3). A zero-row result is
    // expected and fine — the first activation of a lineage has no
    // predecessor to retire.
    await tx.$executeRaw`
      UPDATE "ReviewTemplate"
      SET "status" = 'retired'
      WHERE "elementType" = ${lineage.elementType} AND "frequency" = ${lineage.frequency} AND "status" = 'active'
    `;

    // 5. flip-to-active: the `"status" = 'draft'` guard is load-bearing,
    // not belt-and-braces — without it this UPDATE would match by `id`
    // alone and always succeed even if a concurrent transaction already
    // flipped this exact row between step 1's lineage read and here. Zero
    // rows means that race was lost — mapped to the same retryable
    // conflict as step 1's race loss.
    const flippedRows = await tx.$executeRaw`
      UPDATE "ReviewTemplate"
      SET "status" = 'active', "version" = ${nextVersion}
      WHERE "id" = ${id}::uuid AND "status" = 'draft'
    `;
    if (flippedRows === 0) {
      throw new TransactionConflictError();
    }

    return { id, status: 'active', version: nextVersion };
  }

  // Sets deletedAt on a draft only (spec.md "Only Drafts May Be
  // Soft-Deleted") — frozen versions are undeletable, mirrored by the
  // `status: 'draft'` filter rather than a separate guard.
  async softDeleteDraftById(id: string): Promise<boolean> {
    const result = await this.prisma.reviewTemplate.updateMany({
      where: this.withDefaultFilter({ id, status: 'draft' as const }),
      data: { deletedAt: new Date() },
    });

    return result.count > 0;
  }

  private toTemplateWithQuestions(
    template: {
      id: string;
      elementType: ElementType;
      frequency: ReviewFrequency;
      name: string;
      version: number | null;
      status: string;
      createdAt: Date;
      deletedAt: Date | null;
    },
    questions: TemplateWithQuestions['questions'],
  ): TemplateWithQuestions {
    return {
      id: template.id,
      elementType: template.elementType,
      frequency: template.frequency,
      name: template.name,
      version: template.version,
      status: template.status as TemplateWithQuestions['status'],
      createdAt: template.createdAt,
      deletedAt: template.deletedAt,
      questions,
    };
  }
}
