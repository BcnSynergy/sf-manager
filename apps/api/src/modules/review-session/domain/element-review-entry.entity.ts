import { QuestionAnswer } from './question-answer.entity';
import { MissingObservationsError } from './errors/missing-observations.error';
import { MissingAnswersError } from './errors/missing-answers.error';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// design.md Decision 1 (BLOCKING, resolved): `observations` lives here,
// nullable, and is the entry's skip reason. An entry is valid iff EXACTLY
// ONE of: `answers.length > 0 && observations === null` (reviewed), or
// `answers.length === 0 && observations !== null` (unreviewed). There is no
// session-level free-text `observations`.
//
// Enforcement is the domain invariant (primary, this file): NO PUBLIC
// CONSTRUCTOR — `.reviewed()` and `.unreviewed()` are the only ways to
// build one, so the illegal state (both populated, or neither) is
// unconstructible; the Zod discriminated union (Phase 5) and the
// hand-written Postgres CHECK (migration.sql, intra-row half only) are the
// other two enforcement layers.
export interface ElementReviewEntryProps {
  id: string;
  reviewSessionId: string;
  inspectableElementId: string;
  answers: QuestionAnswer[];
  observations: string | null;
  recordedAt: Date;
}

interface ReviewedProps {
  id: string;
  reviewSessionId: string;
  inspectableElementId: string;
  answers: QuestionAnswer[];
  recordedAt: Date;
}

interface UnreviewedProps {
  id: string;
  reviewSessionId: string;
  inspectableElementId: string;
  observations: string;
  recordedAt: Date;
}

export class ElementReviewEntry {
  readonly id: string;
  readonly reviewSessionId: string;
  readonly inspectableElementId: string;
  readonly answers: QuestionAnswer[];
  readonly observations: string | null;
  readonly recordedAt: Date;

  private constructor(props: ElementReviewEntryProps) {
    this.id = props.id;
    this.reviewSessionId = props.reviewSessionId;
    this.inspectableElementId = props.inspectableElementId;
    this.answers = props.answers;
    this.observations = props.observations;
    this.recordedAt = props.recordedAt;
  }

  // spec.md "Record an Element's Answers": the element was reviewed —
  // `observations` is `null`, never `''` or "not applicable" (design.md
  // Decision 1).
  static reviewed(props: ReviewedProps): ElementReviewEntry {
    if (props.answers.length === 0) {
      throw new MissingAnswersError();
    }

    return new ElementReviewEntry({
      id: props.id,
      reviewSessionId: props.reviewSessionId,
      inspectableElementId: props.inspectableElementId,
      answers: props.answers,
      observations: null,
      recordedAt: props.recordedAt,
    });
  }

  // spec.md "An Unreviewed Element Requires a Recorded Reason": a blank or
  // missing reason MUST be rejected and MUST persist nothing — enforced
  // here so the illegal state never reaches the repository (design.md
  // Decision 1, "the illegal state is unconstructible").
  static unreviewed(props: UnreviewedProps): ElementReviewEntry {
    if (props.observations.trim().length === 0) {
      throw new MissingObservationsError();
    }

    return new ElementReviewEntry({
      id: props.id,
      reviewSessionId: props.reviewSessionId,
      inspectableElementId: props.inspectableElementId,
      answers: [],
      observations: props.observations,
      recordedAt: props.recordedAt,
    });
  }
}
