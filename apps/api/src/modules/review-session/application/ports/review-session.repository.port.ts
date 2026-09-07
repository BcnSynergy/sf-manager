import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
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
  // mark-unreviewed use cases are the real callers; wired here for
  // interface completeness per design.md Interfaces/Contracts.
  upsertEntry(
    sessionId: string,
    entry: ElementReviewEntry,
    answers: QuestionAnswer[],
  ): Promise<void>;

  // `WHERE status='draft'`; false => the caller maps this to 409
  // REVIEW_SESSION_NOT_EDITABLE (design.md Decision 8).
  complete(id: string, at: Date): Promise<boolean>;

  // Hard delete (resolved 2026-09-06, design.md Interfaces/Contracts — no
  // `deletedAt` exists on the three review tables). `WHERE status='draft'`;
  // false => 409 REVIEW_SESSION_NOT_EDITABLE. `ElementReviewEntry`/
  // `QuestionAnswer`'s FKs declare `ON DELETE CASCADE`, so a discarded
  // draft's recorded entries/answers are removed with it, never orphaned.
  discardDraft(id: string): Promise<boolean>;
}

export const REVIEW_SESSION_REPOSITORY = Symbol('REVIEW_SESSION_REPOSITORY');
