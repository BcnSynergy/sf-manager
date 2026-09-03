import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/review-template/presentation/
// review-template.controller.ts::mapError verbatim (design.md Decision 8,
// "Coded-error convention"). CHECKLIST_QUESTION_NOT_FOUND is reused from
// checklist-question's own error code (not re-declared there) — the same
// code the pool's api client already carries, kept honestly duplicated
// here rather than importing across modules, same rationale as
// api/checklist-question.ts's own comment. An e2e assertion on `body.code`
// (Phase 11) is the anti-drift guard on the API side.
export type ReviewTemplateErrorCode =
  | 'REVIEW_TEMPLATE_NOT_FOUND'
  | 'REVIEW_TEMPLATE_NOT_EDITABLE'
  | 'REVIEW_TEMPLATE_EMPTY'
  | 'REVIEW_TEMPLATE_DRAFT_EXISTS'
  | 'REVIEW_TEMPLATE_ACTIVATION_CONFLICT'
  | 'CHECKLIST_QUESTION_NOT_FOUND';

// design.md Decision 1: the Zod projection lives in @sf-manager/validation
// (reviewTemplateStatusSchema); this type mirrors it for the wire shape.
export type ReviewTemplateStatus = 'draft' | 'active' | 'retired';

// Mirrors ReviewTemplateListItemResponseDto — GET /review-templates never
// joins questions (design.md Decision 5's two read paths are only
// exercised by GET .../:id).
export type ReviewTemplateListItem = {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
  version: number | null;
  status: ReviewTemplateStatus;
};

// Mirrors ReviewTemplateQuestionResponseDto — `text` is either the live
// pool wording (draft) or the frozen snapshot (active/retired); the
// component never has to know which (design.md Decision 5).
export type ReviewTemplateQuestion = {
  questionId: string;
  order: number;
  text: string;
};

// Mirrors ReviewTemplateResponseDto — the ONE response shape GET .../:id
// returns regardless of status (design.md Decision 5).
export type ReviewTemplate = {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
  version: number | null;
  status: ReviewTemplateStatus;
  questions: ReviewTemplateQuestion[];
};

// Mirrors ActivateReviewTemplateResponseDto — {id, status, version} only,
// not the full ReviewTemplateResponseDto (design.md Decision 8 PR9 note).
export type ActivateReviewTemplateResult = {
  id: string;
  status: ReviewTemplateStatus;
  version: number;
};

export type CreateDraftReviewTemplatePayload = {
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
};

export function listReviewTemplates(): Promise<ReviewTemplateListItem[]> {
  return apiFetch<ReviewTemplateListItem[]>('/review-templates');
}

export function readReviewTemplate(id: string): Promise<ReviewTemplate> {
  return apiFetch<ReviewTemplate>(`/review-templates/${id}`);
}

export function createDraftReviewTemplate(
  payload: CreateDraftReviewTemplatePayload,
): Promise<ReviewTemplateListItem> {
  return apiFetch<ReviewTemplateListItem>('/review-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// design.md Interfaces (PUT .../questions): questionIds is the full,
// ordered replacement selection — order in the array IS the submitted
// order (spec.md "Replace a Draft's Ordered Question Selection").
export function setReviewTemplateQuestions(
  id: string,
  questionIds: string[],
): Promise<ReviewTemplate> {
  return apiFetch<ReviewTemplate>(`/review-templates/${id}/questions`, {
    method: 'PUT',
    body: JSON.stringify({ questionIds }),
  });
}

export function activateReviewTemplate(id: string): Promise<ActivateReviewTemplateResult> {
  return apiFetch<ActivateReviewTemplateResult>(`/review-templates/${id}/activate`, {
    method: 'POST',
  });
}

// 204 No Content on success. Only `draft` templates are deletable — a
// frozen version yields 409 REVIEW_TEMPLATE_NOT_EDITABLE (spec.md "Only
// Drafts May Be Soft-Deleted"), unlike checklist-question's unconditional
// soft-delete.
export function softDeleteDraftReviewTemplate(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/review-templates/${id}`, {
    method: 'DELETE',
  });
}
