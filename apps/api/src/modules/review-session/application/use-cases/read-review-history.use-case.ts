import { Inject, Injectable } from '@nestjs/common';
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
import {
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports/user-directory.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import {
  buildHistoryEntries,
  type ReadReviewHistoryEntry,
} from './review-history-entries';
// design.md Decision 2: ReadReviewHistoryEntry now lives in
// review-history-entries.ts (shared with read-review-document); re-exported
// here so existing importers of this module are unaffected.
export type { ReadReviewHistoryEntry } from './review-history-entries';

export interface ReadReviewHistoryResult {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  performedByEmail: string;
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
    @Inject(USER_DIRECTORY)
    private readonly userDirectory: UserDirectory,
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

    // design.md Decision 8: single-performer resolution via the same
    // batched port method the list use case uses — one call over one id.
    const emailByPerformerId = await this.userDirectory.findEmailsByIds([
      session.performedById,
    ]);
    const performedByEmail =
      emailByPerformerId.get(session.performedById) ?? '';

    // design.md Decision 2: no answerOrder — history keeps its original
    // entry and answer order, so this call is byte-identical to the
    // inline mapping it replaces.
    const entries = buildHistoryEntries(session.entries, codeByElementId);

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
      performedByEmail,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      entries,
      coverage,
      questions: template.questions,
    };
  }
}
