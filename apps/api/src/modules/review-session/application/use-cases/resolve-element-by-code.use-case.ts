import { Inject, Injectable } from '@nestjs/common';
import type { AnswerValue } from '../../domain/answer-value';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
  type TemplateQuestionEntry,
} from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

export interface ResolveElementByCodeElement {
  id: string;
  code: string;
  name: string;
  location: string;
}

export interface ResolveElementByCodeEntry {
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: AnswerValue }>;
  recordedAt: Date;
}

export interface ResolveElementByCodeResult {
  element: ResolveElementByCodeElement;
  questions: TemplateQuestionEntry[];
  entry: ResolveElementByCodeEntry | null;
}

// spec.md "Resolve an Element by Code Within the Session's Scope" +
// "Rejected Codes Are Indistinguishable"; design.md Decision 11 ("the
// frozen question set is fetched per element, in one round trip") and
// Decision 6 (scope in the port signature, one collapsing return path).
// Reached exclusively through SessionAccess (Decision 4, Layer 3) — this
// is the FIRST use of `session.communityId` alongside the template's own
// `elementType` (the session entity itself carries no elementType column;
// it is derived from the bound, frozen template, per spec.md "Element type
// and frequency are derived, not supplied").
@Injectable()
export class ResolveElementByCodeUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
  ) {}

  async execute(
    sessionId: string,
    code: string,
    actor: Actor,
  ): Promise<ResolveElementByCodeResult> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);

    // The frozen template row is the ONLY place this use case can read the
    // session's element type from (design.md Decision 7) — a session
    // stores templateId only, never a separate elementType column. Missing
    // here would mean the bound template's frozen row disappeared after
    // the session opened it, which the schema does not allow (Decision 7:
    // "activating a successor does not break an old session's read") —
    // defensive, not a reachable code path in normal operation.
    const template = await this.templateRepository.findFrozenWithSnapshot(
      session.templateId,
    );
    if (!template) {
      throw new ActiveTemplateNotFoundError();
    }

    // design.md Decision 6: communityId and elementType are read off the
    // already-loaded session/template, never accepted as request
    // parameters — the caller cannot widen the scope. Unknown code,
    // foreign community, wrong element type, decommissioned and
    // soft-deleted all collapse to this SAME null return.
    const element = await this.elementRepository.findReviewableByCode(
      session.communityId,
      template.elementType,
      code,
    );
    if (!element) {
      throw new InspectableElementNotFoundError();
    }

    const existingEntry = session.entries.find(
      (entry) => entry.inspectableElementId === element.id,
    );

    return {
      element: {
        id: element.id,
        code: element.code,
        name: element.name,
        location: element.location,
      },
      questions: template.questions,
      entry: existingEntry
        ? {
            reviewed: existingEntry.answers.length > 0,
            observations: existingEntry.observations,
            answers: existingEntry.answers.map((answer) => ({
              questionId: answer.questionId,
              answer: answer.answer,
            })),
            recordedAt: existingEntry.recordedAt,
          }
        : null,
    };
  }
}
