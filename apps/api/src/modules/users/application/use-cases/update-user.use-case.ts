import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
import { Role } from '../../domain/role';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

export interface UpdateUserInput {
  id: string;
  email?: string;
  role?: Role;
}

export interface UpdateUserResult {
  id: string;
  email: string;
  role: Role;
}

// design.md Data Flow (PATCH /users/:id) + Decision 3. Last-Admin Lockout
// only applies when the change actually moves a SYSTEM_ADMIN user away from
// that role (spec.md "Last-Admin Lockout") — every other update runs a
// single updateById() with no transaction overhead.
@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserResult> {
    const { id, ...changes } = input;

    // Same default deletedAt: null filter as findByEmail — a non-existent
    // or soft-deleted id both 404 identically (spec.md "Update targets a
    // non-existent user").
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new UserNotFoundError();
    }

    const isDemotingFromSystemAdmin =
      existing.role === 'SYSTEM_ADMIN' &&
      changes.role !== undefined &&
      changes.role !== 'SYSTEM_ADMIN';

    if (isDemotingFromSystemAdmin) {
      // SERIALIZABLE (adapter, PR 6): the mutation and the re-count run
      // inside the same transaction so two concurrent demotions of two
      // different admins can't both observe "one admin left" (design.md
      // Decision 3 — write skew).
      await this.userRepository.transactional(async (repo) => {
        await repo.updateById(id, changes);
        const remainingAdmins = await repo.countActiveByRole('SYSTEM_ADMIN');
        assertSystemAdminRemains(remainingAdmins); // throws -> caller rolls back
      });
    } else {
      await this.userRepository.updateById(id, changes);
    }

    return {
      id: existing.id,
      email: changes.email ?? existing.email,
      role: changes.role ?? existing.role,
    };
  }
}
