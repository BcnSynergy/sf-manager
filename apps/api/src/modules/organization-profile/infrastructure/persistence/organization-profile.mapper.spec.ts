import { OrganizationProfile } from '../../domain/organization-profile.entity';
import { OrganizationProfileMapper } from './organization-profile.mapper';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper.spec.ts.
//
// design.md Testing Strategy (Unit — mapper/entity): `singleton` never
// reaches the entity; `logoAssetId` round-trips as `null`.
describe('OrganizationProfileMapper', () => {
  describe('toDomain', () => {
    it('maps a Prisma OrganizationProfile record to a domain entity, dropping singleton', () => {
      const record = {
        id: '01997a00-0000-7000-8000-000000000001',
        name: 'Community Managers SL',
        legalName: 'Community Managers Sociedad Limitada',
        taxId: 'B12345678',
        address: 'Carrer Major 1, Girona',
        phone: '972000000',
        email: 'info@example.com',
        logoAssetId: null,
        singleton: true,
      };

      const profile = OrganizationProfileMapper.toDomain(record);

      expect(profile).toBeInstanceOf(OrganizationProfile);
      expect(profile.id).toBe(record.id);
      expect(profile.name).toBe(record.name);
      expect(profile.legalName).toBe(record.legalName);
      expect(profile.taxId).toBe(record.taxId);
      expect(profile.address).toBe(record.address);
      expect(profile.phone).toBe(record.phone);
      expect(profile.email).toBe(record.email);
      expect(profile.logoAssetId).toBeNull();
      expect(
        (profile as unknown as { singleton?: boolean }).singleton,
      ).toBeUndefined();
    });

    it('maps a blank seeded row, all six text fields empty and logoAssetId null', () => {
      const record = {
        id: '01997a00-0000-7000-8000-000000000001',
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
        logoAssetId: null,
        singleton: true,
      };

      const profile = OrganizationProfileMapper.toDomain(record);

      expect(profile.name).toBe('');
      expect(profile.legalName).toBe('');
      expect(profile.taxId).toBe('');
      expect(profile.address).toBe('');
      expect(profile.phone).toBe('');
      expect(profile.email).toBe('');
      expect(profile.logoAssetId).toBeNull();
    });
  });
});
