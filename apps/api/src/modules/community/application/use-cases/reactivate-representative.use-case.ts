import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { assertEligibleFor } from '../../domain/assignment-eligibility.policy';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../ports/community-representative.repository.port';
import type { RepresentativeWarning } from './add-representative.use-case';

export interface ReactivateRepresentativeInput {
  communityId: string;
  userId: string;
}

export interface ReactivateRepresentativeResult {
  communityId: string;
  userId: string;
  deactivatedAt: null;
  warning?: RepresentativeWarning;
}

// design.md "Where the settled policies live in code" (eligibility gate
// applies to "all four add/reactivate use cases") + Decision 4 +
// community-assignments spec.md "Representative Reactivation",
// "Reactivation rejected for a soft-deleted user", "Multi-Community
// Representative Warning". Same exclusivity-swap shape as
// AddRepresentativeUseCase, but against an EXISTING (communityId, userId)
// pair instead of inserting a new one.
@Injectable()
export class ReactivateRepresentativeUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
  ) {}

  async execute(
    input: ReactivateRepresentativeInput,
  ): Promise<ReactivateRepresentativeResult> {
    const existing = await this.representativeRepository.findByCommunityAndUser(
      input.communityId,
      input.userId,
    );
    if (!existing) {
      throw new AssignmentNotFoundError();
    }

    // Default deletedAt: null filter (ADR-010) — a soft-deleted user
    // resolves to null, so reactivation for a soft-deleted user 404s here
    // (community-assignments spec.md "Reactivation rejected for a
    // soft-deleted user").
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    assertEligibleFor(user.role, 'REPRESENTATIVE');

    return this.representativeRepository.transactional(async (repo) => {
      // Exclusivity swap, re-applied on reactivation (design.md Decision
      // 1/2): deactivate whoever else is currently active for this
      // community before reactivating the target. Skip if the target is
      // already the active one (no incumbent to swap out).
      const incumbent = await repo.findActiveByCommunity(input.communityId);
      if (incumbent && incumbent.userId !== input.userId) {
        await repo.setDeactivatedAt(
          input.communityId,
          incumbent.userId,
          new Date(),
        );
      }

      await repo.setDeactivatedAt(input.communityId, input.userId, null);

      // Multi-community warning, counted AFTER the write, inside the same
      // transaction — identical rule to AddRepresentativeUseCase.
      const communityCount = await repo.countActiveByUser(input.userId);

      return {
        communityId: input.communityId,
        userId: input.userId,
        deactivatedAt: null,
        ...(communityCount > 1
          ? {
              warning: {
                code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES' as const,
                communityCount,
              },
            }
          : {}),
      };
    });
  }
}
