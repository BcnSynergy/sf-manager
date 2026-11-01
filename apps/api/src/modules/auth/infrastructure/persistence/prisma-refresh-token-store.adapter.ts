import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type {
  NewRefreshToken,
  RefreshTokenStore,
  StoredRefreshToken,
} from '../../application/ports/refresh-token-store.port';

// Prisma adapter for the RefreshTokenStore port (TD-5, ADR-013).
@Injectable()
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: token });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
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

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
}
