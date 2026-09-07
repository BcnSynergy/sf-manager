// Thrown by `ElementReviewEntry.unreviewed()` (design.md Decision 1) when
// the given reason is empty or whitespace-only. spec.md "An Unreviewed
// Element Requires a Recorded Reason" — "An empty or missing reason is
// rejected... nothing MUST be persisted for E". The presentation layer maps
// this to 400 { code: MISSING_OBSERVATIONS } via the Zod discriminated
// union (Phase 5); this error is the domain-layer backstop that makes the
// illegal state unconstructible even if a caller bypasses validation.
export class MissingObservationsError extends Error {
  constructor() {
    super('An unreviewed element requires a non-empty observations reason');
    this.name = 'MissingObservationsError';
  }
}
