import { CommunityTechnician } from './community-technician.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// design.md: technician sibling of CommunityRepresentative — same shape,
// deliberately no exclusivity semantics (many active technicians per
// community, and the same technician active across many communities, is
// allowed).
describe('CommunityTechnician', () => {
  it('constructs an active assignment with the given identity', () => {
    const technician = new CommunityTechnician({
      id: '01930000-0000-7000-8000-000000000401',
      communityId: '01930000-0000-7000-8000-000000000101',
      userId: '01930000-0000-7000-8000-000000000501',
      deactivatedAt: null,
    });

    expect(technician.id).toBe('01930000-0000-7000-8000-000000000401');
    expect(technician.communityId).toBe('01930000-0000-7000-8000-000000000101');
    expect(technician.userId).toBe('01930000-0000-7000-8000-000000000501');
    expect(technician.isActive).toBe(true);
  });

  it('marks an assignment with a deactivatedAt timestamp as inactive', () => {
    const deactivatedAt = new Date('2026-05-01T00:00:00.000Z');

    const technician = new CommunityTechnician({
      id: '01930000-0000-7000-8000-000000000402',
      communityId: '01930000-0000-7000-8000-000000000102',
      userId: '01930000-0000-7000-8000-000000000502',
      deactivatedAt,
    });

    expect(technician.deactivatedAt).toBe(deactivatedAt);
    expect(technician.isActive).toBe(false);
  });
});
