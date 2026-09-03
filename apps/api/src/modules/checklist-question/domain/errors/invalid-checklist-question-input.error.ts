// Thrown by CreateChecklistQuestionUseCase for a structurally invalid
// payload: a missing/blank required field, or an empty `frequencies` set
// (spec.md "Create Checklist Question" — "Empty frequencies set rejected",
// "Missing or blank required field rejected"). Defense-in-depth alongside
// the shared Zod schema (createChecklistQuestionSchema, packages/
// validation, task 3.7) that enforces the same rule at the HTTP boundary
// (design.md Decision 7 / ADR-015) — this guard protects any direct
// application-layer caller that bypasses the DTO pipe. The presentation
// layer (Phase 4) maps this to 400.
export class InvalidChecklistQuestionInputError extends Error {
  constructor() {
    super('Invalid checklist question input');
    this.name = 'InvalidChecklistQuestionInputError';
  }
}
