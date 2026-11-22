import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { ReviewPhoto } from '../../domain/review-photo';
import type {
  AddReviewPhotoResult,
  DeleteReviewPhotoResult,
  ReviewPhotoRepository,
} from '../../application/ports/review-photo.repository.port';

const ORDER_BY: Prisma.ReviewPhotoOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

type Row = {
  id: string;
  reviewSessionId: string;
  inspectableElementId: string;
  storageKey: string;
  sizeBytes: number;
  createdAt: Date;
};

function toPhoto(row: Row): ReviewPhoto {
  return {
    id: row.id,
    reviewSessionId: row.reviewSessionId,
    inspectableElementId: row.inspectableElementId,
    storageKey: row.storageKey,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

// EN-164. addToDraft and deleteFromDraft run in one interactive transaction
// that first locks the session row with `SELECT ... FOR UPDATE`. complete()
// and discardDraft() write that same row, so they wait for the lock (and the
// photo write waits for them): a photo can never land on a session that was
// completed or deleted first, and two concurrent uploads count one after the
// other, which is what makes the per-element limit hold (Risk item 4).
@Injectable()
export class PrismaReviewPhotoRepository implements ReviewPhotoRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Locks the row and returns its status, or null when it does not exist.
  private async lockSession(
    tx: Prisma.TransactionClient,
    reviewSessionId: string,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ status: string }>>(
      Prisma.sql`SELECT "status"::text AS "status" FROM "ReviewSession" WHERE "id" = ${reviewSessionId}::uuid FOR UPDATE`,
    );
    return rows.length === 0 ? null : rows[0].status;
  }

  async addToDraft(
    photo: ReviewPhoto,
    maxPerElement: number,
  ): Promise<AddReviewPhotoResult> {
    return this.prisma.$transaction(async (tx) => {
      const status = await this.lockSession(tx, photo.reviewSessionId);
      if (status !== 'draft') {
        return 'not_editable';
      }
      const count = await tx.reviewPhoto.count({
        where: {
          reviewSessionId: photo.reviewSessionId,
          inspectableElementId: photo.inspectableElementId,
        },
      });
      if (count >= maxPerElement) {
        return 'limit_reached';
      }
      await tx.reviewPhoto.create({ data: photo });
      return 'added';
    });
  }

  async listForElement(
    reviewSessionId: string,
    inspectableElementId: string,
  ): Promise<ReviewPhoto[]> {
    const rows = await this.prisma.reviewPhoto.findMany({
      where: { reviewSessionId, inspectableElementId },
      orderBy: ORDER_BY,
    });
    return rows.map(toPhoto);
  }

  async findInSession(
    reviewSessionId: string,
    photoId: string,
  ): Promise<ReviewPhoto | null> {
    const row = await this.prisma.reviewPhoto.findFirst({
      where: { id: photoId, reviewSessionId },
    });
    return row ? toPhoto(row) : null;
  }

  async deleteFromDraft(
    reviewSessionId: string,
    photoId: string,
  ): Promise<DeleteReviewPhotoResult> {
    return this.prisma.$transaction(async (tx) => {
      const status = await this.lockSession(tx, reviewSessionId);
      if (status === null) {
        return { outcome: 'not_found' };
      }
      if (status !== 'draft') {
        return { outcome: 'not_editable' };
      }
      const row = await tx.reviewPhoto.findFirst({
        where: { id: photoId, reviewSessionId },
      });
      if (!row) {
        return { outcome: 'not_found' };
      }
      await tx.reviewPhoto.delete({ where: { id: row.id } });
      return { outcome: 'deleted', storageKey: row.storageKey };
    });
  }

  async listKeysForSession(reviewSessionId: string): Promise<string[]> {
    const rows = await this.prisma.reviewPhoto.findMany({
      where: { reviewSessionId },
      select: { storageKey: true },
      orderBy: ORDER_BY,
    });
    return rows.map((row) => row.storageKey);
  }
}
