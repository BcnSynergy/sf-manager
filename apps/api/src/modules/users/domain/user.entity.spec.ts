import { ManagerCapability } from './manager-capability';
import { User } from './user.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `User` model (design.md Interfaces/Contracts)
// but this class never imports @prisma/client.
describe('User', () => {
  it('constructs an active user with the given identity and timestamps', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');

    const user = new User({
      id: '01930000-0000-7000-8000-000000000001',
      email: 'admin@example.com',
      passwordHash: 'argon2id$hash',
      role: 'SYSTEM_ADMIN',
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    expect(user.id).toBe('01930000-0000-7000-8000-000000000001');
    expect(user.email).toBe('admin@example.com');
    expect(user.passwordHash).toBe('argon2id$hash');
    expect(user.role).toBe('SYSTEM_ADMIN');
    expect(user.createdAt).toBe(createdAt);
    expect(user.updatedAt).toBe(updatedAt);
    expect(user.isDeleted).toBe(false);
  });

  it('marks a user with a deletedAt timestamp as deleted (ADR-010)', () => {
    const deletedAt = new Date('2026-03-01T00:00:00.000Z');

    const user = new User({
      id: '01930000-0000-7000-8000-000000000002',
      email: 'former-admin@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MANAGER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt,
    });

    expect(user.deletedAt).toBe(deletedAt);
    expect(user.isDeleted).toBe(true);
  });

  // design.md Decision 5: the constructor performs NO validation of
  // maintenanceCompanyId against role — UserMapper.toDomain reconstitutes
  // every row read from the database, including grandfathered
  // maintenance-role users with a null company (spec.md "Grandfathered
  // Maintenance-Role Users"); throwing here would turn GET /users into a
  // 500 for those rows. This is a plain field, not a validated one.
  it('carries a maintenanceCompanyId when supplied, with no role-based validation', () => {
    const user = new User({
      id: '01930000-0000-7000-8000-000000000003',
      email: 'technician@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MAINTENANCE_TECHNICIAN',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      maintenanceCompanyId: '01930000-0000-7000-8000-00000000abcd',
    });

    expect(user.maintenanceCompanyId).toBe(
      '01930000-0000-7000-8000-00000000abcd',
    );
  });

  // Every existing caller across the codebase (use cases, seed.ts, fixtures)
  // constructs User without maintenanceCompanyId — it defaults to null
  // rather than becoming a required constructor argument everywhere, which
  // would inflate this PR into Phase 6's use-case wiring.
  it('defaults maintenanceCompanyId to null when omitted (e.g. a non-maintenance-role user)', () => {
    const user = new User({
      id: '01930000-0000-7000-8000-000000000004',
      email: 'admin2@example.com',
      passwordHash: 'argon2id$hash',
      role: 'SYSTEM_ADMIN',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    });

    expect(user.maintenanceCompanyId).toBeNull();
  });

  it('does NOT throw for a maintenance role with a null maintenanceCompanyId (grandfathered row, spec.md)', () => {
    expect(
      () =>
        new User({
          id: '01930000-0000-7000-8000-000000000005',
          email: 'grandfathered@example.com',
          passwordHash: 'argon2id$hash',
          role: 'MAINTENANCE_COMPANY_MANAGER',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          maintenanceCompanyId: null,
        }),
    ).not.toThrow();
  });

  // review-history-manager-capability/design.md Decision 1: optional prop,
  // field defaults to `[]` — mirrors maintenanceCompanyId's shipped
  // precedent so no existing `new User({…})` call site (seed, fixtures, use
  // cases) breaks.
  it('defaults managerCapabilities to an empty array when omitted', () => {
    const user = new User({
      id: '01930000-0000-7000-8000-000000000006',
      email: 'admin3@example.com',
      passwordHash: 'argon2id$hash',
      role: 'SYSTEM_ADMIN',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    });

    expect(user.managerCapabilities).toEqual([]);
  });

  // No constructor validation against role, same reasoning as
  // maintenanceCompanyId — UserMapper.toDomain reconstitutes every row,
  // including a capability left on a non-MANAGER row (policy-enforced only
  // on the write path, design.md Decision 5).
  it('carries a supplied managerCapabilities array with no role-based validation', () => {
    const user = new User({
      id: '01930000-0000-7000-8000-000000000007',
      email: 'manager@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MANAGER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });

    expect(user.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);
  });

  // PR 1/4 review fix: `readonly managerCapabilities` only blocks REBINDING
  // the property, not mutating the array in place, and the constructor was
  // storing the caller's array by reference. PR 2's capability checker will
  // read this array for an authorization decision, so a caller mutating its
  // own input array after construction must NOT be able to change what the
  // entity reports.
  it('is not affected by a mutation of the array passed into the constructor', () => {
    const input: ManagerCapability[] = ['VIEW_ALL_REVIEWS'];
    const user = new User({
      id: '01930000-0000-7000-8000-000000000008',
      email: 'manager2@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MANAGER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      managerCapabilities: input,
    });

    input.push('VIEW_ALL_REVIEWS');
    input.length = 0;

    expect(user.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);
  });

  // PR 1/4 review fix (round 2): the first fix pass made the constructor
  // defensively copy `managerCapabilities` (the test above), but left the
  // field's TYPE as a plain `ManagerCapability[]` — `readonly` on the
  // property alone only blocks REBINDING it, not mutating the array in
  // place, so `user.managerCapabilities.push(...)` still compiled clean and
  // could mutate the entity's internal state (which matters because PR 2's
  // capability checker reads this array for an authorization decision).
  // user.entity.ts now types the field `readonly ManagerCapability[]`,
  // making `.push()` a COMPILE-TIME error. `@ts-expect-error` proves that:
  // this test fails loudly (the expected error stops being reported) if
  // anyone ever loosens the type back to a mutable array.
  it('does not allow mutating the returned managerCapabilities array (compile-time guard)', () => {
    const user = new User({
      id: '01930000-0000-7000-8000-000000000009',
      email: 'manager3@example.com',
      passwordHash: 'argon2id$hash',
      role: 'MANAGER',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });

    // Wrapped in a function that is declared but deliberately NEVER CALLED:
    // `readonly` is a TypeScript-only guard, not a runtime Object.freeze —
    // the real JS array underneath still has a `.push` method, so actually
    // invoking it would silently mutate the entity's internal state and
    // defeat the point of this test. TypeScript still type-checks the
    // function BODY at compile time regardless of whether it is ever
    // called, so the `@ts-expect-error` below still does its job.
    const attemptToMutateManagerCapabilities = (): void => {
      // @ts-expect-error managerCapabilities is `readonly
      // ManagerCapability[]` — `.push` must not type-check. If this stops
      // being a type error, the field's compile-time mutability guard has
      // regressed.
      // (`.push` is expected to be typed `any` here BECAUSE of the
      // `@ts-expect-error` above; that IS the guard this test pins, not an
      // accidental unsafe call.)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      user.managerCapabilities.push('VIEW_ALL_REVIEWS');
    };

    expect(typeof attemptToMutateManagerCapabilities).toBe('function');
    expect(user.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);
  });
});
