import type { OrganizationProfileProps } from './organization-profile.entity';

// Shared test fixture (domain layer, so both domain and application specs
// and the in-memory fake may import it without an inverted dependency).
// Single source of truth for the sentinel id and the blank-profile shape,
// which the migration's idempotent blank seed hand-picks and fixes forever
// (design.md "Migration" — migration.sql; spec.md "The Profile Row Exists
// Before Any Request"). Never regenerate this literal.
export const ORGANIZATION_PROFILE_SENTINEL_ID =
  '01997a00-0000-7000-8000-000000000001';

// The exact shape every fresh deployment starts from: all six text fields
// blank, logoAssetId null (design.md Decision 1 seed, spec.md "The row
// exists after migration, with no request made").
export const blankOrganizationProfileProps: OrganizationProfileProps = {
  id: ORGANIZATION_PROFILE_SENTINEL_ID,
  name: '',
  legalName: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  logoAssetId: null,
};
