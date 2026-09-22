import { OrganizationProfile as PrismaOrganizationProfile } from '@prisma/client';
import { OrganizationProfile } from '../../domain/organization-profile.entity';

// ADR-013: dedicated mapper between Prisma's row-shaped query result and the
// hand-written domain entity — mirrors CommunityMapper. `singleton` is the
// Prisma-visible half of the sentinel guard (design.md Decision 1) and is
// persistence-only — deliberately never mapped onto the domain entity.
//
// No toPersistence(): this module has no create surface (design.md,
// spec.md "The Profile Has No Create and No Delete Surface"). Writes go
// through PrismaOrganizationProfileRepository.update()'s partial `data`
// object directly, built from OrganizationProfileChanges — there is no
// full-entity persistence payload to build.
export class OrganizationProfileMapper {
  static toDomain(record: PrismaOrganizationProfile): OrganizationProfile {
    return new OrganizationProfile({
      id: record.id,
      name: record.name,
      legalName: record.legalName,
      taxId: record.taxId,
      address: record.address,
      phone: record.phone,
      email: record.email,
      logoAssetId: record.logoAssetId,
    });
  }
}
