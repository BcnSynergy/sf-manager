import { Inject, Injectable } from '@nestjs/common';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';
import { assertElementReviewable } from '../services/assert-element-reviewable';
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
// in any session status. The element must be reviewable in the session, as
// for an upload.
// Id and creation time only: the storage key never leaves the API.
@Injectable()
export class ListReviewPhotosUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
  ) {}

  async execute(
    sessionId: string,
    elementId: string,
    actor: Actor,
  ): Promise<ReviewPhotoSummary[]> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    await assertElementReviewable(
      this.templateRepository,
      this.elementRepository,
      session,
      elementId,
    );
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
