import { Community, Locale } from '../../../domain/community.entity';
import { CommunityRepository } from '../../ports/community.repository.port';

// Test double for CommunityRepository (design.md Testing Strategy: in-memory
// fakes for use-case unit specs, mirroring InMemoryUserRepository). Shared
// across the four use-case unit specs (tasks.md 4.6).
export class InMemoryCommunityRepository implements CommunityRepository {
  private readonly communitiesById = new Map<string, Community>();

  seed(community: Community): void {
    this.communitiesById.set(community.id, community);
  }

  create(community: Community): Promise<void> {
    this.communitiesById.set(community.id, community);
    return Promise.resolve();
  }

  findById(id: string): Promise<Community | null> {
    const community = this.communitiesById.get(id);
    // deletedAt: null default filter parity (ADR-010) — a soft-deleted
    // community resolves to null, same as InMemoryUserRepository.findById.
    if (!community || community.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(community);
  }

  findAll(): Promise<Community[]> {
    // Soft-deleted communities excluded from findAll (ADR-010), same filter
    // parity as InMemoryUserRepository.findAll.
    return Promise.resolve(
      [...this.communitiesById.values()].filter(
        (community) => !community.isDeleted,
      ),
    );
  }

  updateById(
    id: string,
    changes: { name?: string; address?: string; locale?: Locale },
  ): Promise<void> {
    const existing = this.communitiesById.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.communitiesById.set(
      id,
      new Community({
        ...existing,
        name: changes.name ?? existing.name,
        address: changes.address ?? existing.address,
        locale: changes.locale ?? existing.locale,
      }),
    );
    return Promise.resolve();
  }

  // inspectable-elements/design.md Decision 6: reproduces the boolean
  // contract PrismaCommunityRepository's atomic UPDATE...NOT EXISTS
  // enforces — this fake has no InspectableElement table to guard against,
  // so it only reproduces the "already gone" half (missing or already
  // soft-deleted) of the contract; the active-element half is exercised via
  // `jest.spyOn(...).mockResolvedValueOnce(false)` in
  // soft-delete-community.use-case.spec.ts (mirrors
  // InMemoryMaintenanceCompanyRepository's identical fake-boundary
  // rationale).
  softDeleteById(id: string): Promise<boolean> {
    const existing = this.communitiesById.get(id);
    if (!existing || existing.isDeleted) {
      return Promise.resolve(false);
    }
    this.communitiesById.set(
      id,
      new Community({ ...existing, deletedAt: new Date() }),
    );
    return Promise.resolve(true);
  }
}
