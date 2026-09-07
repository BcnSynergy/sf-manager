import { ReviewSessionStatus } from './review-session-status';
import { ElementReviewEntry } from './element-review-entry.entity';
import { ReviewSessionNotEditableError } from './errors/review-session-not-editable.error';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `ReviewSession` model (design.md
// Interfaces/Contracts). design.md Decision 9: plain fields, no Value
// Objects — the genuine behaviour this aggregate root has is the
// immutability rule (Decision 8), which is a pure guard with no I/O,
// mirroring `review-template/domain/review-template.entity.ts`'s
// `assertEditable` shape.
export interface ReviewSessionProps {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  // Optional: the repository (Phase 4/5) is the source of truth for
  // persisted entries; this in-memory list lets the aggregate itself apply
  // the `@@unique([reviewSessionId, inspectableElementId])` upsert
  // semantics (design.md Interfaces/Contracts) when recordEntry/
  // markUnreviewed are called directly against a hydrated aggregate.
  entries?: ElementReviewEntry[];
}

export class ReviewSession {
  readonly id: string;
  readonly communityId: string;
  readonly templateId: string;
  readonly performedById: string;
  readonly status: ReviewSessionStatus;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  private readonly entriesByElementId: Map<string, ElementReviewEntry>;

  constructor(props: ReviewSessionProps) {
    this.id = props.id;
    this.communityId = props.communityId;
    this.templateId = props.templateId;
    this.performedById = props.performedById;
    this.status = props.status;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.entriesByElementId = new Map(
      (props.entries ?? []).map((entry) => [entry.inspectableElementId, entry]),
    );
  }

  // Read-only view of the recorded entries, keyed by
  // `@@unique([reviewSessionId, inspectableElementId])`'s own uniqueness —
  // at most one entry per element (design.md Interfaces/Contracts).
  get entries(): ElementReviewEntry[] {
    return [...this.entriesByElementId.values()];
  }

  // design.md Decision 8: immutability is the aggregate root's job, not the
  // controller's — it is the domain-layer enforcement of spec.md
  // "Completed Sessions Are Immutable", so it holds regardless of which
  // route, use case or repository method is used to reach the session.
  private assertEditable(): void {
    if (this.status !== 'draft') {
      throw new ReviewSessionNotEditableError();
    }
  }

  // spec.md "Answering a completed session is rejected". Durable persistence
  // is owned by the repository (`upsertEntry`, Phase 4/5) — this method is
  // what makes the illegal transition unreachable regardless of the caller,
  // and applies the same upsert-by-element-id semantics locally so a
  // hydrated aggregate stays consistent with `@@unique([reviewSessionId,
  // inspectableElementId])`.
  recordEntry(entry: ElementReviewEntry): void {
    this.assertEditable();
    this.entriesByElementId.set(entry.inspectableElementId, entry);
  }

  // spec.md "An unreviewed element is not counted as reviewed" /
  // "Answering a completed session is rejected" — same immutability guard
  // and upsert semantics as recordEntry, kept as a distinct method per
  // design.md Decision 8's named transition list.
  markUnreviewed(entry: ElementReviewEntry): void {
    this.assertEditable();
    this.entriesByElementId.set(entry.inspectableElementId, entry);
  }

  // spec.md "Reopening a completed session is rejected" — complete() is
  // itself only a legal transition from draft; the repository's own
  // `WHERE status = 'draft'` (Decision 8) is the concurrency backstop for
  // the same rule.
  complete(): void {
    this.assertEditable();
  }

  // spec.md "Discarding is refused for a completed session" — only a draft
  // may be discarded.
  discard(): void {
    this.assertEditable();
  }
}
