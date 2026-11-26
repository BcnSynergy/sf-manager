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
import { REVIEW_SIGNATURE_DIRECTORY } from '../../domain/review-session.entity';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

// review-session-management "Orphan Photo and Signature Files Are Swept"
// (EN-244): deletes every file under review-signatures/ that no session's
// signatureStorageKey references and that was stored more than an hour ago
// (sweepOrphanFiles). Signing copies the signature there before the write
// that completes the session, so a process that stops between the two, or a
// failed delete of the copy after a lost race, leaves such a file. Returns
// how many orphan files were deleted.
@Injectable()
export class SweepOrphanReviewSignatureFilesUseCase {
  private readonly logger = new Logger(
    SweepOrphanReviewSignatureFilesUseCase.name,
  );

  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly sessionRepository: ReviewSessionRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    return sweepOrphanFiles(
      {
        directory: REVIEW_SIGNATURE_DIRECTORY,
        fileLabel: 'review signature',
        rowLabel: 'signed session',
        findReferencedStorageKeys: (keys) =>
          this.sessionRepository.findReferencedSignatureStorageKeys(keys),
        hasAnyRow: () => this.sessionRepository.hasAnySignedSession(),
      },
      this.fileStorage,
      this.clock.now(),
      this.logger,
    );
  }
}
