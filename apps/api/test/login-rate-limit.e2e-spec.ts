import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../src/modules/users/domain/user.entity';
import { getTrustProxySetting } from '../src/shared/infrastructure/env/trust-proxy';

// design.md D10: separate from auth.e2e-spec.ts on purpose. Every compiled
// AppModule has its own throttler storage, so each app below starts with
// fresh counters. The throttler keeps a non-unref'd timer per hit that is
// only cleared on shutdown, so EVERY app must be closed in afterAll or
// Jest hangs.
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
const MANAGED_ENV = [
  'LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
  'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
  'TRUST_PROXY',
] as const;

describe('Login rate limit (e2e)', () => {
  const apps: NestExpressApplication[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  let passwordHash: string;

  async function createApp(
    env: Partial<Record<(typeof MANAGED_ENV)[number], string>>,
  ): Promise<NestExpressApplication> {
    for (const name of MANAGED_ENV) {
      delete process.env[name];
    }
    Object.assign(process.env, env);

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

    // forRootAsync reads the env when the factory runs during compile(),
    // so the vars set above are the ones this app sees.
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(userRepository)
      .overrideProvider(TOKEN_DENYLIST)
      .useValue(new InMemoryTokenDenylist())
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
    forwardedFor?: string,
    body: object = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  ) => {
    const req = request(app.getHttpServer()).post('/auth/login');
    if (forwardedFor !== undefined) {
      void req.set('X-Forwarded-For', forwardedFor);
    }
    return req.send(body);
  };

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

  describe('defaults (10 attempts per 15 minutes, TRUST_PROXY off)', () => {
    it('allows 10 attempts, rejects the 11th with 429 and a Retry-After, and leaves other endpoints alone', async () => {
      const app = await createApp({});

      // Varying X-Forwarded-For must not matter while TRUST_PROXY is off:
      // all 10 share the socket address counter. All succeed, so successful
      // attempts count too.
      let sessionCookie: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const accepted = await login(app, `203.0.113.${i}`).expect(200);
        if (i === 1) {
          sessionCookie = accepted.headers['set-cookie'] as unknown as string[];
        }
      }

      const rejected = await login(app, '203.0.113.99').expect(429);
      const retryAfter = rejected.headers['retry-after'];
      expect(retryAfter).toMatch(/^\d+$/);
      expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
      expect(Number(retryAfter)).toBeLessThanOrEqual(900);

      // Guards run before the validation pipe: a malformed body is still 429.
      await login(app, undefined, { nonsense: true }).expect(429);

      await request(app.getHttpServer()).get('/health').expect(200);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);
    });
  });

  describe('configured limits (2 attempts per 1 second)', () => {
    it('rejects the 3rd attempt with Retry-After 1 and recovers after the window', async () => {
      const app = await createApp({
        LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '2',
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: '1',
      });

      await login(app).expect(200);
      await login(app).expect(200);
      const rejected = await login(app).expect(429);
      expect(rejected.headers['retry-after']).toBe('1');

      await new Promise((resolve) => setTimeout(resolve, 1500));

      await login(app).expect(200);
    });
  });

  describe('TRUST_PROXY=true', () => {
    it('keeps one counter per forwarded client IP', async () => {
      const app = await createApp({
        TRUST_PROXY: 'true',
        LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '2',
      });

      await login(app, '198.51.100.1').expect(200);
      await login(app, '198.51.100.1').expect(200);
      await login(app, '198.51.100.1').expect(429);

      await login(app, '198.51.100.2').expect(200);
    });
  });
});
