import { Inject, Injectable } from '@nestjs/common';
import { OrganizationProfile } from '../../domain/organization-profile.entity';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  type OrganizationProfileChanges,
  type OrganizationProfileRepository,
} from '../ports/organization-profile.repository.port';

// design.md Decision 3: no preliminary read — a single atomic UPDATE whose
// RETURNING row is the authoritative post-state. Mirrors
// UpdateMaintenanceCompanyUseCase's shape minus its findById/404 branch,
// which this singleton has no equivalent for (Decision 1).
@Injectable()
export class UpdateOrganizationProfileUseCase {
  constructor(
    @Inject(ORGANIZATION_PROFILE_REPOSITORY)
    private readonly organizationProfileRepository: OrganizationProfileRepository,
  ) {}

  execute(changes: OrganizationProfileChanges): Promise<OrganizationProfile> {
    return this.organizationProfileRepository.update(changes);
  }
}
