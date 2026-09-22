import {
  OrganizationProfile,
  type OrganizationProfileProps,
} from './organization-profile.entity';
import {
  blankOrganizationProfileProps,
  ORGANIZATION_PROFILE_SENTINEL_ID,
} from './organization-profile.fixture';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// design.md Decision 2: all six text fields are plain strings — no Value
// Objects. design.md Interfaces/Contracts: no `singleton` field (persistence-
// only guard, never mapped), no `isComplete()` getter (the incompleteness
// signal is UI-only, Decision 5), no constructor validation — mirroring
// MaintenanceCompany/Community/User exactly.
describe('OrganizationProfile', () => {
  it.each<[string, OrganizationProfileProps]>([
    [
      'a filled profile',
      {
        id: ORGANIZATION_PROFILE_SENTINEL_ID,
        name: 'Acme Property Management',
        legalName: 'Acme Property Management SL',
        taxId: 'B12345678',
        address: 'Carrer Major 1, Girona',
        phone: '+34 972 000 000',
        email: 'contact@acme-pm.example',
        logoAssetId: null,
      },
    ],
    ['the blank seeded profile', blankOrganizationProfileProps],
  ])('constructs %s with every field exposed verbatim', (_case, props) => {
    const profile = new OrganizationProfile(props);

    expect(profile.id).toBe(props.id);
    expect(profile.name).toBe(props.name);
    expect(profile.legalName).toBe(props.legalName);
    expect(profile.taxId).toBe(props.taxId);
    expect(profile.address).toBe(props.address);
    expect(profile.phone).toBe(props.phone);
    expect(profile.email).toBe(props.email);
    expect(profile.logoAssetId).toBeNull();
  });
});
