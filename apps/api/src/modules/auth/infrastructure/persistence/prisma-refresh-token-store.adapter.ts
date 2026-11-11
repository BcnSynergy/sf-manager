import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type {
  FoundRefreshToken,
  NewRefreshToken,
  RefreshExchangeKind,
  RefreshTokenStore,
} from '../../application/ports/refresh-token-store.port';

// Prisma adapter for the RefreshTokenStore port (TD-5, ADR-013).
@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: token });
  }

  async findByHash(tokenHash: string): Promise<FoundRefreshToken | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!token) {
      return null;
    }
    const revoked = await this.prisma.refreshToken.findFirst({
      where: { familyId: token.familyId, revokedAt: { not: null } },
      select: { id: true },
    });
    return { ...token, familyRevoked: revoked !== null };
  }

  // One query: the familyId index finds the family's rows, which are sorted
  // so a revoked one comes first (a family keeps its consumed tokens until
  // its absolute expiry: one row per refresh, so up to about 700 rows in 7
  // days at the 15-minute default; EN-176).
  // No row at all means the family was deleted after its absolute expiry.
  async isFamilyEnded(familyId: string): Promise<boolean> {
    const first = await this.prisma.refreshToken.findFirst({
      where: { familyId },
      orderBy: { revokedAt: { sort: 'desc', nulls: 'last' } },
      select: { revokedAt: true },
    });
    return first === null || first.revokedAt !== null;
  }

  // A conditional UPDATE plus the INSERT, in one transaction: Postgres row
  // locking lets exactly one of two concurrent exchanges see the field null,
  // and a failed INSERT rolls the consume back. `revokedAt: null` refuses a
  // token whose family a logout revoked after it was read (revokeFamily
  // stamps every row, this one included).
  async exchange(
    id: string,
    kind: RefreshExchangeKind,
    at: Date,
    successor: NewRefreshToken,
  ): Promise<boolean> {
    const consume: Prisma.RefreshTokenUpdateManyArgs =
      kind === 'rotation'
        ? {
            where: { id, rotatedAt: null, revokedAt: null },
            data: { rotatedAt: at },
          }
        : {
            where: { id, graceUsedAt: null, revokedAt: null },
            data: { graceUsedAt: at },
          };
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany(consume);
      if (count !== 1) {
        return false;
      }
      await tx.refreshToken.create({ data: successor });
      return true;
    });
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { familyExpiresAt: { lt: now } },
    });
  }
}
