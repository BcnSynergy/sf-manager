import { Inject, Injectable } from '@nestjs/common';
import type { AnswerValue } from '../../domain/answer-value';
import type { ReviewSessionStatus } from '../../domain/review-session-status';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
  type TemplateQuestionEntry,
} from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

export interface ReadReviewHistoryEntry {
  inspectableElementId: string;
  elementCode: string | null;
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: AnswerValue }>;
  recordedAt: Date;
}

export interface ReadReviewHistoryResult {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  entries: ReadReviewHistoryEntry[];
  coverage: { reviewed: number; unreviewed: number };
  questions: TemplateQuestionEntry[];
}

// review-history design.md Decision 6 / Data Flow: loadCompletedForActor
// (ReviewHistoryAccessService) -> findFrozenWithSnapshot (frozen question
// wording, mirrors ResolveElementByCodeUseCase/CompleteReviewSessionUseCase)
// -> findActiveByCommunityAndType (the SAME live universe
// CompleteReviewSessionUseCase already computes over) to attach a nullable
// `elementCode` per entry. An element decommissioned or soft-deleted after
// completion is absent from that active set, so its entry still returns —
// with `elementCode: null` — rather than being dropped.
@Injectable()
export class ReadReviewHistoryUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<ReadReviewHistoryResult> {
    // loadCompletedForActor throws ReviewSessionNotFoundError for an
    // unknown/draft/foreign-performer/foreign-community/deactivated-
    // assignment session BEFORE anything below runs — one throw site.
    const session = await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );

    // A session stores templateId only, never a separate elementType column
    // (mirrors ResolveElementByCodeUseCase/CompleteReviewSessionUseCase).
    // Defensive: the schema does not allow a bound template's frozen row to
    // disappear after the session opened it (design.md Decision 7).
    const template = await this.templateRepository.findFrozenWithSnapshot(
      session.templateId,
    );
    if (!template) {
      throw new ActiveTemplateNotFoundError();
    }

    const activeElements =
      await this.elementRepository.findActiveByCommunityAndType(
        session.communityId,
        template.elementType,
      );
    const codeByElementId = new Map(
      activeElements.map((element) => [element.id, element.code]),
    );

    const entries: ReadReviewHistoryEntry[] = session.entries.map((entry) => ({
      inspectableElementId: entry.inspectableElementId,
      elementCode: codeByElementId.get(entry.inspectableElementId) ?? null,
      reviewed: entry.answers.length > 0,
      observations: entry.observations,
      answers: entry.answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
      })),
      recordedAt: entry.recordedAt,
    }));

    // design.md Decision 1: an entry is EXACTLY one of reviewed/unreviewed
    // by construction, so these two counts always sum to entries.length.
    const coverage = {
      reviewed: entries.filter((entry) => entry.reviewed).length,
      unreviewed: entries.filter((entry) => !entry.reviewed).length,
    };

    return {
      id: session.id,
      communityId: session.communityId,
      templateId: session.templateId,
      performedById: session.performedById,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      entries,
      coverage,
      questions: template.questions,
    };
  }
}
