// Thrown by `OpenReviewSessionUseCase` (design.md Decision 4, Phase 4, task
// 4.4) when the named community does not exist, is soft-deleted, or the
// actor holds no active assignment to it. Both causes MUST collapse to this
// SAME error — the caller supplied `communityId` directly, so "not yours"
// leaks nothing it did not already supply, but the two sub-causes
// themselves stay indistinguishable (design.md Decision 4, corrected
// 2026-09-07): `communityRepository.findById(communityId)` resolving to
// `null` (nonexistent OR soft-deleted, ADR-010) is checked BEFORE
// `communityScopeChecker.isAssignedTo`, and either failure throws this same
// error. The presentation layer maps this to 403 { code:
// COMMUNITY_NOT_IN_SCOPE }.
export class CommunityNotInScopeError extends Error {
  constructor() {
    super('Community is not in the actor scope');
    this.name = 'CommunityNotInScopeError';
  }
}
