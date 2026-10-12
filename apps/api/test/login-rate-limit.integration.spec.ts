import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// login-rate-limit-hardening design.md Testing Strategy, "Integration (app,
// real Postgres)": the real AppModule (real PrismaThrottlerStorage) against
// the per-run hermetic database. Failed logins (unknown email, 401) count
// toward the limit, so no user is seeded.
//
// Isolation: every test uses its own client key, built from random bytes in
// the documentation ranges (2001:db8::/32, 203.0.113.0/24), and never
// 127.0.0.1, which other integration specs share. Counters for those keys
// are left behind; the per-run database is dropped at teardown.
const LIMIT = 3;
const MANAGED_ENV = [
  'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
  'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
  'TRUST_PROXY',
] as const;

// A unique IPv6 address inside 2001:db8::/32: 32 random bits select the /64.
const uniqueClient = (): string => {
  const hex = randomUUID().replace(/-/g, '');
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4, 8)}::1`;
};

describe('Login rate limit persistence (integration)', () => {
  const apps: NestExpressApplication[] = [];
  const savedEnv: Record<string, string | undefined> = {};

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

  const failedLogin = (app: NestExpressApplication, client: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', client)
      .send({
        email: `nobody-${randomUUID()}@example.com`,
        password: 'wrong-password-1',
      });

  beforeAll(() => {
    for (const name of MANAGED_ENV) {
      savedEnv[name] = process.env[name];
    }
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
    delete process.env.TRUST_PROXY;
    delete process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS = String(LIMIT);
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

  it('keeps counting after the API restarts', async () => {
    const client = uniqueClient();

    const appA = await createApp();
    for (let i = 0; i < LIMIT; i++) {
      await failedLogin(appA, client).expect(401);
    }
    await failedLogin(appA, client).expect(429);
    await closeApp(appA);

    const appB = await createApp();
    await failedLogin(appB, client).expect(429);
    // Another client is unaffected: the rejection came from the persisted
    // counter for this key, not from a global state.
    await failedLogin(appB, uniqueClient()).expect(401);
  });

  it('shares counters between two running instances', async () => {
    const client = uniqueClient();
    const appA = await createApp();
    const appB = await createApp();

    await failedLogin(appA, client).expect(401);
    await failedLogin(appA, client).expect(401);
    await failedLogin(appB, client).expect(401);

    await failedLogin(appA, client).expect(429);
    await failedLogin(appB, client).expect(429);
  });

  it('counts concurrent attempts exactly', async () => {
    const client = uniqueClient();
    const app = await createApp();

    const statuses = (
      await Promise.all(
        Array.from({ length: LIMIT }, () => failedLogin(app, client)),
      )
    ).map((response) => response.status);

    expect(statuses).toEqual(Array.from({ length: LIMIT }, () => 401));
    await failedLogin(app, client).expect(429);
  });
});
