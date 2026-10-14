import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import type { LoginEmailRateLimitConfig } from '../config/login-rate-limit.config';
import { PrismaLoginFailureLimiter } from './prisma-login-failure-limiter.adapter';
import { PrismaThrottlerStorage } from './prisma-throttler-storage.adapter';

// Integration test against the real (hermetic, per-run) Postgres database
// (login-account-lockout/design.md Decisions 3, 4, 7 and Testing Strategy).
// The adapter's guarantees (atomic upsert, block on reaching the limit, DB
// clock, blocked rows not rewritten) live in one SQL statement, so only a
// real database can prove them. The in-memory fake is checked against the
// same rules by its own unit spec.
//
// Every test uses its own randomUUID() email. The table is shared and the
// throttler storage's cleanup deletes ANY expired row, so the one test that
// depends on the set of expired rows first removes only the rows this suite
// created, never the whole table the sibling suite also uses.
describe('PrismaLoginFailureLimiter (integration)', () => {
  let prisma: PrismaService;

  const WINDOW_MS = 60_000;
  const config: LoginEmailRateLimitConfig = {
    maxFailures: 3,
    windowMs: WINDOW_MS,
  };

  const keyFor = (email: string) =>
    createHash('sha256').update(`login-email:${email}`).digest('hex');
  // Every email this suite creates, so cleanup touches only its own rows.
  const createdKeys = new Set<string>();
  const newEmail = () => {
    const email = `${randomUUID()}@example.com`;
    createdKeys.add(keyFor(email));
    return email;
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const limiterWith = (overrides: Partial<LoginEmailRateLimitConfig> = {}) =>
    new PrismaLoginFailureLimiter(prisma, { ...config, ...overrides });
  const failTimes = async (
    limiter: PrismaLoginFailureLimiter,
    email: string,
    times: number,
  ) => {
    for (let i = 0; i < times; i++) {
      await limiter.recordFailure(email);
    }
  };
  const rowFor = (email: string) =>
    prisma.throttleCounter.findUnique({ where: { key: keyFor(email) } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Silences (and lets tests inspect) the one-per-transition block warning.
  let warn: jest.SpyInstance<void, [message: unknown, ...optional: unknown[]]>;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not block an email that never failed and writes nothing', async () => {
    const email = newEmail();

    await expect(limiterWith().getBlock(email)).resolves.toEqual({
      blocked: false,
    });
    expect(await rowFor(email)).toBeNull();
  });

  it('does not block below the limit and blocks on the failure that reaches it', async () => {
    const limiter = limiterWith();
    const email = newEmail();

    await failTimes(limiter, email, config.maxFailures - 1);
    await expect(limiter.getBlock(email)).resolves.toEqual({ blocked: false });

    await limiter.recordFailure(email);
    const block = await limiter.getBlock(email);

    expect(block.blocked).toBe(true);
    if (block.blocked) {
      expect(block.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(block.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    expect((await rowFor(email))?.hits).toBe(config.maxFailures);
  });

  it('blocks on the first failure when the limit is 1', async () => {
    const limiter = limiterWith({ maxFailures: 1 });
    const email = newEmail();

    await limiter.recordFailure(email);

    await expect(limiter.getBlock(email)).resolves.toMatchObject({
      blocked: true,
    });
  });

  it('does not count failures recorded while blocked and does not rewrite the row', async () => {
    const limiter = limiterWith();
    const email = newEmail();
    await failTimes(limiter, email, config.maxFailures);
    const xmin = async () => {
      const rows = await prisma.$queryRaw<{ xmin: string }[]>`
        SELECT xmin::text AS xmin FROM "ThrottleCounter" WHERE "key" = ${keyFor(email)}
      `;
      return rows[0]?.xmin;
    };
    const before = await rowFor(email);
    const xminBefore = await xmin();

    await failTimes(limiter, email, 3);

    const after = await rowFor(email);
    expect(after?.hits).toBe(before?.hits);
    expect(after?.blockedUntil?.getTime()).toBe(
      before?.blockedUntil?.getTime(),
    );
    expect(after?.windowEndsAt.getTime()).toBe(before?.windowEndsAt.getTime());
    expect(await xmin()).toBe(xminBefore);
  });

  it('restarts the count at 1 once the window has elapsed', async () => {
    const limiter = limiterWith({ windowMs: 1000 });
    const email = newEmail();
    await failTimes(limiter, email, config.maxFailures - 1);
    expect((await rowFor(email))?.hits).toBe(config.maxFailures - 1);

    await sleep(1200);
    await limiter.recordFailure(email);

    const row = await rowFor(email);
    expect(row?.hits).toBe(1);
    expect(row?.blockedUntil).toBeNull();
    await expect(limiter.getBlock(email)).resolves.toEqual({ blocked: false });
  });

  it('unblocks once the block has expired and the next failure opens a new window', async () => {
    const limiter = limiterWith({ windowMs: 1000 });
    const email = newEmail();
    await failTimes(limiter, email, config.maxFailures);
    await expect(limiter.getBlock(email)).resolves.toMatchObject({
      blocked: true,
    });

    await sleep(1200);
    await expect(limiter.getBlock(email)).resolves.toEqual({ blocked: false });
    await limiter.recordFailure(email);

    const row = await rowFor(email);
    expect(row?.hits).toBe(1);
    expect(row?.blockedUntil).toBeNull();
    await expect(limiter.getBlock(email)).resolves.toEqual({ blocked: false });
  });

  it('reset deletes the row and clears a block', async () => {
    const limiter = limiterWith();
    const email = newEmail();
    await failTimes(limiter, email, config.maxFailures);

    await limiter.reset(email);

    expect(await rowFor(email)).toBeNull();
    await expect(limiter.getBlock(email)).resolves.toEqual({ blocked: false });
  });

  it('reset resolves for an email with no row and leaves other emails alone', async () => {
    const limiter = limiterWith();
    const other = newEmail();
    await limiter.recordFailure(other);

    await expect(limiter.reset(newEmail())).resolves.toBeUndefined();

    expect((await rowFor(other))?.hits).toBe(1);
  });

  it('counts every one of 50 concurrent failures exactly once', async () => {
    const limiter = limiterWith({ maxFailures: 1000 });
    const email = newEmail();

    await Promise.all(
      Array.from({ length: 50 }, () => limiter.recordFailure(email)),
    );

    expect((await rowFor(email))?.hits).toBe(50);
  });

  it('blocks once and logs exactly one transition for maxFailures + 5 concurrent failures', async () => {
    const limiter = limiterWith();
    const email = newEmail();

    await Promise.all(
      Array.from({ length: config.maxFailures + 5 }, () =>
        limiter.recordFailure(email),
      ),
    );

    await expect(limiter.getBlock(email)).resolves.toMatchObject({
      blocked: true,
    });
    expect((await rowFor(email))?.hits).toBe(config.maxFailures);
    const transitions = warn.mock.calls.filter((call) =>
      String(call[0]).includes(keyFor(email)),
    );
    expect(transitions).toHaveLength(1);
  });

  it('stores only the hashed key: no column holds the raw email and the log carries the hash', async () => {
    const limiter = limiterWith();
    const email = newEmail();

    await failTimes(limiter, email, config.maxFailures);

    const row = await rowFor(email);
    expect(row?.key).toBe(keyFor(email));
    expect(row?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(email);
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain(keyFor(email));
    expect(logged).not.toContain(email);
  });

  it('keeps the email namespace apart from the unprefixed and per-client-key hashes', async () => {
    const limiter = limiterWith();
    const text = newEmail();

    await limiter.recordFailure(text);

    const unprefixed = createHash('sha256').update(text).digest('hex');
    const clientStyle = createHash('sha256')
      .update(`AuthController-login-default-${text}`)
      .digest('hex');
    expect(await rowFor(text)).not.toBeNull();
    expect(unprefixed).not.toBe(keyFor(text));
    expect(clientStyle).not.toBe(keyFor(text));
    expect(
      await prisma.throttleCounter.findMany({
        where: { key: { in: [unprefixed, clientStyle] } },
      }),
    ).toEqual([]);
  });

  describe('expiresAt and cleanup', () => {
    it('lets the trigger derive expiresAt: window end while counting, block end once blocked', async () => {
      const limiter = limiterWith();
      const email = newEmail();

      await limiter.recordFailure(email);
      const counting = await rowFor(email);
      expect(counting?.expiresAt.getTime()).toBe(
        counting?.windowEndsAt.getTime(),
      );

      await failTimes(limiter, email, config.maxFailures - 1);
      const blocked = await rowFor(email);
      expect(blocked?.blockedUntil).not.toBeNull();
      expect(blocked?.expiresAt.getTime()).toBe(
        Math.max(
          blocked?.windowEndsAt.getTime() ?? 0,
          blocked?.blockedUntil?.getTime() ?? 0,
        ),
      );
    });

    it('lets PrismaThrottlerStorage cleanup remove an expired email row but keep a blocked one', async () => {
      await prisma.throttleCounter.deleteMany({
        where: { key: { in: [...createdKeys] } },
      });
      const expiring = limiterWith({ maxFailures: 1000, windowMs: 1000 });
      const expiredEmail = newEmail();
      const blockedEmail = newEmail();
      await expiring.recordFailure(expiredEmail);
      await failTimes(limiterWith(), blockedEmail, config.maxFailures);
      await sleep(1200);

      // A new client key opens a window, which is when the bounded cleanup runs.
      await new PrismaThrottlerStorage(prisma).increment(
        randomUUID(),
        WINDOW_MS,
        10,
        WINDOW_MS,
        'default',
      );

      expect(await rowFor(expiredEmail)).toBeNull();
      expect(await rowFor(blockedEmail)).not.toBeNull();
    });
  });

  it('propagates storage errors (fail closed)', async () => {
    const failing = new PrismaLoginFailureLimiter(
      {
        $queryRaw: () => Promise.reject(new Error('db down')),
        $executeRaw: () => Promise.reject(new Error('db down')),
      } as unknown as PrismaService,
      config,
    );

    await expect(failing.getBlock('a@example.com')).rejects.toThrow('db down');
    await expect(failing.recordFailure('a@example.com')).rejects.toThrow(
      'db down',
    );
    await expect(failing.reset('a@example.com')).rejects.toThrow('db down');
  });
});
