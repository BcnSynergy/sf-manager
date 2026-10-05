import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { ElementType } from '../../../inspectable-element/domain/element-type';
import type {
  ReviewScheduleReader,
  SchedulePair,
  ScheduleScope,
} from '../../application/ports/review-schedule.reader.port';
import type { PairCoverage } from '../../domain/review-due.policy';

// The only Prisma calls the reader makes, written out as a structural type
// (design.md Interfaces/Contracts). A `Pick<PrismaService, ...>` of the four
// delegates is NOT enough: a `$extends` client is not assignable to it, so the
// query-counting test could not pass its extended client without a cast
// (spike, PR 4 task 4.1). Narrowing the Pick to `findMany`/`groupBy` fails the
// same way, because Prisma's generic method signatures differ between the base
// and the extended client. Plain, non-generic call signatures accept both
// `PrismaService` and its extended clients, with no cast and no import of the
// generated client (ADR-013).
//
// The `@Inject(PrismaService)` binding below is only type-checked by
// constructing `new PrismaReviewScheduleReader(prisma)` (the integration
// spec), so a future `useClass` binding is not compile-checked.
type CoveringFrequency = 'QUARTERLY' | 'ANNUAL';
type IdFilter = { in: string[] } | undefined;

export interface ReviewSchedulePrisma {
  community: {
    findMany(args: {
      where: { deletedAt: null; id: IdFilter };
      select: { id: true; name: true };
    }): Promise<{ id: string; name: string }[]>;
  };
  inspectableElement: {
    groupBy(args: {
      by: ['communityId', 'elementType'];
      where: { deletedAt: null; deactivatedAt: null; communityId: IdFilter };
    }): Promise<{ communityId: string; elementType: ElementType }[]>;
  };
  reviewTemplate: {
    findMany(args: {
      where: {
        frequency: { in: CoveringFrequency[] };
        status: { in: ('active' | 'retired')[] };
      };
      select: { id: true; elementType: true; frequency: true };
    }): Promise<{ id: string; elementType: ElementType; frequency: string }[]>;
  };
  reviewSession: {
    groupBy(args: {
      by: ['communityId', 'templateId'];
      where: {
        status: 'completed';
        communityId: IdFilter;
        templateId: { in: string[] };
        completedAt?: { lt: Date };
      };
      _max: { completedAt: true };
    }): Promise<
      {
        communityId: string;
        templateId: string;
        _max: { completedAt: Date | null };
      }[]
    >;
    findMany(args: {
      where: {
        status: 'completed';
        communityId: IdFilter;
        templateId: { in: string[] };
        completedAt: { gte: Date };
      };
      select: { communityId: true; templateId: true; completedAt: true };
    }): Promise<
      { communityId: string; templateId: string; completedAt: Date | null }[]
    >;
  };
}

// The port's PairCoverage is read-only for consumers; the fold needs to push.
interface MutableCoverage {
  lastBeforeSinceAt: Date | null;
  lastAnnualAt: Date | null;
  recentCoveringAt: Date[];
}

const emptyCoverage = (): MutableCoverage => ({
  lastBeforeSinceAt: null,
  lastAnnualAt: null,
  recentCoveringAt: [],
});

const pairKey = (communityId: string, elementType: ElementType): string =>
  `${communityId}::${elementType}`;

const latest = (current: Date | null, candidate: Date | null): Date | null =>
  candidate !== null && (current === null || candidate > current)
    ? candidate
    : current;

// Prisma adapter for ReviewScheduleReader (design.md Decision 6). Exactly six
// typed queries whatever the result size, with no raw SQL and no per-pair
// lookup: ReviewSession has no @relation to its template or community (E1), so
// the join is done here by folding on (communityId, template element type).
// It applies no quarter logic; the pure policy narrows the facts.
//
// Not yet bound in a Nest module (task 6.x registers it).
@Injectable()
export class PrismaReviewScheduleReader implements ReviewScheduleReader {
  // `@Inject(PrismaService)` is required: a structural type emits `Object` as
  // decorator metadata, so Nest could not resolve it. Nest still injects the
  // real PrismaService.
  constructor(
    @Inject(PrismaService) private readonly prisma: ReviewSchedulePrisma,
  ) {}

  async listPairs(scope: ScheduleScope, since: Date): Promise<SchedulePair[]> {
    const inScope: IdFilter =
      scope.kind === 'all' ? undefined : { in: [...scope.communityIds] };

    // q1: live communities in scope
    const communities = await this.prisma.community.findMany({
      where: { deletedAt: null, id: inScope },
      select: { id: true, name: true },
    });
    // q2: (community, element type) pairs with at least one live element
    const livePairs = await this.prisma.inspectableElement.groupBy({
      by: ['communityId', 'elementType'],
      where: { deletedAt: null, deactivatedAt: null, communityId: inScope },
    });
    // q3: frozen QUARTERLY and ANNUAL template versions, active and retired.
    // The status filter only narrows the id list (only frozen versions can
    // carry sessions); it is not a business rule.
    const templates = await this.prisma.reviewTemplate.findMany({
      where: {
        frequency: { in: ['QUARTERLY', 'ANNUAL'] },
        status: { in: ['active', 'retired'] },
      },
      select: { id: true, elementType: true, frequency: true },
    });

    const coveringIds = templates.map((template) => template.id);
    const annualIds = templates
      .filter((template) => template.frequency === 'ANNUAL')
      .map((template) => template.id);

    // q4: pre-window existence and latest date, per (community, template)
    const beforeSince = await this.prisma.reviewSession.groupBy({
      by: ['communityId', 'templateId'],
      where: {
        status: 'completed',
        communityId: inScope,
        templateId: { in: coveringIds },
        completedAt: { lt: since },
      },
      _max: { completedAt: true },
    });
    // q5: latest ANNUAL session of all time, per (community, template)
    const annual = await this.prisma.reviewSession.groupBy({
      by: ['communityId', 'templateId'],
      where: {
        status: 'completed',
        communityId: inScope,
        templateId: { in: annualIds },
      },
      _max: { completedAt: true },
    });
    // q6: every covering session inside the window
    const recent = await this.prisma.reviewSession.findMany({
      where: {
        status: 'completed',
        communityId: inScope,
        templateId: { in: coveringIds },
        completedAt: { gte: since },
      },
      select: { communityId: true, templateId: true, completedAt: true },
    });

    const nameByCommunityId = new Map(
      communities.map((community) => [community.id, community.name]),
    );
    const elementTypeByTemplateId = new Map(
      templates.map((template) => [template.id, template.elementType]),
    );

    const coverageByPair = new Map<string, MutableCoverage>();
    const coverageOf = (
      communityId: string,
      templateId: string,
    ): MutableCoverage | undefined => {
      const elementType = elementTypeByTemplateId.get(templateId);
      if (elementType === undefined) {
        return undefined;
      }
      const key = pairKey(communityId, elementType);
      let coverage = coverageByPair.get(key);
      if (coverage === undefined) {
        coverage = emptyCoverage();
        coverageByPair.set(key, coverage);
      }
      return coverage;
    };

    for (const row of beforeSince) {
      const coverage = coverageOf(row.communityId, row.templateId);
      if (coverage !== undefined) {
        coverage.lastBeforeSinceAt = latest(
          coverage.lastBeforeSinceAt,
          row._max.completedAt,
        );
      }
    }
    for (const row of annual) {
      const coverage = coverageOf(row.communityId, row.templateId);
      if (coverage !== undefined) {
        coverage.lastAnnualAt = latest(
          coverage.lastAnnualAt,
          row._max.completedAt,
        );
      }
    }
    for (const row of recent) {
      const coverage = coverageOf(row.communityId, row.templateId);
      if (coverage !== undefined && row.completedAt !== null) {
        coverage.recentCoveringAt.push(row.completedAt);
      }
    }

    return livePairs.flatMap((pair): SchedulePair[] => {
      const communityName = nameByCommunityId.get(pair.communityId);
      if (communityName === undefined) {
        return [];
      }
      const coverage: PairCoverage =
        coverageByPair.get(pairKey(pair.communityId, pair.elementType)) ??
        emptyCoverage();
      return [
        {
          communityId: pair.communityId,
          communityName,
          elementType: pair.elementType,
          coverage,
        },
      ];
    });
  }
}
