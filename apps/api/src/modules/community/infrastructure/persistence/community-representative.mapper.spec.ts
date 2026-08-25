import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { CommunityRepresentativeMapper } from './community-representative.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper.spec.ts / UserMapper.spec.ts.
// tasks.md 8.1 (pulled forward into PR 7 to fix the DI-bootstrap defect).
describe('CommunityRepresentativeMapper', () => {
  describe('toDomain', () => {
    it('maps an active Prisma CommunityRepresentative record (deactivatedAt null) to a domain entity', () => {
      const record = {
        id: '01930000-0000-7000-8000-000000000020',
        communityId: '01930000-0000-7000-8000-000000000021',
        userId: '01930000-0000-7000-8000-000000000022',
        deactivatedAt: null,
      };

      const representative = CommunityRepresentativeMapper.toDomain(record);

      expect(representative).toBeInstanceOf(CommunityRepresentative);
      expect(representative.id).toBe(record.id);
      expect(representative.communityId).toBe(record.communityId);
      expect(representative.userId).toBe(record.userId);
      expect(representative.deactivatedAt).toBeNull();
      expect(representative.isActive).toBe(true);
    });

    it('preserves a non-null deactivatedAt (design.md Decision 3 — domain state, not deletedAt)', () => {
      const deactivatedAt = new Date('2026-05-01T00:00:00.000Z');
      const record = {
        id: '01930000-0000-7000-8000-000000000023',
        communityId: '01930000-0000-7000-8000-000000000021',
        userId: '01930000-0000-7000-8000-000000000024',
        deactivatedAt,
      };

      const representative = CommunityRepresentativeMapper.toDomain(record);

      expect(representative.deactivatedAt).toBe(deactivatedAt);
      expect(representative.isActive).toBe(false);
    });
  });

  describe('toPersistence', () => {
    it('maps a domain CommunityRepresentative entity to a Prisma create payload, including id', () => {
      const representative = new CommunityRepresentative({
        id: '01930000-0000-7000-8000-000000000020',
        communityId: '01930000-0000-7000-8000-000000000021',
        userId: '01930000-0000-7000-8000-000000000022',
        deactivatedAt: null,
      });

      const data = CommunityRepresentativeMapper.toPersistence(representative);

      expect(data).toEqual({
        id: '01930000-0000-7000-8000-000000000020',
        communityId: '01930000-0000-7000-8000-000000000021',
        userId: '01930000-0000-7000-8000-000000000022',
        deactivatedAt: null,
      });
    });
  });
});
