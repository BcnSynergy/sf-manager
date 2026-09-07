// Thrown by `CompleteReviewSessionUseCase` (design.md Decision 2, Phase 6)
// when the active elements of the session's community and element type
// minus the elements that already have an entry is non-empty. spec.md
// "Complete a Session With Explained Gaps Only" — "Completion MUST be
// rejected when any active, non-soft-deleted element... is neither
// reviewed nor carries a recorded unreviewed reason." The presentation
// layer maps this to 409 { code: UNREVIEWED_ELEMENTS_WITHOUT_REASON },
// listing the offending element codes in the response body.
export class UnreviewedElementsWithoutReasonError extends Error {
  constructor(readonly elementCodes: string[]) {
    super('Active elements remain without a recorded review or reason');
    this.name = 'UnreviewedElementsWithoutReasonError';
  }
}
