import { Module } from '@nestjs/common';
import { ORPHAN_SIGNATURE_FILE_SWEEP } from './application/ports/orphan-signature-file-sweep.port';
import { OWN_SIGNATURE_READER } from './application/ports/own-signature.reader.port';
import { REVIEWER_SIGNATURE_REPOSITORY } from './application/ports/reviewer-signature.repository.port';
import { GetOwnSignatureStatusUseCase } from './application/use-cases/get-own-signature-status.use-case';
import { ReadOwnSignatureImageUseCase } from './application/use-cases/read-own-signature-image.use-case';
import { SweepOrphanSignatureFilesUseCase } from './application/use-cases/sweep-orphan-signature-files.use-case';
import { UploadOwnSignatureUseCase } from './application/use-cases/upload-own-signature.use-case';
import { PrismaReviewerSignatureRepository } from './infrastructure/persistence/prisma-reviewer-signature.repository';
import { ReviewerSignatureController } from './presentation/reviewer-signature.controller';

// reviewer-signature (FR-010 slice 2): the /me/signature surface. FILE_STORAGE
// and ID_GENERATOR come from the global FileStorageModule and
// IdGeneratorModule. Imports nothing.
@Module({
  controllers: [ReviewerSignatureController],
  providers: [
    {
      provide: REVIEWER_SIGNATURE_REPOSITORY,
      useClass: PrismaReviewerSignatureRepository,
    },
    GetOwnSignatureStatusUseCase,
    ReadOwnSignatureImageUseCase,
    UploadOwnSignatureUseCase,
    // reviewer-signature (T2): the reader export — review-session reads the
    // performer's current signature to snapshot it when a session is signed,
    // never the repository or the upload.
    {
      provide: OWN_SIGNATURE_READER,
      useExisting: ReadOwnSignatureImageUseCase,
    },
    // EN-243: the sweep export — review-session's ReviewFileSweepScheduler
    // runs it, so every orphan file sweep shares one schedule.
    SweepOrphanSignatureFilesUseCase,
    {
      provide: ORPHAN_SIGNATURE_FILE_SWEEP,
      useExisting: SweepOrphanSignatureFilesUseCase,
    },
  ],
  exports: [OWN_SIGNATURE_READER, ORPHAN_SIGNATURE_FILE_SWEEP],
})
export class ReviewerSignatureModule {}
