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
// Every test uses its own randomUUID() key, so tests never interfere with
// each other even though they share one database.
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
        })),
        { key: liveKey, hits: 4, windowEndsAt: future },
        {
          key: expiredButBlockedKey,
          hits: 11,
          windowEndsAt: past,
          blockedUntil: future,
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

  it('does not run cleanup for a hit inside a live window', async () => {
    const key = randomUUID();
    await storage.increment(key, TTL_MS, 10, TTL_MS, NAME);
    const staleKey = randomUUID();
    await prisma.throttleCounter.create({
      data: {
        key: staleKey,
        hits: 1,
        windowEndsAt: new Date(Date.now() - 60_000),
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
      'hits',
      'key',
      'windowEndsAt',
    ]);
  });
});
