import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { InspectableElementCounter } from '../../application/ports/inspectable-element-counter.port';

// Prisma adapter for the InspectableElementCounter port (design.md Decision
// 4), owned entirely by `community` — talks to the `InspectableElement`
// table directly via `PrismaService` (`@Global()` PrismaModule, so no module
// import is needed at all), never through the inspectable-element module's
// own repository. This is what keeps the Nest DI graph acyclic without
// `forwardRef()`.
//
// A ~12-line count probe, not a repository: `community` never writes
// InspectableElement and owns exactly one question. Mirrors
// PrismaMaintenanceCompanyLookup.
@Injectable()
export class PrismaInspectableElementCounter implements InspectableElementCounter {
  constructor(private readonly prisma: PrismaService) {}

  // Active = not soft-deleted (ADR-010) — inline `deletedAt: null`, not
  // `withDefaultFilter` (this class has exactly one method, unlike
  // PrismaMaintenanceCompanyLookup which extends SoftDeletableRepository for
  // a future second method; a rule-of-two is not worth the base class here).
  async countActiveByCommunity(communityId: string): Promise<number> {
    return this.prisma.inspectableElement.count({
      where: { communityId, deletedAt: null },
    });
  }
}
