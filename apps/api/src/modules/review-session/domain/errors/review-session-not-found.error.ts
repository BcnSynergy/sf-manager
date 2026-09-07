// Thrown by `SessionAccess.loadForActor` (design.md Decision 4, Layer 3,
// Phase 4) when `findByIdForPerformer` resolves to null OR the community
// scope check fails — an unknown sessionId, another performer's session,
// and a since-deactivated assignment are all indistinguishable (design.md
// "Rejection matrix": 404 REVIEW_SESSION_NOT_FOUND). The presentation layer
// maps this to 404 { code: REVIEW_SESSION_NOT_FOUND }.
//
// Mirrors `inspectable-element/domain/errors/inspectable-element-not-found
// .error.ts` — same shape, same role in its own module.
export class ReviewSessionNotFoundError extends Error {
  constructor() {
    super('Review session not found');
    this.name = 'ReviewSessionNotFoundError';
  }
}
