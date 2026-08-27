// Thrown by MaintenanceCompanyLookup.existsActive() call sites (design.md
// Decision 4/5) — CreateUserUseCase and UpdateUserUseCase (resulting-state-
// scoped: checked whenever the RESULTING role/maintenanceCompanyId pair
// requires a live company, not only when the request payload itself
// supplies maintenanceCompanyId) — when a supplied `maintenanceCompanyId`
// does not resolve to an existing,
// non-soft-deleted MaintenanceCompany (spec.md "Nonexistent or soft-deleted
// company rejected"). Missing and soft-deleted are indistinguishable
// (ADR-010). The application layer maps this to 400
// { code: MAINTENANCE_COMPANY_NOT_FOUND } — NOT 404, because
// `PATCH /users/:id` already 404s for "user not found" and a second cause
// would make that status ambiguous (design.md Decision 5).
//
// NOT to be confused with `maintenance-company/domain/errors/
// maintenance-company-not-found.error.ts` (Phase 3): that sibling is thrown
// by the maintenance-company module's OWN update/soft-delete use cases when
// the addressed company id itself doesn't resolve, and maps to a plain 404.
// Different call site, different status, deliberately not shared (design.md
// Decision 4: `users` owns its own narrow contract).
export class MaintenanceCompanyNotFoundError extends Error {
  constructor() {
    super('Maintenance company not found');
    this.name = 'MaintenanceCompanyNotFoundError';
  }
}
