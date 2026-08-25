import { Community, Locale } from '../../domain/community.entity';

// Port (application layer, ADR-002/013): the `community` presentation/
// infrastructure layers (PR 5) depend on this interface, never on the Prisma
// adapter directly. See design.md Interfaces/Contracts and File Changes —
// the concrete adapter is PrismaCommunityRepository
// (infrastructure/persistence/prisma-community.repository.ts, PR 5).
//
// Unlike UserRepository, this port has no transactional() — the exclusivity
// concurrency seam belongs to CommunityRepresentativeRepository (PR 6), not
// to plain Community CRUD (design.md Decision 1/2).
export interface CommunityRepository {
  // Plain insert, mirrors UserRepository.create() (design.md Decision 8
  // precedent). No uniqueness constraint on name/address in this slice.
  create(community: Community): Promise<void>;

  // Default `deletedAt: null` filter (ADR-010) — a soft-deleted community
  // resolves to null, so Update/SoftDelete use cases 404 it the same way as
  // "no such community", never "already deleted".
  findById(id: string): Promise<Community | null>;

  // Soft-deleted communities are EXCLUDED by default (ADR-010, spec.md
  // "Soft-deleted communities excluded from the list").
  findAll(): Promise<Community[]>;

  updateById(
    id: string,
    changes: { name?: string; address?: string; locale?: Locale },
  ): Promise<void>;

  // Sets deletedAt (ADR-010) — no row deletion. The representative
  // deactivation cascade (community-management spec.md, "Soft-deleting a
  // community deactivates its sole-active representative") is NOT part of
  // this port method; it is orchestrated by SoftDeleteCommunityUseCase in
  // Phase 7 (PR 7) once CommunityRepresentativeRepository exists (PR 6).
  softDeleteById(id: string): Promise<void>;
}

export const COMMUNITY_REPOSITORY = Symbol('COMMUNITY_REPOSITORY');
