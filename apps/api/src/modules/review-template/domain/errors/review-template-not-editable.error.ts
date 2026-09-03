// Thrown by ReviewTemplate.assertEditable()/assertActivatable() (design.md
// Decision 7) whenever the template's status is not `draft` — covers EVERY
// mutation attempt on a frozen (`active` or `retired`) template: replacing
// or reordering its question selection, renaming it, soft-deleting it, and
// re-activating it (spec.md "Frozen Templates Are Immutable": "retired is
// terminal... MUST NOT return to active by any path"). The presentation
// layer maps this to 409 { code: REVIEW_TEMPLATE_NOT_EDITABLE } (design.md
// Decision 8).
export class ReviewTemplateNotEditableError extends Error {
  constructor() {
    super('Review template is not editable');
    this.name = 'ReviewTemplateNotEditableError';
  }
}
