import type { AnswerValue, ElementType, ReviewFrequency } from '@sf-manager/validation';
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
// no coverage counts, no template/element-type column. `communityName` may
// be `''` for a soft-deleted community the caller is still assigned to
// (design.md Open Questions) — the list page renders a neutral placeholder
// for that case, not the empty string. `performedByEmail` (review-history-
// company-scope design.md Decision 8) is resolved server-side from
// `performedById` via one batched query and may also be `''` when
// unresolvable — same placeholder treatment as `communityName`.
export type ReviewHistoryRow = {
  id: string;
  communityId: string;
  communityName: string;
  performedById: string;
  performedByEmail: string;
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
  performedByEmail: string;
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

// Mirrors ElementReviewHistoryResponseDto (GET /communities/:communityId/
// inspectable-elements/:elementId/review-history) — review-history-per-
// element/design.md Decision 5/7. The only rejection cause this endpoint can
// produce is INSPECTABLE_ELEMENT_NOT_FOUND (design.md Decision 5's ONE
// throw site), already mapped by inspectable-element/error-messages.ts's
// mapApiErrorToMessageKey — this module does not duplicate that mapping.
export type ElementReviewHistoryHeader = {
  id: string;
  code: string;
  name: string;
  elementType: ElementType;
  location: string;
  communityId: string;
  communityName: string;
  deactivatedAt: string | null;
};
export type ElementReviewHistoryRow = {
  reviewSessionId: string;
  performedById: string;
  performedByEmail: string;
  reviewed: boolean;
  observations: string | null;
  recordedAt: string;
};
export type ElementReviewHistory = {
  element: ElementReviewHistoryHeader;
  entries: ElementReviewHistoryRow[];
};

export function readElementReviewHistory(
  communityId: string,
  elementId: string,
): Promise<ElementReviewHistory> {
  return apiFetch<ElementReviewHistory>(
    `/communities/${communityId}/inspectable-elements/${elementId}/review-history`,
  );
}

// Mirrors ReviewDocumentResponseDto (GET /review-history/:sessionId/document)
// — review-export/design.md Interfaces/Contracts. This is the document's OWN
// entry, template and letterhead shape, never `ReviewHistoryDetailEntryDto`
// (design.md Decision 2): `elementName`/`elementLocation` are additions this
// endpoint carries that the history detail does not. `elementCode`,
// `elementName` and `elementLocation` are each `null` only when the element
// id resolves no row at all — a deactivated or soft-deleted element still
// carries its real values. `maintenanceCompanyName` is `null` only when no
// company was recorded for the session; `communityName`,
// `maintenanceCompanyName` and `performedByEmail` may separately be `''`,
// the defensive-fallback for an id that resolves no row (review-document
// spec's "A defensive-fallback empty value renders a placeholder, not a
// blank cell") — the page renders a placeholder for that case, never the
// company-absent state.
export type ReviewDocumentTemplate = {
  name: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  version: number | null;
};
export type ReviewDocumentEntry = {
  inspectableElementId: string;
  elementCode: string | null;
  elementName: string | null;
  elementLocation: string | null;
  reviewed: boolean;
  observations: string | null;
  answers: ReviewHistoryEntryAnswer[];
  recordedAt: string;
};
// spec.md "The document exposes only the letterhead fields" — exactly the
// six text fields, never `id`/`logoAssetId`.
export type ReviewDocumentLetterhead = {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
};
export type ReviewDocument = {
  id: string;
  communityId: string;
  communityName: string;
  template: ReviewDocumentTemplate;
  maintenanceCompanyName: string | null;
  performedById: string;
  performedByEmail: string;
  status: 'completed';
  startedAt: string;
  completedAt: string | null;
  entries: ReviewDocumentEntry[];
  questions: ReviewHistoryQuestion[];
  letterhead: ReviewDocumentLetterhead;
};

export function readReviewDocument(sessionId: string): Promise<ReviewDocument> {
  return apiFetch<ReviewDocument>(`/review-history/${sessionId}/document`);
}
