import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '../../domain/role';
import type { CompanyScopeChecker } from '../../../../shared/application/authorization/company-scope.checker.port';
import { USER_REPOSITORY } from '../../application/ports/user.repository.port';
import type { UserRepository } from '../../application/ports/user.repository.port';

// Adapter for CompanyScopeChecker (design.md Decision 3/4, Layer 2).
// Fail-closed and EXHAUSTIVE on Role via a switch, mirroring
// AssignmentCommunityScopeChecker's shape exactly. Only
// MAINTENANCE_COMPANY_MANAGER ever resolves to a non-null company — a
// MAINTENANCE_TECHNICIAN has a `maintenanceCompanyId` too, and it
// deliberately grants nothing here (that association is a data fact, read
// through the separate, non-authorizing `UserDirectory` port instead).
//
// Reuses USER_REPOSITORY.findById, which already applies the default
// `deletedAt: null` filter (ADR-010, SoftDeletableRepository) — a
// soft-deleted manager resolves to `null` here for free, with no extra
// check in this class. No cache, re-read on every call — detaching a
// manager from their company or soft-deleting them revokes their history
// scope on the very next request, the same contract CommunityScopeChecker
// already established.
@Injectable()
export class UserCompanyScopeChecker implements CompanyScopeChecker {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async resolveCompanyScope(
    userId: string,
    role: Role,
  ): Promise<string | null> {
    switch (role) {
      case 'MAINTENANCE_COMPANY_MANAGER': {
        const user = await this.userRepository.findById(userId);
        return user?.maintenanceCompanyId ?? null;
      }
      // No company-wide scope exists for these roles — fail closed. A
      // MAINTENANCE_TECHNICIAN's own maintenanceCompanyId is deliberately
      // never consulted here.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
      case 'MAINTENANCE_TECHNICIAN':
      case 'COMMUNITY_REPRESENTATIVE':
        return null;
      default: {
        // `role` comes from a JWT claim with no runtime enum validation, so
        // an out-of-union value can reach here despite the switch being
        // exhaustive at compile time. Fail closed at runtime too — the
        // `satisfies never` check still forces a compile error if a 6th
        // Role is added without a matching case above.
        role satisfies never;
        return null;
      }
    }
  }
}
