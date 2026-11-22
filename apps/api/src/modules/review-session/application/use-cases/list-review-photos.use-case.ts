import { Inject, Injectable } from '@nestjs/common';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

export interface ReviewPhotoSummary {
  id: string;
  createdAt: Date;
}

// EN-164 S1/S3: the photos of one element in a session the actor performs,
// in any session status. No element check: a photo can only be added to an
// element reviewable in the session, so any other id simply has none, and a
// completed session's photos stay listable after their element is
// deactivated or deleted.
// Id and creation time only: the storage key never leaves the API.
@Injectable()
export class ListReviewPhotosUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
  ) {}

  async execute(
    sessionId: string,
    elementId: string,
    actor: Actor,
  ): Promise<ReviewPhotoSummary[]> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    const photos = await this.photoRepository.listForElement(
      session.id,
      elementId,
    );
    return photos.map((photo) => ({
      id: photo.id,
      createdAt: photo.createdAt,
    }));
  }
}
