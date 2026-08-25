import { CommunityRepresentative } from '../../../domain/community-representative.entity';
import { AssignmentAlreadyExistsError } from '../../../domain/errors/assignment-already-exists.error';
import { CommunityRepresentativeRepository } from '../../ports/community-representative.repository.port';

// Test double for CommunityRepresentativeRepository (design.md Testing
// Strategy: in-memory fakes with invariant parity). Shared across the
// Phase 6 use-case unit specs (tasks.md 6.6). Keyed by the
// `(communityId, userId)` pair — mirrors the real `@@unique([communityId,
// userId])` constraint (design.md Decision 4) — so create() rejects a
// second row for the same pair exactly like PrismaCommunityRepresentative
// Repository.create() will (PR 8, P2002 -> AssignmentAlreadyExistsError).
export class InMemoryCommunityRepresentativeRepository implements CommunityRepresentativeRepository {
  private readonly assignmentsByKey = new Map<
    string,
    CommunityRepresentative
  >();

  private key(communityId: string, userId: string): string {
    return `${communityId}::${userId}`;
  }

  seed(representative: CommunityRepresentative): void {
    this.assignmentsByKey.set(
      this.key(representative.communityId, representative.userId),
      representative,
    );
  }

  findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityRepresentative | null> {
    return Promise.resolve(
      this.assignmentsByKey.get(this.key(communityId, userId)) ?? null,
    );
  }

  // NULL deactivatedAt = active (design.md Decision 3); at most one row per
  // community should satisfy this — the swap logic in the use cases is what
  // keeps that true, this fake only reports the current state.
  findActiveByCommunity(
    communityId: string,
  ): Promise<CommunityRepresentative | null> {
    for (const representative of this.assignmentsByKey.values()) {
      if (
        representative.communityId === communityId &&
        representative.isActive
      ) {
        return Promise.resolve(representative);
      }
    }
    return Promise.resolve(null);
  }

  listByCommunity(communityId: string): Promise<CommunityRepresentative[]> {
    return Promise.resolve(
      [...this.assignmentsByKey.values()].filter(
        (representative) => representative.communityId === communityId,
      ),
    );
  }

  countActiveByUser(userId: string): Promise<number> {
    let count = 0;
    for (const representative of this.assignmentsByKey.values()) {
      if (representative.userId === userId && representative.isActive) {
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  // Mirrors the real unique index on (communityId, userId) (design.md
  // Decision 4) — ANY existing row for this pair, active or deactivated,
  // rejects the insert.
  create(assignment: CommunityRepresentative): Promise<void> {
    const key = this.key(assignment.communityId, assignment.userId);
    if (this.assignmentsByKey.has(key)) {
      return Promise.reject(new AssignmentAlreadyExistsError());
    }
    this.assignmentsByKey.set(key, assignment);
    return Promise.resolve();
  }

  // NULL = reactivate, a Date = deactivate (design.md Decision 3). No-op on
  // an unknown pair, mirroring InMemoryCommunityRepository.softDeleteById's
  // leniency — callers that need existence guarantees check it themselves
  // before calling this.
  setDeactivatedAt(
    communityId: string,
    userId: string,
    at: Date | null,
  ): Promise<void> {
    const key = this.key(communityId, userId);
    const existing = this.assignmentsByKey.get(key);
    if (!existing) {
      return Promise.resolve();
    }
    this.assignmentsByKey.set(
      key,
      new CommunityRepresentative({ ...existing, deactivatedAt: at }),
    );
    return Promise.resolve();
  }

  // No real isolation/concurrency abort (design.md Testing Strategy — that
  // guarantee is infrastructure, tested against real Postgres in PR 8), but
  // the port contract's other half — "a rejected work MUST roll back" — is
  // real and testable here: snapshot the map, run the callback inline
  // against `this`, and restore the snapshot if `work` throws. Mirrors
  // InMemoryUserRepository.transactional().
  transactional<T>(
    work: (repo: CommunityRepresentativeRepository) => Promise<T>,
  ): Promise<T> {
    const snapshot = new Map(this.assignmentsByKey);
    return work(this).catch((error: unknown) => {
      this.assignmentsByKey.clear();
      for (const [key, representative] of snapshot) {
        this.assignmentsByKey.set(key, representative);
      }
      throw error;
    });
  }
}
