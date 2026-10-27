import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { OrganizationProfile } from '../../domain/organization-profile.entity';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  type OrganizationProfileRepository,
} from '../ports/organization-profile.repository.port';

// EN-110: the key is cleared first and the file deleted after, the same
// order as a replacing upload, so a failure never leaves the profile
// pointing at a deleted file; the worst outcome is an orphaned file.
// Removing when there is no logo succeeds and changes nothing.
@Injectable()
export class RemoveOrganizationLogoUseCase {
  private readonly logger = new Logger(RemoveOrganizationLogoUseCase.name);

  constructor(
    @Inject(ORGANIZATION_PROFILE_REPOSITORY)
    private readonly organizationProfileRepository: OrganizationProfileRepository,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(): Promise<OrganizationProfile> {
    const current = await this.organizationProfileRepository.get();
    if (!current.logoAssetId) return current;

    const profile =
      await this.organizationProfileRepository.setLogoAssetId(null);
    try {
      await this.fileStorage.delete(current.logoAssetId);
    } catch (error) {
      this.logger.warn(
        `Could not delete logo file ${current.logoAssetId}: ${(error as Error).message}`,
      );
    }
    return profile;
  }
}
