// Thrown by `OpenReviewSessionUseCase` (design.md Decision 7, Phase 4, task
// 4.4) when the named `templateId` does not currently resolve to an
// `active` frozen `ReviewTemplate` — unknown id, a `draft` template (spec.md
// "A draft template can never back a session") and a `retired` template are
// all indistinguishable causes of the same rejection. The presentation
// layer maps this to 404 { code: ACTIVE_TEMPLATE_NOT_FOUND }.
export class ActiveTemplateNotFoundError extends Error {
  constructor() {
    super('No active template found for the requested id');
    this.name = 'ActiveTemplateNotFoundError';
  }
}
