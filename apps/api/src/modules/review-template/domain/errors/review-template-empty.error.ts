// Thrown when activation is attempted on a draft with zero selected
// questions (spec.md "Activating an empty template rejected without
// consuming a version"; design.md Data Flow step 3, the fast-path guard
// before repo.activate() even runs). The presentation layer maps this to
// 409 { code: REVIEW_TEMPLATE_EMPTY } (design.md Decision 8). Also the
// rollback reason if the DB-side INSERT...SELECT snapshot (design.md
// Decision 4) produces zero rows because every selected question was
// concurrently soft-deleted (Phase 9).
export class ReviewTemplateEmptyError extends Error {
  constructor() {
    super('Review template has no selected questions');
    this.name = 'ReviewTemplateEmptyError';
  }
}
