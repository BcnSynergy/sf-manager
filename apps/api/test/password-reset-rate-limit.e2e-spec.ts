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
// An invalid value stops the app at boot.
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

  it('answers the per-email 429 and the per-client-key 429 identically', async () => {
    const emailServer = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '1000',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '1',
    });
    const post = (server: App, email: string) =>
      request(server).post('/auth/password-reset/request').send({ email });
    await post(emailServer, 'a@example.com').expect(202);
    const byEmail = await post(emailServer, 'a@example.com');
    await app?.get(RequestPasswordResetUseCase).whenIdle();
    await app?.close();

    const clientServer = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '1',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '1000',
    });
    await post(clientServer, 'a@example.com').expect(202);
    const byClient = await post(clientServer, 'a@example.com');

    expect(byEmail.status).toBe(429);
    expect(byClient.status).toBe(429);
    expect(byClient.body).toEqual(byEmail.body);
    // Same headers too: one Retry-After (the longer of the two windows, 3600 s
    // by default) and no X-RateLimit-* counters, so neither the limit that
    // fired nor anyone's request count shows.
    expect(byEmail.headers['retry-after']).toBe('3600');
    expect(byClient.headers['retry-after']).toBe('3600');
    for (const response of [byEmail, byClient]) {
      expect(
        Object.keys(response.headers).filter((name) =>
          name.startsWith('x-ratelimit'),
        ),
      ).toEqual([]);
    }
  });

  it('limits requests per normalized email, counting unknown emails too, with the same 429 and a Retry-After', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '1000',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '2',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_SECONDS: '600',
    });
    const post = (email: string) =>
      request(server).post('/auth/password-reset/request').send({ email });

    await post('nobody@example.com').expect(202);
    await post('  NOBODY@example.com ').expect(202);
    const blocked = await post('nobody@example.com');

    expect(blocked.status).toBe(429);
    // The longer of the two windows (900 s per client key, 600 s per email
    // here), whichever limit fired.
    expect(blocked.headers['retry-after']).toBe('900');
    await post('someone-else@example.com').expect(202);
  });

  it('limits requests per client key, with the same 429 and a Retry-After', async () => {
    const server = await startApp({
      PASSWORD_RESET_RATE_LIMIT_MAX_ATTEMPTS: '2',
      PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS: '600',
      PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '1000',
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

    await confirm().expect(400);
    await confirm().expect(400);
    const blocked = await confirm();

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await request(server)
      .post('/auth/password-reset/request')
      .send({ email: 'a@example.com' })
      .expect(202);
  });

  it('stops the app at boot for an invalid limit', async () => {
    await expect(
      startApp({ PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS: '0' }),
    ).rejects.toThrow(/PASSWORD_RESET_EMAIL_RATE_LIMIT_MAX_REQUESTS/);
  });
});
