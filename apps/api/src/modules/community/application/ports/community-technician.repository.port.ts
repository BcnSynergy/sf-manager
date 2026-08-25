import { CommunityTechnician } from '../../domain/community-technician.entity';

// Port (application layer, ADR-002/013): technician sibling of
// CommunityRepresentativeRepository, deliberately missing
// findActiveByCommunity, countActiveByUser, and transactional() —
// technicians have no exclusivity invariant (design.md Interfaces: "the
// asymmetry, made structural"), so there is nothing to swap and nothing to
// count for a warning. Many active technicians per community, and the same
// technician active across many communities, is allowed with zero
// cross-checking (tasks.md 9.1).
export interface CommunityTechnicianRepository {
  findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityTechnician | null>;

  // Active AND deactivated records — Phase 10's list-assignments route.
  listByCommunity(communityId: string): Promise<CommunityTechnician[]>;

  // Plain insert. Rejects with AssignmentAlreadyExistsError when the
  // (communityId, userId) pair already has a record — active or deactivated
  // (design.md Decision 4; `@@unique([communityId, userId])`) — mirrors
  // CommunityRepresentativeRepository.create()'s precedent.
  create(assignment: CommunityTechnician): Promise<void>;

  // NULL = reactivate, a Date = deactivate (design.md Decision 3 —
  // overwrites any prior timestamp; no assignment history is kept). No
  // exclusivity side effect: setting this on one row never touches any
  // other technician row.
  setDeactivatedAt(
    communityId: string,
    userId: string,
    at: Date | null,
  ): Promise<void>;
}

export const COMMUNITY_TECHNICIAN_REPOSITORY = Symbol(
  'COMMUNITY_TECHNICIAN_REPOSITORY',
);
