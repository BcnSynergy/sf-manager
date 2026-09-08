import { ElementReviewEntry } from '../../../domain/element-review-entry.entity';
import { ReviewSession } from '../../../domain/review-session.entity';
import { OpenDraftAlreadyExistsError } from '../../../domain/errors/open-draft-already-exists.error';
import { ReviewSessionNotFoundError } from '../../../domain/errors/review-session-not-found.error';
import { ReviewSessionRepository } from '../../ports/review-session.repository.port';

// review-history design.md Decision 3: same `completedAt DESC, id DESC`
// ordering as the Prisma adapter, and the same explicit empty-scope
// fail-closed behaviour — `communityIds = []` yields an empty list here
// exactly like Prisma's `{ in: [] }` compiles to a false predicate there.
// A plain module-level function, not a class method, so `.sort(...)` can
// reference it directly without an unbound-`this` lint concern.
function orderByCompletedHistory(a: ReviewSession, b: ReviewSession): number {
  const aCompletedAt = a.completedAt?.getTime() ?? 0;
  const bCompletedAt = b.completedAt?.getTime() ?? 0;
  if (aCompletedAt !== bCompletedAt) {
    return bCompletedAt - aCompletedAt;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// Test double for ReviewSessionRepository (design.md Testing Strategy:
// in-memory fakes mirroring the shipped module shape, tasks.md 4.9). Keyed
// by id; also mirrors the hand-written partial unique index
// `ReviewSession_open_draft_key` on (communityId, templateId,
// performedById) WHERE status='draft' (design.md Interfaces/Contracts) —
// create() rejects a second open draft for the same triple exactly like
// PrismaReviewSessionRepository.create() will (P2002 ->
// OpenDraftAlreadyExistsError).
export class InMemoryReviewSessionRepository implements ReviewSessionRepository {
  private readonly sessionsById = new Map<string, ReviewSession>();

  seed(session: ReviewSession): void {
    this.sessionsById.set(session.id, session);
  }

  private openDraftKey(session: ReviewSession): string {
    return `${session.communityId}::${session.templateId}::${session.performedById}`;
  }

  create(session: ReviewSession): Promise<void> {
    if (session.status === 'draft') {
      const key = this.openDraftKey(session);
      const collision = [...this.sessionsById.values()].some(
        (existing) =>
          existing.status === 'draft' && this.openDraftKey(existing) === key,
      );
      if (collision) {
        return Promise.reject(new OpenDraftAlreadyExistsError());
      }
    }
    this.sessionsById.set(session.id, session);
    return Promise.resolve();
  }

  findByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null> {
    const session = this.sessionsById.get(id);
    if (!session || session.performedById !== performedById) {
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }

  findDraftsByPerformer(performedById: string): Promise<ReviewSession[]> {
    return Promise.resolve(
      [...this.sessionsById.values()].filter(
        (session) =>
          session.performedById === performedById && session.status === 'draft',
      ),
    );
  }

  // `entry.answers` is the single source of truth (review finding #C), and
  // so is `entry.reviewSessionId` (Phase 5 follow-up — no separate
  // `sessionId` parameter either). `session.recordEntry(entry)` stores the
  // entry as-is. Rejects with ReviewSessionNotFoundError for an unknown
  // sessionId instead of silently no-op-ing, matching
  // PrismaReviewSessionRepository's mapped FK-violation behaviour.
  //
  // Fresh-context review finding M1: explicit `status !== 'draft'` guard
  // mirroring complete()/discardDraft() below — `false` is the concurrency
  // backstop's mapped result (PrismaReviewSessionRepository's own `WHERE
  // status='draft'` guard), not a domain-guard throw. A fresh lookup here
  // (rather than reusing a caller-held aggregate reference) is what lets
  // this fake observe a concurrent complete()/discardDraft() that already
  // replaced the map entry.
  upsertEntry(entry: ElementReviewEntry): Promise<boolean> {
    const session = this.sessionsById.get(entry.reviewSessionId);
    if (!session) {
      return Promise.reject(new ReviewSessionNotFoundError());
    }
    if (session.status !== 'draft') {
      return Promise.resolve(false);
    }
    session.recordEntry(entry);
    return Promise.resolve(true);
  }

  complete(id: string, at: Date): Promise<boolean> {
    const session = this.sessionsById.get(id);
    if (!session || session.status !== 'draft') {
      return Promise.resolve(false);
    }
    this.sessionsById.set(
      id,
      new ReviewSession({
        id: session.id,
        communityId: session.communityId,
        templateId: session.templateId,
        performedById: session.performedById,
        status: 'completed',
        startedAt: session.startedAt,
        completedAt: at,
        entries: session.entries,
      }),
    );
    return Promise.resolve(true);
  }

  discardDraft(id: string): Promise<boolean> {
    const session = this.sessionsById.get(id);
    if (!session || session.status !== 'draft') {
      return Promise.resolve(false);
    }
    this.sessionsById.delete(id);
    return Promise.resolve(true);
  }

  findCompletedForPerformerInCommunities(
    performedById: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession[]> {
    const communityIdSet = new Set(communityIds);
    return Promise.resolve(
      [...this.sessionsById.values()]
        .filter(
          (session) =>
            session.status === 'completed' &&
            session.performedById === performedById &&
            communityIdSet.has(session.communityId),
        )
        .sort(orderByCompletedHistory),
    );
  }

  findCompletedInCommunities(
    communityIds: readonly string[],
  ): Promise<ReviewSession[]> {
    const communityIdSet = new Set(communityIds);
    return Promise.resolve(
      [...this.sessionsById.values()]
        .filter(
          (session) =>
            session.status === 'completed' &&
            communityIdSet.has(session.communityId),
        )
        .sort(orderByCompletedHistory),
    );
  }

  findCompletedByIdForPerformerInCommunities(
    id: string,
    performedById: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null> {
    const session = this.sessionsById.get(id);
    if (
      !session ||
      session.status !== 'completed' ||
      session.performedById !== performedById ||
      !communityIds.includes(session.communityId)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }

  findCompletedByIdInCommunities(
    id: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null> {
    const session = this.sessionsById.get(id);
    if (
      !session ||
      session.status !== 'completed' ||
      !communityIds.includes(session.communityId)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }
}
