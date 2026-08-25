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
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../ports/community-technician.repository.port';

export interface AddTechnicianInput {
  communityId: string;
  userId: string;
}

export interface AddTechnicianResult {
  communityId: string;
  userId: string;
  deactivatedAt: null;
}

// design.md Data Flow (mirrors POST /communities/:id/representatives, minus
// the exclusivity swap and the multi-community warning — tasks.md 9.2):
// eligibility gate, then a plain insert. No transactional() wrap, since no
// other row is ever affected by adding a technician.
// community-assignments spec.md "Add Technician — Eligibility Gate, No
// Exclusivity".
@Injectable()
export class AddTechnicianUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly technicianRepository: CommunityTechnicianRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: AddTechnicianInput): Promise<AddTechnicianResult> {
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

    assertEligibleFor(user.role, 'TECHNICIAN');

    // Plain insert, no exclusivity swap and no transaction: any number of
    // technicians can be active in the same community, and this technician
    // can be active in any number of communities (design.md Interfaces).
    // create() rejects with AssignmentAlreadyExistsError if the
    // (communityId, userId) pair already has a record.
    await this.technicianRepository.create(
      new CommunityTechnician({
        id: this.idGenerator.generate(),
        communityId: input.communityId,
        userId: input.userId,
        deactivatedAt: null,
      }),
    );

    return {
      communityId: input.communityId,
      userId: input.userId,
      deactivatedAt: null,
    };
  }
}
