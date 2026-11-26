import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { ReviewerSignature } from '../../domain/reviewer-signature';
import type { ReviewerSignatureRepository } from '../../application/ports/reviewer-signature.repository.port';

// Prisma adapter for the ReviewerSignatureRepository port (ADR-013). The
// row is keyed by the user id, so `save` is one atomic upsert.
@Injectable()
export class PrismaReviewerSignatureRepository implements ReviewerSignatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<ReviewerSignature | null> {
    return this.prisma.reviewerSignature.findUnique({ where: { userId } });
  }

  save(userId: string, storageKey: string): Promise<ReviewerSignature> {
    const updatedAt = new Date();
    return this.prisma.reviewerSignature.upsert({
      where: { userId },
      create: { userId, storageKey, updatedAt },
      update: { storageKey, updatedAt },
    });
  }
}
