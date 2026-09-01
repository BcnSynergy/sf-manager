// Thrown by assertNoActiveElementsAttached() (design.md Decision 6) when a
// soft-delete attempt targets a community with at least one non-soft-deleted
// InspectableElement still pointing at it (community-management spec.md
// "Soft-Delete Community"). The count is carried on the error so the 409
// message — and, upstream, the API response — can say *how many* elements
// must be removed first, mirroring MaintenanceCompanyHasActiveUsersError.
// The application layer maps this to 409 { code:
// COMMUNITY_HAS_ACTIVE_ELEMENTS }.
export class CommunityHasActiveElementsError extends Error {
  readonly activeElementCount: number;

  constructor(activeElementCount: number) {
    super(
      `Community has ${activeElementCount} active inspectable element(s) attached and cannot be deleted`,
    );
    this.name = 'CommunityHasActiveElementsError';
    this.activeElementCount = activeElementCount;
  }
}
