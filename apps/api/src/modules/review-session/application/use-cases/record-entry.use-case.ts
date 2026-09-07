import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';
import type { AnswerValue } from '../../domain/answer-value';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { AnswersDoNotMatchTemplateError } from '../../domain/errors/answers-do-not-match-template.error';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

export interface RecordEntryReviewedInput {
  kind: 'reviewed';
  answers: Array<{ questionId: string; value: AnswerValue }>;
}

export interface RecordEntryUnreviewedInput {
  kind: 'unreviewed';
  observations: string;
}

export type RecordEntryInput =
  RecordEntryReviewedInput | RecordEntryUnreviewedInput;

export interface RecordEntryResult {
  inspectableElementId: string;
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: AnswerValue }>;
  recordedAt: Date;
}

// spec.md "Record an Element's Answers" + "An Unreviewed Element Requires a
// Recorded Reason" + "Completed Sessions Are Immutable". design.md
// Decision 10: "One write endpoint for both outcomes" — this is that one
// use case, dispatching on the Zod discriminated body shape
// (`recordEntryRequestSchema`, packages/validation) rather than exposing
// two separate operations. Reached exclusively through SessionAccess
// (Decision 4, Layer 3).
@Injectable()
export class RecordEntryUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly sessionRepository: ReviewSessionRepository,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    sessionId: string,
    elementId: string,
    input: RecordEntryInput,
    actor: Actor,
  ): Promise<RecordEntryResult> {
    // SessionAccess throws ReviewSessionNotFoundError for an unknown/
    // foreign/out-of-scope session BEFORE anything below runs.
    const session = await this.sessionAccess.loadForActor(sessionId, actor);

    const entryId = this.idGenerator.generate();
    const recordedAt = new Date();

    let entry: ElementReviewEntry;
    if (input.kind === 'unreviewed') {
      // ElementReviewEntry.unreviewed() throws MissingObservationsError on
      // a blank/whitespace-only reason — the domain-layer backstop behind
      // the Zod schema's own `.min(1)` after `.trim()` (design.md
      // Decision 1, enforcement layer 1).
      entry = ElementReviewEntry.unreviewed({
        id: entryId,
        reviewSessionId: session.id,
        inspectableElementId: elementId,
        observations: input.observations,
        recordedAt,
      });
    } else {
      // design.md Decision 11: the frozen snapshot is the ONLY source of
      // truth for which questions this element's answers must cover —
      // never the live ChecklistQuestion pool. spec.md "An incomplete
      // answer set is rejected" / "An unknown question is rejected": both
      // collapse to the SAME AnswersDoNotMatchTemplateError, mirroring
      // Decision 6's "one collapsing return path" philosophy for a
      // different rejection.
      const template = await this.templateRepository.findFrozenWithSnapshot(
        session.templateId,
      );
      if (!template) {
        throw new ActiveTemplateNotFoundError();
      }

      const snapshotQuestionIds = new Set(
        template.questions.map((question) => question.questionId),
      );
      const submittedQuestionIds = new Set(
        input.answers.map((answer) => answer.questionId),
      );
      const matchesSnapshot =
        submittedQuestionIds.size === input.answers.length &&
        submittedQuestionIds.size === snapshotQuestionIds.size &&
        [...submittedQuestionIds].every((id) => snapshotQuestionIds.has(id));
      if (!matchesSnapshot) {
        throw new AnswersDoNotMatchTemplateError();
      }

      // ElementReviewEntry.reviewed() throws MissingAnswersError on an
      // empty array — unreachable here since the Zod schema already
      // requires `answers.length >= 1`, kept as the same domain-layer
      // backstop pattern as the unreviewed branch above.
      entry = ElementReviewEntry.reviewed({
        id: entryId,
        reviewSessionId: session.id,
        inspectableElementId: elementId,
        answers: input.answers.map(
          (answer) =>
            new QuestionAnswer({
              id: this.idGenerator.generate(),
              elementReviewEntryId: entryId,
              questionId: answer.questionId,
              answer: answer.value,
            }),
        ),
        recordedAt,
      });
    }

    // design.md Decision 8: the aggregate root's own guard is the primary
    // immutability enforcement — throws ReviewSessionNotEditableError when
    // `status !== 'draft'`, regardless of which named method is called.
    if (input.kind === 'unreviewed') {
      session.markUnreviewed(entry);
    } else {
      session.recordEntry(entry);
    }

    // Full-replace semantics, `entry` alone is the source of truth for
    // which session it belongs to (Phase 5 redundancy fix — see
    // review-session.repository.port.ts).
    await this.sessionRepository.upsertEntry(entry);

    return {
      inspectableElementId: entry.inspectableElementId,
      reviewed: entry.answers.length > 0,
      observations: entry.observations,
      answers: entry.answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
      })),
      recordedAt: entry.recordedAt,
    };
  }
}
