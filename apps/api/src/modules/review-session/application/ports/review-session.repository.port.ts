import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { ReviewSession } from '../../domain/review-session.entity';

// review-history-per-element/design.md Decision 1/2: the element-keyed
// reads. FLATTENED projection rows, not ReviewSession aggregates — the
// element conjunct and the scope conjunct are both required parameters of
// the four methods below, so no caller can forget either one, and a
// session's OTHER elements' entries are never loaded in the first place.
// `answers` is deliberately absent (this surface renders no answers,
// proposal non-goal) and `reviewed` is NOT a column here — the application
// layer derives it from `observations === null` (Decision 5), keeping the
// adapter a dumb projection (ADR-013).
export interface ElementReviewEntryRow {
  entryId: string;
  reviewSessionId: string;
  performedById: string;
  completedAt: Date; // non-null: every one of these carries status='completed'
  recordedAt: Date;
  observations: string | null;
}

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

  // `GET /review-history` for a COMMUNITY_REPRESENTATIVE — every completed
  // session in the caller's actively assigned communities, regardless of
  // who performed it.
  //
  // review-history-company-scope/tasks.md 3.6: the technician's
  // community-narrowed pair (`findCompletedForPerformerInCommunities`/
  // `findCompletedByIdForPerformerInCommunities`) was deleted here — the
  // reversal (design.md Decision 7) means `ReviewHistoryAccessService` no
  // longer calls them, and a dead-but-plausibly-named method on a
  // security-critical port is worse than the delete (design.md Decision 6:
  // "the one a future caller picks by autocomplete, silently reinstating
  // the reversed rule").
  findCompletedInCommunities(
    communityIds: readonly string[],
  ): Promise<ReviewSession[]>;

  // `GET /review-history/:sessionId` for a COMMUNITY_REPRESENTATIVE (PR 2).
  findCompletedByIdInCommunities(
    id: string,
    communityIds: readonly string[],
  ): Promise<ReviewSession | null>;

  // review-history-company-scope/design.md Decision 6/7: the technician's
  // REPLACEMENT pair — own completed sessions, unconditionally, no
  // community narrowing at all. Not yet called by any production code in
  // this PR (Phase 3 wires `ReviewHistoryAccessService`'s technician branch
  // onto these); added here so the port, both adapters and their tests
  // exist ahead of that rewiring, per tasks.md 2.6/2.7/2.8.
  findCompletedForPerformer(performedById: string): Promise<ReviewSession[]>;

  findCompletedByIdForPerformer(
    id: string,
    performedById: string,
  ): Promise<ReviewSession | null>;

  // review-history-company-scope/design.md Decision 3/4/6/9: the manager's
  // company-wide pair. `WHERE performedByCompanyId = :companyId AND status
  // = 'completed'` — full stop, no other conjunct (Decision 9). Same
  // `COMPLETED_HISTORY_ORDER_BY` direction as the other list methods.
  findCompletedForCompany(companyId: string): Promise<ReviewSession[]>;

  findCompletedByIdForCompany(
    id: string,
    companyId: string,
  ): Promise<ReviewSession | null>;

  // review-history-admin-scope design.md Decision 1/2: the SYSTEM_ADMIN
  // scope. The scope IS the installation — `WHERE status = 'completed'` and
  // nothing else. This is the ONLY read on this port with no narrowing
  // conjunct, and that is DELIBERATE, not an omission: total-oversight
  // audit is the whole point of the SYSTEM_ADMIN scope (proposal "Total
  // oversight, no exceptions"). Deactivated communities and soft-deleted
  // maintenance companies are INCLUDED on purpose — deleted context must
  // not hide a compliance record from the auditor. Callable from exactly
  // TWO places (review-history-manager-capability/design.md Decision 3):
  // ReviewHistoryAccessService's `SYSTEM_ADMIN` branch unconditionally, and
  // its `MANAGER` branch once `VIEW_ALL_REVIEWS` is granted. Do NOT reach
  // for this pair for a scoped need; use the
  // …InCommunities/…ForPerformer/…ForCompany method for that scope. Same
  // COMPLETED_HISTORY_ORDER_BY as every other list method.
  //
  // design.md Decision 2 — the "no identifier-only read" invariant,
  // restated: every by-id read on this port names its scope in its own
  // name and takes that scope as a required parameter UNLESS the named
  // scope is the whole installation — in which case the method is
  // reachable from exactly two branches of that one service (design.md
  // review-history-manager-capability Decision 3): `SYSTEM_ADMIN`
  // unconditionally, and `MANAGER` holding `VIEW_ALL_REVIEWS`. The same
  // installation-scope carve-out now also covers
  // `findCompletedEntriesForElementAcrossInstallation` below (review-history-
  // per-element/design.md Decision 1) — reachable from the identical two
  // branches, this time of `listElementHistoryForActor`. `findById` still
  // does not exist, and never will.
  findCompletedAcrossInstallation(): Promise<ReviewSession[]>;

  findCompletedByIdAcrossInstallation(
    id: string,
  ): Promise<ReviewSession | null>;

  // review-history-per-element/design.md Decision 1/2: the four element-keyed
  // reads. Each carries the element id AND a scope conjunct as required
  // parameters — no scope discriminant, no branching query builder — and
  // filters `status = 'completed'` so a draft session's entries never
  // surface. Rows are returned UNSORTED; the use case's own private
  // `elementHistoryOrder` comparator orders them `recordedAt DESC, id DESC`
  // once, after the join, so all four scopes are identical by construction.

  // MAINTENANCE_TECHNICIAN — own recorded entries for this element, nothing
  // else.
  findCompletedEntriesForElementForPerformer(
    elementId: string,
    performedById: string,
  ): Promise<ElementReviewEntryRow[]>;

  // COMMUNITY_REPRESENTATIVE — entries whose session is in one of the
  // caller's currently active communities. `communityIds = []` is the
  // fail-closed empty scope (Prisma's `{ in: [] }` is already a false
  // predicate; the in-memory fake mirrors that explicitly).
  findCompletedEntriesForElementInCommunities(
    elementId: string,
    communityIds: readonly string[],
  ): Promise<ElementReviewEntryRow[]>;

  // MAINTENANCE_COMPANY_MANAGER — entries whose session was performed by the
  // caller's own company (the snapshotted `performedByCompanyId`, no other
  // conjunct — review-history-company-scope Decision 9, unchanged).
  findCompletedEntriesForElementForCompany(
    elementId: string,
    companyId: string,
  ): Promise<ElementReviewEntryRow[]>;

  // SYSTEM_ADMIN, and MANAGER holding VIEW_ALL_REVIEWS. The scope IS the
  // installation — same deliberate carve-out from the "no identifier-only
  // read" invariant that findCompletedAcrossInstallation already carries.
  findCompletedEntriesForElementAcrossInstallation(
    elementId: string,
  ): Promise<ElementReviewEntryRow[]>;
}

export const REVIEW_SESSION_REPOSITORY = Symbol('REVIEW_SESSION_REPOSITORY');
