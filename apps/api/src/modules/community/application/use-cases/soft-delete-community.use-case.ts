import { Inject, Injectable } from '@nestjs/common';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { CommunityHasActiveElementsError } from '../../domain/errors/community-has-active-elements.error';
import { assertNoActiveElementsAttached } from '../../domain/community-deletion.policy';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../ports/community-representative.repository.port';
import {
  INSPECTABLE_ELEMENT_COUNTER,
  type InspectableElementCounter,
} from '../ports/inspectable-element-counter.port';

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": sets deletedAt (ADR-010, no row deletion) — same default
// deletedAt: null filter as findAll, so a missing or already soft-deleted id
// both 404 identically.
//
// inspectable-elements/design.md Decision 6 / Data Flow "DELETE
// /communities/:id (the new block guard)": findById (404) ->
// countActiveByCommunity [fast path, community-owned port] ->
// assertNoActiveElementsAttached [pure domain policy] -> softDeleteById
// [ATOMIC: UPDATE ... AND NOT EXISTS(active element)]. On a refused atomic
// write, re-check via findById as the sole existence oracle (404) or
// CommunityHasActiveElementsError — mirrors
// SoftDeleteMaintenanceCompanyUseCase's re-check discipline exactly.
//
// design.md "Data Flow — Community Soft-Delete Cascade to Representative":
// after the community is ACTUALLY soft-deleted (wasDeleted === true — a
// refused delete must never cascade), conditionally deactivate its
// sole-active representative. `countActiveByUser` is reused as-is from the
// multi-community warning (design.md rationale) — no new port method, no
// new domain error. Technician repositories are never injected here and
// never called (community-management spec.md: "MUST NOT perform any
// operation on that community's technician assignments").
@Injectable()
export class SoftDeleteCommunityUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
    @Inject(INSPECTABLE_ELEMENT_COUNTER)
    private readonly elementCounter: InspectableElementCounter,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.communityRepository.findById(id);
    if (!existing) {
      throw new CommunityNotFoundError();
    }

    const activeElementCount =
      await this.elementCounter.countActiveByCommunity(id);
    assertNoActiveElementsAttached(activeElementCount);

    const wasDeleted = await this.communityRepository.softDeleteById(id);
    if (!wasDeleted) {
      // Extremely rare: the atomic UPDATE found the invariant violated at
      // write time even though the read-time check above passed — an
      // element was concurrently attached between the check and the write.
      // The write is authoritative and simply refuses in this case instead
      // of silently succeeding.
      //
      // findById — not a second countActiveByCommunity read — is the sole
      // existence oracle here (ADR-010's "soft-deleted resolves to null" is
      // what findById already encodes everywhere else). A stale/racy count
      // read must never be used to infer "vanished": if the community still
      // exists, the ONLY reason the atomic write could have refused is an
      // active element, so that's the only error thrown in that case,
      // regardless of what the count reads a moment later (the count is
      // fetched only to make the message accurate, never to decide which
      // error to throw).
      const stillExists = await this.communityRepository.findById(id);
      if (!stillExists) {
        // Community vanished between the read-time check and the write
        // (e.g. concurrently soft-deleted by another request) — same 404
        // semantics as the initial findById check above.
        throw new CommunityNotFoundError();
      }
      const currentActiveElementCount =
        await this.elementCounter.countActiveByCommunity(id);
      throw new CommunityHasActiveElementsError(
        Math.max(currentActiveElementCount, 1),
      );
    }

    const incumbent =
      await this.representativeRepository.findActiveByCommunity(id);
    if (!incumbent) {
      return;
    }

    const communityCount =
      await this.representativeRepository.countActiveByUser(incumbent.userId);
    if (communityCount > 1) {
      // Active in at least one other community — left unchanged (design.md:
      // "no-op, assignment left active").
      return;
    }

    await this.representativeRepository.setDeactivatedAt(
      id,
      incumbent.userId,
      new Date(),
    );
  }
}
