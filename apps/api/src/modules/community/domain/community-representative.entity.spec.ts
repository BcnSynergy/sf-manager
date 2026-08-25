import { CommunityRepresentative } from './community-representative.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// design.md Decision 3: `deactivatedAt`, not `deletedAt` — this is domain
// state ("stopped serving"), not an administrative delete, so it must not
// hide behind `SoftDeletableRepository`'s default filter. Reactivation is
// `deactivatedAt = null`; no assignment history is kept.
describe('CommunityRepresentative', () => {
  it('constructs an active assignment with the given identity', () => {
    const representative = new CommunityRepresentative({
      id: '01930000-0000-7000-8000-000000000201',
      communityId: '01930000-0000-7000-8000-000000000101',
      userId: '01930000-0000-7000-8000-000000000301',
      deactivatedAt: null,
    });

    expect(representative.id).toBe('01930000-0000-7000-8000-000000000201');
    expect(representative.communityId).toBe(
      '01930000-0000-7000-8000-000000000101',
    );
    expect(representative.userId).toBe('01930000-0000-7000-8000-000000000301');
    expect(representative.isActive).toBe(true);
  });

  it('marks an assignment with a deactivatedAt timestamp as inactive', () => {
    const deactivatedAt = new Date('2026-04-01T00:00:00.000Z');

    const representative = new CommunityRepresentative({
      id: '01930000-0000-7000-8000-000000000202',
      communityId: '01930000-0000-7000-8000-000000000102',
      userId: '01930000-0000-7000-8000-000000000302',
      deactivatedAt,
    });

    expect(representative.deactivatedAt).toBe(deactivatedAt);
    expect(representative.isActive).toBe(false);
  });
});
