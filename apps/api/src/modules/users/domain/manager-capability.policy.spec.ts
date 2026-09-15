import type { Role } from './role';
import { InvalidManagerCapabilityAssignmentError } from './errors/invalid-manager-capability-assignment.error';
import {
  assertCapabilitiesAllowedForRole,
  resolveManagerCapabilities,
} from './manager-capability.policy';

// review-history-manager-capability/design.md Decision 5: a pure domain
// module, no ports, no I/O — mirrors maintenance-company-assignment.policy's
// placement/testability, but with TWO functions: an assertion (the
// NOT_ALLOWED direction) and a resolution (the clear-on-role-change/
// reset-on-promotion direction).
describe('assertCapabilitiesAllowedForRole', () => {
  const NON_MANAGER_ROLES: Role[] = [
    'SYSTEM_ADMIN',
    'MAINTENANCE_COMPANY_MANAGER',
    'MAINTENANCE_TECHNICIAN',
    'COMMUNITY_REPRESENTATIVE',
  ];

  it.each(NON_MANAGER_ROLES)(
    'throws InvalidManagerCapabilityAssignmentError for %s with a non-empty capability list',
    (role) => {
      expect(() =>
        assertCapabilitiesAllowedForRole(role, ['VIEW_ALL_REVIEWS']),
      ).toThrow(InvalidManagerCapabilityAssignmentError);
    },
  );

  it.each(NON_MANAGER_ROLES)(
    'never throws for %s with an empty capability list',
    (role) => {
      expect(() => assertCapabilitiesAllowedForRole(role, [])).not.toThrow();
    },
  );

  it('never throws for MANAGER with a non-empty capability list', () => {
    expect(() =>
      assertCapabilitiesAllowedForRole('MANAGER', ['VIEW_ALL_REVIEWS']),
    ).not.toThrow();
  });

  it('never throws for MANAGER with an empty capability list', () => {
    expect(() => assertCapabilitiesAllowedForRole('MANAGER', [])).not.toThrow();
  });
});

// design.md Decision 5's four-plus-promotion-reset row table.
describe('resolveManagerCapabilities', () => {
  it('resulting MANAGER, prior MANAGER, requested supplied -> requested', () => {
    expect(
      resolveManagerCapabilities(
        'MANAGER',
        'MANAGER',
        ['VIEW_ALL_REVIEWS'],
        [],
      ),
    ).toEqual(['VIEW_ALL_REVIEWS']);
  });

  it('resulting MANAGER, prior MANAGER, requested undefined -> undefined (unchanged)', () => {
    expect(
      resolveManagerCapabilities('MANAGER', 'MANAGER', undefined, [
        'VIEW_ALL_REVIEWS',
      ]),
    ).toBeUndefined();
  });

  it('resulting MANAGER, prior NOT MANAGER (a promotion), requested supplied -> requested', () => {
    expect(
      resolveManagerCapabilities(
        'MANAGER',
        'SYSTEM_ADMIN',
        ['VIEW_ALL_REVIEWS'],
        [],
      ),
    ).toEqual(['VIEW_ALL_REVIEWS']);
  });

  it('resulting MANAGER, prior NOT MANAGER (a promotion), requested undefined -> [] (reset)', () => {
    expect(
      resolveManagerCapabilities('MANAGER', 'SYSTEM_ADMIN', undefined, [
        'VIEW_ALL_REVIEWS',
      ]),
    ).toEqual([]);
  });

  it('resulting NOT MANAGER, existing empty -> undefined (nothing to do)', () => {
    expect(
      resolveManagerCapabilities('SYSTEM_ADMIN', 'MANAGER', undefined, []),
    ).toBeUndefined();
  });

  it('resulting NOT MANAGER, existing set -> [] (the clear)', () => {
    expect(
      resolveManagerCapabilities('SYSTEM_ADMIN', 'MANAGER', undefined, [
        'VIEW_ALL_REVIEWS',
      ]),
    ).toEqual([]);
  });

  it('resulting NOT MANAGER, existing set, requested explicitly [] -> [] (explicit revoke honoured)', () => {
    expect(
      resolveManagerCapabilities(
        'SYSTEM_ADMIN',
        'MANAGER',
        [],
        ['VIEW_ALL_REVIEWS'],
      ),
    ).toEqual([]);
  });
});
