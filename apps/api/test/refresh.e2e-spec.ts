import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

// TD-5 (PR 2/3): POST /auth/refresh end to end, hermetic like auth.e2e-spec.
// This suite runs with a zero grace window (strict rotation), so reusing a
// rotated token is detected at once. The refresh rate limit has its own
// suite (refresh-rate-limit.e2e-spec.ts).
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

const TEST_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery-staple';

function cookiesOf(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown as
    string[] | string | undefined;
  if (header === undefined) {
    return [];
  }
  return Array.isArray(header) ? header : [header];
}

function valueOf(response: request.Response, name: string): string | undefined {
  const cookie = cookiesOf(response).find((c) => c.startsWith(`${name}=`));
  return cookie?.split(';')[0].slice(name.length + 1);
}

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUserRepository;
  let nextUser = 0;

  const ENV_KEYS = [
    'JWT_SECRET',
    'CORS_ORIGIN',
    'JWT_EXPIRES_IN',
    'REFRESH_TOKEN_REUSE_GRACE',
  ] as const;
  const savedEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = TEST_ORIGIN;
    process.env.JWT_EXPIRES_IN = '2h';
    process.env.REFRESH_TOKEN_REUSE_GRACE = '0s';

    users = new InMemoryUserRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
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
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
    await app.init();
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    await app.close();
  });

  // One user per test, so their families never interfere.
  async function loggedInUser(): Promise<{ id: string; refresh: string }> {
    nextUser += 1;
    const id = `refresh-user-${nextUser}`;
    const email = `refresh-${nextUser}@example.com`;
    const now = new Date();
    users.seed(
      new User({
        id,
        email,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        role: 'SYSTEM_ADMIN',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { id, refresh: valueOf(login, 'sf_refresh_token') as string };
  }

  function refresh(token: string | undefined, origin = TEST_ORIGIN) {
    const call = request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', origin);
    return token === undefined
      ? call
      : call.set('Cookie', `sf_refresh_token=${token}`);
  }

  it('exchanges the refresh cookie for a new access cookie and a new refresh cookie', async () => {
    const { id, refresh: first } = await loggedInUser();

    const response = await refresh(first).expect(200);

    expect(response.body).toEqual({
      id,
      email: expect.stringMatching(/@example\.com$/) as string,
      role: 'SYSTEM_ADMIN',
    });
    const access = valueOf(response, 'sf_access_token');
    const next = valueOf(response, 'sf_refresh_token');
    expect(access).toBeDefined();
    expect(next).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(next).not.toBe(first);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `sf_access_token=${access}`)
      .expect(200);
  });

  it('answers 401 without a refresh cookie', async () => {
    await refresh(undefined).expect(401);
  });

  it('answers 401 for an unknown refresh token, and clears the cookie', async () => {
    const response = await refresh('A'.repeat(43)).expect(401);

    const cleared = cookiesOf(response).find((c) =>
      c.startsWith('sf_refresh_token=;'),
    );
    expect(cleared).toContain('Path=/auth');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('revokes the whole family when a rotated token is reused (strict rotation)', async () => {
    const { refresh: first } = await loggedInUser();
    const rotated = valueOf(
      await refresh(first).expect(200),
      'sf_refresh_token',
    );

    await refresh(first).expect(401);

    await refresh(rotated).expect(401);
  });

  it('refuses a request from another origin with 403, leaving the token usable', async () => {
    const { refresh: token } = await loggedInUser();

    await refresh(token, 'https://evil.example').expect(403);

    await refresh(token).expect(200);
  });

  it('refuses a user deleted since the login, and the family stays dead', async () => {
    const { id, refresh: token } = await loggedInUser();
    await users.softDeleteById(id);

    await refresh(token).expect(401);
  });

  it('puts the live role, not the login-time role, in the refreshed session', async () => {
    const { id, refresh: token } = await loggedInUser();
    await users.updateById(id, { role: 'MANAGER' });

    const response = await refresh(token).expect(200);

    expect((response.body as { role: string }).role).toBe('MANAGER');
  });

  // TD-5 S6: logout ends the refresh family too, even when only the refresh
  // cookie is left.
  describe('POST /auth/logout', () => {
    it('works with only the refresh cookie, clears both cookies and kills the family', async () => {
      const { refresh: token } = await loggedInUser();

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `sf_refresh_token=${token}`)
        .expect(200);

      const cleared = cookiesOf(response).map((c) => c.split('=')[0]);
      expect(cleared).toEqual(
        expect.arrayContaining(['sf_access_token', 'sf_refresh_token']),
      );
      await refresh(token).expect(401);
    });

    it('still answers 401 with neither a valid access token nor a refresh cookie', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });
});
