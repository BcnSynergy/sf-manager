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
// The first suite runs with a zero grace window (strict rotation), so reusing
// a rotated token is detected at once; the second boots its own app with a
// 10 s grace window (EN-140). The refresh rate limit has its own suite
// (refresh-rate-limit.e2e-spec.ts).
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

const ENV_KEYS = [
  'JWT_SECRET',
  'CORS_ORIGIN',
  'JWT_EXPIRES_IN',
  'REFRESH_TOKEN_REUSE_GRACE',
] as const;
const savedEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

// Boots the app with the given grace window; the policy is read at boot.
async function bootApp(
  users: InMemoryUserRepository,
  reuseGrace: string,
): Promise<INestApplication<App>> {
  process.env.JWT_SECRET = 'e2e-test-secret';
  process.env.CORS_ORIGIN = TEST_ORIGIN;
  process.env.JWT_EXPIRES_IN = '2h';
  process.env.REFRESH_TOKEN_REUSE_GRACE = reuseGrace;

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

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
  await app.init();
  return app;
}

// The claims of a JWT, read without verifying it (the API verified it).
function claimsOf(jwt: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function seedUser(
  users: InMemoryUserRepository,
  id: string,
  email: string,
  passwordHash: string,
): void {
  const now = new Date();
  users.seed(
    new User({
      id,
      email,
      passwordHash,
      role: 'SYSTEM_ADMIN',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }),
  );
}

// One user per test, so their families never interfere.
let nextUser = 0;

interface LoggedInUser {
  id: string;
  email: string;
  passwordHash: string;
  access: string;
  refresh: string;
}

async function loggedInUser(
  app: INestApplication<App>,
  users: InMemoryUserRepository,
): Promise<LoggedInUser> {
  nextUser += 1;
  const id = `refresh-user-${nextUser}`;
  const email = `refresh-${nextUser}@example.com`;
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  seedUser(users, id, email, passwordHash);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    id,
    email,
    passwordHash,
    access: valueOf(login, 'sf_access_token') as string,
    refresh: valueOf(login, 'sf_refresh_token') as string,
  };
}

function refreshCall(
  app: INestApplication<App>,
  token: string | undefined,
  origin = TEST_ORIGIN,
) {
  const call = request(app.getHttpServer())
    .post('/auth/refresh')
    .set('Origin', origin);
  return token === undefined
    ? call
    : call.set('Cookie', `sf_refresh_token=${token}`);
}

describe('POST /auth/refresh (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUserRepository;

  beforeAll(async () => {
    users = new InMemoryUserRepository();
    app = await bootApp(users, '0s');
  });

  afterAll(async () => {
    restoreEnv();
    await app.close();
  });

  const refresh = (token: string | undefined, origin?: string) =>
    refreshCall(app, token, origin);
  const login = () => loggedInUser(app, users);

  it('exchanges the refresh cookie for a new access cookie and a new refresh cookie', async () => {
    const { id, refresh: first } = await login();

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

  it('answers 401, not 500, for a crafted cookie that cookie-parser turns into an object', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', 'sf_refresh_token=j:{}')
      .expect(401);
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
    const { refresh: first } = await login();
    const rotation = await refresh(first).expect(200);
    const rotated = valueOf(rotation, 'sf_refresh_token');
    const access = valueOf(rotation, 'sf_access_token') as string;

    await refresh(first).expect(401);

    await refresh(rotated).expect(401);
    // EN-174: the session's access tokens die with it.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `sf_access_token=${access}`)
      .expect(401);
  });

  it('refuses a request from another origin with 403, leaving the token usable', async () => {
    const { refresh: token } = await login();

    await refresh(token, 'https://evil.example').expect(403);

    await refresh(token).expect(200);
  });

  it('refuses a user deleted since the login, and revokes the family', async () => {
    const { id, email, passwordHash, refresh: token } = await login();
    await users.softDeleteById(id);

    const response = await refresh(token).expect(401);

    expect(
      cookiesOf(response).some((c) => c.startsWith('sf_refresh_token=;')),
    ).toBe(true);
    // Back as an active user, the family stays dead: it was revoked, not
    // just turned away.
    seedUser(users, id, email, passwordHash);
    await refresh(token).expect(401);
  });

  it('puts the live role, not the login-time role, in the refreshed session', async () => {
    const { id, refresh: token } = await login();
    await users.updateById(id, { role: 'MANAGER' });

    const response = await refresh(token).expect(200);

    expect((response.body as { role: string }).role).toBe('MANAGER');
    const access = valueOf(response, 'sf_access_token') as string;
    expect(claimsOf(access)).toMatchObject({ sub: id, role: 'MANAGER' });
  });

  // TD-5 S6: logout ends the refresh family too, even when only the refresh
  // cookie is left.
  describe('POST /auth/logout', () => {
    // EN-176: a logout whose server-side revocation fails still answers 500,
    // but clears both cookies, so the browser does not keep the session.
    it('clears both cookies even when revoking the session fails', async () => {
      const { access, refresh: token } = await login();
      const store = app.get<InMemoryRefreshTokenStore>(REFRESH_TOKEN_STORE);
      const failing = jest
        .spyOn(store, 'revokeFamily')
        .mockRejectedValueOnce(new Error('db unreachable'));

      try {
        const response = await request(app.getHttpServer())
          .post('/auth/logout')
          .set('Cookie', [
            `sf_access_token=${access}`,
            `sf_refresh_token=${token}`,
          ])
          .expect(500);

        const cleared = cookiesOf(response)
          .filter((c) => /Expires=Thu, 01 Jan 1970/.test(c))
          .map((c) => c.split('=')[0]);
        expect(cleared).toEqual(
          expect.arrayContaining(['sf_access_token', 'sf_refresh_token']),
        );
      } finally {
        failing.mockRestore();
      }
    });

    it('works with only the refresh cookie, clears both cookies and kills the family', async () => {
      const { refresh: token } = await login();

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

    it('with both cookies, revokes the access token and kills the family', async () => {
      const { access, refresh: token } = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [
          `sf_access_token=${access}`,
          `sf_refresh_token=${token}`,
        ])
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `sf_access_token=${access}`)
        .expect(401);
      await refresh(token).expect(401);
    });

    // EN-174: another tab may have refreshed just before the logout; the
    // access token that refresh issued (a jti the logout never sees) must
    // die with the session too.
    it('invalidates an access token issued by a refresh just before the logout', async () => {
      const { access, refresh: token } = await login();
      const refreshed = await refresh(token).expect(200);
      const lateAccess = valueOf(refreshed, 'sf_access_token') as string;

      // Only the access cookie: the refresh cookie alone would revoke the
      // family too, and would not pin the session claim.
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `sf_access_token=${access}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `sf_access_token=${lateAccess}`)
        .expect(401);
    });

    it('with only the access cookie, also kills the refresh family', async () => {
      const { access, refresh: token } = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', `sf_access_token=${access}`)
        .expect(200);

      await refresh(token).expect(401);
    });

    it('leaves another session of the same user alive', async () => {
      const first = await login();
      const second = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: first.email, password: PASSWORD })
        .expect(200);
      const secondAccess = valueOf(second, 'sf_access_token') as string;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [
          `sf_access_token=${first.access}`,
          `sf_refresh_token=${first.refresh}`,
        ])
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `sf_access_token=${secondAccess}`)
        .expect(200);
    });

    it('refuses a logout from another origin with 403, leaving the session alive', async () => {
      const { refresh: token } = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', 'https://evil.example')
        .set('Cookie', `sf_refresh_token=${token}`)
        .expect(403);

      await refresh(token).expect(200);
    });

    it('still answers 401 with neither a valid access token nor a refresh cookie', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(401);
    });
  });
});

// TD-5 S4: with a grace window, a token consumed a moment ago gets one more
// exchange (two tabs refreshing at once); a further attempt inside the window
// is "superseded": turned away without revoking the family or clearing the
// cookie the browser may already have replaced.
describe('POST /auth/refresh with a grace window (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUserRepository;

  beforeAll(async () => {
    users = new InMemoryUserRepository();
    app = await bootApp(users, '10s');
  });

  afterAll(async () => {
    restoreEnv();
    await app.close();
  });

  it('allows one grace exchange, then answers 401 superseded without revoking the family', async () => {
    const { refresh: first } = await loggedInUser(app, users);
    const rotated = valueOf(
      await refreshCall(app, first).expect(200),
      'sf_refresh_token',
    ) as string;

    const grace = await refreshCall(app, first).expect(200);
    const sibling = valueOf(grace, 'sf_refresh_token') as string;
    expect(sibling).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sibling).not.toBe(rotated);

    const superseded = await refreshCall(app, first).expect(401);
    expect(
      cookiesOf(superseded).some((c) => c.startsWith('sf_refresh_token=')),
    ).toBe(false);

    await refreshCall(app, rotated).expect(200);
    await refreshCall(app, sibling).expect(200);
  });
});
