import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TokenDenylist } from '../../application/ports/token-denylist.port';

// Prisma adapter for the TokenDenylist port (ADR-013, design.md Decision 9).
@Injectable()
export class PrismaTokenDenylistAdapter implements TokenDenylist {
  constructor(private readonly prisma: PrismaService) {}

  async isRevoked(jti: string): Promise<boolean> {
    const record = await this.prisma.revokedToken.findUnique({
      where: { jti },
    });
    return record !== null;
  }

  // Upsert keyed on `jti` — idempotent by construction: a concurrent
  // duplicate revoke() for the same still-valid token is a no-op success,
  // not a unique-constraint violation.
  async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this.prisma.revokedToken.upsert({
      where: { jti },
      create: { jti, expiresAt },
      update: { expiresAt },
    });
  }

  async deleteExpired(): Promise<void> {
    await this.prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
