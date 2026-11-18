import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { EMAIL_SENDER } from '../src/shared/application/ports/email-sender.port';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { InMemoryEmailSender } from '../src/shared/testing/in-memory-email-sender';
import { LOGIN_FAILURE_LIMITER } from '../src/modules/auth/application/ports/login-failure-limiter.port';
import { PASSWORD_RESET_TOKEN_STORE } from '../src/modules/auth/application/ports/password-reset-token-store.port';
import { REFRESH_TOKEN_STORE } from '../src/modules/auth/application/ports/refresh-token-store.port';
import { TOKEN_DENYLIST } from '../src/modules/auth/application/ports/token-denylist.port';
import { RequestPasswordResetUseCase } from '../src/modules/auth/application/use-cases/request-password-reset.use-case';
import { InMemoryLoginFailureLimiter } from '../src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter';
import { InMemoryPasswordResetTokenStore } from '../src/modules/auth/application/services/testing/in-memory-password-reset-token-store';
import { InMemoryRefreshTokenStore } from '../src/modules/auth/application/services/testing/in-memory-refresh-token-store';
import { getLoginEmailRateLimitConfig } from '../src/modules/auth/infrastructure/config/login-rate-limit.config';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';

// password-reset S6: the limits on their own app so counts start at zero.
// An invalid value stops the app at boot. EN-200 removed the per-email limit:
// its old variables stay listed so the suite can prove they are ignored.
const ENV_KEYS = [
  'JWT_SECRET',
  'THROTTLE_KEY_SECRET',
  'CORS_ORIGIN',
  'PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS',
  'PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS',
  'PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS',
  'PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS',
] as const;

describe('Password reset rate limit (e2e)', () => {
  const savedEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  let app: INestApplication<App> | undefined;
  let sender: InMemoryEmailSender;

  async function startApp(limits: Record<string, string>) {
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-0123456789abcdef';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    Object.assign(process.env, limits);
    sender = new InMemoryEmailSender();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(new InMemoryUserRepository())
      .overrideProvider(TOKEN_DENYLIST)
      .useValue({
        isRevoked: () => Promise.resolve(false),
        revoke: () => Promise.resolve(),
        deleteExpired: () => Promise.resolve(),
      })
      .overrideProvider(REFRESH_TOKEN_STORE)
      .useFactory({ factory: () => new InMemoryRefreshTokenStore() })
      .overrideProvider(PASSWORD_RESET_TOKEN_STORE)
      .useFactory({ factory: () => new InMemoryPasswordResetTokenStore() })
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .overrideProvider(ThrottlerStorage)
      .useFactory({ factory: () => new ThrottlerStorageService() })
      .overrideProvider(LOGIN_FAILURE_LIMITER)
      .useFactory({
        factory: () =>
          new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()),
      })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    return app.getHttpServer();
  }

  afterEach(async () => {
    await app?.get(RequestPasswordResetUseCase).whenIdle();
    await app?.close();
    app = undefined;
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('does not limit requests per email (EN-200), even with the old per-email variables set', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '1000',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '1',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS: '600',
    });
    const post = (email: string) =>
      request(server).post('/auth/password-reset/request').send({ email });

    // A known-account email would be blocked just the same if it were
    // limited; an unknown one keeps the test free of email side effects.
    // Four requests: one more than the old default (3 per hour), so a
    // per-email limit brought back under any variable name still fails here.
    await post('nobody@example.com').expect(202);
    await post('  NOBODY@example.com ').expect(202);
    await post('nobody@example.com').expect(202);
    await post('Nobody@Example.com').expect(202);
  });

  it('answers the per-client-key 429 with Retry-After equal to its window and no X-RateLimit-* headers', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '1',
      PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: '600',
    });
    const post = (email: string) =>
      request(server).post('/auth/password-reset/request').send({ email });

    const accepted = await post('a@example.com').expect(202);
    const blocked = await post('b@example.com');

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('600');
    for (const response of [accepted, blocked]) {
      expect(
        Object.keys(response.headers).filter((name) =>
          name.startsWith('x-ratelimit'),
        ),
      ).toEqual([]);
    }
  });

  it('limits requests per client key, with the same 429 and a Retry-After', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '2',
      PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: '600',
    });
    const post = (email: string) =>
      request(server).post('/auth/password-reset/request').send({ email });

    await post('a@example.com').expect(202);
    await post('b@example.com').expect(202);
    const blocked = await post('c@example.com');

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // The confirm endpoint counts on its own: still not limited.
    await request(server)
      .post('/auth/password-reset/confirm')
      .send({ token: 'nope', password: 'abcdefghi1' })
      .expect(400);
  });

  it('limits confirmations per client key apart from requests', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '2',
      PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: '600',
    });
    const confirm = () =>
      request(server)
        .post('/auth/password-reset/confirm')
        .send({ token: 'nope', password: 'abcdefghi1' });

    const accepted = await confirm().expect(400);
    await confirm().expect(400);
    const blocked = await confirm();

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('600');
    for (const response of [accepted, blocked]) {
      expect(
        Object.keys(response.headers).filter((name) =>
          name.startsWith('x-ratelimit'),
        ),
      ).toEqual([]);
    }
    await request(server)
      .post('/auth/password-reset/request')
      .send({ email: 'a@example.com' })
      .expect(202);
  });

  it('stops the app at boot for an invalid limit', async () => {
    await expect(
      startApp({ PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '0' }),
    ).rejects.toThrow(/PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS/);
  });

  it('ignores a leftover invalid per-email variable instead of stopping at boot', async () => {
    const server = await startApp({
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '0',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS: 'abc',
    });

    await request(server)
      .post('/auth/password-reset/request')
      .send({ email: 'a@example.com' })
      .expect(202);
  });
});
