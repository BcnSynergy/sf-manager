// Thrown by inspectable-element application use cases (design.md File
// Changes, "Where the settled policies live in code") when
// `findByIdInCommunity(communityId, elementId)` resolves to null — wrong
// community, unknown id, and soft-deleted are all indistinguishable
// (design.md Decision 5; ADR-010). Used by the update and soft-delete use
// cases (Phase 5). The presentation layer maps this to
// 404 { code: INSPECTABLE_ELEMENT_NOT_FOUND } (design.md Decision 7).
//
// Mirrors `maintenance-company/domain/errors/maintenance-company-not-found
// .error.ts` — same shape, same role in its own module.
export class InspectableElementNotFoundError extends Error {
  constructor() {
    super('Inspectable element not found');
    this.name = 'InspectableElementNotFoundError';
  }
}
