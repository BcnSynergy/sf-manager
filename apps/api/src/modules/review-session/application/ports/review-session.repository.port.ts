import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { ReviewSession } from '../../domain/review-session.entity';

// Port (application layer, ADR-002/013): design.md Decision 4/8 — scope is
// a PROPERTY OF THE PORT, not a per-caller discipline check, verbatim the
// `InspectableElementRepository.findByIdInCommunity` precedent. There is
// deliberately NO `findById(id)`, NO `updateById` and NO status setter:
// `findByIdForPerformer` is the only by-id read, scoped to the performer
// (Layer 3 of the scope check, `SessionAccess`); `complete`/`discardDraft`
// are the only state transitions, each carrying its own `WHERE
// status='draft'` so a lost race fails on affected-row-count rather than
// silently mutating a completed session.
export interface ReviewSessionRepository {
  // P2002 on the hand-written partial unique index
  // `ReviewSession_open_draft_key` -> OpenDraftAlreadyExistsError (adapter's
  // responsibility, task 4.10) — spec.md "At Most One Open Draft Per
  // Community, Template and User".
  create(session: ReviewSession): Promise<void>;

  // Scope in the signature (design.md Decision 4, Layer 3): an unknown id
  // AND another performer's session both resolve to `null`, so
  // `SessionAccess` cannot distinguish them either — both collapse to
  // `ReviewSessionNotFoundError` upstream.
  findByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null>;

  // `GET /review-sessions` — the caller's own `draft` sessions only
  // (design.md Open Questions: completed-session history is out of scope
  // for this slice).
  findDraftsByPerformer(performedById: string): Promise<ReviewSession[]>;

  // Full-replace semantics per element — Phase 5's record-answer /
  // mark-unreviewed use cases (record-entry.use-case.ts) are the real
  // callers.
  //
  // Fresh-context review finding #C (PR4 follow-up), resolved further in
  // Phase 5 (PR4's "carried into PR5" note): there is deliberately NO
  // separate `sessionId` parameter either. `entry.reviewSessionId` is
  // already part of the entry the caller constructed via
  // `ElementReviewEntry.reviewed()`/`.unreviewed()` (design.md Decision 1)
  // — a second parameter carrying the same value was a near-identical
  // redundancy with no caller to notice the two diverging, until
  // `record-entry.use-case.ts` became the first real one. `entry` alone is
  // now the sole source of truth for which session the entry belongs to.
  // Rejects with ReviewSessionNotFoundError for an unknown sessionId
  // (mirrors SessionAccess's own 404 mapping) rather than surfacing a raw
  // FK-violation error.
  //
  // Fresh-context review finding M1: carries the SAME `WHERE status='draft'`
  // guard as complete()/discardDraft() — `false` => the caller maps this to
  // 409 REVIEW_SESSION_NOT_EDITABLE (design.md Decision 8). The domain-layer
  // guard the caller runs before this call (session.recordEntry/
  // markUnreviewed) only protects the aggregate reference it already holds;
  // this is the concurrency backstop for a complete()/discardDraft() that
  // committed at the DB layer between that load and this write.
  upsertEntry(entry: ElementReviewEntry): Promise<boolean>;

  // `WHERE status='draft'`; false => the caller maps this to 409
  // REVIEW_SESSION_NOT_EDITABLE (design.md Decision 8).
  complete(id: string, at: Date): Promise<boolean>;

  // Hard delete (resolved 2026-09-06, design.md Interfaces/Contracts — no
  // `deletedAt` exists on the three review tables). `WHERE status='draft'`;
  // false => 409 REVIEW_SESSION_NOT_EDITABLE. `ElementReviewEntry`/
  // `QuestionAnswer`'s FKs declare `ON DELETE CASCADE`, so a discarded
  // draft's recorded entries/answers are removed with it, never orphaned.
  discardDraft(id: string): Promise<boolean>;

  // review-history design.md Decision 3: four named methods, one per
  // (scope x shape) — no scope discriminant, no branching query builder.
  // Every one of the four carries `status = 'completed'` in its `WHERE`,
  // so a `draft` session never surfaces through any of them. Ordering for
  // the two list methods is `completedAt DESC, id DESC` (a shared constant
  // in each adapter) — both scopes MUST return the identical direction,
  // deterministic on equal timestamps (`id` is a UUIDv7, ADR-009).
  // `communityIds = []` is the fail-closed empty-scope case: it MUST
  // resolve to an empty list / `null`, never "everything" (Prisma's
  // `{ in: [] }` already compiles to a false predicate; the in-memory fake
  // mirrors that explicitly). Still NO bare `findById` — every one of
  // these four carries a performer and/or community scope as a required
  // parameter (spec: "No unscoped session read exists").

  // `GET /review-history` for a MAINTENANCE_TECHNICIAN — own completed
  // sessions, narrowed to their currently active community scope.
  findCompletedForPerformerInCommunities(
    performedById: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession[]>;

  // `GET /review-history` for a COMMUNITY_REPRESENTATIVE — every completed
  // session in the caller's actively assigned communities, regardless of
  // who performed it.
  findCompletedInCommunities(
    communityIds: readonly string[],
  ): Promise<ReviewSession[]>;

  // `GET /review-history/:sessionId` for a MAINTENANCE_TECHNICIAN (PR 2) —
  // the technician's performer filter is a NARROWING of the community
  // filter (design.md Decision 3), so this is its own method rather than a
  // caller-side check layered on `findCompletedByIdInCommunities`.
  findCompletedByIdForPerformerInCommunities(
    id: string,
    performedById: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null>;

  // `GET /review-history/:sessionId` for a COMMUNITY_REPRESENTATIVE (PR 2).
  findCompletedByIdInCommunities(
    id: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null>;
}

export const REVIEW_SESSION_REPOSITORY = Symbol('REVIEW_SESSION_REPOSITORY');
