import { Module } from '@nestjs/common';
import { REVIEWER_SIGNATURE_REPOSITORY } from './application/ports/reviewer-signature.repository.port';
import { GetOwnSignatureStatusUseCase } from './application/use-cases/get-own-signature-status.use-case';
import { ReadOwnSignatureImageUseCase } from './application/use-cases/read-own-signature-image.use-case';
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
  ],
})
export class ReviewerSignatureModule {}
