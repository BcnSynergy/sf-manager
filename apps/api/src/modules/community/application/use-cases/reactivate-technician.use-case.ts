import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { assertEligibleFor } from '../../domain/assignment-eligibility.policy';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../ports/community-technician.repository.port';

export interface ReactivateTechnicianInput {
  communityId: string;
  userId: string;
}

export interface ReactivateTechnicianResult {
  communityId: string;
  userId: string;
  deactivatedAt: null;
}

// design.md "Where the settled policies live in code" (eligibility gate
// applies to "all four add/reactivate use cases") + community-assignments
// spec.md "Technician Deactivation and Reactivation", "Reactivation
// rejected for a soft-deleted user". Unlike
// ReactivateRepresentativeUseCase, there is no exclusivity swap and no
// transactional() wrap, and the result never carries a warning field
// (tasks.md 9.3).
@Injectable()
export class ReactivateTechnicianUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly technicianRepository: CommunityTechnicianRepository,
  ) {}

  async execute(
    input: ReactivateTechnicianInput,
  ): Promise<ReactivateTechnicianResult> {
    const existing = await this.technicianRepository.findByCommunityAndUser(
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

    assertEligibleFor(user.role, 'TECHNICIAN');

    await this.technicianRepository.setDeactivatedAt(
      input.communityId,
      input.userId,
      null,
    );

    return {
      communityId: input.communityId,
      userId: input.userId,
      deactivatedAt: null,
    };
  }
}
