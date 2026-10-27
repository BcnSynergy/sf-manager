import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { logoContentTypeForKey } from '../../domain/organization-logo';
import type {
  OrganizationLogo,
  OrganizationLogoReader,
} from '../ports/organization-logo.reader.port';
import {
  ORGANIZATION_PROFILE_READER,
  type OrganizationProfileReader,
} from '../ports/organization-profile.reader.port';

// organization-logo S3: the browser reads the logo through the API, never
// from a static path, so the URL stays the same whatever stores the bytes.
// Resolves null when there is no logo to show: none uploaded, or a recorded
// key whose file is gone.
@Injectable()
export class GetOrganizationLogoUseCase implements OrganizationLogoReader {
  constructor(
    @Inject(ORGANIZATION_PROFILE_READER)
    private readonly organizationProfileReader: OrganizationProfileReader,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(): Promise<OrganizationLogo | null> {
    const key = (await this.organizationProfileReader.get()).logoAssetId;
    if (!key) return null;

    const contentType = logoContentTypeForKey(key);
    const content = contentType ? await this.fileStorage.get(key) : null;
    if (!contentType || !content) return null;

    return { content, contentType };
  }
}
