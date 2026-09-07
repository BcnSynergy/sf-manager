// Thrown by `ElementReviewEntry.reviewed()` (design.md Decision 1) when the
// given answers array is empty. spec.md's invariant permits exactly one of
// "answered" or "explained" per element — `reviewed({ answers: [] })`
// would otherwise produce the "neither answered nor explained" state the
// entity's own doc comment declares unconstructible. Distinct from
// `MissingObservationsError`, which guards the `unreviewed()` side (a
// blank/missing skip reason) — the two are different failure reasons and
// may map to different presentation-layer error codes later.
export class MissingAnswersError extends Error {
  constructor() {
    super('A reviewed element requires at least one answer');
    this.name = 'MissingAnswersError';
  }
}
