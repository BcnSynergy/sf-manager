import { User } from '../../modules/users/domain/user.entity';
import type { DevUser } from './dev-dataset';
import { describeUserDrift, findByNaturalKey } from './dev-seed-plan';

describe('findByNaturalKey', () => {
  const rows = [
    { id: 'a', key: 'B1' },
    { id: 'b', key: 'B2' },
  ];

  it('returns the row whose key equals the wanted one', () => {
    expect(findByNaturalKey(rows, (r) => r.key, 'B2')).toEqual({
      id: 'b',
      key: 'B2',
    });
  });

  it('returns undefined when no row matches', () => {
    expect(findByNaturalKey(rows, (r) => r.key, 'B3')).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(
      findByNaturalKey([], (r: { key: string }) => r.key, 'B1'),
    ).toBeUndefined();
  });
});

describe('describeUserDrift', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const desired: DevUser = {
    email: 'technician@sf-manager.example',
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: 'B99000001',
  };

  function userWith(
    role: User['role'],
    maintenanceCompanyId: string | null,
  ): User {
    return new User({
      id: 'u1',
      email: desired.email,
      passwordHash: 'hash',
      role,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      maintenanceCompanyId,
    });
  }

  it('returns null when role and company match', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', 'c1'),
        desired,
        'c1',
      ),
    ).toBeNull();
  });

  it('describes a different role', () => {
    expect(describeUserDrift(userWith('MANAGER', 'c1'), desired, 'c1')).toBe(
      'role is MANAGER, expected MAINTENANCE_TECHNICIAN',
    );
  });

  it('describes a different company', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', 'c9'),
        desired,
        'c1',
      ),
    ).toBe('company is c9, expected c1');
  });

  it('describes a missing company (the legacy dev technician has none)', () => {
    expect(
      describeUserDrift(
        userWith('MAINTENANCE_TECHNICIAN', null),
        desired,
        'c1',
      ),
    ).toBe('company is none, expected c1');
  });

  it('describes both differences together', () => {
    expect(describeUserDrift(userWith('MANAGER', null), desired, 'c1')).toBe(
      'role is MANAGER, expected MAINTENANCE_TECHNICIAN; company is none, expected c1',
    );
  });

  it('expects no company for a role without one', () => {
    const rep: DevUser = {
      email: desired.email,
      role: 'COMMUNITY_REPRESENTATIVE',
    };

    expect(
      describeUserDrift(userWith('COMMUNITY_REPRESENTATIVE', null), rep, null),
    ).toBeNull();
    expect(
      describeUserDrift(userWith('COMMUNITY_REPRESENTATIVE', 'c1'), rep, null),
    ).toBe('company is c1, expected none');
  });
});
