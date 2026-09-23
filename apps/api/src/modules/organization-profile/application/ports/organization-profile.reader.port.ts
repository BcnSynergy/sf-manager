import { OrganizationProfile } from '../../domain/organization-profile.entity';

// Port (application layer, ADR-002/013). design.md Decision 3: a read-only
// alias of OrganizationProfileRepository, bound in
// organization-profile.module.ts via `useExisting: ORGANIZATION_PROFILE_REPOSITORY`
// — the SAME PrismaOrganizationProfileRepository singleton, never a second
// adapter. The module exports only this token, never
// ORGANIZATION_PROFILE_REPOSITORY, so a consumer (review-session, PR 7) can
// read the profile without ever seeing update(). This is the narrowed
// exception review-document *The Organization Profile Gains One Reader, Not
// a Wider Endpoint* and authorization *The Organization Profile Grants
// Nothing Beyond Itself* both describe: one read-only consumer, checkable by
// grepping the token, GET /organization-profile unchanged.
export interface OrganizationProfileReader {
  get(): Promise<OrganizationProfile>;
}

export const ORGANIZATION_PROFILE_READER = Symbol(
  'ORGANIZATION_PROFILE_READER',
);
