import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { User } from '../src/modules/users/domain/user.entity';

// design.md Testing Strategy (E2E row): hermetic, no test DB — USER_REPOSITORY
// and TOKEN_DENYLIST are overridden with in-memory implementations, so
// PrismaService (still part of the DI graph via the @Global() PrismaModule,
// which HealthController also injects directly) is stubbed too, purely to
// avoid opening a real database connection in onModuleInit()/$connect().
class InMemoryUserRepository implements UserRepository {
  private readonly usersByEmail = new Map<string, User>();

  seed(user: User): void {
    this.usersByEmail.set(user.email, user);
  }

  findByEmail(email: string): Promise<User | null> {
    const user = this.usersByEmail.get(email);
    if (!user || user.isDeleted) {
      return Promise.resolve(null);
    }
    return Promise.resolve(user);
  }

  save(user: User): Promise<void> {
    this.usersByEmail.set(user.email, user);
    return Promise.resolve();
  }

  // --- Compile bridge only (user-management-roles PR 5). This auth-only
  // e2e suite never exercises `/users` routes, so it has no need for the
  // full CRUD surface — but `implements UserRepository` requires these
  // members after PR 5 extended the port (design.md Interfaces/Contracts).
  // A dedicated in-memory fake with a real implementation of these members
  // lands in `test/users.e2e-spec.ts` (tasks.md 8.1).
  findById(): Promise<User | null> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  findAll(): Promise<User[]> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  create(): Promise<void> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  updateById(): Promise<void> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  softDeleteById(): Promise<void> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  countActiveByRole(): Promise<number> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }

  transactional<T>(): Promise<T> {
    throw new Error('Not used by auth.e2e-spec.ts');
  }
}

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
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';
const ACCESS_TOKEN_COOKIE_NAME = 'sf_access_token';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: InMemoryUserRepository;
  let tokenDenylist: InMemoryTokenDenylist;

  beforeAll(async () => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before .compile().
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = TEST_ORIGIN;
    process.env.JWT_EXPIRES_IN = '2h';

    userRepository = new InMemoryUserRepository();
    tokenDenylist = new InMemoryTokenDenylist();

    const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(userRepository)
      .overrideProvider(TOKEN_DENYLIST)
      .useValue(tokenDenylist)
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // design.md Round-5 fix: a Nest TestingModule-built INestApplication does
    // NOT inherit main.ts's bootstrap-only middleware — cookie-parser and
    // enableCors must be re-applied explicitly here, exactly as main.ts does,
    // or the cookie/CORS assertions below would be false passes/failures.
    app.use(cookieParser());
    app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('stays reachable without a session (public)', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok', db: 'ok' });
    });
  });

  describe('POST /auth/login', () => {
    it('sets an access-token cookie and returns only public fields for valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);

      expect(response.body).toEqual({
        id: 'seeded-admin-id',
        email: ADMIN_EMAIL,
        role: 'SYSTEM_ADMIN',
      });

      const setCookieHeader = response.headers['set-cookie'];
      expect(setCookieHeader).toBeDefined();
      const cookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];
      expect(
        cookies.some((cookie: string) =>
          cookie.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`),
        ),
      ).toBe(true);
      expect(
        cookies.some((cookie: string) => cookie.includes('HttpOnly')),
      ).toBe(true);

      // tasks.md 7.7: the signed access token itself must carry `role`, not
      // just the response body — decode-only (no signature verification
      // needed here; JwtTokenIssuer's own unit tests already cover
      // sign/verify round-tripping `role`).
      const accessTokenCookie = cookies.find((cookie: string) =>
        cookie.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`),
      ) as string;
      const rawToken = accessTokenCookie
        .split(';')[0]
        .slice(`${ACCESS_TOKEN_COOKIE_NAME}=`.length);
      const decodedPayload = JSON.parse(
        Buffer.from(rawToken.split('.')[1], 'base64url').toString('utf8'),
      ) as { sub: string; email: string; role: string };
      expect(decodedPayload.role).toBe('SYSTEM_ADMIN');
    });

    it('rejects wrong credentials with a generic 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without a session cookie', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns {id, email, role} for a valid session', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);

      const response = await agent.get('/auth/me').expect(200);

      expect(response.body).toEqual({
        id: 'seeded-admin-id',
        email: ADMIN_EMAIL,
        role: 'SYSTEM_ADMIN',
      });
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the cookie and the reused cookie is rejected by the denylist afterward', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);

      // Confirm the session works before logging out.
      await agent.get('/auth/me').expect(200);

      await agent.post('/auth/logout').expect(200);

      // supertest's agent keeps the (now-cleared) cookie jar; reusing the
      // pre-logout cookie value against a protected endpoint must be
      // rejected — this is what actually proves TokenDenylist revocation
      // works, not just that the cookie was cleared client-side.
      await agent.get('/auth/me').expect(401);
    });
  });

  describe('CORS', () => {
    it('returns Access-Control-Allow-Origin/Credentials for a cross-origin request from the configured origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', TEST_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
