import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { assertNoActiveUsersAttached } from '../../domain/maintenance-company-deletion.policy';
import { MaintenanceCompanyHasActiveUsersError } from '../../domain/errors/maintenance-company-has-active-users.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../ports/maintenance-company.repository.port';

// design.md Data Flow — DELETE /maintenance-companies/:id +
// maintenance-company-management spec.md "Refuse Delete While Active Users
// Attached": findById (404) -> countActiveByMaintenanceCompany (via the
// `users`-owned UserRepository, injected here mirroring CommunityModule's
// USER_REPOSITORY precedent, design.md Decision 4) -> assertNoActiveUsers
// Attached [pure domain policy] -> softDeleteById. The check precedes the
// write — the inversion vs. SoftDeleteCommunityUseCase is deliberate
// (design.md: "no user is modified by the attempt" also implies "no company
// is modified").
//
// design.md Decision 4 addendum (Phase 8, closing the PR7-documented
// cross-repo race): this read-time check is now only the fast path / an
// accurate error message. The actual guarantee is enforced atomically by
// PrismaMaintenanceCompanyRepository.softDeleteById's single UPDATE + NOT
// EXISTS guard. If a user is concurrently attached between the check above
// and the write below, softDeleteById returns `false` and this use case
// re-checks to report the precise cause instead of silently succeeding.
@Injectable()
export class SoftDeleteMaintenanceCompanyUseCase {
  constructor(
    @Inject(MAINTENANCE_COMPANY_REPOSITORY)
    private readonly maintenanceCompanyRepository: MaintenanceCompanyRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.maintenanceCompanyRepository.findById(id);
    if (!existing) {
      throw new MaintenanceCompanyNotFoundError();
    }

    const activeUserCount =
      await this.userRepository.countActiveByMaintenanceCompany(id);
    assertNoActiveUsersAttached(activeUserCount);

    const wasDeleted = await this.maintenanceCompanyRepository.softDeleteById(
      id,
    );
    if (!wasDeleted) {
      // Extremely rare: the atomic UPDATE found the invariant violated at
      // write time even though the read-time check above passed — a user
      // was concurrently attached between the check and the write. This is
      // exactly the PR7-documented race, now closed: the write is
      // authoritative and simply refuses in this case instead of silently
      // succeeding. Re-check to give an accurate error.
      const currentActiveUserCount =
        await this.userRepository.countActiveByMaintenanceCompany(id);
      if (currentActiveUserCount > 0) {
        throw new MaintenanceCompanyHasActiveUsersError(
          currentActiveUserCount,
        );
      }
      // Company vanished between the read-time check and the write (e.g.
      // concurrently soft-deleted by another request) — same 404 semantics
      // as the initial findById check (ADR-010: soft-deleted resolves to
      // "no such company").
      throw new MaintenanceCompanyNotFoundError();
    }
  }
}
