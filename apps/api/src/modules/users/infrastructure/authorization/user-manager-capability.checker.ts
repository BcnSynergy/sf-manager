import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '../../domain/role';
import type { ManagerCapability } from '../../domain/manager-capability';
import type { ManagerCapabilityChecker } from '../../../../shared/application/authorization/manager-capability.checker.port';
import { USER_REPOSITORY } from '../../application/ports/user.repository.port';
import type { UserRepository } from '../../application/ports/user.repository.port';

// Adapter for ManagerCapabilityChecker (design.md Decision 2, Layer 2).
// Fail-closed and EXHAUSTIVE on Role via a switch, mirroring
// UserCompanyScopeChecker's shape exactly. Only MANAGER ever resolves to
// `true`, and only when the persisted row both IS currently MANAGER and
// carries the requested capability.
//
// Reuses USER_REPOSITORY.findById, which already applies the default
// `deletedAt: null` filter (ADR-010, SoftDeletableRepository) — a
// soft-deleted manager resolves to `false` here for free, with no extra
// check in this class. No cache, re-read on every call.
@Injectable()
export class UserManagerCapabilityChecker implements ManagerCapabilityChecker {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async hasManagerCapability(
    userId: string,
    role: Role,
    capability: ManagerCapability,
  ): Promise<boolean> {
    switch (role) {
      case 'MANAGER': {
        const user = await this.userRepository.findById(userId);
        // The `role` PARAMETER is a JWT claim, stale for up to ADR-011's
        // accepted ~2h token lifetime. This re-checks the FRESHLY-READ
        // persisted row's own role, structurally closing the case where a
        // user was demoted out of MANAGER mid-token-lifetime but their JWT
        // still claims `role: 'MANAGER'` (design.md Decision 2).
        if (!user || user.role !== 'MANAGER') {
          return false;
        }
        return user.managerCapabilities.includes(capability);
      }
      // No capability exists for these roles — fail closed. The column is
      // meaningless for any role other than MANAGER (domain policy, PR 3).
      case 'SYSTEM_ADMIN':
      case 'MAINTENANCE_COMPANY_MANAGER':
      case 'MAINTENANCE_TECHNICIAN':
      case 'COMMUNITY_REPRESENTATIVE':
        return false;
      default: {
        // `role` comes from a JWT claim with no runtime enum validation, so
        // an out-of-union value can reach here despite the switch being
        // exhaustive at compile time. Fail closed at runtime too.
        role satisfies never;
        return false;
      }
    }
  }
}
