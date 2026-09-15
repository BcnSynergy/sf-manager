import type { Role } from '../role';

// Thrown by assertCapabilitiesAllowedForRole()
// (review-history-manager-capability/design.md Decision 5) at the write
// path (UpdateUserUseCase) when a request would leave a non-MANAGER user
// holding a non-empty `managerCapabilities` array. Unlike
// InvalidMaintenanceCompanyAssignmentError, there is only ONE violation
// shape here (NOT_ALLOWED) — capabilities are never REQUIRED for a role,
// so no `reason` discriminator is needed.
export class InvalidManagerCapabilityAssignmentError extends Error {
  constructor(role: Role) {
    super(
      `Role "${role}" does not accept managerCapabilities, but a non-empty array was supplied`,
    );
    this.name = 'InvalidManagerCapabilityAssignmentError';
  }
}
