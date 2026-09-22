import { OrganizationProfile } from './organization-profile.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// design.md Decision 2: all six text fields are plain strings — no Value
// Objects. design.md Interfaces/Contracts: no `singleton` field (persistence-
// only guard, never mapped), no `isComplete()` getter (the incompleteness
// signal is UI-only, Decision 5), no constructor validation — mirroring
// MaintenanceCompany/Community/User exactly.
describe('OrganizationProfile', () => {
  it('constructs the profile with its identity, six text fields and a null logoAssetId', () => {
    const profile = new OrganizationProfile({
      id: '01997a00-0000-7000-8000-000000000001',
      name: 'Acme Property Management',
      legalName: 'Acme Property Management SL',
      taxId: 'B12345678',
      address: 'Carrer Major 1, Girona',
      phone: '+34 972 000 000',
      email: 'contact@acme-pm.example',
      logoAssetId: null,
    });

    expect(profile.id).toBe('01997a00-0000-7000-8000-000000000001');
    expect(profile.name).toBe('Acme Property Management');
    expect(profile.legalName).toBe('Acme Property Management SL');
    expect(profile.taxId).toBe('B12345678');
    expect(profile.address).toBe('Carrer Major 1, Girona');
    expect(profile.phone).toBe('+34 972 000 000');
    expect(profile.email).toBe('contact@acme-pm.example');
    expect(profile.logoAssetId).toBeNull();
  });

  it('constructs the blank seeded profile with every text field empty', () => {
    const profile = new OrganizationProfile({
      id: '01997a00-0000-7000-8000-000000000001',
      name: '',
      legalName: '',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoAssetId: null,
    });

    expect(profile.name).toBe('');
    expect(profile.legalName).toBe('');
    expect(profile.taxId).toBe('');
    expect(profile.address).toBe('');
    expect(profile.phone).toBe('');
    expect(profile.email).toBe('');
    expect(profile.logoAssetId).toBeNull();
  });
});
