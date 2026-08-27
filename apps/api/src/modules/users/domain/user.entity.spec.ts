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
});
