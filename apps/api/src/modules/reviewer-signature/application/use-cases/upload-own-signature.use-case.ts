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
  SignatureTooLargeError,
  UnsupportedSignatureFormatError,
} from '../../domain/errors/reviewer-signature.errors';
import {
  SIGNATURE_DIRECTORY,
  SIGNATURE_MAX_BYTES,
  detectSignatureFormat,
} from '../../domain/reviewer-signature';
import {
  REVIEWER_SIGNATURE_REPOSITORY,
  type ReviewerSignatureRepository,
} from '../ports/reviewer-signature.repository.port';
import type { OwnSignatureStatus } from './get-own-signature-status.use-case';

// reviewer-signature, "Upload the Own Signature". Same order as the
// organization logo upload: store under a fresh key, record the key, then
// delete the previous file. A failure at any step leaves the user pointing
// at a complete file; the worst outcome is an orphaned file.
@Injectable()
export class UploadOwnSignatureUseCase {
  private readonly logger = new Logger(UploadOwnSignatureUseCase.name);

  constructor(
    @Inject(REVIEWER_SIGNATURE_REPOSITORY)
    private readonly repository: ReviewerSignatureRepository,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(userId: string, content: Buffer): Promise<OwnSignatureStatus> {
    if (content.length > SIGNATURE_MAX_BYTES) {
      throw new SignatureTooLargeError();
    }
    const format = detectSignatureFormat(content);
    if (!format) throw new UnsupportedSignatureFormatError();

    const previous = (await this.repository.findByUserId(userId))?.storageKey;
    const key = `${SIGNATURE_DIRECTORY}/${this.idGenerator.generate()}.${format.extension}`;

    await this.fileStorage.put(key, content);
    let updatedAt: Date;
    try {
      ({ updatedAt } = await this.repository.save(userId, key));
    } catch (error) {
      await this.deleteQuietly(key);
      throw error;
    }

    if (previous) await this.deleteQuietly(previous);
    return { hasSignature: true, updatedAt };
  }

  // A file left behind costs disk space, not correctness, so a failed
  // cleanup is logged and never fails the upload.
  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.fileStorage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete signature file ${key}: ${(error as Error).message}`,
      );
    }
  }
}
