import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaThrottlerStorage } from './prisma-throttler-storage.adapter';

// Integration test against the real (hermetic, per-run) Postgres database
// (login-rate-limit-hardening/design.md Decisions 4-6 and Testing Strategy).
// The adapter's guarantees (atomic increment, DB-clock windows, bounded
// cleanup) live in one SQL statement, so only a real database can prove
// them; a mocked PrismaService would only prove the statement is issued.
//
// Every test uses its own randomUUID() key, but the table is shared and the
// adapter's cleanup deletes ANY expired rows, so a test that depends on the
// set of expired rows (the cleanup test) clears them in its own setup.
describe('PrismaThrottlerStorage (integration)', () => {
  let prisma: PrismaService;
  let storage: PrismaThrottlerStorage;

  const TTL_MS = 60_000;
  const NAME = 'default';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    storage = new PrismaThrottlerStorage(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  it('first hit counts 1, reports the window length in seconds and is not blocked', async () => {
    const key = randomUUID();

    const record = await storage.increment(key, TTL_MS, 10, TTL_MS, NAME);

    expect(record.totalHits).toBe(1);
    expect(record.timeToExpire).toBeGreaterThanOrEqual(59);
    expect(record.timeToExpire).toBeLessThanOrEqual(60);
    expect(record.isBlocked).toBe(false);
    expect(record.timeToBlockExpire).toBe(0);
  });

  it('counts consecutive hits within the limit without blocking', async () => {
    const key = randomUUID();

    const records: Awaited<ReturnType<typeof storage.increment>>[] = [];
    for (let i = 0; i < 3; i++) {
      records.push(await storage.increment(key, TTL_MS, 3, TTL_MS, NAME));
    }

    expect(records.map((r) => r.totalHits)).toEqual([1, 2, 3]);
    expect(records.map((r) => r.isBlocked)).toEqual([false, false, false]);
  });

  it('blocks the hit that exceeds the limit and reports the block duration', async () => {
    const key = randomUUID();
    const limit = 3;

    for (let i = 0; i < limit; i++) {
      const ok = await storage.increment(key, TTL_MS, limit, TTL_MS, NAME);
      expect(ok.isBlocked).toBe(false);
    }
    const over = await storage.increment(key, TTL_MS, limit, TTL_MS, NAME);

    expect(over.totalHits).toBe(limit + 1);
    expect(over.isBlocked).toBe(true);
    expect(over.timeToBlockExpire).toBeGreaterThanOrEqual(1);
    expect(over.timeToBlockExpire).toBeLessThanOrEqual(60);
  });

  it('does not count hits made while blocked', async () => {
    const key = randomUUID();
    await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);
    const blocked = await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);
    expect(blocked.isBlocked).toBe(true);
    const rowBefore = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key },
    });

    const whileBlocked = await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);
    await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);

    expect(whileBlocked.isBlocked).toBe(true);
    expect(whileBlocked.totalHits).toBe(rowBefore.hits);
    const rowAfter = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key },
    });
    expect(rowAfter.hits).toBe(rowBefore.hits);
    expect(rowAfter.blockedUntil?.getTime()).toBe(
      rowBefore.blockedUntil?.getTime(),
    );
  });

  it('does not rewrite the row for an attempt on a blocked key and still reports the block', async () => {
    const key = randomUUID();
    await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);
    const blocked = await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);
    expect(blocked.isBlocked).toBe(true);
    const xmin = async () => {
      const rows = await prisma.$queryRaw<{ xmin: string }[]>`
        SELECT xmin::text AS xmin FROM "ThrottleCounter" WHERE "key" = ${key}
      `;
      return rows[0]?.xmin;
    };
    const before = await xmin();

    const whileBlocked = await storage.increment(key, TTL_MS, 1, TTL_MS, NAME);

    expect(whileBlocked.isBlocked).toBe(true);
    expect(whileBlocked.totalHits).toBe(blocked.totalHits);
    expect(whileBlocked.timeToBlockExpire).toBeGreaterThanOrEqual(59);
    expect(whileBlocked.timeToBlockExpire).toBeLessThanOrEqual(60);
    expect(whileBlocked.timeToExpire).toBeGreaterThanOrEqual(59);
    expect(await xmin()).toBe(before);
  });

  it('starts a new window once the window has elapsed', async () => {
    const key = randomUUID();
    await storage.increment(key, 1000, 10, 1000, NAME);
    const second = await storage.increment(key, 1000, 10, 1000, NAME);
    expect(second.totalHits).toBe(2);

    await sleep(1200);
    const afterWindow = await storage.increment(key, 1000, 10, 1000, NAME);

    expect(afterWindow.totalHits).toBe(1);
    expect(afterWindow.isBlocked).toBe(false);
  });

  it('resets to 1 and unblocks once the block has expired', async () => {
    const key = randomUUID();
    await storage.increment(key, 1000, 1, 1000, NAME);
    const blocked = await storage.increment(key, 1000, 1, 1000, NAME);
    expect(blocked.isBlocked).toBe(true);

    await sleep(1200);
    const afterBlock = await storage.increment(key, 1000, 1, 1000, NAME);

    expect(afterBlock.totalHits).toBe(1);
    expect(afterBlock.isBlocked).toBe(false);
    expect(afterBlock.timeToBlockExpire).toBe(0);
    const row = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key },
    });
    expect(row.blockedUntil).toBeNull();
  });

  it('counts every one of 50 concurrent increments exactly once', async () => {
    const key = randomUUID();

    const records = await Promise.all(
      Array.from({ length: 50 }, () =>
        storage.increment(key, TTL_MS, 1000, TTL_MS, NAME),
      ),
    );

    const hits = records.map((r) => r.totalHits).sort((a, b) => a - b);
    expect(hits).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const row = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key },
    });
    expect(row.hits).toBe(50);
  });

  it('lets exactly `limit` of limit + 5 concurrent increments through', async () => {
    const key = randomUUID();
    const limit = 10;

    const records = await Promise.all(
      Array.from({ length: limit + 5 }, () =>
        storage.increment(key, TTL_MS, limit, TTL_MS, NAME),
      ),
    );

    expect(records.filter((r) => !r.isBlocked)).toHaveLength(limit);
    expect(records.filter((r) => r.isBlocked)).toHaveLength(5);
  });

  it('removes expired rows (at most 100 per call) when a new window opens and keeps live rows', async () => {
    // Cleanup removes any 100 expired rows of the shared table. Rows left by
    // earlier tests can expire between this setup and the increment below,
    // so start from an empty table to make the count deterministic.
    // Integration suites run in band, so nothing else uses the table now.
    await prisma.$executeRaw`DELETE FROM "ThrottleCounter"`;
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 600_000);
    const expiredKeys = Array.from({ length: 105 }, () => randomUUID());
    const liveKey = randomUUID();
    const expiredButBlockedKey = randomUUID();
    await prisma.throttleCounter.createMany({
      data: [
        ...expiredKeys.map((key) => ({
          key,
          hits: 2,
          windowEndsAt: past,
          expiresAt: past,
        })),
        { key: liveKey, hits: 4, windowEndsAt: future, expiresAt: future },
        {
          key: expiredButBlockedKey,
          hits: 11,
          windowEndsAt: past,
          blockedUntil: future,
          expiresAt: future,
        },
      ],
    });
    const countExpired = () =>
      prisma.throttleCounter.count({ where: { key: { in: expiredKeys } } });
    expect(await countExpired()).toBe(105);

    await storage.increment(randomUUID(), TTL_MS, 10, TTL_MS, NAME);

    // Exactly 100 removed by one call: the bound is the contract.
    expect(await countExpired()).toBe(5);
    const live = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key: liveKey },
    });
    expect(live.hits).toBe(4);
    const blocked = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key: expiredButBlockedKey },
    });
    expect(blocked.hits).toBe(11);
  });

  describe('cleanup on expiresAt', () => {
    // Seeds rows whose window has ended, optionally still blocked. expiresAt
    // is omitted: the trigger derives it (later of windowEndsAt and
    // blockedUntil), as it does for every writer.
    const seed = async (count: number, blockedForSeconds: number | null) => {
      const keys = Array.from({ length: count }, () => randomUUID());
      for (const key of keys) {
        await prisma.$executeRaw`
          INSERT INTO "ThrottleCounter" ("key", "hits", "windowEndsAt", "blockedUntil")
          VALUES (
            ${key}, 2, now() - interval '60 seconds',
            CASE WHEN ${blockedForSeconds}::int IS NULL THEN NULL
              ELSE now() + ${blockedForSeconds}::int * interval '1 second' END
          )
        `;
      }
      return keys;
    };

    it('deletes fully expired rows past more than 100 expired-window but still-blocked rows', async () => {
      await prisma.$executeRaw`DELETE FROM "ThrottleCounter"`;
      const blockedKeys = await seed(150, 600);
      const expiredKeys = await seed(30, null);

      await storage.increment(randomUUID(), TTL_MS, 10, TTL_MS, NAME);

      expect(
        await prisma.throttleCounter.count({
          where: { key: { in: expiredKeys } },
        }),
      ).toBe(0);
      expect(
        await prisma.throttleCounter.count({
          where: { key: { in: blockedKeys } },
        }),
      ).toBe(150);
    });

    it('keeps expiresAt at the later of the window end and the block end', async () => {
      const key = randomUUID();
      const read = () =>
        prisma.throttleCounter.findUniqueOrThrow({ where: { key } });

      await storage.increment(key, TTL_MS, 1, 5 * TTL_MS, NAME);
      const live = await read();
      expect(live.expiresAt.getTime()).toBe(live.windowEndsAt.getTime());

      await storage.increment(key, TTL_MS, 1, 5 * TTL_MS, NAME);
      const blocked = await read();
      expect(blocked.blockedUntil).not.toBeNull();
      expect(blocked.expiresAt.getTime()).toBe(
        Math.max(
          blocked.windowEndsAt.getTime(),
          blocked.blockedUntil?.getTime() ?? 0,
        ),
      );
      expect(blocked.expiresAt.getTime()).toBeGreaterThan(
        blocked.windowEndsAt.getTime(),
      );
    });

    it('derives expiresAt for writers that omit it (previous adapter version)', async () => {
      // The pre-expiresAt adapter inserted without the column and updated
      // windowEndsAt/blockedUntil without touching it; a rolling deploy or a
      // code-only rollback must keep working and keep expiresAt correct.
      const key = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "ThrottleCounter" ("key", "hits", "windowEndsAt", "blockedUntil")
        VALUES (${key}, 1, now() + interval '60 seconds', NULL)
      `;
      const inserted = await prisma.throttleCounter.findUniqueOrThrow({
        where: { key },
      });
      expect(inserted.expiresAt.getTime()).toBe(
        inserted.windowEndsAt.getTime(),
      );

      await prisma.$executeRaw`
        INSERT INTO "ThrottleCounter" AS t ("key", "hits", "windowEndsAt", "blockedUntil")
        VALUES (${key}, 1, now() + interval '60 seconds', NULL)
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = t."hits" + 1,
          "blockedUntil" = now() + interval '600 seconds'
      `;
      const blocked = await prisma.throttleCounter.findUniqueOrThrow({
        where: { key },
      });
      expect(blocked.blockedUntil).not.toBeNull();
      expect(blocked.expiresAt.getTime()).toBe(blocked.blockedUntil?.getTime());
    });

    it('serves the cleanup predicate from the expiresAt index', async () => {
      // enable_seqscan = off only removes the planner's cost preference on a
      // tiny table; it still proves the predicate can use the index.
      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
        const rows = await tx.$queryRaw<{ 'QUERY PLAN': string }[]>`
          EXPLAIN SELECT "key" FROM "ThrottleCounter"
          WHERE "expiresAt" < now()
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        `;
        return rows.map((r) => r['QUERY PLAN']).join(' ');
      });

      expect(plan).toContain('ThrottleCounter_expiresAt_idx');
    });
  });

  it('runs the cleanup under a transaction-local timeout that does not leak to the pool', async () => {
    // A new key opens a window, so the cleanup (and its SET LOCAL equivalent)
    // runs. Every pooled connection must still report the server default.
    await storage.increment(randomUUID(), TTL_MS, 10, TTL_MS, NAME);

    const settings = await Promise.all(
      Array.from(
        { length: 5 },
        () =>
          prisma.$queryRaw<
            { statement_timeout: string }[]
          >`SHOW statement_timeout`,
      ),
    );
    expect(settings.map((r) => r[0]?.statement_timeout)).toEqual(
      Array.from({ length: 5 }, () => '0'),
    );
  });

  it('accepts a ttl and block duration above 2^31-1 ms', async () => {
    const key = randomUUID();
    const hugeMs = 3_000_000_000;

    const first = await storage.increment(key, hugeMs, 1, hugeMs, NAME);
    const blocked = await storage.increment(key, hugeMs, 1, hugeMs, NAME);

    expect(first.totalHits).toBe(1);
    expect(first.timeToExpire).toBeGreaterThan(2_000_000);
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(2_000_000);
  });

  it('does not run cleanup for a hit inside a live window', async () => {
    const key = randomUUID();
    await storage.increment(key, TTL_MS, 10, TTL_MS, NAME);
    const staleKey = randomUUID();
    await prisma.throttleCounter.create({
      data: {
        key: staleKey,
        hits: 1,
        windowEndsAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const second = await storage.increment(key, TTL_MS, 10, TTL_MS, NAME);

    expect(second.totalHits).toBe(2);
    expect(
      await prisma.throttleCounter.findUnique({ where: { key: staleKey } }),
    ).not.toBeNull();
  });

  it('stores a 64-character hashed key verbatim and has no raw-IP column', async () => {
    const hashedKey =
      randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    expect(hashedKey).toHaveLength(64);

    await storage.increment(hashedKey, TTL_MS, 10, TTL_MS, NAME);

    const row = await prisma.throttleCounter.findUniqueOrThrow({
      where: { key: hashedKey },
    });
    expect(row.key).toBe(hashedKey);
    expect(Object.keys(row).sort()).toEqual([
      'blockedUntil',
      'expiresAt',
      'hits',
      'key',
      'windowEndsAt',
    ]);
  });
});
