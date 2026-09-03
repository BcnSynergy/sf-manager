import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { apiFetch } from './client';

// Mirrors apps/api/src/modules/checklist-question/presentation/
// checklist-question-error-code.ts verbatim (design.md Decision 8,
// "Coded-error convention"). Kept as honest duplication, same rationale as
// api/inspectable-element.ts's InspectableElementErrorCode — an e2e
// assertion on `body.code` in apps/api/test/checklist-question.e2e-spec.ts
// (task 5.8) is the anti-drift guard on the API side.
export type ChecklistQuestionErrorCode = 'CHECKLIST_QUESTION_NOT_FOUND';

// Mirrors apps/api's ChecklistQuestionResponseDto — deletedAt is never
// returned (design.md Data Flow).
export type ChecklistQuestion = {
  id: string;
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
};

export type CreateChecklistQuestionPayload = {
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
};

// elementType is NOT updatable (design.md Interfaces,
// ChecklistQuestionRepository.updateById comment) — mirrored here so a
// caller cannot even type it into the payload.
export type UpdateChecklistQuestionPayload = {
  text?: string;
  frequencies?: ReviewFrequency[];
};

export function listChecklistQuestions(): Promise<ChecklistQuestion[]> {
  return apiFetch<ChecklistQuestion[]>('/checklist-questions');
}

export function createChecklistQuestion(
  payload: CreateChecklistQuestionPayload,
): Promise<ChecklistQuestion> {
  return apiFetch<ChecklistQuestion>('/checklist-questions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateChecklistQuestion(
  id: string,
  payload: UpdateChecklistQuestionPayload,
): Promise<ChecklistQuestion> {
  return apiFetch<ChecklistQuestion>(`/checklist-questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// 204 No Content on success (mirrors api/inspectable-element.ts's
// softDeleteInspectableElement). Never 409 — soft-delete is never blocked
// by template references (design.md Decision 8, spec.md "Confirmed
// Soft-Delete").
export function softDeleteChecklistQuestion(id: string): Promise<undefined> {
  return apiFetch<undefined>(`/checklist-questions/${id}`, {
    method: 'DELETE',
  });
}
