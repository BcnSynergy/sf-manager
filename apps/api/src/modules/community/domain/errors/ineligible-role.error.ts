import type { Role } from '../../../users/domain/role';

// Thrown by assertEligibleFor() (design.md "Where the settled policies live
// in code") when a user's global role does not match the role required for
// the given assignment kind (community-assignments spec.md, "Add
// Representative — Eligibility Gate" / "Add Technician — Eligibility Gate,
// No Exclusivity"). The application layer maps this to 409 (well-formed
// request, conflicting target state — same class as `LastSystemAdminError`).
export class IneligibleRoleError extends Error {
  constructor(kind: 'REPRESENTATIVE' | 'TECHNICIAN', actualRole: Role) {
    super(
      `User with role "${actualRole}" is not eligible for ${kind.toLowerCase()} assignment`,
    );
    this.name = 'IneligibleRoleError';
  }
}
