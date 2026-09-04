// Thrown by CreateInspectableElementUseCase (design.md Decision 3) when all
// 3 bounded generation attempts collide against
// `InspectableElement_code_key`. At this collision probability
// (31^10 ≈ 8.2×10^14 combinations) exhaustion is not a collision story —
// it signals a systemic bug (a constant generator, a corrupt index) — so
// the presentation layer maps this to a plain 500
// (InternalServerErrorException) with no error code, not a retryable coded
// error.
export class ElementCodeGenerationFailedError extends Error {
  constructor() {
    super('Failed to generate a unique element code after 3 attempts');
    this.name = 'ElementCodeGenerationFailedError';
  }
}
