// Thrown when creating a draft for an (elementType, frequency) lineage that
// already has a draft (spec.md "Second draft for the same lineage
// rejected": "at most one draft MUST exist per lineage at any time").
// Backed by the partial unique index
// `ReviewTemplate_one_draft_per_lineage` (design.md Decision 3) as the
// by-construction backstop; this error is the application-layer guard's own
// rejection. The presentation layer maps this to 409
// { code: REVIEW_TEMPLATE_DRAFT_EXISTS } (design.md Decision 8).
export class ReviewTemplateDraftExistsError extends Error {
  constructor() {
    super('A draft already exists for this element type and frequency');
    this.name = 'ReviewTemplateDraftExistsError';
  }
}
