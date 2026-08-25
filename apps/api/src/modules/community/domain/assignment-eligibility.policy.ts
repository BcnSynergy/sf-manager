import type { Role } from '../../users/domain/role';
import { IneligibleRoleError } from './errors/ineligible-role.error';

export type AssignmentKind = 'REPRESENTATIVE' | 'TECHNICIAN';

// design.md Decision 4/Interfaces: the role required to hold each
// assignment kind. Single source of truth for the eligibility gate below.
const REQUIRED_ROLE: Record<AssignmentKind, Role> = {
  REPRESENTATIVE: 'COMMUNITY_REPRESENTATIVE',
  TECHNICIAN: 'MAINTENANCE_TECHNICIAN',
};

// design.md "Where the settled policies live in code": pure domain
// function, no ports — mirrors last-admin.policy.ts. Called by all four
// add/reactivate use cases after UserRepository.findById(userId) (via the
// already-exported USER_REPOSITORY). Throws IneligibleRoleError → 409
// (well-formed request, conflicting target state — same class as
// LastSystemAdminError).
export function assertEligibleFor(role: Role, kind: AssignmentKind): void {
  if (role !== REQUIRED_ROLE[kind]) {
    throw new IneligibleRoleError(kind, role);
  }
}
