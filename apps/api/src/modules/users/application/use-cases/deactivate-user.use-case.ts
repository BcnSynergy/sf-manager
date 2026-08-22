import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

// design.md Data Flow (DELETE /users/:id) + Decision 3. Last-Admin Lockout
// only applies when the target is an active SYSTEM_ADMIN (spec.md
// "Last-Admin Lockout") — deactivating any other user runs a single
// softDeleteById() with no transaction overhead.
@Injectable()
export class DeactivateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(id: string): Promise<void> {
    // Same default deletedAt: null filter as findByEmail — a non-existent
    // or already-deactivated id both 404 identically.
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new UserNotFoundError();
    }

    if (existing.role === 'SYSTEM_ADMIN') {
      // SERIALIZABLE (adapter, PR 6): the mutation and the re-count run
      // inside the same transaction so two concurrent deactivations of two
      // different admins can't both observe "one admin left" (design.md
      // Decision 3 — write skew).
      await this.userRepository.transactional(async (repo) => {
        await repo.softDeleteById(id);
        const remainingAdmins = await repo.countActiveByRole('SYSTEM_ADMIN');
        assertSystemAdminRemains(remainingAdmins); // throws -> caller rolls back
      });
    } else {
      await this.userRepository.softDeleteById(id);
    }
  }
}
