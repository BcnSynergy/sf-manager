import { CommunityRepresentative } from '../../domain/community-representative.entity';

// Port (application layer, ADR-002/013): PR 8 (infrastructure) implements
// this port with PrismaCommunityRepresentativeRepository (SERIALIZABLE
// transaction). Unlike CommunityRepository, this port owns transactional()
// (design.md Decision 1/2) — the exclusivity swap (deactivate incumbent,
// activate target, re-count for the multi-community warning) is exactly the
// write-skew shape UserRepository.transactional() already solved.
export interface CommunityRepresentativeRepository {
  findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityRepresentative | null>;

  // NULL deactivatedAt = active (design.md Decision 3) — at most one row per
  // community satisfies this (the partial unique index is the infra-layer
  // backstop, PR 8).
  findActiveByCommunity(
    communityId: string,
  ): Promise<CommunityRepresentative | null>;

  // Active AND deactivated records — Phase 10's list-assignments route.
  listByCommunity(communityId: string): Promise<CommunityRepresentative[]>;

  // Multi-community warning (design.md "Where the settled policies live in
  // code") — also reused as-is by the soft-delete cascade (Phase 7, PR 7),
  // never duplicated.
  countActiveByUser(userId: string): Promise<number>;

  // Plain insert. Rejects with AssignmentAlreadyExistsError when the
  // (communityId, userId) pair already has a record — active or deactivated
  // (design.md Decision 4; `@@unique([communityId, userId])`) — mirrors
  // UserRepository.create()'s EmailAlreadyInUseError precedent.
  create(assignment: CommunityRepresentative): Promise<void>;

  // NULL = reactivate, a Date = deactivate (design.md Decision 3 —
  // overwrites any prior timestamp; no assignment history is kept).
  setDeactivatedAt(
    communityId: string,
    userId: string,
    at: Date | null,
  ): Promise<void>;

  // MUST run at SERIALIZABLE (adapter, PR 8) so two concurrent activations
  // targeting the same community can't both observe "no active rep" and
  // both commit (write skew) — mirrors UserRepository.transactional()
  // (design.md Decision 2).
  transactional<T>(
    work: (repo: CommunityRepresentativeRepository) => Promise<T>,
  ): Promise<T>;
}

export const COMMUNITY_REPRESENTATIVE_REPOSITORY = Symbol(
  'COMMUNITY_REPRESENTATIVE_REPOSITORY',
);
