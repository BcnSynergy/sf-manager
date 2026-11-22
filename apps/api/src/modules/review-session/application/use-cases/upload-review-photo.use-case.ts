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
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import {
  ReviewPhotoLimitReachedError,
  ReviewPhotoTooLargeError,
  UnsupportedReviewPhotoFormatError,
} from '../../domain/errors/review-photo.errors';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import {
  REVIEW_PHOTO_MAX_BYTES,
  REVIEW_PHOTOS_PER_ELEMENT_MAX,
  isJpegPhoto,
  reviewPhotoKey,
} from '../../domain/review-photo';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';

export interface UploadReviewPhotoResult {
  id: string;
  createdAt: Date;
}

// EN-164 S1-S3: the performer attaches a JPEG of at most 2 MiB to an element
// of a draft session, up to 3 per element. Reached through SessionAccess
// (performer + scope; existence is the secret). The file is stored first and
// the row second, so a row never points at a missing file; any failure after
// the put deletes the file again. The 3-photo limit and the draft check are
// the repository's, under the session row lock.
@Injectable()
export class UploadReviewPhotoUseCase {
  private readonly logger = new Logger(UploadReviewPhotoUseCase.name);

  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    sessionId: string,
    elementId: string,
    content: Buffer,
    actor: Actor,
  ): Promise<UploadReviewPhotoResult> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    // Same domain guard record-entry uses: only a draft is editable.
    if (session.status !== 'draft') {
      throw new ReviewSessionNotEditableError();
    }

    // Same scoping as RecordEntryUseCase: the element must be reviewable in
    // this session's community and element type; every miss is one 404.
    const template = await this.templateRepository.findFrozenWithSnapshot(
      session.templateId,
    );
    if (!template) {
      throw new ActiveTemplateNotFoundError();
    }
    const element = await this.elementRepository.findReviewableById(
      session.communityId,
      template.elementType,
      elementId,
    );
    if (!element) {
      throw new InspectableElementNotFoundError();
    }

    if (content.length > REVIEW_PHOTO_MAX_BYTES) {
      throw new ReviewPhotoTooLargeError();
    }
    if (!isJpegPhoto(content)) {
      throw new UnsupportedReviewPhotoFormatError();
    }

    const id = this.idGenerator.generate();
    const createdAt = new Date();
    const storageKey = reviewPhotoKey(id);

    await this.fileStorage.put(storageKey, content);
    let outcome;
    try {
      outcome = await this.photoRepository.addToDraft(
        {
          id,
          reviewSessionId: session.id,
          inspectableElementId: elementId,
          storageKey,
          sizeBytes: content.length,
          createdAt,
        },
        REVIEW_PHOTOS_PER_ELEMENT_MAX,
      );
    } catch (error) {
      await this.deleteQuietly(storageKey);
      throw error;
    }

    if (outcome === 'added') {
      return { id, createdAt };
    }
    await this.deleteQuietly(storageKey);
    if (outcome === 'limit_reached') {
      throw new ReviewPhotoLimitReachedError();
    }
    throw new ReviewSessionNotEditableError();
  }

  // A file left behind costs disk space, not correctness: a failed cleanup
  // is logged and never replaces the real error.
  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.fileStorage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete review photo file ${key}: ${(error as Error).message}`,
      );
    }
  }
}
