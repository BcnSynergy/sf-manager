import type {
  AnswerValue,
  RecordEntryRequest,
  ReviewSessionStatus,
} from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/review-session/presentation/
// review-session.controller.ts's `mapError` verbatim (design.md Decision 4's
// rejection matrix) — same honest-duplication rationale as every other
// api/*.ts ErrorCode union in this app (an e2e assertion on `body.code` in
// apps/api/test/review-session.e2e-spec.ts is the anti-drift guard on the
// API side).
export type ReviewSessionErrorCode =
  | 'COMMUNITY_NOT_IN_SCOPE'
  | 'ACTIVE_TEMPLATE_NOT_FOUND'
  | 'OPEN_DRAFT_ALREADY_EXISTS'
  | 'REVIEW_SESSION_NOT_FOUND'
  | 'REVIEW_SESSION_NOT_EDITABLE'
  | 'ELEMENT_NOT_FOUND'
  | 'ANSWERS_DO_NOT_MATCH_TEMPLATE'
  | 'MISSING_OBSERVATIONS'
  | 'MISSING_ANSWERS'
  | 'UNREVIEWED_ELEMENTS_WITHOUT_REASON';

// Mirrors ReviewScopeResponseDto (GET /review-scope).
export type ReviewScopeCommunity = { id: string; name: string };
export type ReviewScopeTemplate = {
  id: string;
  elementType: string;
  frequency: string;
  name: string;
};
export type ReviewScope = {
  communities: ReviewScopeCommunity[];
  templates: ReviewScopeTemplate[];
};

// Mirrors ReviewSessionResponseDto — the shape shared by POST
// /review-sessions, each item of GET /review-sessions, and the trimmed
// return of POST .../complete.
export type ReviewSession = {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: ReviewSessionStatus;
  startedAt: string;
  completedAt: string | null;
};

export type OpenReviewSessionPayload = { communityId: string; templateId: string };

// Mirrors ReviewSessionDetailResponseDto (GET /review-sessions/:sessionId).
export type ReviewSessionEntryAnswer = { questionId: string; answer: AnswerValue };
export type ReviewSessionEntry = {
  inspectableElementId: string;
  reviewed: boolean;
  observations: string | null;
  answers: ReviewSessionEntryAnswer[];
  recordedAt: string;
};
export type ReviewSessionCoverage = { reviewed: number; unreviewed: number };
export type ReviewSessionDetail = ReviewSession & {
  entries: ReviewSessionEntry[];
  coverage: ReviewSessionCoverage;
};

// Mirrors ResolveElementResponseDto (GET .../elements/:code) — design.md
// Decision 11: element identity, the frozen question snapshot, and any
// existing entry, in one round trip.
export type ResolveElementElement = {
  id: string;
  code: string;
  name: string;
  location: string;
};
export type ResolveElementQuestion = { questionId: string; order: number; text: string };
export type ResolveElementEntry = {
  reviewed: boolean;
  observations: string | null;
  answers: ReviewSessionEntryAnswer[];
  recordedAt: string;
};
export type ResolveElementResult = {
  element: ResolveElementElement;
  questions: ResolveElementQuestion[];
  entry: ResolveElementEntry | null;
};

// Mirrors RecordEntryResponseDto (PUT .../entries/:elementId).
export type RecordEntryResult = {
  inspectableElementId: string;
  reviewed: boolean;
  observations: string | null;
  answers: ReviewSessionEntryAnswer[];
  recordedAt: string;
};

export function getReviewScope(): Promise<ReviewScope> {
  return apiFetch<ReviewScope>('/review-scope');
}

export function openReviewSession(payload: OpenReviewSessionPayload): Promise<ReviewSession> {
  return apiFetch<ReviewSession>('/review-sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listOwnReviewSessions(): Promise<ReviewSession[]> {
  return apiFetch<ReviewSession[]>('/review-sessions');
}

export function readReviewSession(sessionId: string): Promise<ReviewSessionDetail> {
  return apiFetch<ReviewSessionDetail>(`/review-sessions/${sessionId}`);
}

// 204 No Content on success (mirrors api/community.ts's softDeleteCommunity).
export function discardReviewSession(sessionId: string): Promise<undefined> {
  return apiFetch<undefined>(`/review-sessions/${sessionId}`, { method: 'DELETE' });
}

// `code` is uppercased by the caller before this is invoked (review-session-ui
// spec "Manual Code Entry Only" — codes are accepted case-insensitively
// where the underlying alphabet permits; ELEMENT_CODE_ALPHABET is
// uppercase-only, so uppercasing client-side before the request is the
// whole of "case-insensitive" here) — this function does not re-normalize,
// mirroring how every other api/*.ts function trusts its caller's payload
// shape.
export function resolveElementByCode(
  sessionId: string,
  code: string,
): Promise<ResolveElementResult> {
  return apiFetch<ResolveElementResult>(
    `/review-sessions/${sessionId}/elements/${encodeURIComponent(code)}`,
  );
}

export function recordEntry(
  sessionId: string,
  elementId: string,
  body: RecordEntryRequest,
): Promise<RecordEntryResult> {
  return apiFetch<RecordEntryResult>(
    `/review-sessions/${sessionId}/entries/${elementId}`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
}

// design.md Decision 2: on 409 UNREVIEWED_ELEMENTS_WITHOUT_REASON, the
// response body carries `elementCodes` — surfaced via ApiError.extra
// (client.ts). This function does not unwrap it; callers read
// `error.extra?.elementCodes` themselves, same pattern as every other
// ApiError consumer reading `.status`/`.code`.
export function completeReviewSession(
  sessionId: string,
): Promise<Pick<ReviewSession, 'id' | 'status' | 'completedAt'>> {
  return apiFetch<Pick<ReviewSession, 'id' | 'status' | 'completedAt'>>(
    `/review-sessions/${sessionId}/complete`,
    { method: 'POST' },
  );
}
