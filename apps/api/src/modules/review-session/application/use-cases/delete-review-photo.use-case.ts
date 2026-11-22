import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { ReviewPhotoNotFoundError } from '../../domain/errors/review-photo.errors';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

// EN-164 S3: the performer removes a photo while the session is a draft.
// The row goes first (under the session row lock, draft only), the file
// after; a failed file delete is logged, never thrown.
@Injectable()
export class DeleteReviewPhotoUseCase {
  private readonly logger = new Logger(DeleteReviewPhotoUseCase.name);

  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
  ) {}

  async execute(
    sessionId: string,
    photoId: string,
    actor: Actor,
  ): Promise<void> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    const result = await this.photoRepository.deleteFromDraft(
      session.id,
      photoId,
    );
    if (result.outcome === 'not_editable') {
      throw new ReviewSessionNotEditableError();
    }
    if (result.outcome === 'not_found') {
      throw new ReviewPhotoNotFoundError();
    }
    try {
      await this.fileStorage.delete(result.storageKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete review photo file ${result.storageKey}: ${(error as Error).message}`,
      );
    }
  }
}
