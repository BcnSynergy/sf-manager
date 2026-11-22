import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';

// spec.md "Discard a Draft Session": hard delete of the ReviewSession row
// (design.md Interfaces/Contracts — no deletedAt exists on this table),
// WHERE status='draft'; false => 409 REVIEW_SESSION_NOT_EDITABLE. Reached
// exclusively through SessionAccess (Decision 4, Layer 3) — only the
// opener, in scope, may discard. The domain-layer `session.discard()` guard
// runs first (Decision 8) as the primary immutability enforcement; the
// photo repository's own locked `WHERE status='draft'` delete is the
// concurrency backstop for a lost race (it also owns the session delete, so
// the photo keys are read under the same lock).
//
// EN-164 S4: the photo rows go with the session (ON DELETE CASCADE); their
// files are deleted here, after the discard committed, from the keys the
// repository read under the same lock. A failed file delete is logged, never thrown.
@Injectable()
export class DiscardReviewSessionUseCase {
  private readonly logger = new Logger(DiscardReviewSessionUseCase.name);

  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
  ) {}

  async execute(sessionId: string, actor: Actor): Promise<void> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    session.discard();

    // Keys are read and the session deleted in one transaction under the
    // session row lock, so no photo committed before the delete is missed.
    const result =
      await this.photoRepository.discardDraftWithPhotoKeys(sessionId);
    if (result.outcome !== 'discarded') {
      throw new ReviewSessionNotEditableError();
    }

    for (const key of result.storageKeys) {
      try {
        await this.fileStorage.delete(key);
      } catch (error) {
        this.logger.warn(
          `Could not delete review photo file ${key}: ${(error as Error).message}`,
        );
      }
    }
  }
}
