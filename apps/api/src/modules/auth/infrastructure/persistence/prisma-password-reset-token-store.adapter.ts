import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type {
  NewPasswordResetToken,
  PasswordResetTokenStore,
} from '../../application/ports/password-reset-token-store.port';

// Prisma adapter for the PasswordResetTokenStore port (password-reset S4,
// ADR-013).
@Injectable()
export class PrismaPasswordResetTokenStore implements PasswordResetTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  // The invalidation and the insert share a transaction: a failed insert
  // leaves the user's earlier link usable. The user's row is locked first,
  // so two concurrent requests for one user run one after the other (at READ
  // COMMITTED both would otherwise invalidate the same old rows and each
  // insert, leaving two usable tokens).
  async createReplacingUnused(token: NewPasswordResetToken): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${token.userId}::uuid FOR UPDATE`;
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: token.createdAt },
      });
      await tx.passwordResetToken.create({ data: token });
    });
  }

  // A conditional UPDATE: Postgres row locking lets exactly one of two
  // concurrent consumes see usedAt null, so the second matches no row.
  async consume(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: string } | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (count !== 1) {
        return null;
      }
      const row = await tx.passwordResetToken.findUniqueOrThrow({
        where: { tokenHash },
        select: { userId: true },
      });
      return { userId: row.userId };
    });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lte: now } },
    });
  }
}
