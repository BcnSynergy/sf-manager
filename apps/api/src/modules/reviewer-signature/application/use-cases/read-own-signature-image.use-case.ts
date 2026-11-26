import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import {
  type SignatureFormatInfo,
  signatureContentTypeForKey,
} from '../../domain/reviewer-signature';
import {
  REVIEWER_SIGNATURE_REPOSITORY,
  type ReviewerSignatureRepository,
} from '../ports/reviewer-signature.repository.port';

export interface SignatureImage {
  content: Buffer;
  contentType: SignatureFormatInfo['contentType'];
}

// reviewer-signature, "Read the Own Signature Image": the caller's own
// signature only, by their user id; null when none is recorded or its file
// is gone.
@Injectable()
export class ReadOwnSignatureImageUseCase {
  constructor(
    @Inject(REVIEWER_SIGNATURE_REPOSITORY)
    private readonly repository: ReviewerSignatureRepository,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(userId: string): Promise<SignatureImage | null> {
    const key = (await this.repository.findByUserId(userId))?.storageKey;
    if (!key) return null;

    const contentType = signatureContentTypeForKey(key);
    const content = contentType ? await this.fileStorage.get(key) : null;
    if (!contentType || !content) return null;
    return { content, contentType };
  }
}
