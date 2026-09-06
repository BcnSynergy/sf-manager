import { InspectableElement } from './inspectable-element.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `InspectableElement` model (design.md File
// Changes). name/location/description/serialNumber stay plain fields — no
// Value Objects (design.md Decision 2): none carries behaviour beyond
// validation, and validation itself lives in the shared Zod schema
// (packages/validation, Phase 5) — mirroring MaintenanceCompany/Community/
// User exactly. This constructor performs no validation of its own.
describe('InspectableElement', () => {
  it('constructs an active inspectable element with the given identity and fields', () => {
    const installedAt = new Date('2026-03-15T00:00:00.000Z');

    const element = new InspectableElement({
      id: '01930000-0000-7000-8000-000000000301',
      communityId: '01930000-0000-7000-8000-000000000101',
      elementType: 'EXTINGUISHER',
      name: 'Corridor Extinguisher A',
      description: 'Near the main stairwell',
      location: 'Ground floor corridor',
      installedAt,
      serialNumber: 'SN-12345',
      deletedAt: null,
      code: 'ABCDEFGHJK',
      deactivatedAt: null,
    });

    expect(element.id).toBe('01930000-0000-7000-8000-000000000301');
    expect(element.communityId).toBe('01930000-0000-7000-8000-000000000101');
    expect(element.elementType).toBe('EXTINGUISHER');
    expect(element.name).toBe('Corridor Extinguisher A');
    expect(element.description).toBe('Near the main stairwell');
    expect(element.location).toBe('Ground floor corridor');
    expect(element.installedAt).toBe(installedAt);
    expect(element.serialNumber).toBe('SN-12345');
    expect(element.isDeleted).toBe(false);
    expect(element.code).toBe('ABCDEFGHJK');
    expect(element.isDeactivated).toBe(false);
  });

  it('holds null description and serialNumber verbatim when the optional fields are absent', () => {
    const element = new InspectableElement({
      id: '01930000-0000-7000-8000-000000000302',
      communityId: '01930000-0000-7000-8000-000000000101',
      elementType: 'EXTINGUISHER',
      name: 'Rooftop Extinguisher',
      description: null,
      location: 'Rooftop access door',
      installedAt: new Date('2026-01-10T00:00:00.000Z'),
      serialNumber: null,
      deletedAt: null,
      code: 'BCDEFGHJKM',
      deactivatedAt: null,
    });

    expect(element.description).toBeNull();
    expect(element.serialNumber).toBeNull();
  });

  it('marks an inspectable element with a deletedAt timestamp as deleted (ADR-010)', () => {
    const deletedAt = new Date('2026-04-01T00:00:00.000Z');

    const element = new InspectableElement({
      id: '01930000-0000-7000-8000-000000000303',
      communityId: '01930000-0000-7000-8000-000000000101',
      elementType: 'EXTINGUISHER',
      name: 'Basement Extinguisher',
      description: null,
      location: 'Basement parking',
      installedAt: new Date('2025-11-20T00:00:00.000Z'),
      serialNumber: null,
      deletedAt,
      code: 'CDEFGHJKMN',
      deactivatedAt: null,
    });

    expect(element.deletedAt).toBe(deletedAt);
    expect(element.isDeleted).toBe(true);
  });

  // review-session/design.md Decision 3 + inspectable-element-management
  // spec.md "Decommissioned and deleted are distinct states": deactivatedAt
  // is orthogonal to deletedAt — NULL = active, a timestamp = decommissioned.
  it('marks an inspectable element with a deactivatedAt timestamp as deactivated, independent of deletedAt', () => {
    const deactivatedAt = new Date('2026-05-01T00:00:00.000Z');

    const element = new InspectableElement({
      id: '01930000-0000-7000-8000-000000000304',
      communityId: '01930000-0000-7000-8000-000000000101',
      elementType: 'EXTINGUISHER',
      name: 'Decommissioned Extinguisher',
      description: null,
      location: 'Rooftop',
      installedAt: new Date('2025-12-01T00:00:00.000Z'),
      serialNumber: null,
      deletedAt: null,
      code: 'DEFGHJKMNP',
      deactivatedAt,
    });

    expect(element.deactivatedAt).toBe(deactivatedAt);
    expect(element.isDeactivated).toBe(true);
    expect(element.isDeleted).toBe(false);
  });
});
