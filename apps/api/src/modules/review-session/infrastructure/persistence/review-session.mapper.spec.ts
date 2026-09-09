import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionMapper } from './review-session.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper.spec.ts.
//
// review-history-company-scope/design.md Decision 1: performedByCompanyId
// must round-trip in BOTH directions — the snapshot is meaningless if the
// mapper drops it on read or forgets it on write.
describe('ReviewSessionMapper', () => {
  const baseRecord = {
    id: '01930000-0000-7000-8000-000000000701',
    communityId: '01930000-0000-7000-8000-000000000101',
    templateId: '01930000-0000-7000-8000-000000000501',
    performedById: '01930000-0000-7000-8000-000000000001',
    status: 'draft' as const,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    performedByCompanyId: null as string | null,
  };

  describe('toDomain', () => {
    it('maps a record whose performer had a company at creation', () => {
      const session = ReviewSessionMapper.toDomain({
        ...baseRecord,
        performedByCompanyId: '01930000-0000-7000-8000-000000000901',
      });

      expect(session.performedByCompanyId).toBe(
        '01930000-0000-7000-8000-000000000901',
      );
    });

    it('maps a record whose performer had no company at creation', () => {
      const session = ReviewSessionMapper.toDomain({
        ...baseRecord,
        performedByCompanyId: null,
      });

      expect(session.performedByCompanyId).toBeNull();
    });
  });

  describe('toPersistence', () => {
    it('includes the attributed company id in the create payload', () => {
      const session = new ReviewSession({
        id: baseRecord.id,
        communityId: baseRecord.communityId,
        templateId: baseRecord.templateId,
        performedById: baseRecord.performedById,
        status: 'draft',
        startedAt: baseRecord.startedAt,
        completedAt: null,
        performedByCompanyId: '01930000-0000-7000-8000-000000000901',
      });

      const data = ReviewSessionMapper.toPersistence(session);

      expect(data.performedByCompanyId).toBe(
        '01930000-0000-7000-8000-000000000901',
      );
    });

    it('includes a null attribution when the performer had no company', () => {
      const session = new ReviewSession({
        id: baseRecord.id,
        communityId: baseRecord.communityId,
        templateId: baseRecord.templateId,
        performedById: baseRecord.performedById,
        status: 'draft',
        startedAt: baseRecord.startedAt,
        completedAt: null,
        performedByCompanyId: null,
      });

      const data = ReviewSessionMapper.toPersistence(session);

      expect(data.performedByCompanyId).toBeNull();
    });
  });
});
