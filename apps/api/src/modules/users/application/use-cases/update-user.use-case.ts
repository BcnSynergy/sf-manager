import { Inject, Injectable } from '@nestjs/common';
import { InvalidMaintenanceCompanyAssignmentError } from '../../domain/errors/invalid-maintenance-company-assignment.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { assertSystemAdminRemains } from '../../domain/last-admin.policy';
import {
  assertCapabilitiesAllowedForRole,
  resolveManagerCapabilities,
} from '../../domain/manager-capability.policy';
import { ManagerCapability } from '../../domain/manager-capability';
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
  // review-history-manager-capability/design.md Decision 6: present only
  // when the request itself carries the field — absent means "not part of
  // this PATCH", an explicit `[]` is the revoke.
  managerCapabilities?: ManagerCapability[];
}

export interface UpdateUserResult {
  id: string;
  email: string;
  role: Role;
  maintenanceCompanyId: string | null;
  // Always the RESULTING truth (design.md Decision 5) — computed as
  // `resolved ?? existing.managerCapabilities`, never the raw resolution
  // output, so a plain email-only PATCH still reports the correct value.
  managerCapabilities: ManagerCapability[];
}

// design.md Data Flow (PATCH /users/:id) + Decision 3 + Decision 5.
// review-history-manager-capability/design.md Decision 5's transactional
// requirement: EVERY write that can touch role and/or managerCapabilities
// (i.e. essentially every PATCH, since almost every one can) now runs
// inside the same SERIALIZABLE transactional pattern previously reserved
// for the demote-a-SYSTEM_ADMIN path — `existing` is re-read INSIDE the
// transaction, and both the maintenance-company and manager-capability
// resulting-state checks run against that freshly-read snapshot, closing a
// race between two near-simultaneous PATCHes against the same user (e.g.
// one demoting away from MANAGER, one granting a capability) that a
// non-transactional read could otherwise interleave.
@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAINTENANCE_COMPANY_LOOKUP)
    private readonly companyLookup: MaintenanceCompanyLookup,
  ) {}

  async execute(input: UpdateUserInput): Promise<UpdateUserResult> {
    const { id, ...changes } = input;

    return this.userRepository.transactional(async (repo) => {
      // Re-read INSIDE the transaction (design.md Decision 5) — same
      // default deletedAt: null filter as findByEmail (a non-existent or
      // soft-deleted id both 404 identically, spec.md "Update targets a
      // non-existent user").
      const existing = await repo.findById(id);
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

      // review-history-manager-capability/design.md Decision 5: the
      // NOT_ALLOWED direction, evaluated against the RESULTING role — the
      // sole authority for the non-payload-decidable case (a capability set
      // with no `role` in the payload, resulting role non-MANAGER); the
      // schema (`updateUserSchema`) already rejects the payload-decidable
      // shape earlier in the pipe.
      assertCapabilitiesAllowedForRole(
        resultingRole,
        changes.managerCapabilities ?? [],
      );

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
        const isLive =
          await this.companyLookup.existsActive(resultingCompanyId);
        if (!isLive) {
          throw new MaintenanceCompanyNotFoundError();
        }
      }

      // design.md Decision 5's resolution table — reads BOTH `priorRole`
      // and `existing` from the SAME transactionally-fresh snapshot
      // `resultingRole` was computed against.
      const resolvedCapabilities = resolveManagerCapabilities(
        resultingRole,
        existing.role,
        changes.managerCapabilities,
        existing.managerCapabilities,
      );

      const isDemotingFromSystemAdmin =
        existing.role === 'SYSTEM_ADMIN' &&
        changes.role !== undefined &&
        changes.role !== 'SYSTEM_ADMIN';

      await repo.updateById(id, {
        ...changes,
        managerCapabilities: resolvedCapabilities,
      });

      if (isDemotingFromSystemAdmin) {
        // SERIALIZABLE: the mutation and the re-count run inside the same
        // transaction so two concurrent demotions of two different admins
        // can't both observe "one admin left" (design.md Decision 3 —
        // write skew). Throwing here rolls back the write above.
        const remainingAdmins = await repo.countActiveByRole('SYSTEM_ADMIN');
        assertSystemAdminRemains(remainingAdmins);
      }

      return {
        id: existing.id,
        email: changes.email ?? existing.email,
        role: resultingRole,
        maintenanceCompanyId: resultingCompanyId,
        managerCapabilities: [
          ...(resolvedCapabilities ?? existing.managerCapabilities),
        ],
      };
    });
  }
}
