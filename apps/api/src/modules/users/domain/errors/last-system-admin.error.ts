// Thrown by assertSystemAdminRemains() (design.md Decision 3) when an
// operation — deactivation or a role change away from SYSTEM_ADMIN — would
// leave zero active SYSTEM_ADMIN users (spec.md "Last-Admin Lockout"). The
// application layer maps this to a 4xx error and rolls back the transaction.
export class LastSystemAdminError extends Error {
  constructor() {
    super('At least one active SYSTEM_ADMIN user must remain');
    this.name = 'LastSystemAdminError';
  }
}
