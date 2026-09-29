import {
  createMaintenanceCompanySchema,
  createUserSchema,
  passwordSchema,
} from '@sf-manager/validation';
import { DEV_DATASET, DEV_SEED_PASSWORD } from './dev-dataset';

// dev-seed-data design.md Decision 10: use cases trust input the HTTP pipe
// already canonicalized, so every dataset literal must survive the shared
// request schemas UNCHANGED. Without this check a lower-case tax id would
// silently defeat the natural-key skip (Decision 4).
describe('DEV_DATASET', () => {
  it('uses a password accepted by the shared password policy', () => {
    expect(passwordSchema.safeParse(DEV_SEED_PASSWORD).success).toBe(true);
  });

  it('seeds two companies', () => {
    expect(DEV_DATASET.companies.map((c) => c.name)).toEqual([
      'Dev Seed Fire Safety A',
      'Dev Seed Fire Safety B',
    ]);
  });

  it.each(DEV_DATASET.companies.map((company) => [company.name, company]))(
    'company %s is canonical through createMaintenanceCompanySchema',
    (_name, company) => {
      expect(createMaintenanceCompanySchema.parse(company)).toEqual(company);
    },
  );

  it('seeds the six non-admin users of the design table', () => {
    expect(DEV_DATASET.users.map((u) => [u.email, u.role])).toEqual([
      ['technician@sf-manager.example', 'MAINTENANCE_TECHNICIAN'],
      ['technician2@sf-manager.example', 'MAINTENANCE_TECHNICIAN'],
      ['companymgr@sf-manager.example', 'MAINTENANCE_COMPANY_MANAGER'],
      ['rep@sf-manager.example', 'COMMUNITY_REPRESENTATIVE'],
      ['manager@sf-manager.example', 'MANAGER'],
      ['manager-nocap@sf-manager.example', 'MANAGER'],
    ]);
  });

  it('grants VIEW_ALL_REVIEWS to exactly one of the two managers', () => {
    const managers = DEV_DATASET.users.filter((u) => u.role === 'MANAGER');

    expect(managers).toHaveLength(2);
    expect(
      managers
        .filter((m) => m.managerCapabilities?.includes('VIEW_ALL_REVIEWS'))
        .map((m) => m.email),
    ).toEqual(['manager@sf-manager.example']);
  });

  it('assigns every maintenance-side user to a seeded company by tax id', () => {
    const taxIds = DEV_DATASET.companies.map((c) => c.taxId);
    const maintenance = DEV_DATASET.users.filter(
      (u) =>
        u.role === 'MAINTENANCE_TECHNICIAN' ||
        u.role === 'MAINTENANCE_COMPANY_MANAGER',
    );

    expect(maintenance).toHaveLength(3);
    for (const user of maintenance) {
      expect(taxIds).toContain(user.companyTaxId);
    }
    // technician2@ belongs to the other company (scope asymmetry).
    expect(new Set(maintenance.map((u) => u.companyTaxId)).size).toBe(2);
  });

  it.each(DEV_DATASET.users.map((user) => [user.email, user]))(
    'user %s is canonical through createUserSchema',
    (_email, user) => {
      const input = {
        email: user.email,
        password: DEV_DATASET.password,
        role: user.role,
        ...(user.companyTaxId !== undefined && {
          maintenanceCompanyId: 'company-id-placeholder',
        }),
      };

      expect(createUserSchema.parse(input)).toEqual(input);
    },
  );
});
