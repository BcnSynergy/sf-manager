import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '../../../users/domain/role';
import type { CommunityScopeChecker } from '../../../../shared/application/authorization/community-scope.checker.port';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from '../../application/ports/community-representative.repository.port';
import type { CommunityRepresentativeRepository } from '../../application/ports/community-representative.repository.port';
import { COMMUNITY_TECHNICIAN_REPOSITORY } from '../../application/ports/community-technician.repository.port';
import type { CommunityTechnicianRepository } from '../../application/ports/community-technician.repository.port';

// Adapter for CommunityScopeChecker (design.md Decision 4, Layer 2).
// Fail-closed and EXHAUSTIVE on Role via a switch. The default branch
// exists only to fail closed at runtime against an out-of-union value (see
// below) — `role satisfies never` inside it still fails the build if a 6th
// role is added without a matching case above, the same way
// ROLE_PERMISSIONS forces every role to be considered (authorization spec
// "The scope check cannot be silently omitted"). Only the two performing
// roles have an
// assignment kind at all; SYSTEM_ADMIN, MANAGER and
// MAINTENANCE_COMPANY_MANAGER hold no community assignment concept and
// always refuse here, regardless of what either repository contains for
// that user/community — they never even reach a repository call.
//
// Reuses the SAME `findByCommunityAndUser` each assignment use case already
// calls — no new repository method, no cache — so deactivating an
// assignment revokes access on the caller's very next request
// (authorization spec "Deactivating an assignment removes access on the
// next request").
@Injectable()
export class AssignmentCommunityScopeChecker implements CommunityScopeChecker {
  constructor(
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly technicianRepository: CommunityTechnicianRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
  ) {}

  async isAssignedTo(
    userId: string,
    role: Role,
    communityId: string,
  ): Promise<boolean> {
    switch (role) {
      case 'MAINTENANCE_TECHNICIAN': {
        const assignment =
          await this.technicianRepository.findByCommunityAndUser(
            communityId,
            userId,
          );
        return assignment !== null && assignment.deactivatedAt === null;
      }
      case 'COMMUNITY_REPRESENTATIVE': {
        const assignment =
          await this.representativeRepository.findByCommunityAndUser(
            communityId,
            userId,
          );
        return assignment !== null && assignment.deactivatedAt === null;
      }
      // No assignment kind exists for these roles — fail closed.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
      case 'MAINTENANCE_COMPANY_MANAGER':
        return false;
      default: {
        // `role` comes from a JWT claim with no runtime enum validation, so
        // an out-of-union value can reach here despite the switch being
        // exhaustive at compile time. Fail closed at runtime too — the
        // `satisfies never` check still forces a compile error if a 6th
        // Role is added without a matching case above.
        role satisfies never;
        return false;
      }
    }
  }

  // review-history design.md Decision 2 — same fail-closed exhaustive
  // dispatch as isAssignedTo, re-read on every call (no cache), reusing the
  // shipped findActiveByUser on both assignment ports. Only the two
  // performing roles have an assignment kind at all.
  async listAssignedCommunityIds(
    userId: string,
    role: Role,
  ): Promise<string[]> {
    switch (role) {
      case 'MAINTENANCE_TECHNICIAN': {
        const assignments =
          await this.technicianRepository.findActiveByUser(userId);
        return assignments.map((assignment) => assignment.communityId);
      }
      case 'COMMUNITY_REPRESENTATIVE': {
        const assignments =
          await this.representativeRepository.findActiveByUser(userId);
        return assignments.map((assignment) => assignment.communityId);
      }
      // No assignment kind exists for these roles — fail closed.
      case 'SYSTEM_ADMIN':
      case 'MANAGER':
      case 'MAINTENANCE_COMPANY_MANAGER':
        return [];
      default: {
        // Same runtime fail-closed backstop as isAssignedTo above.
        role satisfies never;
        return [];
      }
    }
  }
}
