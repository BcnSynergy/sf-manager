import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { assertEligibleFor } from '../../domain/assignment-eligibility.policy';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../ports/community-representative.repository.port';

export interface AddRepresentativeInput {
  communityId: string;
  userId: string;
}

export interface RepresentativeWarning {
  code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES';
  communityCount: number;
}

export interface AddRepresentativeResult {
  communityId: string;
  userId: string;
  deactivatedAt: null;
  warning?: RepresentativeWarning;
}

// design.md Data Flow (POST /communities/:id/representatives) + Decision 4:
// eligibility gate, exclusivity swap inside a SERIALIZABLE transaction, and
// the multi-community warning computed AFTER the write, inside the same
// transaction. community-assignments spec.md "Add Representative —
// Eligibility Gate", "Single Active Representative Per Community",
// "Multi-Community Representative Warning".
@Injectable()
export class AddRepresentativeUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: AddRepresentativeInput,
  ): Promise<AddRepresentativeResult> {
    const community = await this.communityRepository.findById(
      input.communityId,
    );
    if (!community) {
      throw new CommunityNotFoundError();
    }

    // Default deletedAt: null filter (ADR-010) — a soft-deleted user
    // resolves to null here too, so this also covers "cannot assign a
    // soft-deleted user".
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    assertEligibleFor(user.role, 'REPRESENTATIVE');

    return this.representativeRepository.transactional(async (repo) => {
      // Exclusivity swap (design.md Decision 1/2): deactivate the current
      // active representative OF THIS COMMUNITY ONLY before activating the
      // target. repo.create() below rejects with
      // AssignmentAlreadyExistsError if the (communityId, userId) pair
      // already has a record — the transaction rolls that deactivation
      // back too (InMemoryCommunityRepresentativeRepository.transactional /
      // PrismaCommunityRepresentativeRepository.transactional, PR 8).
      const incumbent = await repo.findActiveByCommunity(input.communityId);
      if (incumbent) {
        await repo.setDeactivatedAt(
          input.communityId,
          incumbent.userId,
          new Date(),
        );
      }

      await repo.create(
        new CommunityRepresentative({
          id: this.idGenerator.generate(),
          communityId: input.communityId,
          userId: input.userId,
          deactivatedAt: null,
        }),
      );

      // Multi-community warning (design.md "Where the settled policies live
      // in code"): counted AFTER the write, inside the same transaction, so
      // it reflects the post-activation state.
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
