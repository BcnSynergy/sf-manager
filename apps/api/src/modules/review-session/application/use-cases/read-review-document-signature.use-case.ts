import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { signatureContentTypeForKey } from '../../../reviewer-signature/domain/reviewer-signature';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

export interface ReviewDocumentSignature {
  content: Buffer;
  contentType: string;
}

// reviewer-signature T3, review-document "The Document Carries the Session
// Signature": the same scope gate as ReadReviewDocumentUseCase FIRST, so a
// caller who cannot open the document gets the same 404 and no file is
// read. Serves the session's own copy, never the performer's current
// signature. Resolves null when the session has no copy (signed before the
// signature existed) or its file is gone.
@Injectable()
export class ReadReviewDocumentSignatureUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<ReviewDocumentSignature | null> {
    const session = await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );
    const key = session.signatureStorageKey;
    const contentType = key ? signatureContentTypeForKey(key) : null;
    if (!key || !contentType) return null;

    const content = await this.fileStorage.get(key);
    return content ? { content, contentType } : null;
  }
}
