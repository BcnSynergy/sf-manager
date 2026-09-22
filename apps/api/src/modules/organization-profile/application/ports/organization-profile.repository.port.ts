import { OrganizationProfile } from '../../domain/organization-profile.entity';

// Port (application layer, ADR-002/013). See design.md Interfaces/Contracts
// — the concrete adapter is PrismaOrganizationProfileRepository
// (infrastructure/persistence, PR 3).
//
// No `logoAssetId` key in OrganizationProfileChanges: the field is reserved
// and inert this slice (ADR-012 Consequences), absent from this type, from
// the Zod schema and from the DTO, so it is unwritable by construction
// rather than by a rejection rule (design.md Interfaces/Contracts).
export interface OrganizationProfileChanges {
  name?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface OrganizationProfileRepository {
  // NOT `| null`. Existence is a deployment guarantee (migration seed) and
  // uniqueness a structural one (design.md Decision 1's CHECK + unique
  // index), so the absence of the row is an environment defect, not a
  // runtime condition: the adapter throws OrganizationProfileMissingError.
  // No findById — there is nothing to address (design.md Interfaces).
  get(): Promise<OrganizationProfile>;

  // Single atomic UPDATE addressed by the sentinel unique key; resolves to
  // the authoritative post-state (design.md Decision 3). No id parameter,
  // and no preliminary read.
  update(changes: OrganizationProfileChanges): Promise<OrganizationProfile>;

  // No create(), no softDeleteById(), no findAll(), no transactional() —
  // the profile has no create/delete/list surface (design.md, spec.md "The
  // Profile Has No Create and No Delete Surface").
}

export const ORGANIZATION_PROFILE_REPOSITORY = Symbol(
  'ORGANIZATION_PROFILE_REPOSITORY',
);
