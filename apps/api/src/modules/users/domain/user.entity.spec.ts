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
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    expect(user.id).toBe('01930000-0000-7000-8000-000000000001');
    expect(user.email).toBe('admin@example.com');
    expect(user.passwordHash).toBe('argon2id$hash');
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
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt,
    });

    expect(user.deletedAt).toBe(deletedAt);
    expect(user.isDeleted).toBe(true);
  });
});
