import type {
  CreateChecklistQuestionRequest,
  CreateCommunityRequest,
  CreateInspectableElementRequest,
  ElementType,
  ReviewFrequency,
  Role,
  UpdateOrganizationProfileRequest,
} from '@sf-manager/validation';
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

export const DEV_SEED_MARKER = 'Dev Seed';

export interface DevAssignment {
  communityName: string;
  userEmail: string;
  as: 'REPRESENTATIVE' | 'TECHNICIAN';
}

export type DevElement = CreateInspectableElementRequest & {
  communityName: string;
};

export interface DevTemplate {
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
}

export interface DevDataset {
  password: string;
  profile: UpdateOrganizationProfileRequest;
  companies: DevCompany[];
  users: DevUser[];
  communities: CreateCommunityRequest[];
  assignments: DevAssignment[];
  elements: DevElement[];
  questions: CreateChecklistQuestionRequest[];
  template: DevTemplate;
}

const COMPANY_A_TAX_ID = 'B99000001';
const COMPANY_B_TAX_ID = 'B99000002';
const TECHNICIAN = 'technician@sf-manager.example';
const TECHNICIAN_2 = 'technician2@sf-manager.example';
const REP = 'rep@sf-manager.example';
const NORTH = 'Dev Seed Residences North';
const SOUTH = 'Dev Seed Residences South';

// design.md "Dataset" table. Every name carries the `Dev Seed` marker so the
// rows are recognizable and never clash with other data. The SYSTEM_ADMIN is
// not part of the dataset: it comes from the unchanged seed.ts bootstrap.
export const DEV_DATASET: DevDataset = {
  password: DEV_SEED_PASSWORD,
  profile: {
    name: 'Dev Seed Fire Safety',
    legalName: 'Dev Seed Fire Safety S.L.',
    taxId: 'B99000000',
    address: '10 Example Street, Barcelona',
    phone: '+34 900 000 000',
    email: 'info@sf-manager.example',
  },
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
      email: TECHNICIAN,
      role: 'MAINTENANCE_TECHNICIAN',
      companyTaxId: COMPANY_A_TAX_ID,
    },
    {
      email: TECHNICIAN_2,
      role: 'MAINTENANCE_TECHNICIAN',
      companyTaxId: COMPANY_B_TAX_ID,
    },
    {
      email: 'companymgr@sf-manager.example',
      role: 'MAINTENANCE_COMPANY_MANAGER',
      companyTaxId: COMPANY_A_TAX_ID,
    },
    { email: REP, role: 'COMMUNITY_REPRESENTATIVE' },
    {
      email: 'manager@sf-manager.example',
      role: 'MANAGER',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    },
    { email: 'manager-nocap@sf-manager.example', role: 'MANAGER' },
  ],  communities: [
    {
      name: 'Dev Seed Residences North',
      address: '1 North Street, Barcelona',
      locale: 'es',
    },
    {
      name: 'Dev Seed Residences South',
      address: '2 South Street, Barcelona',
      locale: 'ca',
    },
  ],
  assignments: [
    { communityName: NORTH, userEmail: REP, as: 'REPRESENTATIVE' },
    { communityName: NORTH, userEmail: TECHNICIAN, as: 'TECHNICIAN' },
    { communityName: SOUTH, userEmail: TECHNICIAN, as: 'TECHNICIAN' },
    { communityName: SOUTH, userEmail: TECHNICIAN_2, as: 'TECHNICIAN' },
  ],
  elements: [
    ...['Lobby', 'Garage'].flatMap((place) =>
      [NORTH, SOUTH].map((communityName) => ({
        communityName,
        elementType: 'EXTINGUISHER' as const,
        name: `Dev Seed Extinguisher ${communityName.split(' ').pop()} ${place}`,
        location: place,
        installedAt: '2024-01-15',
      })),
    ),
  ],
  questions: [
    'Is the extinguisher visible and unobstructed?',
    'Is the pressure gauge in the green zone?',
    'Is the safety seal intact?',
  ].map((text) => ({
    elementType: 'EXTINGUISHER' as const,
    frequencies: ['MONTHLY' as const],
    text,
  })),
  template: {
    elementType: 'EXTINGUISHER',
    frequency: 'MONTHLY',
    name: 'Dev Seed Extinguisher Monthly Check',
  },
};
