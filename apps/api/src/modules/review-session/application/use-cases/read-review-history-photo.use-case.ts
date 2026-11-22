import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { ReviewPhotoNotFoundError } from '../../domain/errors/review-photo.errors';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

// EN-164 S3 (T3): the bytes of one photo of a completed review the caller
// may read in the history. Same gate as the history detail read first; then
// an unknown photo, a photo of another session and a missing file are all
// one ReviewPhotoNotFoundError.
@Injectable()
export class ReadReviewHistoryPhotoUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
  ) {}

  async execute(
    sessionId: string,
    photoId: string,
    actor: Actor,
  ): Promise<Buffer> {
    const session = await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );
    const photo = await this.photoRepository.findInSession(session.id, photoId);
    if (!photo) {
      throw new ReviewPhotoNotFoundError();
    }
    const content = await this.fileStorage.get(photo.storageKey);
    if (!content) {
      throw new ReviewPhotoNotFoundError();
    }
    return content;
  }
}
