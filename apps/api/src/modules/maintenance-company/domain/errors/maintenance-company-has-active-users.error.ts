// Thrown by assertNoActiveUsersAttached() (design.md Decision 4) when a
// soft-delete attempt targets a company with at least one non-soft-deleted
// user still pointing at it (spec.md "Refuse Delete While Active Users
// Attached"). The count is carried on the error so the 409 message — and,
// upstream, the API response — can say *how many* users must be reassigned
// or removed first, which is the actionable half of the success criterion.
// The application layer maps this to 409 { code:
// MAINTENANCE_COMPANY_HAS_ACTIVE_USERS }.
export class MaintenanceCompanyHasActiveUsersError extends Error {
  readonly activeUserCount: number;

  constructor(activeUserCount: number) {
    super(
      `Maintenance company has ${activeUserCount} active user(s) attached and cannot be deleted`,
    );
    this.name = 'MaintenanceCompanyHasActiveUsersError';
    this.activeUserCount = activeUserCount;
  }
}
