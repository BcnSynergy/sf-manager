import { CommunityTechnician } from '../../domain/community-technician.entity';
import { CommunityTechnicianMapper } from './community-technician.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and
// the hand-written domain entity — mirrors CommunityRepresentativeMapper.spec.ts.
describe('CommunityTechnicianMapper', () => {
  describe('toDomain', () => {
    it('maps an active Prisma CommunityTechnician record (deactivatedAt null) to a domain entity', () => {
      const record = {
        id: '01930000-0000-7000-8000-000000000030',
        communityId: '01930000-0000-7000-8000-000000000031',
        userId: '01930000-0000-7000-8000-000000000032',
        deactivatedAt: null,
      };

      const technician = CommunityTechnicianMapper.toDomain(record);

      expect(technician).toBeInstanceOf(CommunityTechnician);
      expect(technician.id).toBe(record.id);
      expect(technician.communityId).toBe(record.communityId);
      expect(technician.userId).toBe(record.userId);
      expect(technician.deactivatedAt).toBeNull();
      expect(technician.isActive).toBe(true);
    });

    it('preserves a non-null deactivatedAt (design.md Decision 3 — domain state, not deletedAt)', () => {
      const deactivatedAt = new Date('2026-05-01T00:00:00.000Z');
      const record = {
        id: '01930000-0000-7000-8000-000000000033',
        communityId: '01930000-0000-7000-8000-000000000031',
        userId: '01930000-0000-7000-8000-000000000034',
        deactivatedAt,
      };

      const technician = CommunityTechnicianMapper.toDomain(record);

      expect(technician.deactivatedAt).toBe(deactivatedAt);
      expect(technician.isActive).toBe(false);
    });
  });

  describe('toPersistence', () => {
    it('maps a domain CommunityTechnician entity to a Prisma create payload, including id', () => {
      const technician = new CommunityTechnician({
        id: '01930000-0000-7000-8000-000000000030',
        communityId: '01930000-0000-7000-8000-000000000031',
        userId: '01930000-0000-7000-8000-000000000032',
        deactivatedAt: null,
      });

      const data = CommunityTechnicianMapper.toPersistence(technician);

      expect(data).toEqual({
        id: '01930000-0000-7000-8000-000000000030',
        communityId: '01930000-0000-7000-8000-000000000031',
        userId: '01930000-0000-7000-8000-000000000032',
        deactivatedAt: null,
      });
    });
  });
});
