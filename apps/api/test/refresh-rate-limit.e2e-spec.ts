import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { LOGIN_FAILURE_LIMITER } from '../src/modules/auth/application/ports/login-failure-limiter.port';
import { InMemoryLoginFailureLimiter } from '../src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter';
import { getLoginEmailRateLimitConfig } from '../src/modules/auth/infrastructure/config/login-rate-limit.config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { REFRESH_TOKEN_STORE } from '../src/modules/auth/application/ports/refresh-token-store.port';
import { InMemoryRefreshTokenStore } from '../src/modules/auth/application/services/testing/in-memory-refresh-token-store';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../src/modules/users/domain/user.entity';

// TD-5 S7: the refresh limit, on its own app so the count starts at zero:
// exactly REFRESH_RATE_LIMIT_MAX_ATTEMPTS refreshes pass per client key, the
// next one gets 429, and login keeps its own budget. An invalid value stops
// the app at boot.
class InMemoryTokenDenylist implements TokenDenylist {
  isRevoked(): Promise<boolean> {
    return Promise.resolve(false);
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }

  deleteExpired(): Promise<void> {
    return Promise.resolve();
  }
}

const TEST_ORIGIN = 'http://localhost:5173';
const EMAIL = 'limit@example.com';
const PASSWORD = 'correct-horse-battery-staple';
const LIMIT = 3;
const ENV_KEYS = [
  'JWT_SECRET',
  'CORS_ORIGIN',
  'REFRESH_RATE_LIMIT_MAX_ATTEMPTS',
  'REFRESH_RATE_LIMIT_WINDOW_SECONDS',
] as const;

async function compileApp(users: InMemoryUserRepository) {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(USER_REPOSITORY)
    .useValue(users)
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
    .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
    .compile();
}

describe('Refresh rate limit (e2e)', () => {
  const savedEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  let app: INestApplication<App> | undefined;
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = TEST_ORIGIN;
    process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = String(LIMIT);
    process.env.REFRESH_RATE_LIMIT_WINDOW_SECONDS = '60';
    users = new InMemoryUserRepository();
    const now = new Date();
    users.seed(
      new User({
        id: 'limit-user',
        email: EMAIL,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        role: 'SYSTEM_ADMIN',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
  });

  afterEach(async () => {
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

  it('lets exactly the configured number of refreshes through per client key, then 429, while login keeps its own budget', async () => {
    const moduleFixture = await compileApp(users);
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    const server = app.getHttpServer();
    const attempt = () =>
      request(server)
        .post('/auth/refresh')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', `sf_refresh_token=${'A'.repeat(43)}`);

    for (let i = 0; i < LIMIT; i += 1) {
      await attempt().expect(401);
    }
    const limited = await attempt().expect(429);

    expect(limited.headers['retry-after']).toBeDefined();
    await request(server)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
  });

  it.each(['0', 'ten'])(
    'refuses to start with REFRESH_RATE_LIMIT_MAX_ATTEMPTS=%s',
    async (value) => {
      process.env.REFRESH_RATE_LIMIT_MAX_ATTEMPTS = value;

      await expect(compileApp(users)).rejects.toThrow(
        /REFRESH_RATE_LIMIT_MAX_ATTEMPTS/,
      );
    },
  );
});
