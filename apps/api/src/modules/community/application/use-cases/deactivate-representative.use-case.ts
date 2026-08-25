import { Inject, Injectable } from '@nestjs/common';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../ports/community-representative.repository.port';

export interface DeactivateRepresentativeInput {
  communityId: string;
  userId: string;
}

// tasks.md 6.3 — a single-row mutation with no exclusivity side effect (no
// other row is affected), so no transactional() wrap is needed, mirroring
// DeactivateUserUseCase's non-admin branch.
@Injectable()
export class DeactivateRepresentativeUseCase {
  constructor(
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
  ) {}

  async execute(input: DeactivateRepresentativeInput): Promise<void> {
    const existing = await this.representativeRepository.findByCommunityAndUser(
      input.communityId,
      input.userId,
    );
    if (!existing) {
      throw new AssignmentNotFoundError();
    }

    await this.representativeRepository.setDeactivatedAt(
      input.communityId,
      input.userId,
      new Date(),
    );
  }
}
