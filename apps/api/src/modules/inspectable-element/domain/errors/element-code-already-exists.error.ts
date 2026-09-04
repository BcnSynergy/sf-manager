// Repository's `P2002` translation (design.md Decision 3), thrown by
// PrismaInspectableElementRepository.create() on a unique-constraint
// violation against `InspectableElement_code_key`. Consumed only by the
// create use case's bounded 3-attempt retry loop (Phase 3) — never surfaces
// to the presentation layer directly. Mirrors
// `community/domain/errors/assignment-already-exists.error.ts`.
export class ElementCodeAlreadyExistsError extends Error {
  constructor() {
    super('Element code already exists');
    this.name = 'ElementCodeAlreadyExistsError';
  }
}
