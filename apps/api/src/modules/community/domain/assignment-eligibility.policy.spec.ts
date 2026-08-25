import type { Role } from '../../users/domain/role';
import { assertEligibleFor } from './assignment-eligibility.policy';
import { IneligibleRoleError } from './errors/ineligible-role.error';

// design.md "Where the settled policies live in code": pure domain
// function, no ports — mirrors last-admin.policy.ts. Table-driven over
// roles × kind per tasks.md 2.4 (community-assignments spec.md, "Add
// Representative — Eligibility Gate" / "Add Technician — Eligibility Gate,
// No Exclusivity").
describe('assertEligibleFor', () => {
  const allRoles: Role[] = [
    'SYSTEM_ADMIN',
    'MANAGER',
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ];

  describe('REPRESENTATIVE', () => {
    it('passes when the role is exactly COMMUNITY_REPRESENTATIVE', () => {
      expect(() =>
        assertEligibleFor('COMMUNITY_REPRESENTATIVE', 'REPRESENTATIVE'),
      ).not.toThrow();
    });

    const ineligibleForRepresentative = allRoles.filter(
      (role) => role !== 'COMMUNITY_REPRESENTATIVE',
    );

    it.each(ineligibleForRepresentative)(
      'throws IneligibleRoleError when the role is %s',
      (role) => {
        expect(() => assertEligibleFor(role, 'REPRESENTATIVE')).toThrow(
          IneligibleRoleError,
        );
      },
    );
  });

  describe('TECHNICIAN', () => {
    it('passes when the role is exactly MAINTENANCE_TECHNICIAN', () => {
      expect(() =>
        assertEligibleFor('MAINTENANCE_TECHNICIAN', 'TECHNICIAN'),
      ).not.toThrow();
    });

    const ineligibleForTechnician = allRoles.filter(
      (role) => role !== 'MAINTENANCE_TECHNICIAN',
    );

    it.each(ineligibleForTechnician)(
      'throws IneligibleRoleError when the role is %s',
      (role) => {
        expect(() => assertEligibleFor(role, 'TECHNICIAN')).toThrow(
          IneligibleRoleError,
        );
      },
    );
  });

  it('produces a message naming both the actual role and the assignment kind', () => {
    try {
      assertEligibleFor('MANAGER', 'REPRESENTATIVE');
      throw new Error('expected assertEligibleFor to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IneligibleRoleError);
      expect((error as Error).message).toContain('MANAGER');
      expect((error as Error).message).toContain('representative');
    }
  });
});
