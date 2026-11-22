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
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

// EN-164 S3: the bytes of one photo of a session the actor performs. An
// unknown photo, a photo of another session and a missing file are all one
// ReviewPhotoNotFoundError.
@Injectable()
export class ReadReviewPhotoUseCase {
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
  ): Promise<Buffer> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
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
