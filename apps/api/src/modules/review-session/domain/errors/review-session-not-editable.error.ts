// Thrown by the `ReviewSession` aggregate root (design.md Decision 8) when
// `recordEntry`/`markUnreviewed`/`complete`/`discard` is attempted on a
// session whose `status !== 'draft'`. This is the domain-layer enforcement
// of spec.md "Completed Sessions Are Immutable" — it holds regardless of
// which route, use case or repository method is used to reach the session.
// The presentation layer maps this to 409 { code: REVIEW_SESSION_NOT_EDITABLE }.
export class ReviewSessionNotEditableError extends Error {
  constructor() {
    super('Review session is not editable');
    this.name = 'ReviewSessionNotEditableError';
  }
}
