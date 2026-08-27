import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MaintenanceCompanyLookup } from '../../application/ports/maintenance-company-lookup.port';

// Prisma adapter for the MaintenanceCompanyLookup port (design.md Decision
// 4), owned entirely by `users` — talks to the `MaintenanceCompany` table
// directly via `PrismaService` (`@Global()` PrismaModule, so no module
// import is needed at all), never through the maintenance-company module's
// own repository. This is what keeps the Nest DI graph acyclic without
// `forwardRef()`.
//
// A ~15-line existence probe, not a repository: `users` never writes
// MaintenanceCompany and owns exactly one question.
@Injectable()
export class PrismaMaintenanceCompanyLookup implements MaintenanceCompanyLookup {
  constructor(private readonly prisma: PrismaService) {}

  // True only for a company that exists AND is not soft-deleted (ADR-010) —
  // missing and soft-deleted are indistinguishable by design (design.md
  // Decision 5).
  async existsActive(id: string): Promise<boolean> {
    const record = await this.prisma.maintenanceCompany.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    return record !== null;
  }
}
