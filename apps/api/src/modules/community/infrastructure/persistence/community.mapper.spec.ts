import { Community } from '../../domain/community.entity';
import { CommunityMapper } from './community.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors UserMapper.spec.ts.
describe('CommunityMapper', () => {
  describe('toDomain', () => {
    it('maps a Prisma Community record to a domain Community entity', () => {
      const record = {
        id: '01930000-0000-7000-8000-000000000010',
        name: 'Carrer Major 12',
        address: 'Carrer Major 12, Girona',
        locale: 'ca' as const,
        deletedAt: null,
      };

      const community = CommunityMapper.toDomain(record);

      expect(community).toBeInstanceOf(Community);
      expect(community.id).toBe(record.id);
      expect(community.name).toBe(record.name);
      expect(community.address).toBe(record.address);
      expect(community.locale).toBe('ca');
      expect(community.deletedAt).toBeNull();
    });

    it('preserves a non-null deletedAt (ADR-010 soft-deleted row)', () => {
      const deletedAt = new Date('2026-04-01T00:00:00.000Z');
      const record = {
        id: '01930000-0000-7000-8000-000000000011',
        name: 'Avinguda Diagonal 200',
        address: 'Avinguda Diagonal 200, Barcelona',
        locale: 'es' as const,
        deletedAt,
      };

      const community = CommunityMapper.toDomain(record);

      expect(community.deletedAt).toBe(deletedAt);
    });
  });

  describe('toPersistence', () => {
    it('maps a domain Community entity to a Prisma create payload, including id', () => {
      const community = new Community({
        id: '01930000-0000-7000-8000-000000000010',
        name: 'Carrer Major 12',
        address: 'Carrer Major 12, Girona',
        locale: 'ca',
        deletedAt: null,
      });

      const data = CommunityMapper.toPersistence(community);

      expect(data).toEqual({
        id: '01930000-0000-7000-8000-000000000010',
        name: 'Carrer Major 12',
        address: 'Carrer Major 12, Girona',
        locale: 'ca',
        deletedAt: null,
      });
    });
  });
});
