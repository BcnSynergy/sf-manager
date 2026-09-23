import {
  ReviewDocumentElementIdentity,
  ReviewDocumentNameDirectory,
} from '../../ports/review-document-name-directory.port';

// Test double for ReviewDocumentNameDirectory (design.md Decision 4). Like
// InMemoryUserDirectory, it has no `deletedAt`/deactivation concept at
// all — a seeded community, company or element always resolves, regardless
// of whether the caller's scenario describes it as soft-deleted or
// deactivated. That is the whole point: the real Prisma adapter (PR 4)
// deliberately bypasses ADR-010's default soft-delete filter (community,
// company) and `findActiveByCommunityAndType`'s deactivation filter
// (elements) so a signed document still names context decommissioned after
// the session completed. An id with no seeded entry resolves `null`
// (community/company) or is simply absent from the map (elements) — there
// is no "not found" error path, mirroring the Prisma adapter's contract for
// an id with no row at all.
export class InMemoryReviewDocumentNameDirectory implements ReviewDocumentNameDirectory {
  private readonly communityNameById = new Map<string, string>();
  private readonly maintenanceCompanyNameById = new Map<string, string>();
  private readonly elementById = new Map<
    string,
    ReviewDocumentElementIdentity
  >();

  seedCommunity(communityId: string, name: string): void {
    this.communityNameById.set(communityId, name);
  }

  seedMaintenanceCompany(companyId: string, name: string): void {
    this.maintenanceCompanyNameById.set(companyId, name);
  }

  seedElement(
    elementId: string,
    identity: ReviewDocumentElementIdentity,
  ): void {
    this.elementById.set(elementId, identity);
  }

  findCommunityName(communityId: string): Promise<string | null> {
    return Promise.resolve(this.communityNameById.get(communityId) ?? null);
  }

  findMaintenanceCompanyName(companyId: string): Promise<string | null> {
    return Promise.resolve(
      this.maintenanceCompanyNameById.get(companyId) ?? null,
    );
  }

  findElementsByIds(
    ids: readonly string[],
  ): Promise<Map<string, ReviewDocumentElementIdentity>> {
    const result = new Map<string, ReviewDocumentElementIdentity>();
    for (const id of ids) {
      const identity = this.elementById.get(id);
      if (identity !== undefined) {
        result.set(id, identity);
      }
    }
    return Promise.resolve(result);
  }
}
