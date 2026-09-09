import type { AnswerValue } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/review-session/presentation/
// review-history.controller.ts's `mapError` (design.md Decision 4/7): only
// REVIEW_SESSION_NOT_FOUND (list never throws it, detail collapses every
// rejection cause into it) and ACTIVE_TEMPLATE_NOT_FOUND (defensive-only)
// can reach the client here. review-session/error-messages.ts's
// mapApiErrorToMessageKey already maps REVIEW_SESSION_NOT_FOUND to the same
// uniform message key this surface needs (spec "An Unreachable Session Gets
// One Uniform Message"), so this module reuses it rather than duplicating a
// second mapper for the same code.

// Mirrors ReviewHistoryRowDto (GET /review-history) — design.md Decision 6:
// no coverage counts, no template/element-type column, no performer name.
// `communityName` may be `''` for a soft-deleted community the caller is
// still assigned to (design.md Open Questions) — the list page renders a
// neutral placeholder for that case, not the empty string.
export type ReviewHistoryRow = {
  id: string;
  communityId: string;
  communityName: string;
  performedById: string;
  startedAt: string;
  completedAt: string;
};

// Mirrors ReviewHistoryDetailResponseDto (GET /review-history/:sessionId) —
// a superset of review-session.ts's ReviewSessionDetail: `elementCode`
// (live, nullable) per entry and `questions` (frozen wording).
export type ReviewHistoryEntryAnswer = { questionId: string; answer: AnswerValue };
export type ReviewHistoryEntry = {
  inspectableElementId: string;
  elementCode: string | null;
  reviewed: boolean;
  observations: string | null;
  answers: ReviewHistoryEntryAnswer[];
  recordedAt: string;
};
export type ReviewHistoryCoverage = { reviewed: number; unreviewed: number };
export type ReviewHistoryQuestion = { questionId: string; order: number; text: string };
export type ReviewHistoryDetail = {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: 'completed';
  startedAt: string;
  completedAt: string;
  entries: ReviewHistoryEntry[];
  coverage: ReviewHistoryCoverage;
  questions: ReviewHistoryQuestion[];
};

export function listReviewHistory(): Promise<ReviewHistoryRow[]> {
  return apiFetch<ReviewHistoryRow[]>('/review-history');
}

export function readReviewHistory(sessionId: string): Promise<ReviewHistoryDetail> {
  return apiFetch<ReviewHistoryDetail>(`/review-history/${sessionId}`);
}
