import { Inject, Injectable } from '@nestjs/common';
import { OrganizationProfile } from '../../domain/organization-profile.entity';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  type OrganizationProfileRepository,
} from '../ports/organization-profile.repository.port';

// design.md Decision 1 + Data Flow: no branch — the port never resolves to
// null, so there is nothing to check before returning the repository's
// result.
@Injectable()
export class GetOrganizationProfileUseCase {
  constructor(
    @Inject(ORGANIZATION_PROFILE_REPOSITORY)
    private readonly organizationProfileRepository: OrganizationProfileRepository,
  ) {}

  execute(): Promise<OrganizationProfile> {
    return this.organizationProfileRepository.get();
  }
}
