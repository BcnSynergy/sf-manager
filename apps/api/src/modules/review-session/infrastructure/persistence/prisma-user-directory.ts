import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UserDirectory } from '../../application/ports/user-directory.port';

// Prisma adapter for the UserDirectory port (design.md Decision 5), owned
// entirely by `review-session` — reads `PrismaService` directly (mirroring
// `PrismaMaintenanceCompanyLookup`), never through the `users` module's own
// repository. This is a data-fact lookup, not an authorization port: no
// role dispatch, no fail-closed default.
//
// Phase 1 implements only `findMaintenanceCompanyId` (the write-path half,
// Decision 1). `findEmailsByIds` (the read-path half, deliberately
// soft-delete-inclusive, Decision 5) is added in Phase 3.
@Injectable()
export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly prisma: PrismaService) {}

  // Deliberately NOT filtered by `deletedAt` — this reads the performer's
  // CURRENT company at the moment a session is opened, and only an
  // authenticated, non-soft-deleted actor ever reaches this call in
  // practice (AuthenticatedGuard). Role-agnostic: every role's
  // `maintenanceCompanyId` is read the same way, and whether it grants
  // anything is decided elsewhere (Decision 1's "data fact, not a grant").
  async findMaintenanceCompanyId(userId: string): Promise<string | null> {
    const record = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { maintenanceCompanyId: true },
    });

    return record?.maintenanceCompanyId ?? null;
  }
}
