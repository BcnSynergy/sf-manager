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
import { SIGNATURE_DIRECTORY } from '../../domain/reviewer-signature';
import {
  REVIEWER_SIGNATURE_REPOSITORY,
  type ReviewerSignatureRepository,
} from '../ports/reviewer-signature.repository.port';

// reviewer-signature "Orphan Signature Files Are Swept" (EN-243): deletes
// every file under signatures/ that no ReviewerSignature row references and
// that was stored more than an hour ago (sweepOrphanFiles). An upload stores
// the new file before it saves the row, then deletes the previous file, so
// two concurrent uploads by the same user, a process that stops between the
// two writes, or a failed delete leaves such a file. Run by review-session's
// ReviewFileSweepScheduler, which this module exports it to. Returns how
// many orphan files were deleted.
@Injectable()
export class SweepOrphanSignatureFilesUseCase {
  private readonly logger = new Logger(SweepOrphanSignatureFilesUseCase.name);

  constructor(
    @Inject(REVIEWER_SIGNATURE_REPOSITORY)
    private readonly repository: ReviewerSignatureRepository,
    @Inject(FILE_STORAGE) private readonly fileStorage: FileStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    return sweepOrphanFiles(
      {
        directory: SIGNATURE_DIRECTORY,
        fileLabel: 'signature',
        rowLabel: 'signature',
        findReferencedStorageKeys: (keys) =>
          this.repository.findReferencedStorageKeys(keys),
        hasAnyRow: () => this.repository.hasAnySignature(),
      },
      this.fileStorage,
      this.clock.now(),
      this.logger,
    );
  }
}
