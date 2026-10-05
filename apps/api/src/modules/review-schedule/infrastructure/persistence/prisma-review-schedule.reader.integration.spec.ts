import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import type {
  SchedulePair,
  ScheduleScope,
} from '../../application/ports/review-schedule.reader.port';
import type { PairCoverage } from '../../domain/review-due.policy';
import { PrismaReviewScheduleReader } from './prisma-review-schedule.reader';

const idGenerator = new UuidV7IdGenerator();

type Frequency = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

// The coverage window starts here in every test (a stand-in for
// `coverageWindowStart(now)`; the adapter applies no quarter logic).
const SINCE = new Date('2026-06-30T00:00:00.000Z');

// Integration test against a real Postgres instance (design.md Testing
// Strategy, Test isolation). Every template it inserts is `retired` with a
// run-unique high `version`, so neither the (elementType, frequency, version)
// unique index nor the one-active-per-lineage partial index can be hit. The one
// exception is `withActiveTemplate`: EXTINGUISHER is the only element type, so
// every covering lineage is shared, and the test that needs an ACTIVE version
// swaps it in for the duration of one test and restores the previous active
// row in a `finally` (the suite runs in band). Reads are scoped to the
// communities the test itself created. Everything inserted is deleted in
// `afterAll`.
describe('PrismaReviewScheduleReader (integration)', () => {
  let prisma: PrismaService;
  let reader: PrismaReviewScheduleReader;
  const communityIds: string[] = [];
  const templateIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    reader = new PrismaReviewScheduleReader(prisma);
  });

  afterAll(async () => {
    await prisma.reviewSession.deleteMany({
      where: { communityId: { in: communityIds } },
    });
    await prisma.reviewTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
    await prisma.inspectableElement.deleteMany({
      where: { communityId: { in: communityIds } },
    });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const createCommunity = async (
    options: { deletedAt?: Date } = {},
  ): Promise<{ id: string; name: string }> => {
    const id = idGenerator.generate();
    const name = `Schedule Reader ${randomUUID()}`;
    await prisma.community.create({
      data: {
        id,
        name,
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: options.deletedAt ?? null,
      },
    });
    communityIds.push(id);
    return { id, name };
  };

  const createElement = async (
    communityId: string,
    overrides: { deletedAt?: Date; deactivatedAt?: Date } = {},
  ): Promise<void> => {
    await prisma.inspectableElement.create({
      data: {
        id: idGenerator.generate(),
        communityId,
        elementType: 'EXTINGUISHER',
        name: `Extinguisher ${randomUUID()}`,
        location: 'Lobby',
        installedAt: new Date('2024-01-01'),
        code: randomUUID().slice(0, 10),
        deletedAt: overrides.deletedAt ?? null,
        deactivatedAt: overrides.deactivatedAt ?? null,
      },
    });
  };

  const createUser = async (): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.user.create({
      data: {
        id,
        email: `schedule-reader-${randomUUID()}@example.com`,
        passwordHash: 'not-a-real-hash',
        role: 'MAINTENANCE_TECHNICIAN',
      },
    });
    userIds.push(id);
    return id;
  };

  const createTemplate = async (frequency: Frequency): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.reviewTemplate.create({
      data: {
        id,
        elementType: 'EXTINGUISHER',
        frequency,
        name: `Schedule Reader ${frequency} ${randomUUID()}`,
        version: 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
        status: 'retired',
      },
    });
    templateIds.push(id);
    return id;
  };

  // Runs `body` with a run-unique ACTIVE template in the lineage, temporarily
  // retiring whichever version other specs left active, and restores that
  // state afterwards. Sessions are written against ACTIVE versions in real use.
  const withActiveTemplate = async (
    frequency: Frequency,
    body: (templateId: string) => Promise<void>,
  ): Promise<void> => {
    const lineage = { elementType: 'EXTINGUISHER' as const, frequency };
    const previouslyActive = await prisma.reviewTemplate.findMany({
      where: { ...lineage, status: 'active' },
      select: { id: true },
    });
    const previousIds = previouslyActive.map((template) => template.id);
    const id = idGenerator.generate();
    try {
      await prisma.reviewTemplate.updateMany({
        where: { id: { in: previousIds } },
        data: { status: 'retired' },
      });
      await prisma.reviewTemplate.create({
        data: {
          id,
          ...lineage,
          name: `Schedule Reader active ${frequency} ${randomUUID()}`,
          version: 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
          status: 'active',
        },
      });
      templateIds.push(id);
      await body(id);
    } finally {
      await prisma.reviewSession.deleteMany({ where: { templateId: id } });
      await prisma.reviewTemplate.deleteMany({ where: { id } });
      await prisma.reviewTemplate.updateMany({
        where: { id: { in: previousIds } },
        data: { status: 'active' },
      });
    }
  };

  const createSession = async (
    communityId: string,
    templateId: string,
    performedById: string,
    completedAt: string | null,
  ): Promise<void> => {
    await prisma.reviewSession.create({
      data: {
        id: idGenerator.generate(),
        communityId,
        templateId,
        performedById,
        status: completedAt === null ? 'draft' : 'completed',
        completedAt: completedAt === null ? null : new Date(completedAt),
      },
    });
  };

  const scopeOf = (...ids: string[]): ScheduleScope => ({
    kind: 'communities',
    communityIds: ids,
  });

  // The reader invariant documented on `PairCoverage` (PR 3 review): an ANNUAL
  // session counted in `lastAnnualAt` must also be a covering session, i.e. be
  // reachable through `lastBeforeSinceAt` or `recentCoveringAt`. Otherwise the
  // policy would report NEVER_REVIEWED for a pair that has an annual review.
  const expectPairCoverageInvariant = (coverage: PairCoverage): void => {
    if (coverage.lastAnnualAt === null) {
      return;
    }
    const annual = coverage.lastAnnualAt.getTime();
    const covered =
      (coverage.lastBeforeSinceAt !== null &&
        coverage.lastBeforeSinceAt.getTime() >= annual) ||
      coverage.recentCoveringAt.some((date) => date.getTime() === annual);
    expect(covered).toBe(true);
  };

  const readPair = async (communityId: string): Promise<SchedulePair> => {
    const pairs = await reader.listPairs(scopeOf(communityId), SINCE);
    expect(pairs).toHaveLength(1);
    expectPairCoverageInvariant(pairs[0].coverage);
    return pairs[0];
  };

  const liveCommunity = async () => {
    const community = await createCommunity();
    await createElement(community.id);
    return community;
  };

  const times = (coverage: PairCoverage) => ({
    lastBeforeSinceAt: coverage.lastBeforeSinceAt?.toISOString() ?? null,
    lastAnnualAt: coverage.lastAnnualAt?.toISOString() ?? null,
    recentCoveringAt: coverage.recentCoveringAt
      .map((date) => date.toISOString())
      .sort(),
  });

  describe('which pairs exist', () => {
    it('returns one pair, named, for a community with two live extinguishers', async () => {
      const community = await createCommunity();
      await createElement(community.id);
      await createElement(community.id);

      const pairs = await reader.listPairs(scopeOf(community.id), SINCE);

      expect(pairs).toHaveLength(1);
      expect(pairs[0]).toMatchObject({
        communityId: community.id,
        communityName: community.name,
        elementType: 'EXTINGUISHER',
      });
    });

    it('returns a live pair with empty coverage when the community was never reviewed', async () => {
      const community = await liveCommunity();

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: [],
      });
    });

    it('returns no pair when the only elements are deactivated or soft-deleted', async () => {
      const deactivated = await createCommunity();
      await createElement(deactivated.id, { deactivatedAt: new Date() });
      const deleted = await createCommunity();
      await createElement(deleted.id, { deletedAt: new Date() });

      await expect(
        reader.listPairs(scopeOf(deactivated.id, deleted.id), SINCE),
      ).resolves.toEqual([]);
    });

    it('keeps the pair when a live element sits next to a deactivated one', async () => {
      const community = await createCommunity();
      await createElement(community.id, { deactivatedAt: new Date() });
      await createElement(community.id);

      await expect(
        reader.listPairs(scopeOf(community.id), SINCE),
      ).resolves.toHaveLength(1);
    });

    it('returns no pair for a soft-deleted community, even in the all scope', async () => {
      const deleted = await createCommunity({ deletedAt: new Date() });
      await createElement(deleted.id);

      await expect(
        reader.listPairs(scopeOf(deleted.id), SINCE),
      ).resolves.toEqual([]);
      const everything = await reader.listPairs({ kind: 'all' }, SINCE);
      expect(everything.map((pair) => pair.communityId)).not.toContain(
        deleted.id,
      );
    });

    it('returns the live community in the all scope and nothing outside a communities scope', async () => {
      const inScope = await liveCommunity();
      const outOfScope = await liveCommunity();

      const everything = await reader.listPairs({ kind: 'all' }, SINCE);
      const scoped = await reader.listPairs(scopeOf(inScope.id), SINCE);

      expect(everything.map((pair) => pair.communityId)).toEqual(
        expect.arrayContaining([inScope.id, outOfScope.id]),
      );
      expect(scoped.map((pair) => pair.communityId)).toEqual([inScope.id]);
    });

    it('returns nothing for an empty communities scope', async () => {
      await liveCommunity();

      await expect(reader.listPairs(scopeOf(), SINCE)).resolves.toEqual([]);
    });
  });

  describe('what covers a quarter', () => {
    it('reports a QUARTERLY session inside the window as recent coverage only', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      await createSession(
        community.id,
        await createTemplate('QUARTERLY'),
        user,
        '2026-10-10T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: ['2026-10-10T10:00:00.000Z'],
      });
    });

    it('reports an ANNUAL session inside the window as recent coverage and as the annual', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      await createSession(
        community.id,
        await createTemplate('ANNUAL'),
        user,
        '2026-08-10T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: null,
        lastAnnualAt: '2026-08-10T10:00:00.000Z',
        recentCoveringAt: ['2026-08-10T10:00:00.000Z'],
      });
    });

    it('ignores MONTHLY and SEMIANNUAL sessions, including one inside the window', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      await createSession(
        community.id,
        await createTemplate('MONTHLY'),
        user,
        '2026-11-10T10:00:00.000Z',
      );
      await createSession(
        community.id,
        await createTemplate('SEMIANNUAL'),
        user,
        '2026-07-10T10:00:00.000Z',
      );
      await createSession(
        community.id,
        await createTemplate('MONTHLY'),
        user,
        '2025-01-10T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: [],
      });
    });

    it('ignores an open draft on a QUARTERLY template', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      await createSession(
        community.id,
        await createTemplate('QUARTERLY'),
        user,
        null,
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: null,
        lastAnnualAt: null,
        recentCoveringAt: [],
      });
    });

    it('counts sessions performed by different users', async () => {
      const community = await liveCommunity();
      const template = await createTemplate('QUARTERLY');
      await createSession(
        community.id,
        template,
        await createUser(),
        '2026-10-02T10:00:00.000Z',
      );
      await createSession(
        community.id,
        template,
        await createUser(),
        '2026-10-03T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage).recentCoveringAt).toEqual([
        '2026-10-02T10:00:00.000Z',
        '2026-10-03T10:00:00.000Z',
      ]);
    });

    it('counts a session frozen against a replaced template version', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      const replacedVersion = await createTemplate('QUARTERLY');
      await createTemplate('QUARTERLY'); // the newer version; no session on it
      await createSession(
        community.id,
        replacedVersion,
        user,
        '2026-10-10T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage).recentCoveringAt).toEqual([
        '2026-10-10T10:00:00.000Z',
      ]);
    });

    it('does not leak sessions of another community into the pair', async () => {
      const community = await liveCommunity();
      const other = await liveCommunity();
      await createSession(
        other.id,
        await createTemplate('QUARTERLY'),
        await createUser(),
        '2026-10-10T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage).recentCoveringAt).toEqual([]);
    });
  });

  describe('the coverage window', () => {
    it('puts a session exactly at the window start inside it and one millisecond earlier before it', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      const template = await createTemplate('QUARTERLY');
      await createSession(
        community.id,
        template,
        user,
        '2026-06-30T00:00:00.000Z',
      );
      await createSession(
        community.id,
        template,
        user,
        '2026-06-29T23:59:59.999Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: '2026-06-29T23:59:59.999Z',
        lastAnnualAt: null,
        recentCoveringAt: ['2026-06-30T00:00:00.000Z'],
      });
    });

    it('reports only the latest pre-window date, across QUARTERLY and ANNUAL templates', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      const quarterly = await createTemplate('QUARTERLY');
      const annual = await createTemplate('ANNUAL');
      await createSession(
        community.id,
        quarterly,
        user,
        '2025-02-01T10:00:00.000Z',
      );
      await createSession(
        community.id,
        quarterly,
        user,
        '2025-11-20T10:00:00.000Z',
      );
      await createSession(
        community.id,
        annual,
        user,
        '2025-05-05T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: '2025-11-20T10:00:00.000Z',
        lastAnnualAt: '2025-05-05T10:00:00.000Z',
        recentCoveringAt: [],
      });
    });

    it('does not let MONTHLY history before the window count as an existing pre-window session', async () => {
      const community = await liveCommunity();
      await createSession(
        community.id,
        await createTemplate('MONTHLY'),
        await createUser(),
        '2025-03-01T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(pair.coverage.lastBeforeSinceAt).toBeNull();
    });
  });

  describe('the annual maximum', () => {
    it('is the all-time ANNUAL maximum and is not moved by newer QUARTERLY sessions', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      await createSession(
        community.id,
        await createTemplate('ANNUAL'),
        user,
        '2024-04-04T10:00:00.000Z',
      );
      await createSession(
        community.id,
        await createTemplate('QUARTERLY'),
        user,
        '2026-08-15T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(times(pair.coverage)).toEqual({
        lastBeforeSinceAt: '2024-04-04T10:00:00.000Z',
        lastAnnualAt: '2024-04-04T10:00:00.000Z',
        recentCoveringAt: ['2026-08-15T10:00:00.000Z'],
      });
    });

    it('lets a lone ANNUAL session before the window be both the pre-window fact and the annual (invariant)', async () => {
      const community = await liveCommunity();
      await createSession(
        community.id,
        await createTemplate('ANNUAL'),
        await createUser(),
        '2024-04-04T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(pair.coverage.lastBeforeSinceAt).toEqual(
        pair.coverage.lastAnnualAt,
      );
      expect(pair.coverage.lastAnnualAt).toEqual(
        new Date('2024-04-04T10:00:00.000Z'),
      );
      expect(pair.coverage.recentCoveringAt).toEqual([]);
    });

    it('counts retired ANNUAL template versions and takes the maximum across them', async () => {
      const community = await liveCommunity();
      const user = await createUser();
      const versionOne = await createTemplate('ANNUAL');
      const versionTwo = await createTemplate('ANNUAL');
      await createSession(
        community.id,
        versionOne,
        user,
        '2025-09-01T10:00:00.000Z',
      );
      await createSession(
        community.id,
        versionTwo,
        user,
        '2024-09-01T10:00:00.000Z',
      );

      const pair = await readPair(community.id);

      expect(pair.coverage.lastAnnualAt).toEqual(
        new Date('2025-09-01T10:00:00.000Z'),
      );
    });

    it('counts a session frozen against an ACTIVE ANNUAL template version', async () => {
      const community = await liveCommunity();
      const user = await createUser();

      await withActiveTemplate('ANNUAL', async (activeTemplateId) => {
        await createSession(
          community.id,
          activeTemplateId,
          user,
          '2026-08-10T10:00:00.000Z',
        );

        const pair = await readPair(community.id);

        expect(times(pair.coverage)).toEqual({
          lastBeforeSinceAt: null,
          lastAnnualAt: '2026-08-10T10:00:00.000Z',
          recentCoveringAt: ['2026-08-10T10:00:00.000Z'],
        });
      });
    });

    it('ignores an ANNUAL draft', async () => {
      const community = await liveCommunity();
      await createSession(
        community.id,
        await createTemplate('ANNUAL'),
        await createUser(),
        null,
      );

      const pair = await readPair(community.id);

      expect(pair.coverage.lastAnnualAt).toBeNull();
    });
  });

  describe('constant lookup count', () => {
    const seedCommunities = async (count: number): Promise<string[]> => {
      const user = await createUser();
      const quarterly = await createTemplate('QUARTERLY');
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const community = await liveCommunity();
        await createSession(
          community.id,
          quarterly,
          user,
          '2026-10-10T10:00:00.000Z',
        );
        await createSession(
          community.id,
          quarterly,
          user,
          '2025-10-10T10:00:00.000Z',
        );
        ids.push(community.id);
      }
      return ids;
    };

    // Counts every Prisma client operation of one `listPairs` call through a
    // client extension (E9: the repo has no other counting mechanism). The
    // extended client is passed with no cast: the constructor takes the
    // structural `ReviewSchedulePrisma`.
    const countOperations = async (ids: string[]): Promise<number> => {
      let count = 0;
      const counted = prisma.$extends({
        query: {
          $allOperations: ({ args, query }) => {
            count += 1;
            return query(args);
          },
        },
      });
      const countingReader = new PrismaReviewScheduleReader(counted);

      const pairs = await countingReader.listPairs(scopeOf(...ids), SINCE);

      expect(pairs).toHaveLength(ids.length);
      return count;
    };

    it('issues the same six operations for 2 and for 20 communities', async () => {
      const few = await countOperations(await seedCommunities(2));
      const many = await countOperations(await seedCommunities(20));

      expect(few).toBe(6);
      expect(many).toBe(few);
    }, 60_000);
  });
});
