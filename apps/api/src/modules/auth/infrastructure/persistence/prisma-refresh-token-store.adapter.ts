import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type {
  FoundRefreshToken,
  NewRefreshToken,
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
    const revoked = await this.prisma.refreshToken.count({
      where: { familyId: token.familyId, revokedAt: { not: null } },
    });
    return { ...token, familyRevoked: revoked > 0 };
  }

  // A conditional UPDATE, so two concurrent refreshes cannot both consume
  // the token: Postgres row locking lets exactly one see rotatedAt null.
  async markRotated(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, rotatedAt: null },
      data: { rotatedAt: at },
    });
    return count === 1;
  }

  async claimGrace(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, graceUsedAt: null },
      data: { graceUsedAt: at },
    });
    return count === 1;
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
