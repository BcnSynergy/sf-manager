import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { REFRESH_TOKEN_STORE } from '../src/modules/auth/application/ports/refresh-token-store.port';
import { InMemoryRefreshTokenStore } from '../src/modules/auth/application/services/testing/in-memory-refresh-token-store';
import { LOGIN_FAILURE_LIMITER } from '../src/modules/auth/application/ports/login-failure-limiter.port';
import { InMemoryLoginFailureLimiter } from '../src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter';
import { getLoginEmailRateLimitConfig } from '../src/modules/auth/infrastructure/config/login-rate-limit.config';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../src/shared/application/ports/password-hasher.port';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../src/modules/users/domain/user.entity';
import { getTrustProxySetting } from '../src/shared/infrastructure/env/trust-proxy';

// login-account-lockout PR 2: HTTP contract of the per-email failure limit
// with the in-memory limiter (the Postgres adapter is proven by
// login-email-limit.integration.spec.ts). Every compiled AppModule has its
// own throttler storage and limiter, so each app starts with fresh counters.
// The throttler keeps a non-unref'd timer per hit that is only cleared on
// shutdown, so EVERY app must be closed in afterAll or Jest hangs.
class InMemoryTokenDenylist implements TokenDenylist {
  private readonly revokedJtis = new Set<string>();

  isRevoked(jti: string): Promise<boolean> {
    return Promise.resolve(this.revokedJtis.has(jti));
  }

  revoke(jti: string): Promise<void> {
    this.revokedJtis.add(jti);
    return Promise.resolve();
  }

  deleteExpired(): Promise<void> {
    return Promise.resolve();
  }
}

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'definitely-not-the-password';
const MANAGED_ENV = [
  'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
  'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
  'LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES',
  'LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
  'TRUST_PROXY',
] as const;

describe('Login email limit (e2e)', () => {
  const apps: NestExpressApplication[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  let passwordHash: string;

  async function createApp(
    env: Partial<Record<(typeof MANAGED_ENV)[number], string>> = {},
  ): Promise<NestExpressApplication> {
    for (const name of MANAGED_ENV) {
      delete process.env[name];
    }
    // Generous client-key limit unless a test lowers it, so only the email
    // limit (2 failures) can fire in the tests below.
    Object.assign(
      process.env,
      {
        TRUST_PROXY: 'true',
        LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '1000',
        LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES: '2',
      },
      env,
    );

    const userRepository = new InMemoryUserRepository();
    const now = new Date();
    userRepository.seed(
      new User({
        id: 'seeded-admin-id',
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'SYSTEM_ADMIN',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(userRepository)
      .overrideProvider(TOKEN_DENYLIST)
      .useValue(new InMemoryTokenDenylist())
      .overrideProvider(REFRESH_TOKEN_STORE)
      .useFactory({ factory: () => new InMemoryRefreshTokenStore() })
      .overrideProvider(ThrottlerStorage)
      .useFactory({ factory: () => new ThrottlerStorageService() })
      .overrideProvider(LOGIN_FAILURE_LIMITER)
      .useFactory({
        factory: () =>
          new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()),
      })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .compile();

    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.set('trust proxy', getTrustProxySetting(process.env));
    await app.init();
    apps.push(app);
    return app;
  }

  const login = (
    app: NestExpressApplication,
    forwardedFor: string,
    body: object,
  ) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send(body);

  const fail = (
    app: NestExpressApplication,
    forwardedFor: string,
    email = ADMIN_EMAIL,
  ) => login(app, forwardedFor, { email, password: WRONG_PASSWORD });

  const succeed = (app: NestExpressApplication, forwardedFor: string) =>
    login(app, forwardedFor, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  beforeAll(async () => {
    for (const name of MANAGED_ENV) {
      savedEnv[name] = process.env[name];
    }
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
    passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    for (const name of MANAGED_ENV) {
      if (savedEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = savedEnv[name];
      }
    }
  });

  it('blocks the email after 2 failures sent from different client keys and answers 429 with Retry-After', async () => {
    const app = await createApp();

    await fail(app, '198.51.100.1').expect(401);
    await fail(app, '198.51.100.2').expect(401);
    const blocked = await fail(app, '198.51.100.3').expect(429);

    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(900);
  });

  it('keeps the email below the limit usable: fewer failures than the limit never block', async () => {
    const app = await createApp();

    await fail(app, '198.51.100.1').expect(401);
    await succeed(app, '198.51.100.2').expect(200);
  });

  it('answers the email 429 with the same status and body as the per-client-key 429 of the same app', async () => {
    const app = await createApp({ LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3' });

    // Client key A: 3 attempts for three different (unknown) emails never
    // reach the email limit; the 4th is the per-client-key 429.
    await fail(app, '198.51.100.1', 'a@example.com').expect(401);
    await fail(app, '198.51.100.1', 'b@example.com').expect(401);
    await fail(app, '198.51.100.1', 'c@example.com').expect(401);
    const clientBlocked = await fail(
      app,
      '198.51.100.1',
      'd@example.com',
    ).expect(429);

    // Client key B: the email limit fires before the client key's.
    await fail(app, '198.51.100.2').expect(401);
    await fail(app, '198.51.100.2').expect(401);
    const emailBlocked = await fail(app, '198.51.100.2').expect(429);

    expect(emailBlocked.body).toEqual(clientBlocked.body);
    expect(emailBlocked.headers['content-type']).toBe(
      clientBlocked.headers['content-type'],
    );
  });

  it('rejects the correct password while the email is blocked, without setting a cookie or evaluating credentials', async () => {
    const app = await createApp();
    await fail(app, '198.51.100.1').expect(401);
    await fail(app, '198.51.100.2').expect(401);

    const hasher = app.get<PasswordHasher>(PASSWORD_HASHER);
    const verify = jest.spyOn(hasher, 'verify');
    const verifyAgainstDummy = jest.spyOn(hasher, 'verifyAgainstDummy');

    const blocked = await succeed(app, '198.51.100.3').expect(429);

    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
    expect(verifyAgainstDummy).not.toHaveBeenCalled();
  });

  it('does not block a different email', async () => {
    const app = await createApp();
    await fail(app, '198.51.100.1').expect(401);
    await fail(app, '198.51.100.2').expect(401);
    await fail(app, '198.51.100.3').expect(429);

    await fail(app, '198.51.100.4', 'other@example.com').expect(401);
    await fail(app, '198.51.100.5', 'other@example.com').expect(401);
    await fail(app, '198.51.100.6', 'other@example.com').expect(429);
  });

  it('counts case and whitespace variants of an email in one bucket', async () => {
    const app = await createApp();

    await fail(app, '198.51.100.1', 'Admin@Example.com').expect(401);
    await fail(app, '198.51.100.2', '  ADMIN@example.COM ').expect(401);
    await fail(app, '198.51.100.3', ADMIN_EMAIL).expect(429);
  });

  it('answers 400 for a missing or non-string email and counts no failure for any bucket', async () => {
    const app = await createApp();

    await login(app, '198.51.100.1', { password: WRONG_PASSWORD }).expect(400);
    await login(app, '198.51.100.2', {
      email: 42,
      password: WRONG_PASSWORD,
    }).expect(400);
    await login(app, '198.51.100.3', {
      email: 'not-an-email',
      password: WRONG_PASSWORD,
    }).expect(400);

    // Had any invalid request counted against the admin bucket, the second
    // real failure below would already be blocked.
    await fail(app, '198.51.100.4').expect(401);
    await fail(app, '198.51.100.5').expect(401);
    await fail(app, '198.51.100.6').expect(429);
  });

  it('resets the counter on a successful login', async () => {
    const app = await createApp();

    await fail(app, '198.51.100.1').expect(401);
    await succeed(app, '198.51.100.2').expect(200);
    await fail(app, '198.51.100.3').expect(401);
    // 2nd failure since the reset reaches the limit and is still evaluated.
    await fail(app, '198.51.100.4').expect(401);
    await fail(app, '198.51.100.5').expect(429);
  });

  // login-account-lockout PR 3: when both limits block, the client is told the
  // larger wait (Decision 5). The client-key window below is 10 s, so any
  // Retry-After above 10 can only come from the 900 s email block.
  it('answers the larger Retry-After when the client key and the email are both blocked', async () => {
    const app = await createApp({
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3',
      LOGIN_RATE_LIMIT_WINDOW_SECONDS: '10',
    });

    // Two failures block the email (900 s) and use 2 of the client key's 3.
    await fail(app, '198.51.100.1').expect(401);
    await fail(app, '198.51.100.1').expect(401);
    // 3rd attempt: the client key still passes, the use case answers with the
    // email's wait.
    const emailOnly = await fail(app, '198.51.100.1').expect(429);
    // 4th attempt: the client key blocks too, and the guard picks the larger.
    const both = await fail(app, '198.51.100.1').expect(429);

    expect(Number(emailOnly.headers['retry-after'])).toBeGreaterThan(10);
    expect(Number(both.headers['retry-after'])).toBeGreaterThan(10);
    expect(Number(both.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect(both.body).toEqual(emailOnly.body);
  });

  it('keeps the client key Retry-After when only the client key is blocked', async () => {
    const app = await createApp({
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3',
      LOGIN_RATE_LIMIT_WINDOW_SECONDS: '10',
    });

    await fail(app, '198.51.100.1', 'a@example.com').expect(401);
    await fail(app, '198.51.100.1', 'b@example.com').expect(401);
    await fail(app, '198.51.100.1', 'c@example.com').expect(401);
    const clientOnly = await fail(app, '198.51.100.1', 'd@example.com').expect(
      429,
    );

    expect(Number(clientOnly.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(clientOnly.headers['retry-after'])).toBeLessThanOrEqual(10);
  });

  it('adds no email failure for a request rejected by the client-key limit', async () => {
    const app = await createApp({ LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3' });

    await fail(app, '198.51.100.1', 'a@example.com').expect(401);
    await fail(app, '198.51.100.1', 'b@example.com').expect(401);
    await fail(app, '198.51.100.1', 'c@example.com').expect(401);
    // Rejected by the client key: it must not count against the admin email.
    await fail(app, '198.51.100.1').expect(429);

    // Had that request counted, the first failure below would already be the
    // 2nd one and the next attempt would be blocked one step early.
    await fail(app, '198.51.100.2').expect(401);
    await fail(app, '198.51.100.3').expect(401);
    await fail(app, '198.51.100.4').expect(429);
  });
});
