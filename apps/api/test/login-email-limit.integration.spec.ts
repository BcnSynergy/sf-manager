import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../src/shared/application/ports/password-hasher.port';
import { PrismaLoginFailureLimiter } from '../src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter';
import { UuidV7IdGenerator } from '../src/shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';

// login-account-lockout design.md Testing Strategy, "Integration (app, real
// Postgres)": the real AppModule (real PrismaLoginFailureLimiter and
// PrismaThrottlerStorage) against the per-run hermetic database. The spec
// seeds its own run-unique users and removes them in afterAll; email counters
// are keyed by unique emails and left to the per-run database teardown.
//
// Isolation: every request uses its own client key, built from random bytes
// in the IPv6 documentation range (2001:db8::/32), so the per-client-key
// limit (raised to 1000 by rate-limit-env.setup.ts) never interferes, except
// in the one test that lowers it on purpose.
const EMAIL_LIMIT = 3;
const PASSWORD = 'integration-password-1';
const WRONG_PASSWORD = 'definitely-not-the-password';
const MANAGED_ENV = [
  'JWT_SECRET',
  'CORS_ORIGIN',
  'JWT_EXPIRES_IN',
  'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
  'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
  'LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES',
  'LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
  'TRUST_PROXY',
] as const;

// A unique IPv6 address inside 2001:db8::/32: 32 random bits select the /64.
const uniqueClient = (): string => {
  const hex = randomUUID().replace(/-/g, '');
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4, 8)}::1`;
};

describe('Login email limit (integration)', () => {
  const apps: NestExpressApplication[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const userIds: string[] = [];
  const idGenerator = new UuidV7IdGenerator();
  let passwordHash: string;

  const createApp = async (): Promise<NestExpressApplication> => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.set('trust proxy', 1);
    await app.init();
    apps.push(app);
    return app;
  };

  const closeApp = async (app: NestExpressApplication): Promise<void> => {
    await app.close();
    apps.splice(apps.indexOf(app), 1);
  };

  const login = (
    app: NestExpressApplication,
    email: string,
    password: string,
    client: string = uniqueClient(),
  ) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', client)
      .send({ email, password });

  const uniqueEmail = (label: string): string =>
    `email-limit-${label}-${randomUUID()}@example.com`;

  const seedUser = async (
    app: NestExpressApplication,
    label: string,
    deletedAt: Date | null = null,
  ): Promise<string> => {
    const prisma = app.get(PrismaService);
    const email = uniqueEmail(label);
    const id = idGenerator.generate();
    await prisma.user.create({
      data: { id, email, passwordHash, role: 'SYSTEM_ADMIN', deletedAt },
    });
    userIds.push(id);
    return email;
  };

  beforeAll(async () => {
    for (const name of MANAGED_ENV) {
      savedEnv[name] = process.env[name];
    }
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
    delete process.env.TRUST_PROXY;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS;
    process.env.LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES = String(EMAIL_LIMIT);

    const bootstrap = await createApp();
    passwordHash = await bootstrap
      .get<PasswordHasher>(PASSWORD_HASHER, { strict: false })
      .hash(PASSWORD);
    await closeApp(bootstrap);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      const app = await createApp();
      await app.get(PrismaService).user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
    await Promise.all(apps.map((app) => app.close()));
    for (const name of MANAGED_ENV) {
      if (savedEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
  });

  it('blocks an email across client keys and answers 429 with Retry-After', async () => {
    const app = await createApp();
    const email = uniqueEmail('distributed');

    for (let i = 0; i < EMAIL_LIMIT; i++) {
      await login(app, email, WRONG_PASSWORD).expect(401);
    }

    await login(app, email, WRONG_PASSWORD)
      .expect(429)
      .expect('Retry-After', /^[1-9]\d*$/);
  });

  it('resets the counter on a successful login', async () => {
    const app = await createApp();
    const email = await seedUser(app, 'reset');

    await login(app, email, WRONG_PASSWORD).expect(401);
    await login(app, email, WRONG_PASSWORD).expect(401);
    await login(app, email, PASSWORD).expect(200);
    await login(app, email, WRONG_PASSWORD).expect(401);
    await login(app, email, WRONG_PASSWORD).expect(401);
    // Without the reset the 4th failure overall would already be a 429.
  });

  it('does not count successful logins', async () => {
    const app = await createApp();
    const email = await seedUser(app, 'successes');

    for (let i = 0; i < EMAIL_LIMIT + 1; i++) {
      await login(app, email, PASSWORD).expect(200);
    }
  });

  it('answers unknown, existing and soft-deleted emails identically through the block', async () => {
    const app = await createApp();
    const emails = [
      uniqueEmail('unknown'),
      await seedUser(app, 'existing'),
      await seedUser(app, 'soft-deleted', new Date()),
    ];

    interface Step {
      status: number;
      body: unknown;
      retryAfter: boolean;
    }
    const transcripts: Step[][] = [];
    for (const email of emails) {
      const transcript: Step[] = [];
      for (let i = 0; i < EMAIL_LIMIT + 1; i++) {
        const response = await login(app, email, WRONG_PASSWORD);
        transcript.push({
          status: response.status,
          body: response.body,
          retryAfter: response.headers['retry-after'] !== undefined,
        });
      }
      transcripts.push(transcript);
    }

    expect(transcripts[0].map((t) => t.status)).toEqual([401, 401, 401, 429]);
    expect(transcripts[1]).toEqual(transcripts[0]);
    expect(transcripts[2]).toEqual(transcripts[0]);
  });

  it('rejects valid credentials while the email is blocked', async () => {
    const app = await createApp();
    const email = await seedUser(app, 'valid-while-blocked');
    for (let i = 0; i < EMAIL_LIMIT; i++) {
      await login(app, email, WRONG_PASSWORD).expect(401);
    }

    const blocked = await login(app, email, PASSWORD).expect(429);

    expect(blocked.headers['set-cookie']).toBeUndefined();
  });

  it('keeps the block after a restart and shares it between two running instances', async () => {
    const appA = await createApp();
    const appB = await createApp();
    const email = uniqueEmail('instances');

    await login(appA, email, WRONG_PASSWORD).expect(401);
    await login(appB, email, WRONG_PASSWORD).expect(401);
    await login(appA, email, WRONG_PASSWORD).expect(401);

    await login(appB, email, WRONG_PASSWORD).expect(429);
    await login(appA, email, WRONG_PASSWORD).expect(429);

    await closeApp(appA);
    const appC = await createApp();
    await login(appC, email, WRONG_PASSWORD).expect(429);
  });

  it('counts concurrent failures exactly', async () => {
    const app = await createApp();
    const email = uniqueEmail('concurrent');

    const statuses = (
      await Promise.all(
        Array.from({ length: EMAIL_LIMIT }, () =>
          login(app, email, WRONG_PASSWORD),
        ),
      )
    ).map((response) => response.status);

    expect(statuses).toEqual(Array.from({ length: EMAIL_LIMIT }, () => 401));
    await login(app, email, WRONG_PASSWORD).expect(429);
  });

  it('fails closed with a 500 when the block check or the failure record fails', async () => {
    const app = await createApp();
    const email = uniqueEmail('fail-closed');

    jest
      .spyOn(PrismaLoginFailureLimiter.prototype, 'getBlock')
      .mockRejectedValueOnce(new Error('simulated storage outage'));
    await login(app, email, WRONG_PASSWORD).expect(500);

    jest
      .spyOn(PrismaLoginFailureLimiter.prototype, 'recordFailure')
      .mockRejectedValueOnce(new Error('simulated storage outage'));
    await login(app, email, WRONG_PASSWORD).expect(500);

    // No lasting side effect: once storage recovers, counting resumes.
    await login(app, email, WRONG_PASSWORD).expect(401);
  });

  it('still logs in, and warns without the email, when the reset fails', async () => {
    const app = await createApp();
    const email = await seedUser(app, 'reset-fails');
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn(PrismaLoginFailureLimiter.prototype, 'reset')
      .mockRejectedValueOnce(new Error('simulated storage outage'));

    await login(app, email, PASSWORD).expect(200);

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.some((m) => m.includes('reset failed'))).toBe(true);
    expect(messages.every((m) => !m.includes(email))).toBe(true);
  });

  it('shares one bucket between case and whitespace variants of an email', async () => {
    const app = await createApp();
    const email = await seedUser(app, 'variants');

    await login(app, email.toUpperCase(), WRONG_PASSWORD).expect(401);
    await login(app, `  ${email}  `, WRONG_PASSWORD).expect(401);
    await login(app, email, WRONG_PASSWORD).expect(401);

    await login(app, email.toUpperCase(), PASSWORD).expect(429);
  });

  it('adds no email failure for a request rejected by the per-client-key limit', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '2';
    let app: NestExpressApplication;
    try {
      app = await createApp();
    } finally {
      process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS =
        savedEnv.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? '1000';
    }
    const email = uniqueEmail('client-blocked');
    const blockedClient = uniqueClient();

    // Two evaluated failures use up the client key; both are counted.
    await login(app, email, WRONG_PASSWORD, blockedClient).expect(401);
    await login(app, email, WRONG_PASSWORD, blockedClient).expect(401);
    // Rejected by the client-key guard: evaluates and counts nothing.
    await login(app, email, WRONG_PASSWORD, blockedClient).expect(429);

    // The email is at 2 of 3: one more evaluated failure reaches the limit
    // (401), and only then is it blocked. Had the rejected request counted,
    // this attempt would already be a 429.
    await login(app, email, WRONG_PASSWORD).expect(401);
    await login(app, email, WRONG_PASSWORD).expect(429);
  });
});
