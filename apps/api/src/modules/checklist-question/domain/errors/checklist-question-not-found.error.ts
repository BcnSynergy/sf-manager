// Thrown by checklist-question application use cases (Phase 3) when a
// lookup by id resolves to nothing — unknown id and soft-deleted are both
// indistinguishable (ADR-010). The presentation layer maps this to
// 404 { code: CHECKLIST_QUESTION_NOT_FOUND } (design.md Decision 8).
//
// Mirrors `inspectable-element/domain/errors/
// inspectable-element-not-found.error.ts` — same shape, same role in its
// own module.
export class ChecklistQuestionNotFoundError extends Error {
  constructor() {
    super('Checklist question not found');
    this.name = 'ChecklistQuestionNotFoundError';
  }
}
