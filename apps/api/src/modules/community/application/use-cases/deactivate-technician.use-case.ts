import { Inject, Injectable } from '@nestjs/common';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../ports/community-technician.repository.port';

export interface DeactivateTechnicianInput {
  communityId: string;
  userId: string;
}

// tasks.md 9.3 — a single-row mutation with no exclusivity side effect (no
// other row is affected), mirroring DeactivateRepresentativeUseCase minus
// the transactional() distinction (technicians never needed it in the first
// place).
@Injectable()
export class DeactivateTechnicianUseCase {
  constructor(
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly technicianRepository: CommunityTechnicianRepository,
  ) {}

  async execute(input: DeactivateTechnicianInput): Promise<void> {
    const existing = await this.technicianRepository.findByCommunityAndUser(
      input.communityId,
      input.userId,
    );
    if (!existing) {
      throw new AssignmentNotFoundError();
    }

    await this.technicianRepository.setDeactivatedAt(
      input.communityId,
      input.userId,
      new Date(),
    );
  }
}
