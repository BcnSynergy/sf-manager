import { OrganizationProfile } from '../../../domain/organization-profile.entity';
import { blankOrganizationProfileProps } from '../../../domain/organization-profile.fixture';
import {
  OrganizationProfileChanges,
  OrganizationProfileRepository,
} from '../../ports/organization-profile.repository.port';

// Test double for OrganizationProfileRepository (design.md Testing
// Strategy: in-memory fakes for use-case unit specs). Holds a SINGLE field,
// not a Map — the fake-side expression of the database's sentinel-column
// guard (design.md Decision 1): a second row is structurally impossible in
// the real schema, so the fake cannot represent one either. Seeded blank in
// the constructor, mirroring the migration's idempotent blank seed
// (spec.md "The Profile Row Exists Before Any Request").
export class InMemoryOrganizationProfileRepository implements OrganizationProfileRepository {
  private profile: OrganizationProfile = new OrganizationProfile(
    blankOrganizationProfileProps,
  );

  // Test-only helper to override the seeded state for a given spec.
  seed(profile: OrganizationProfile): void {
    this.profile = profile;
  }

  get(): Promise<OrganizationProfile> {
    return Promise.resolve(this.profile);
  }

  update(changes: OrganizationProfileChanges): Promise<OrganizationProfile> {
    this.profile = new OrganizationProfile({
      ...this.profile,
      ...changes,
    });
    return Promise.resolve(this.profile);
  }
}
