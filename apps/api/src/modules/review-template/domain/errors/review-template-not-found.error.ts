// Thrown by review-template application use cases when a lookup by id
// resolves to nothing — unknown id and soft-deleted are both
// indistinguishable (ADR-010). The presentation layer maps this to
// 404 { code: REVIEW_TEMPLATE_NOT_FOUND } (design.md Decision 8, Findings).
//
// Mirrors `checklist-question/domain/errors/
// checklist-question-not-found.error.ts` — same shape, same role in its own
// module.
export class ReviewTemplateNotFoundError extends Error {
  constructor() {
    super('Review template not found');
    this.name = 'ReviewTemplateNotFoundError';
  }
}
