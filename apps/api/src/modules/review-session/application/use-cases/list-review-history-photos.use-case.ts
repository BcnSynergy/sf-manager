import { Inject, Injectable } from '@nestjs/common';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

export interface ReviewHistoryPhotoSummary {
  id: string;
  inspectableElementId: string;
  createdAt: Date;
}

// EN-164 S3/S5 (T3): every photo of a completed review, for whoever may read
// that review in the history. The same gate as the history detail read
// (loadCompletedForActor) runs first, so a caller who cannot open the review
// gets the same 404 and no photo is read. The storage key never leaves the
// API.
@Injectable()
export class ListReviewHistoryPhotosUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<ReviewHistoryPhotoSummary[]> {
    const session = await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );
    const photos = await this.photoRepository.listForSession(session.id);
    return photos.map((photo) => ({
      id: photo.id,
      inspectableElementId: photo.inspectableElementId,
      createdAt: photo.createdAt,
    }));
  }
}
