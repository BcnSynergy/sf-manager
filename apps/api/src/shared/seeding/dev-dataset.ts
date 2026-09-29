import type { Role } from '@sf-manager/validation';
import type { ManagerCapability } from '../../modules/users/domain/manager-capability';

// dev-seed-data design.md Decision 9: the one password shared by every dev
// user. It is public (documented in README.md) and goes through CreateUser,
// so PlainPassword validates it; dev-dataset.spec.ts asserts the policy
// accepts it.
export const DEV_SEED_PASSWORD = 'sf-manager-dev-1';

export interface DevCompany {
  name: string;
  // Natural key (Decision 4). Already canonical: trimmed and upper-cased.
  taxId: string;
  contactInfo: string;
}

export interface DevUser {
  // Natural key (Decision 4). Already canonical: trimmed and lower-cased.
  email: string;
  role: Role;
  // References `DevCompany.taxId`; set only for the maintenance-side roles.
  companyTaxId?: string;
  managerCapabilities?: ManagerCapability[];
}

export interface DevDataset {
  password: string;
  companies: DevCompany[];
  users: DevUser[];
}

const COMPANY_A_TAX_ID = 'B99000001';
const COMPANY_B_TAX_ID = 'B99000002';

// design.md "Dataset" table. Every name carries the `Dev Seed` marker so the
// rows are recognizable and never clash with other data. The SYSTEM_ADMIN is
// not part of the dataset: it comes from the unchanged seed.ts bootstrap.
export const DEV_DATASET: DevDataset = {
  password: DEV_SEED_PASSWORD,
  companies: [
    {
      name: 'Dev Seed Fire Safety A',
      taxId: COMPANY_A_TAX_ID,
      contactInfo: 'dev-seed-a@sf-manager.example',
    },
    {
      name: 'Dev Seed Fire Safety B',
      taxId: COMPANY_B_TAX_ID,
      contactInfo: 'dev-seed-b@sf-manager.example',
    },
  ],
  users: [
    {
      email: 'technician@sf-manager.example',
      role: 'MAINTENANCE_TECHNICIAN',
      companyTaxId: COMPANY_A_TAX_ID,
    },
    {
      email: 'technician2@sf-manager.example',
      role: 'MAINTENANCE_TECHNICIAN',
      companyTaxId: COMPANY_B_TAX_ID,
    },
    {
      email: 'companymgr@sf-manager.example',
      role: 'MAINTENANCE_COMPANY_MANAGER',
      companyTaxId: COMPANY_A_TAX_ID,
    },
    { email: 'rep@sf-manager.example', role: 'COMMUNITY_REPRESENTATIVE' },
    {
      email: 'manager@sf-manager.example',
      role: 'MANAGER',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    },
    { email: 'manager-nocap@sf-manager.example', role: 'MANAGER' },
  ],
};
