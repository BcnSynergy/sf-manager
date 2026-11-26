import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { signatureFormatForKey } from '../../domain/reviewer-signature';
import type {
  OwnSignatureImage,
  OwnSignatureReader,
} from '../ports/own-signature.reader.port';
import {
  REVIEWER_SIGNATURE_REPOSITORY,
  type ReviewerSignatureRepository,
} from '../ports/reviewer-signature.repository.port';

export type SignatureImage = OwnSignatureImage;

// reviewer-signature, "Read the Own Signature Image": the caller's own
// signature only, by their user id; null when none is recorded or its file
// is gone.
//
// EN-112 pattern (as the organization logo read): a replacing upload records
// its new key and then deletes the old file, so a read that got the old key
// just before can find its file gone. When the file is missing, the key is
// read once more: if it changed, the new file is served; if not, the answer
// is null. One retry only.
@Injectable()
export class ReadOwnSignatureImageUseCase implements OwnSignatureReader {
  constructor(
    @Inject(REVIEWER_SIGNATURE_REPOSITORY)
    private readonly repository: ReviewerSignatureRepository,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(userId: string): Promise<SignatureImage | null> {
    const key = (await this.repository.findByUserId(userId))?.storageKey;
    if (!key) return null;

    const image = await this.read(key);
    if (image) return image;

    const current = (await this.repository.findByUserId(userId))?.storageKey;
    if (!current || current === key) return null;
    return this.read(current);
  }

  private async read(key: string): Promise<SignatureImage | null> {
    const format = signatureFormatForKey(key);
    const content = format ? await this.fileStorage.get(key) : null;
    if (!format || !content) return null;
    return {
      content,
      contentType: format.contentType,
      extension: format.extension,
    };
  }
}
