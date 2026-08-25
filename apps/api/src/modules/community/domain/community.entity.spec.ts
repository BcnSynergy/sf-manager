import { Community } from './community.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `Community` model (design.md File Changes) but
// this class never imports @prisma/client. `locale` is the hand-written
// closed-set type (ADR-007), not Prisma's `$Enums.Locale` (design.md
// Decision 5).
describe('Community', () => {
  it('constructs an active community with the given identity and fields', () => {
    const community = new Community({
      id: '01930000-0000-7000-8000-000000000101',
      name: 'Sunset Towers',
      address: '123 Sunset Blvd',
      locale: 'en',
      deletedAt: null,
    });

    expect(community.id).toBe('01930000-0000-7000-8000-000000000101');
    expect(community.name).toBe('Sunset Towers');
    expect(community.address).toBe('123 Sunset Blvd');
    expect(community.locale).toBe('en');
    expect(community.isDeleted).toBe(false);
  });

  it('marks a community with a deletedAt timestamp as deleted (ADR-010)', () => {
    const deletedAt = new Date('2026-03-01T00:00:00.000Z');

    const community = new Community({
      id: '01930000-0000-7000-8000-000000000102',
      name: 'Riverside Court',
      address: '456 Riverside Ave',
      locale: 'es',
      deletedAt,
    });

    expect(community.deletedAt).toBe(deletedAt);
    expect(community.isDeleted).toBe(true);
  });
});
