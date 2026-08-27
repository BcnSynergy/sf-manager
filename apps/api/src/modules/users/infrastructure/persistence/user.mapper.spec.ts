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
        role: 'SYSTEM_ADMIN' as const,
        maintenanceCompanyId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      };

      const user = UserMapper.toDomain(record);

      expect(user).toBeInstanceOf(User);
      expect(user.id).toBe(record.id);
      expect(user.email).toBe(record.email);
      expect(user.passwordHash).toBe(record.passwordHash);
      expect(user.role).toBe('SYSTEM_ADMIN');
      expect(user.createdAt).toBe(record.createdAt);
      expect(user.updatedAt).toBe(record.updatedAt);
      expect(user.deletedAt).toBeNull();
      expect(user.maintenanceCompanyId).toBeNull();
    });

    // maintenance-company design.md File Changes: the mapper must carry the
    // new column through — a grandfathered row (spec.md "Grandfathered
    // Maintenance-Role Users") has this null; a maintenance-role row has it
    // set.
    it('maps a non-null maintenanceCompanyId column through to the domain entity', () => {
      const record = {
        id: '01930000-0000-7000-8000-000000000006',
        email: 'technician@example.com',
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN' as const,
        maintenanceCompanyId: '01930000-0000-7000-8000-00000000abcd',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      };

      const user = UserMapper.toDomain(record);

      expect(user.maintenanceCompanyId).toBe(
        '01930000-0000-7000-8000-00000000abcd',
      );
    });

    it('preserves a non-null deletedAt (ADR-010 soft-deleted row)', () => {
      const deletedAt = new Date('2026-03-01T00:00:00.000Z');
      const record = {
        id: '01930000-0000-7000-8000-000000000002',
        email: 'former-admin@example.com',
        passwordHash: 'argon2id$hash',
        role: 'MANAGER' as const,
        maintenanceCompanyId: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt,
      };

      const user = UserMapper.toDomain(record);

      expect(user.deletedAt).toBe(deletedAt);
    });
  });

  describe('toPersistence', () => {
    it('maps a domain User entity to a Prisma create/update payload, including id and role', () => {
      const user = new User({
        id: '01930000-0000-7000-8000-000000000001',
        email: 'admin@example.com',
        passwordHash: 'argon2id$hash',
        role: 'SYSTEM_ADMIN',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
      });

      const data = UserMapper.toPersistence(user);

      expect(data).toEqual({
        id: '01930000-0000-7000-8000-000000000001',
        email: 'admin@example.com',
        passwordHash: 'argon2id$hash',
        role: 'SYSTEM_ADMIN',
        deletedAt: null,
        maintenanceCompanyId: null,
      });
    });

    it('maps a non-null maintenanceCompanyId through to the Prisma payload', () => {
      const user = new User({
        id: '01930000-0000-7000-8000-000000000007',
        email: 'technician2@example.com',
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        deletedAt: null,
        maintenanceCompanyId: '01930000-0000-7000-8000-00000000abcd',
      });

      const data = UserMapper.toPersistence(user);

      expect(data.maintenanceCompanyId).toBe(
        '01930000-0000-7000-8000-00000000abcd',
      );
    });
  });
});
