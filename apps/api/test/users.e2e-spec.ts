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
import type { Role } from '../src/modules/users/domain/role';
// design.md Testing Strategy (E2E row) + tasks.md 8.1: reuse the SAME
// in-memory fake the four use-case unit specs already exercise (PR 5),
// rather than hand-rolling a second one for this suite. tasks.md 8.2 pins
// this fake's findAll() soft-delete-exclusion parity with
// PrismaUserRepository at the unit level
// (in-memory-user.repository.spec.ts) — reusing it here means this e2e
// suite's "soft-deleted excluded" scenario is exercised against the exact
// same filter logic that unit test already guards.
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';

// design.md Testing Strategy (E2E row): hermetic, no test DB — mirrors
// test/auth.e2e-spec.ts's setup (USER_REPOSITORY / TOKEN_DENYLIST overridden
// with in-memory doubles; PrismaService stubbed only so nothing tries to
// open a real DB connection via the @Global() PrismaModule).
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

const DEFAULT_PASSWORD = 'correct-horse-battery-staple';

async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

interface SeedUserInput {
  id: string;
  email: string;
  role: Role;
  password?: string;
  deletedAt?: Date | null;
}

async function buildSeedUser(input: SeedUserInput): Promise<User> {
  const now = new Date();
  return new User({
    id: input.id,
    email: input.email,
    passwordHash: await hashPassword(input.password ?? DEFAULT_PASSWORD),
    role: input.role,
    createdAt: now,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  });
}

// Builds a fully isolated Nest app + in-memory UserRepository per test
// group, so mutation-heavy scenarios (last-admin lockout, soft-delete) never
// leak state into unrelated tests (design.md Decision 3's countActiveByRole
// is a GLOBAL count, exactly the isolation problem PR 6's integration test
// hit for the same reason — see apply-progress PR 6 notes).
async function buildApp(seedUsers: User[]): Promise<{
  app: INestApplication<App>;
  userRepository: UserRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seedUsers) {
    userRepository.seed(user);
  }
  const tokenDenylist = new InMemoryTokenDenylist();

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

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, userRepository };
}

async function loginAgent(
  app: INestApplication<App>,
  email: string,
  password = DEFAULT_PASSWORD,
) {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/login').send({ email, password }).expect(200);
  return agent;
}

describe('Users (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('Admin CRUD happy paths + validation (tasks.md 8.3)', () => {
    let app: INestApplication<App>;
    const adminId = 'admin-crud-id';
    const adminEmail = 'crud-admin@example.com';
    const existingEmail = 'existing@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: adminId,
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const existing = await buildSeedUser({
        id: 'existing-id',
        email: existingEmail,
        role: 'MANAGER',
      });
      ({ app } = await buildApp([admin, existing]));
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates a user and never returns the password hash (spec: Admin creates a user)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/users')
        .send({
          email: 'new-user@example.com',
          password: 'aValidPassw0rd',
          role: 'MANAGER',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        email: 'new-user@example.com',
        role: 'MANAGER',
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');
    });

    it('rejects a duplicate email with 409 (spec: Duplicate email rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/users')
        .send({
          email: existingEmail,
          password: 'aValidPassw0rd',
          role: 'MANAGER',
        })
        .expect(409);

      // spec: "409 responses carry a machine-readable cause" / "Duplicate-email
      // 409 is distinguishable from last-admin 409" — code is additive, the
      // existing fields are unchanged in shape.
      expect(response.body).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        code: 'EMAIL_ALREADY_IN_USE',
      });
      expect(typeof (response.body as { message: unknown }).message).toBe(
        'string',
      );
    });

    it('rejects a weak password with 400 before any user is created (spec: Weak password rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/users')
        .send({
          email: 'weak-pw@example.com',
          password: 'short1',
          role: 'MANAGER',
        })
        .expect(400);

      const listResponse = await agent.get('/users').expect(200);
      expect(
        (listResponse.body as Array<{ email: string }>).some(
          (user) => user.email === 'weak-pw@example.com',
        ),
      ).toBe(false);
    });

    it('lists users without password hashes (spec: Admin lists users)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/users').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect((response.body as unknown[]).length).toBeGreaterThan(0);
      (response.body as Array<Record<string, unknown>>).forEach((user) => {
        expect(user).not.toHaveProperty('passwordHash');
      });
    });

    it("updates a user's email (spec: Admin updates a user's email)", async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch(`/users/${'existing-id'}`)
        .send({ email: 'renamed@example.com' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'existing-id',
        email: 'renamed@example.com',
      });
    });

    it('returns 404 when updating a non-existent user (spec: Update targets a non-existent user)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/users/does-not-exist')
        .send({ email: 'ghost@example.com' })
        .expect(404);
    });

    it('deactivates a user via soft delete (spec: Admin deactivates a user)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const created = await agent
        .post('/users')
        .send({
          email: 'to-deactivate@example.com',
          password: 'aValidPassw0rd',
          role: 'MANAGER',
        })
        .expect(201);

      await agent
        .delete(`/users/${(created.body as { id: string }).id}`)
        .expect(204);
    });
  });

  describe('Anonymous and non-admin access control (tasks.md 8.4, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'guard-admin@example.com';
    const nonAdminEmail = 'guard-manager@example.com';
    let targetUserId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const nonAdmin = await buildSeedUser({
        id: 'guard-manager-id',
        email: nonAdminEmail,
        role: 'MANAGER',
      });
      const target = await buildSeedUser({
        id: 'guard-target-id',
        email: 'guard-target@example.com',
        role: 'MANAGER',
      });
      targetUserId = target.id;
      ({ app } = await buildApp([admin, nonAdmin, target]));
    });

    afterAll(async () => {
      await app.close();
    });

    // authorization spec: "Unauthenticated caller is rejected before role
    // check" — 401 on every /users route, no session cookie at all.
    it.each([
      ['POST', '/users'],
      ['GET', '/users'],
      ['PATCH', `/users/guard-target-id`],
      ['DELETE', `/users/guard-target-id`],
    ] as const)('anonymous %s %s -> 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const response =
        method === 'POST'
          ? await req
              .post(path)
              .send({ email: 'x@example.com', password: 'x', role: 'MANAGER' })
          : method === 'GET'
            ? await req.get(path)
            : method === 'PATCH'
              ? await req.patch(path).send({ email: 'x@example.com' })
              : await req.delete(path);

      expect(response.status).toBe(401);
    });

    // authorization spec: "Non-admin role is rejected" — 403 on every
    // /users route for an authenticated non-SYSTEM_ADMIN caller.
    it('non-admin caller -> 403 on POST /users (spec: Non-admin caller rejected)', async () => {
      const agent = await loginAgent(app, nonAdminEmail);
      await agent
        .post('/users')
        .send({
          email: 'blocked@example.com',
          password: 'aValidPassw0rd',
          role: 'MANAGER',
        })
        .expect(403);
    });

    it('non-admin caller -> 403 on GET /users (spec: Non-admin caller rejected)', async () => {
      const agent = await loginAgent(app, nonAdminEmail);
      await agent.get('/users').expect(403);
    });

    it('non-admin caller -> 403 on PATCH /users/:id', async () => {
      const agent = await loginAgent(app, nonAdminEmail);
      await agent
        .patch(`/users/${targetUserId}`)
        .send({ email: 'blocked@example.com' })
        .expect(403);
    });

    it('non-admin caller -> 403 on DELETE /users/:id', async () => {
      const agent = await loginAgent(app, nonAdminEmail);
      await agent.delete(`/users/${targetUserId}`).expect(403);
    });

    it('SYSTEM_ADMIN is permitted through the guard (authorization spec: SYSTEM_ADMIN is permitted)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent.get('/users').expect(200);
    });
  });

  describe('Last-Admin Lockout (tasks.md 8.5, spec: Last-Admin Lockout)', () => {
    it('rejects deactivating the sole active SYSTEM_ADMIN, state unchanged', async () => {
      const soleAdmin = await buildSeedUser({
        id: 'sole-admin-id',
        email: 'sole-admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const { app } = await buildApp([soleAdmin]);

      try {
        const agent = await loginAgent(app, 'sole-admin@example.com');

        const response = await agent
          .delete(`/users/${soleAdmin.id}`)
          .expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          error: 'Conflict',
          code: 'LAST_SYSTEM_ADMIN',
        });
        expect(typeof (response.body as { message: unknown }).message).toBe(
          'string',
        );

        const list = await agent.get('/users').expect(200);
        expect(
          (list.body as Array<{ id: string }>).some(
            (user) => user.id === soleAdmin.id,
          ),
        ).toBe(true);
      } finally {
        await app.close();
      }
    });

    it('rejects demoting the sole active SYSTEM_ADMIN away from that role, role unchanged', async () => {
      const soleAdmin = await buildSeedUser({
        id: 'sole-admin-demote-id',
        email: 'sole-admin-demote@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const { app } = await buildApp([soleAdmin]);

      try {
        const agent = await loginAgent(app, 'sole-admin-demote@example.com');

        const response = await agent
          .patch(`/users/${soleAdmin.id}`)
          .send({ role: 'MANAGER' })
          .expect(409);

        expect(response.body).toMatchObject({
          statusCode: 409,
          error: 'Conflict',
          code: 'LAST_SYSTEM_ADMIN',
        });
        expect(typeof (response.body as { message: unknown }).message).toBe(
          'string',
        );

        const list = await agent.get('/users').expect(200);
        const found = (list.body as Array<{ id: string; role: string }>).find(
          (user) => user.id === soleAdmin.id,
        );
        expect(found?.role).toBe('SYSTEM_ADMIN');
      } finally {
        await app.close();
      }
    });

    it('allows deactivating one of two active SYSTEM_ADMIN users (spec: others remain is allowed)', async () => {
      const admin1 = await buildSeedUser({
        id: 'two-admin-1',
        email: 'two-admin-1@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const admin2 = await buildSeedUser({
        id: 'two-admin-2',
        email: 'two-admin-2@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const { app } = await buildApp([admin1, admin2]);

      try {
        const agent = await loginAgent(app, 'two-admin-1@example.com');

        await agent.delete(`/users/${admin2.id}`).expect(204);

        const list = await agent.get('/users').expect(200);
        expect(
          (list.body as Array<{ id: string }>).some(
            (user) => user.id === admin2.id,
          ),
        ).toBe(false);
      } finally {
        await app.close();
      }
    });
  });

  describe('Soft-delete list exclusion (tasks.md 8.6)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'softdelete-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'softdelete-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const target = await buildSeedUser({
        id: 'softdelete-target-id',
        email: 'softdelete-target@example.com',
        role: 'MANAGER',
      });
      ({ app } = await buildApp([admin, target]));
    });

    afterAll(async () => {
      await app.close();
    });

    it('DELETE /users/:id then GET /users no longer lists that user', async () => {
      const agent = await loginAgent(app, adminEmail);

      const beforeDelete = await agent.get('/users').expect(200);
      expect(
        (beforeDelete.body as Array<{ id: string }>).some(
          (user) => user.id === 'softdelete-target-id',
        ),
      ).toBe(true);

      await agent.delete('/users/softdelete-target-id').expect(204);

      const afterDelete = await agent.get('/users').expect(200);
      expect(
        (afterDelete.body as Array<{ id: string }>).some(
          (user) => user.id === 'softdelete-target-id',
        ),
      ).toBe(false);
    });
  });

  describe('GET /auth/me returns role (tasks.md 8, design.md Testing Strategy)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'me-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'me-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp([admin]));
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns {id, email, role} for an authenticated SYSTEM_ADMIN', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/auth/me').expect(200);

      expect(response.body).toEqual({
        id: 'me-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
    });
  });
});
