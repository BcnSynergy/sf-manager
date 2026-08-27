import { MaintenanceCompanyHasActiveUsersError } from './errors/maintenance-company-has-active-users.error';

// design.md Decision 3 (Interfaces)/Decision 4: pure domain function — no
// ports, no I/O, no repository reference. Mirrors
// `assertSystemAdminRemains` (users/domain/last-admin.policy.ts) exactly.
// The use case (SoftDeleteMaintenanceCompanyUseCase) owns the read via
// `countActiveByMaintenanceCompany`, which already excludes soft-deleted
// users through `withDefaultFilter` (ADR-010) — this function only enforces
// the invariant itself (spec.md "Refuse Delete While Active Users
// Attached").
export function assertNoActiveUsersAttached(activeUserCount: number): void {
  if (activeUserCount > 0) {
    throw new MaintenanceCompanyHasActiveUsersError(activeUserCount);
  }
}
