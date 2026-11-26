// Thrown by `CompleteReviewSessionUseCase` when the performer has no
// registered signature to sign with (no row, or a recorded file that is gone)
// — review-session-management "Completion Is the Signing Act". The
// presentation layer maps this to 409 { code: SIGNATURE_REQUIRED }.
export class SignatureRequiredError extends Error {
  constructor() {
    super('A signature must be registered before signing a review');
    this.name = 'SignatureRequiredError';
  }
}
