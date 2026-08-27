import { Inject, Injectable } from '@nestjs/common';
import { InvalidMaintenanceCompanyAssignmentError } from '../../domain/errors/invalid-maintenance-company-assignment.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
import {
  assertCompanyMatchesRole,
  isMaintenanceRole,
} from '../../domain/maintenance-company-assignment.policy';
import { Role } from '../../domain/role';
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../ports/maintenance-company-lookup.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../ports/user.repository.port';

export interface UpdateUserInput {
  id: string;
  email?: string;
  role?: Role;
  maintenanceCompanyId?: string;
}

export interface UpdateUserResult {
  id: string;
  email: string;
  role: Role;
  maintenanceCompanyId: string | null;
}

// design.md Data Flow (PATCH /users/:id) + Decision 3. Last-Admin Lockout
// only applies when the change actually moves a SYSTEM_ADMIN user away from
// that role (spec.md "Last-Admin Lockout") — every other update runs a
// single updateById() with no transaction overhead.
// maintenance-company design.md Decision 5 + spec.md "Grandfathered
// Maintenance-Role Users" (OQ2, the stricter direction design.md's
// "Handoff to sdd-spec" anticipated).
@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAINTENANCE_COMPANY_LOOKUP)
    private readonly companyLookup: MaintenanceCompanyLookup,
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

    const resultingRole = changes.role ?? existing.role;
    const resultingCompanyId =
      changes.maintenanceCompanyId !== undefined
        ? changes.maintenanceCompanyId
        : existing.maintenanceCompanyId;

    // spec.md "Grandfathered Maintenance-Role Users Without a Company"
    // (OQ2): evaluated against the RESULTING state on every PATCH,
    // regardless of which field(s) this request touches — a maintenance-
    // role user can never be left (or created) without a live company by
    // any edit, not just ones that touch role/maintenanceCompanyId
    // directly.
    if (isMaintenanceRole(resultingRole) && resultingCompanyId === null) {
      throw new InvalidMaintenanceCompanyAssignmentError(resultingRole, null);
    }

    if (changes.maintenanceCompanyId !== undefined) {
      // NOT_ALLOWED stays payload-scoped (design.md Decision 5): only
      // evaluated when THIS request itself supplies a maintenanceCompanyId
      // for a non-maintenance resulting role. `resultingCompanyId` is
      // non-null here (it equals `changes.maintenanceCompanyId`), so this
      // can only ever surface the NOT_ALLOWED shape, never REQUIRED.
      assertCompanyMatchesRole(resultingRole, changes.maintenanceCompanyId);
    }

    // Liveness is scoped to the RESULTING state, not to whether this
    // request's payload happens to supply maintenanceCompanyId. A bare
    // demotion away from a maintenance role is excluded here because the
    // outer condition requires isMaintenanceRole(resultingRole) — a stale
    // company id on a demoted user is left untouched, never rejected. But
    // a PATCH that re-promotes a user back into a maintenance role while
    // inheriting an existing maintenanceCompanyId (this request doesn't
    // supply one) must still be checked: that inherited id can point at a
    // company that was soft-deleted after it was originally assigned.
    if (isMaintenanceRole(resultingRole) && resultingCompanyId !== null) {
      const isLive = await this.companyLookup.existsActive(resultingCompanyId);
      if (!isLive) {
        throw new MaintenanceCompanyNotFoundError();
      }
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
      role: resultingRole,
      maintenanceCompanyId: resultingCompanyId,
    };
  }
}
