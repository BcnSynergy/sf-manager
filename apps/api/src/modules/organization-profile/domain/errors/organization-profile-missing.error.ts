// Thrown only by the infrastructure adapter (Phase 3) when the sentinel row
// is not found (design.md Decision 1). This is an ENVIRONMENT DEFECT — a
// skipped migration — not a runtime condition: the row's existence is a
// deployment guarantee (spec.md "The Profile Row Exists Before Any
// Request"), so there is no application-layer branch that catches this.
//
// Deliberately NEVER mapped to an HTTP status by the controller (design.md
// Decision 1, Decision 4): Nest's default exception filter turns this into
// an unhandled 500, loudly, which is the point — `GET /organization-profile`
// must never 404 (spec.md "Read the Organization Profile"), and a missing
// row must be impossible to observe as anything other than a crash.
export class OrganizationProfileMissingError extends Error {
  constructor() {
    super('Organization profile row is missing');
    this.name = 'OrganizationProfileMissingError';
  }
}
