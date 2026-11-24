import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import { REVIEW_PHOTO_DIRECTORY } from '../../domain/review-photo';
import {
  REVIEW_PHOTO_REPOSITORY,
  type ReviewPhotoRepository,
} from '../ports/review-photo.repository.port';

// A file younger than this may belong to an upload in progress: the file is
// stored before its row is inserted.
export const ORPHAN_PHOTO_FILE_MIN_AGE_MS = 60 * 60 * 1000;

// review-session-management "Orphan Photo Files Are Swept" (EN-222): deletes
// every file under review-photos/ that no ReviewPhoto row references and
// that was stored more than an hour ago. Such files are left by a process
// that stopped between storing a file and inserting its row, or by a file
// delete that failed after a photo delete or a discard (those are logged,
// never thrown). A row is never removed here, so a referenced file is never
// touched. A file that cannot be deleted is logged and the others are still
// tried. When no photo row exists at all, nothing is deleted (see below).
// Returns how many files were deleted.
@Injectable()
export class SweepOrphanReviewPhotoFilesUseCase {
  private readonly logger = new Logger(SweepOrphanReviewPhotoFilesUseCase.name);

  constructor(
    @Inject(REVIEW_PHOTO_REPOSITORY)
    private readonly photoRepository: ReviewPhotoRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const cutoff = this.clock.now().getTime() - ORPHAN_PHOTO_FILE_MIN_AGE_MS;
    const oldEnough = (await this.fileStorage.list(REVIEW_PHOTO_DIRECTORY))
      .filter((file) => file.storedAt.getTime() < cutoff)
      .map((file) => file.key);
    if (oldEnough.length === 0) {
      this.logger.log('Swept 0 orphan review photo file(s)');
      return 0;
    }
    // Old files but no photo row at all: the API is most likely running on a
    // database that does not match the files volume (an empty one after a
    // failed restore, a reset dev database). Deleting would wipe every file,
    // so nothing is deleted until a photo row exists.
    if (!(await this.photoRepository.hasAnyPhoto())) {
      this.logger.warn(
        `Skipped the orphan review photo file sweep: ${oldEnough.length} old file(s) but no photo row at all ` +
          '(is the API on the database restored with these files?)',
      );
      return 0;
    }
    // Read after the listing: a row inserted meanwhile belongs to a file
    // that was already stored, so it is seen here and kept.
    const referenced =
      await this.photoRepository.findReferencedStorageKeys(oldEnough);

    let deleted = 0;
    for (const key of oldEnough) {
      if (referenced.has(key)) continue;
      try {
        await this.fileStorage.delete(key);
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Could not delete orphan review photo file ${key}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`Swept ${deleted} orphan review photo file(s)`);
    return deleted;
  }
}
