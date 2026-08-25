// Thrown by community application use cases (design.md File Changes) when a
// given id does not resolve to an existing (and, per
// CommunityRepository.findById's default deletedAt: null filter, active)
// community (community-management spec.md, "Update Community", "Update
// targets a non-existent community"; also used by the soft-delete and
// assignment use cases for a missing community). The application layer
// maps this to 404.
export class CommunityNotFoundError extends Error {
  constructor() {
    super('Community not found');
    this.name = 'CommunityNotFoundError';
  }
}
