import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { sweepOrphanFiles } from '../../../../shared/application/orphan-file-sweep';
import { REVIEW_PHOTO_DIRECTORY } from '../../domain/review-photo';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-222): deletes every file under review-photos/ that no ReviewPhoto row
// references and that was stored more than an hour ago (sweepOrphanFiles).
// Such files are left by a process that stopped between storing a file and
// inserting its row, or by a file delete that failed after a photo delete or
// a discard (those are logged, never thrown). Rows of a discarded session are
// gone (ON DELETE CASCADE), so they keep nothing. Returns how many orphan
// files were deleted.
@Injectable()
export class SweepOrphanReviewPhotoFilesUseCase {
  private readonly logger = new Logger(SweepOrphanReviewPhotoFilesUseCase.name);

  constructor(
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    return sweepOrphanFiles(
      {
        directory: REVIEW_PHOTO_DIRECTORY,
        fileLabel: 'review photo',
        rowLabel: 'photo',
        findReferencedStorageKeys: (keys) =>
          this.photoRepository.findReferencedStorageKeys(keys),
        hasAnyRow: () => this.photoRepository.hasAnyPhoto(),
      },
      this.fileStorage,
      this.clock.now(),
      this.logger,
    );
  }
}
