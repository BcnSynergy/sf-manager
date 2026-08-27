import { MaintenanceCompany } from './maintenance-company.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `MaintenanceCompany` model (design.md File
// Changes). name/taxId/contactInfo stay plain fields — no Value Objects
// (design.md Decision 3): none of the three carries behaviour beyond
// validation, and validation itself lives in the shared Zod schema
// (packages/validation) plus the DB partial unique index for taxId
// uniqueness, not in this constructor — mirroring Community/User exactly.
describe('MaintenanceCompany', () => {
  it('constructs an active maintenance company with the given identity and fields', () => {
    const company = new MaintenanceCompany({
      id: '01930000-0000-7000-8000-000000000201',
      name: 'Acme Maintenance SL',
      taxId: 'B12345678',
      contactInfo: 'contact@acme-maintenance.example',
      deletedAt: null,
    });

    expect(company.id).toBe('01930000-0000-7000-8000-000000000201');
    expect(company.name).toBe('Acme Maintenance SL');
    expect(company.taxId).toBe('B12345678');
    expect(company.contactInfo).toBe('contact@acme-maintenance.example');
    expect(company.isDeleted).toBe(false);
  });

  it('marks a maintenance company with a deletedAt timestamp as deleted (ADR-010)', () => {
    const deletedAt = new Date('2026-03-01T00:00:00.000Z');

    const company = new MaintenanceCompany({
      id: '01930000-0000-7000-8000-000000000202',
      name: 'Beta Repairs Coop',
      taxId: 'B87654321',
      contactInfo: 'ops@beta-repairs.example',
      deletedAt,
    });

    expect(company.deletedAt).toBe(deletedAt);
    expect(company.isDeleted).toBe(true);
  });
});
