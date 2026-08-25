import { CommunityTechnician } from '../../../domain/community-technician.entity';
import { AssignmentAlreadyExistsError } from '../../../domain/errors/assignment-already-exists.error';
import { CommunityTechnicianRepository } from '../../ports/community-technician.repository.port';

// Test double for CommunityTechnicianRepository (design.md Testing
// Strategy: in-memory fakes with invariant parity). Shared across the
// Phase 9 use-case unit specs (tasks.md 9.4). Keyed by the
// `(communityId, userId)` pair — mirrors the real
// `@@unique([communityId, userId])` constraint (design.md Decision 4) — so
// create() rejects a second row for the same pair exactly like
// PrismaCommunityTechnicianRepository.create() will (P2002 ->
// AssignmentAlreadyExistsError). Deliberately no
// findActiveByCommunity/countActiveByUser/transactional() — technicians
// have no exclusivity invariant to enforce.
export class InMemoryCommunityTechnicianRepository implements CommunityTechnicianRepository {
  private readonly assignmentsByKey = new Map<string, CommunityTechnician>();

  private key(communityId: string, userId: string): string {
    return `${communityId}::${userId}`;
  }

  seed(technician: CommunityTechnician): void {
    this.assignmentsByKey.set(
      this.key(technician.communityId, technician.userId),
      technician,
    );
  }

  findByCommunityAndUser(
    communityId: string,
    userId: string,
  ): Promise<CommunityTechnician | null> {
    return Promise.resolve(
      this.assignmentsByKey.get(this.key(communityId, userId)) ?? null,
    );
  }

  listByCommunity(communityId: string): Promise<CommunityTechnician[]> {
    return Promise.resolve(
      [...this.assignmentsByKey.values()].filter(
        (technician) => technician.communityId === communityId,
      ),
    );
  }

  // Mirrors the real unique index on (communityId, userId) (design.md
  // Decision 4) — ANY existing row for this pair, active or deactivated,
  // rejects the insert. No exclusivity check against OTHER pairs: multiple
  // technicians can be active in the same community, and this technician
  // can be active in many communities.
  create(assignment: CommunityTechnician): Promise<void> {
    const key = this.key(assignment.communityId, assignment.userId);
    if (this.assignmentsByKey.has(key)) {
      return Promise.reject(new AssignmentAlreadyExistsError());
    }
    this.assignmentsByKey.set(key, assignment);
    return Promise.resolve();
  }

  // NULL = reactivate, a Date = deactivate (design.md Decision 3). No-op on
  // an unknown pair, mirroring InMemoryCommunityRepresentativeRepository's
  // leniency. Touches only the matching (communityId, userId) row — no
  // other row is ever affected.
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
      new CommunityTechnician({ ...existing, deactivatedAt: at }),
    );
    return Promise.resolve();
  }
}
