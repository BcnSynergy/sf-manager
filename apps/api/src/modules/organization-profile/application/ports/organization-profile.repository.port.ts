import {
  OrganizationProfile,
  type OrganizationProfileProps,
} from '../../domain/organization-profile.entity';

// Port (application layer, ADR-002/013). See design.md Interfaces/Contracts
// — the concrete adapter is PrismaOrganizationProfileRepository
// (infrastructure/persistence, PR 3).
//
// Derived from OrganizationProfileProps rather than hand-declared, so the
// six writable fields cannot drift from the entity's own field list. `id`
// is never writable (no id parameter, design.md Decision 3) and
// `logoAssetId` is reserved and inert this slice (ADR-012 Consequences) —
// both omitted, so `logoAssetId` is unwritable by construction rather than
// by a rejection rule (design.md Interfaces/Contracts).
export type OrganizationProfileChanges = Partial<
  Omit<OrganizationProfileProps, 'id' | 'logoAssetId'>
>;

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
