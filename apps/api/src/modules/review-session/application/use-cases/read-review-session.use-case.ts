import { Injectable } from '@nestjs/common';
import type { AnswerValue } from '../../domain/answer-value';
import type { ReviewSessionStatus } from '../../domain/review-session-status';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

export interface ReadReviewSessionEntry {
  inspectableElementId: string;
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: AnswerValue }>;
  recordedAt: Date;
}

export interface ReadReviewSessionResult {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  entries: ReadReviewSessionEntry[];
  coverage: { reviewed: number; unreviewed: number };
}

// design.md Decision 11: "GET /review-sessions/:sessionId returns entries
// and coverage counts, not the question set" — the frozen question set is
// fetched per element instead (Phase 5). Reached exclusively through
// SessionAccess (Decision 4, Layer 3) — no other read path exists.
@Injectable()
export class ReadReviewSessionUseCase {
  constructor(private readonly sessionAccess: SessionAccessService) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<ReadReviewSessionResult> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);

    const entries: ReadReviewSessionEntry[] = session.entries.map((entry) => ({
      inspectableElementId: entry.inspectableElementId,
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
    };
  }
}
