// Thrown by maintenance-company application use cases (design.md File
// Changes) when a given id does not resolve to an existing (and, per
// MaintenanceCompanyRepository.findById's default deletedAt: null filter,
// active) company — missing or already soft-deleted are indistinguishable
// (ADR-010). Used by the update and soft-delete use cases (spec.md "Update
// targets a non-existent company"). The application layer maps this to 404.
//
// NOT to be confused with `users/domain/errors/maintenance-company-not-found
// .error.ts` (design.md Decision 5, Routes table): that sibling is thrown by
// `MaintenanceCompanyLookup.existsActive` on the `users` side of the
// boundary and maps to 400 { code: MAINTENANCE_COMPANY_NOT_FOUND } — a
// different call site, a different status, and deliberately not shared
// (design.md Decision 4: `users` owns its own narrow contract).
export class MaintenanceCompanyNotFoundError extends Error {
  constructor() {
    super('Maintenance company not found');
    this.name = 'MaintenanceCompanyNotFoundError';
  }
}
