import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  LogoTooLargeError,
  UnsupportedLogoFormatError,
} from '../../domain/errors/organization-logo.errors';
import {
  LOGO_MAX_BYTES,
  detectLogoFormat,
} from '../../domain/organization-logo';
import { OrganizationProfile } from '../../domain/organization-profile.entity';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  type OrganizationProfileRepository,
} from '../ports/organization-profile.repository.port';

// organization-logo S1-S3: every upload is stored under a fresh key, then
// the key is recorded on the profile, then the previous file is deleted.
// Never overwriting in place means a failure at any step leaves the profile
// pointing at a complete file. The worst outcome of a crash or of two
// concurrent uploads is an orphaned file, never a profile pointing at a
// missing or deleted one: keys are unique, so no upload can delete the key
// another upload just recorded.
@Injectable()
export class UploadOrganizationLogoUseCase {
  private readonly logger = new Logger(UploadOrganizationLogoUseCase.name);

  constructor(
    @Inject(ORGANIZATION_PROFILE_REPOSITORY)
    private readonly organizationProfileRepository: OrganizationProfileRepository,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(content: Buffer): Promise<OrganizationProfile> {
    if (content.length > LOGO_MAX_BYTES) throw new LogoTooLargeError();
    const format = detectLogoFormat(content);
    if (!format) throw new UnsupportedLogoFormatError();

    const previous = (await this.organizationProfileRepository.get())
      .logoAssetId;
    const key = `logos/${this.idGenerator.generate()}.${format.extension}`;

    await this.fileStorage.put(key, content);
    let profile: OrganizationProfile;
    try {
      profile = await this.organizationProfileRepository.setLogoAssetId(key);
    } catch (error) {
      await this.deleteQuietly(key);
      throw error;
    }

    if (previous) await this.deleteQuietly(previous);
    return profile;
  }

  // A file left behind costs disk space, not correctness, so a failed
  // cleanup is logged and never fails the upload.
  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.fileStorage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete logo file ${key}: ${(error as Error).message}`,
      );
    }
  }
}
