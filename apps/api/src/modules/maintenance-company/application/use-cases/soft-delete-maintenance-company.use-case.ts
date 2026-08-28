import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { assertNoActiveUsersAttached } from '../../domain/maintenance-company-deletion.policy';
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

    await this.maintenanceCompanyRepository.softDeleteById(id);
  }
}
