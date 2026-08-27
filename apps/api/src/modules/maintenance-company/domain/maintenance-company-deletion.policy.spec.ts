import { MaintenanceCompanyHasActiveUsersError } from './errors/maintenance-company-has-active-users.error';
import { assertNoActiveUsersAttached } from './maintenance-company-deletion.policy';

// design.md Decision 4: pure domain function, no ports, no I/O, no
// repository reference — mirrors `assertSystemAdminRemains`
// (last-admin.policy.ts) exactly. The use case owns the read
// (`countActiveByMaintenanceCompany`, `withDefaultFilter` excludes
// soft-deleted users for free); this function only enforces the invariant
// (spec.md "Refuse Delete While Active Users Attached").
describe('assertNoActiveUsersAttached', () => {
  it('passes when there are zero active users attached', () => {
    expect(() => assertNoActiveUsersAttached(0)).not.toThrow();
  });

  it('throws MaintenanceCompanyHasActiveUsersError when exactly one active user is attached', () => {
    expect(() => assertNoActiveUsersAttached(1)).toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );
  });

  it('throws MaintenanceCompanyHasActiveUsersError when several active users are attached', () => {
    expect(() => assertNoActiveUsersAttached(5)).toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );
  });

  it('carries the active user count on the thrown error (design.md Decision 4)', () => {
    try {
      assertNoActiveUsersAttached(3);
      throw new Error('expected assertNoActiveUsersAttached to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(MaintenanceCompanyHasActiveUsersError);
      expect(
        (error as MaintenanceCompanyHasActiveUsersError).activeUserCount,
      ).toBe(3);
    }
  });
});
