import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { OpenDraftAlreadyExistsError } from '../../domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import {
  ElementReviewEntryRow,
  ReviewSessionRepository,
} from '../../application/ports/review-session.repository.port';
import { ReviewSessionMapper } from './review-session.mapper';

// Prisma unique-constraint violation code — mirrors
// PrismaCommunityTechnicianRepository. `create()` uses the typed `.create`
// API (not raw SQL), so a Postgres violation on the hand-written partial
// unique index `ReviewSession_open_draft_key` (design.md Interfaces/
// Contracts — invisible to Prisma's schema, but still enforced by Postgres
// on every INSERT) surfaces the same way any other unique violation does.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const FOREIGN_KEY_VIOLATION = 'P2003';

// review-history design.md Decision 3: shared ordering constant used by
// BOTH `findCompleted…InCommunities` list methods so the two scopes return
// the identical, deterministic direction (`id` is a UUIDv7, ADR-009 —
// stable tiebreak on equal `completedAt` values).
const COMPLETED_HISTORY_ORDER_BY: Prisma.ReviewSessionOrderByWithRelationInput[] =
  [{ completedAt: 'desc' }, { id: 'desc' }];

// review-history-per-element design.md Decision 1: shared ordering for the
// four element-keyed reads, `recordedAt DESC, entryId DESC` (`entryId` is a
// UUIDv7, ADR-009 — deterministic tiebreak on equal timestamps). Exported so
// the use case (Phase 2) applies it ONCE after the in-memory join
// (Decision 2/5), rather than each adapter method sorting independently —
// this is why the four methods below return their rows UNSORTED.
export function ELEMENT_HISTORY_ORDER_BY(
  a: ElementReviewEntryRow,
  b: ElementReviewEntryRow,
): number {
  const aRecordedAt = a.recordedAt.getTime();
  const bRecordedAt = b.recordedAt.getTime();
  if (aRecordedAt !== bRecordedAt) {
    return bRecordedAt - aRecordedAt;
  }
  return a.entryId < b.entryId ? 1 : a.entryId > b.entryId ? -1 : 0;
}

function isUniqueConstraintViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

// review finding #C (PR4 follow-up): `upsertEntry`'s `elementReviewEntry`
// row FKs to BOTH `reviewSessionId` and `inspectableElementId` — only the
// former means "no such session" (ReviewSessionNotFoundError, mirroring
// SessionAccess's own 404 mapping); an invalid `inspectableElementId`
// FK is a genuinely different, unmapped caller error and must not be
// swallowed as if the session were missing.
//
// PrismaService's driver-adapter setup (@prisma/adapter-pg) surfaces the
// violated constraint name at `error.meta.driverAdapterError.cause
// .constraint.index`, NOT at the plain `error.meta.field_name` the
// non-adapter Prisma client documents — confirmed by inspecting the
// actual error shape this project's PrismaService produces, not assumed
// from Prisma's generic docs.
function violatesReviewSessionForeignKey(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  const constraintName = extractConstraintName(error.meta);
  return constraintName.includes('reviewSessionId');
}

function extractConstraintName(meta: unknown): string {
  if (!meta || typeof meta !== 'object') {
    return '';
  }
  const record = meta as Record<string, unknown>;

  // Non-adapter Prisma client shape.
  if (typeof record.field_name === 'string') {
    return record.field_name;
  }

  // @prisma/adapter-pg shape (this project's PrismaService).
  const driverError = record.driverAdapterError;
  if (driverError && typeof driverError === 'object') {
    const cause = (driverError as Record<string, unknown>).cause;
    if (cause && typeof cause === 'object') {
      const constraint = (cause as Record<string, unknown>).constraint;
      if (constraint && typeof constraint === 'object') {
        const index = (constraint as Record<string, unknown>).index;
        if (typeof index === 'string') {
          return index;
        }
      }
    }
  }

  return '';
}

// Prisma adapter for the ReviewSessionRepository port (ADR-013). design.md
// Decision 4/8 — deliberately no `findById(id)`/`updateById`. The three
// FKs rooted at ReviewSession are hand-written and Prisma-invisible (no
// `@relation`), so ElementReviewEntry/QuestionAnswer are loaded with
// separate queries and assembled by ReviewSessionMapper, not `include`.
@Injectable()
export class PrismaReviewSessionRepository implements ReviewSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // P2002 on ReviewSession_open_draft_key -> OpenDraftAlreadyExistsError
  // (spec.md "At Most One Open Draft Per Community, Template and User").
  async create(session: ReviewSession): Promise<void> {
    try {
      await this.prisma.reviewSession.create({
        data: ReviewSessionMapper.toPersistence(session),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new OpenDraftAlreadyExistsError();
      }
      throw error;
    }
  }

  // Scope in the signature (design.md Decision 4, Layer 3): an unknown id
  // AND another performer's session both resolve to null.
  async findByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null> {
    const record = await this.prisma.reviewSession.findFirst({
      where: { id, performedById },
    });
    if (!record) {
      return null;
    }

    const entries = await this.loadEntriesWithAnswers(id);
    return ReviewSessionMapper.toDomain(record, entries);
  }

  // `GET /review-sessions` — the caller's own draft sessions only (design.md
  // Open Questions). List rows do not need entries hydrated.
  async findDraftsByPerformer(performedById: string): Promise<ReviewSession[]> {
    const records = await this.prisma.reviewSession.findMany({
      where: { performedById, status: 'draft' },
    });

    return records.map((record) => ReviewSessionMapper.toDomain(record, []));
  }

  // Full-replace semantics per element (Phase 5's real caller,
  // record-entry.use-case.ts). Deletes and recreates the answer set inside
  // one transaction so a partial write is never observable. `entry.answers`
  // is the single source of truth (review finding #C), and so is
  // `entry.reviewSessionId` (Phase 5 follow-up) — there is no separate
  // `sessionId` argument either.
  //
  // Fresh-context review finding M1: unlike complete()/discardDraft(), this
  // method previously had NO `WHERE status='draft'` guard of its own — a
  // concurrent complete() committing between RecordEntryUseCase's load of
  // the aggregate (still draft) and this write could silently land on an
  // already-completed session. The `guard` updateMany below is that missing
  // backstop: it re-asserts `status='draft'` inside THIS transaction (the
  // SET is a no-op — same value — the WHERE clause's affected-row count is
  // the point), so a concurrent complete()/discardDraft() that already
  // committed makes `guard.count` 0 and the entry write below never runs.
  // 0 affected rows for an id that still exists maps to `false` (mirrors
  // complete()/discardDraft()'s own mapping); 0 affected rows for an id
  // that never existed at all still maps to ReviewSessionNotFoundError
  // (mirrors this method's own pre-existing FK-violation mapping below —
  // SessionAccess's callers already validated existence moments earlier, so
  // this is a defensive backstop for the port's direct-caller contract, not
  // the expected path for record-entry.use-case.ts).
  async upsertEntry(entry: ElementReviewEntry): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const guard = await tx.reviewSession.updateMany({
          where: { id: entry.reviewSessionId, status: 'draft' },
          data: { status: 'draft' },
        });
        if (guard.count === 0) {
          const exists = await tx.reviewSession.findUnique({
            where: { id: entry.reviewSessionId },
            select: { id: true },
          });
          if (!exists) {
            throw new ReviewSessionNotFoundError();
          }
          return false;
        }

        const stored = await tx.elementReviewEntry.upsert({
          where: {
            reviewSessionId_inspectableElementId: {
              reviewSessionId: entry.reviewSessionId,
              inspectableElementId: entry.inspectableElementId,
            },
          },
          create: {
            id: entry.id,
            reviewSessionId: entry.reviewSessionId,
            inspectableElementId: entry.inspectableElementId,
            observations: entry.observations,
            recordedAt: entry.recordedAt,
          },
          update: {
            observations: entry.observations,
            recordedAt: entry.recordedAt,
          },
        });

        await tx.questionAnswer.deleteMany({
          where: { elementReviewEntryId: stored.id },
        });

        if (entry.answers.length > 0) {
          await tx.questionAnswer.createMany({
            data: entry.answers.map((answer) => ({
              id: answer.id,
              elementReviewEntryId: stored.id,
              questionId: answer.questionId,
              answer: answer.answer,
            })),
          });
        }

        return true;
      });
    } catch (error) {
      if (error instanceof ReviewSessionNotFoundError) {
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION &&
        violatesReviewSessionForeignKey(error)
      ) {
        throw new ReviewSessionNotFoundError();
      }
      throw error;
    }
  }

  // `WHERE status='draft'`; 0 rows => false, mapped to 409 upstream
  // (design.md Decision 8 — the concurrency backstop for a lost race).
  async complete(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.reviewSession.updateMany({
      where: { id, status: 'draft' },
      data: { status: 'completed', completedAt: at },
    });

    return result.count > 0;
  }

  // Hard delete, `WHERE status='draft'` (design.md Interfaces/Contracts —
  // no deletedAt on this table). ElementReviewEntry/QuestionAnswer's FKs
  // declare ON DELETE CASCADE, so recorded entries/answers are removed with
  // it at the database level.
  async discardDraft(id: string): Promise<boolean> {
    const result = await this.prisma.reviewSession.deleteMany({
      where: { id, status: 'draft' },
    });

    return result.count > 0;
  }

  // review-history design.md Decision 3/6: list rows do not need entries
  // hydrated (mirrors findDraftsByPerformer above) — the detail read (PR 2)
  // is the only caller that needs the full aggregate. `communityIds = []`
  // yields Prisma's `{ in: [] }`, which already compiles to a false
  // predicate — no explicit empty-array guard needed for the fail-closed
  // behaviour.
  //
  // review-history-company-scope/tasks.md 3.6: `findCompletedForPerformerInCommunities`/
  // `findCompletedByIdForPerformerInCommunities` were deleted here —
  // `findCompletedForPerformer`/`findCompletedByIdForPerformer` below are
  // their replacement.
  async findCompletedInCommunities(
    communityIds: readonly string[],
  ): Promise<ReviewSession[]> {
    const records = await this.prisma.reviewSession.findMany({
      where: {
        status: 'completed',
        communityId: { in: [...communityIds] },
      },
      orderBy: COMPLETED_HISTORY_ORDER_BY,
    });

    return records.map((record) => ReviewSessionMapper.toDomain(record, []));
  }

  // Detail reads (PR 2's real callers) DO need entries hydrated, so this
  // mirrors findByIdForPerformer's shape rather than the list methods'.
  async findCompletedByIdInCommunities(
    id: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null> {
    const record = await this.prisma.reviewSession.findFirst({
      where: {
        id,
        status: 'completed',
        communityId: { in: [...communityIds] },
      },
    });
    if (!record) {
      return null;
    }

    const entries = await this.loadEntriesWithAnswers(id);
    return ReviewSessionMapper.toDomain(record, entries);
  }

  // review-history-company-scope/design.md Decision 6/7: the technician's
  // replacement pair — own completed sessions, unconditionally, no
  // community conjunct at all.
  async findCompletedForPerformer(
    performedById: string,
  ): Promise<ReviewSession[]> {
    const records = await this.prisma.reviewSession.findMany({
      where: { performedById, status: 'completed' },
      orderBy: COMPLETED_HISTORY_ORDER_BY,
    });

    return records.map((record) => ReviewSessionMapper.toDomain(record, []));
  }

  async findCompletedByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null> {
    const record = await this.prisma.reviewSession.findFirst({
      where: { id, performedById, status: 'completed' },
    });
    if (!record) {
      return null;
    }

    const entries = await this.loadEntriesWithAnswers(id);
    return ReviewSessionMapper.toDomain(record, entries);
  }

  // review-history-company-scope/design.md Decision 3/4/6/9: the manager's
  // company-wide pair. `WHERE performedByCompanyId = :companyId AND status
  // = 'completed'` — no other conjunct (Decision 9): never joined to the
  // performer's CURRENT employment, never gated by any community
  // assignment, never filtered by a performer's or community's `deletedAt`.
  async findCompletedForCompany(companyId: string): Promise<ReviewSession[]> {
    const records = await this.prisma.reviewSession.findMany({
      where: { performedByCompanyId: companyId, status: 'completed' },
      orderBy: COMPLETED_HISTORY_ORDER_BY,
    });

    return records.map((record) => ReviewSessionMapper.toDomain(record, []));
  }

  async findCompletedByIdForCompany(
    id: string,
    companyId: string,
  ): Promise<ReviewSession | null> {
    const record = await this.prisma.reviewSession.findFirst({
      where: { id, performedByCompanyId: companyId, status: 'completed' },
    });
    if (!record) {
      return null;
    }

    const entries = await this.loadEntriesWithAnswers(id);
    return ReviewSessionMapper.toDomain(record, entries);
  }

  // review-history-admin-scope design.md Decision 1/2: the SYSTEM_ADMIN's
  // unscoped pair — `WHERE status = 'completed'` and nothing else.
  // Deactivated communities and soft-deleted maintenance companies are
  // INCLUDED on purpose (total-oversight audit, not operational scoping).
  async findCompletedAcrossInstallation(): Promise<ReviewSession[]> {
    const records = await this.prisma.reviewSession.findMany({
      where: { status: 'completed' },
      orderBy: COMPLETED_HISTORY_ORDER_BY,
    });

    return records.map((record) => ReviewSessionMapper.toDomain(record, []));
  }

  async findCompletedByIdAcrossInstallation(
    id: string,
  ): Promise<ReviewSession | null> {
    const record = await this.prisma.reviewSession.findFirst({
      where: { id, status: 'completed' },
    });
    if (!record) {
      return null;
    }

    const entries = await this.loadEntriesWithAnswers(id);
    return ReviewSessionMapper.toDomain(record, entries);
  }

  // review-history-per-element design.md Decision 2: entry-first, two-query
  // join, forced by this schema's review FKs being Prisma-invisible (no
  // `include`/join expressible). Step 1 bounds the candidate set by how
  // many times THIS element has ever been reviewed (small), not by the
  // scope's session count — the reverse order would build an unbounded `IN`
  // list for the two unscoped branches. Step 3 is a NARROWING filter only:
  // an entry can only survive if its session survived the scoped query, so
  // there is no code path that can widen the result beyond `sessionScope`.
  // Named without a `find` prefix on purpose: the port-surface enumeration
  // guard test (`no repository port method returns a session or a list from
  // an identifier alone`) enumerates every `find*` method on this class's
  // prototype BY NAME — this private join helper is not itself a scoped
  // port method (its scope comes from the caller-supplied `sessionScope`),
  // so it must not collide with that list.
  private async joinCompletedEntriesForElement(
    elementId: string,
    sessionScope: Prisma.ReviewSessionWhereInput,
  ): Promise<ElementReviewEntryRow[]> {
    const candidateEntries = await this.prisma.elementReviewEntry.findMany({
      where: { inspectableElementId: elementId },
    });
    if (candidateEntries.length === 0) {
      return [];
    }

    const sessions = await this.prisma.reviewSession.findMany({
      where: {
        id: { in: candidateEntries.map((entry) => entry.reviewSessionId) },
        status: 'completed',
        ...sessionScope,
      },
      select: { id: true, performedById: true, completedAt: true },
    });
    const sessionById = new Map(
      sessions.map((session) => [session.id, session]),
    );

    const rows: ElementReviewEntryRow[] = [];
    for (const entry of candidateEntries) {
      const session = sessionById.get(entry.reviewSessionId);
      if (!session || !session.completedAt) {
        continue;
      }
      rows.push({
        entryId: entry.id,
        reviewSessionId: entry.reviewSessionId,
        performedById: session.performedById,
        completedAt: session.completedAt,
        recordedAt: entry.recordedAt,
        observations: entry.observations,
      });
    }
    return rows;
  }

  // MAINTENANCE_TECHNICIAN — own recorded entries for this element, nothing
  // else.
  findCompletedEntriesForElementForPerformer(
    elementId: string,
    performedById: string,
  ): Promise<ElementReviewEntryRow[]> {
    return this.joinCompletedEntriesForElement(elementId, { performedById });
  }

  // COMMUNITY_REPRESENTATIVE — entries whose session is in one of the
  // caller's currently active communities. `communityIds = []` yields
  // Prisma's `{ in: [] }`, already a false predicate — no explicit
  // empty-array guard needed for the fail-closed behaviour.
  findCompletedEntriesForElementInCommunities(
    elementId: string,
    communityIds: readonly string[],
  ): Promise<ElementReviewEntryRow[]> {
    return this.joinCompletedEntriesForElement(elementId, {
      communityId: { in: [...communityIds] },
    });
  }

  // MAINTENANCE_COMPANY_MANAGER — entries whose session was performed by the
  // caller's own company, no other conjunct (review-history-company-scope
  // Decision 9, unchanged).
  findCompletedEntriesForElementForCompany(
    elementId: string,
    companyId: string,
  ): Promise<ElementReviewEntryRow[]> {
    return this.joinCompletedEntriesForElement(elementId, {
      performedByCompanyId: companyId,
    });
  }

  // SYSTEM_ADMIN, and MANAGER holding VIEW_ALL_REVIEWS. The scope IS the
  // installation — no narrowing conjunct beyond `status = 'completed'`
  // (already applied by the shared private helper).
  findCompletedEntriesForElementAcrossInstallation(
    elementId: string,
  ): Promise<ElementReviewEntryRow[]> {
    return this.joinCompletedEntriesForElement(elementId, {});
  }

  private async loadEntriesWithAnswers(reviewSessionId: string) {
    const entryRecords = await this.prisma.elementReviewEntry.findMany({
      where: { reviewSessionId },
    });
    if (entryRecords.length === 0) {
      return [];
    }

    const answerRecords = await this.prisma.questionAnswer.findMany({
      where: { elementReviewEntryId: { in: entryRecords.map((e) => e.id) } },
    });
    const answersByEntryId = new Map<string, typeof answerRecords>();
    for (const answer of answerRecords) {
      const list = answersByEntryId.get(answer.elementReviewEntryId) ?? [];
      list.push(answer);
      answersByEntryId.set(answer.elementReviewEntryId, list);
    }

    return entryRecords.map((entry) => ({
      ...entry,
      answers: answersByEntryId.get(entry.id) ?? [],
    }));
  }
}
