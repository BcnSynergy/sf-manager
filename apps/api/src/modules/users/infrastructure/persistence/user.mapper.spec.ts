import { User } from '../../domain/user.entity';
import { UserMapper } from './user.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — no ad hoc inline mapping in the repository.
describe('UserMapper', () => {
  describe('toDomain', () => {
    it('maps a Prisma User record to a domain User entity', () => {
      const record = {
        id: '01930000-0000-7000-8000-000000000001',
        email: 'admin@example.com',
        passwordHash: 'argon2id$hash',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      };

      const user = UserMapper.toDomain(record);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe(record.id);
      expect(user.email).toBe(record.email);
      expect(user.passwordHash).toBe(record.passwordHash);
      expect(user.createdAt).toBe(record.createdAt);
      expect(user.updatedAt).toBe(record.updatedAt);
      expect(user.deletedAt).toBeNull();
    });

    it('preserves a non-null deletedAt (ADR-010 soft-deleted row)', () => {
      const deletedAt = new Date('2026-03-01T00:00:00.000Z');
      const record = {
        id: '01930000-0000-7000-8000-000000000002',
        email: 'former-admin@example.com',
        passwordHash: 'argon2id$hash',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt,
      };

      const user = UserMapper.toDomain(record);

      expect(user.deletedAt).toBe(deletedAt);
    });
  });

  describe('toPersistence', () => {
    it('maps a domain User entity to a Prisma create/update payload, including id', () => {
      const user = new User({
        id: '01930000-0000-7000-8000-000000000001',
        email: 'admin@example.com',
        passwordHash: 'argon2id$hash',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      });

      const data = UserMapper.toPersistence(user);

      expect(data).toEqual({
        id: '01930000-0000-7000-8000-000000000001',
        email: 'admin@example.com',
        passwordHash: 'argon2id$hash',
        deletedAt: null,
      });
    });
  });
});
