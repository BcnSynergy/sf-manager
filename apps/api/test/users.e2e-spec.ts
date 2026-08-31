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
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../src/modules/users/application/ports/maintenance-company-lookup.port';
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

// maintenance-company design.md Decision 4: mirrors InMemoryUserRepository's
// role here — a hermetic double for the one-question MAINTENANCE_COMPANY_LOOKUP
// port, so tests that PATCH a maintenance-side role (and therefore hit
// UpdateUserUseCase's resulting-state existsActive() check, tasks.md 8.x)
// don't need a real Prisma-backed MaintenanceCompany table.
class InMemoryMaintenanceCompanyLookup implements MaintenanceCompanyLookup {
  constructor(private readonly liveCompanyIds: ReadonlySet<string>) {}

  existsActive(id: string): Promise<boolean> {
    return Promise.resolve(this.liveCompanyIds.has(id));
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
  maintenanceCompanyId?: string | null;
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
    maintenanceCompanyId: input.maintenanceCompanyId ?? null,
  });
}

// Builds a fully isolated Nest app + in-memory UserRepository per test
// group, so mutation-heavy scenarios (last-admin lockout, soft-delete) never
// leak state into unrelated tests (design.md Decision 3's countActiveByRole
// is a GLOBAL count, exactly the isolation problem PR 6's integration test
// hit for the same reason — see apply-progress PR 6 notes).
async function buildApp(
  seedUsers: User[],
  liveCompanyIds: string[] = [],
): Promise<{
  app: INestApplication<App>;
  userRepository: UserRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seedUsers) {
    userRepository.seed(user);
  }
  const tokenDenylist = new InMemoryTokenDenylist();
  const companyLookup = new InMemoryMaintenanceCompanyLookup(
    new Set(liveCompanyIds),
  );

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(tokenDenylist)
    .overrideProvider(MAINTENANCE_COMPANY_LOOKUP)
    .useValue(companyLookup)
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

  // maintenance-company design.md Decision 5 + spec.md "Update User" /
  // "Grandfathered Maintenance-Role Users" (OQ2): a PATCH that transitions
  // between two maintenance-side roles without re-supplying
  // maintenanceCompanyId must succeed, inheriting the existing company —
  // updateUserSchema's `.superRefine` must not reject this at the HTTP
  // layer before UpdateUserUseCase's resulting-state check ever runs.
  describe('Maintenance-role update inherits company (maintenance-company design.md Decision 5)', () => {
    it('PATCH role between two maintenance roles without maintenanceCompanyId in the body succeeds, company inherited', async () => {
      const admin = await buildSeedUser({
        id: 'maint-admin-id',
        email: 'maint-admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'maint-technician-id',
        email: 'maint-technician@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-1',
      });
      const { app } = await buildApp([admin, technician], ['company-1']);

      try {
        const agent = await loginAgent(app, 'maint-admin@example.com');

        const response = await agent
          .patch(`/users/${technician.id}`)
          .send({ role: 'MAINTENANCE_COMPANY_MANAGER' })
          .expect(200);

        expect(response.body).toMatchObject({
          id: technician.id,
          role: 'MAINTENANCE_COMPANY_MANAGER',
          maintenanceCompanyId: 'company-1',
        });
      } finally {
        await app.close();
      }
    });
  });

  // maintenance-company design.md Decision 5, spec.md "Create User" /
  // "Update User" — tasks.md 13.1 (shapes 1-3, correct codes).
  //
  // Reachability note (verified against the shared Zod schema and
  // UsersController's error mapping, not assumed): shapes 1 (REQUIRED) and
  // 2 (NOT_ALLOWED) are decided by `createUserSchema`/`updateUserSchema`'s
  // `.superRefine` at the ZodValidationPipe layer whenever the payload
  // alone makes the violation decidable — POST always (role is mandatory),
  // PATCH only when `role` is itself present in the body. These 3
  // combinations were originally found to reject with a plain 400 (Zod
  // issues as `message`, no `code`) BEFORE the controller/use case ever
  // ran — `MaintenanceCompanyZodValidationPipe` closes that gap by reading
  // the schema's own `params.maintenanceCompanyCode` tag and attaching the
  // matching `code` before the pipe throws, so these 3 combinations now
  // carry the same `code` the domain-policy path already produced for the
  // schema-undecidable shapes. The domain-policy `code` mapping
  // (`UsersController.mapMaintenanceCompanyError`) remains the sole
  // authority for the payload shapes the schema cannot decide alone: (a)
  // PATCH's REQUIRED direction, deliberately unchecked by the schema
  // (update-user.schema.ts's header comment) — resulting-state-dependent,
  // decided only by `UpdateUserUseCase`; (b) a PATCH that supplies
  // `maintenanceCompanyId` without `role` in the same body, judged against
  // the user's EXISTING role. Shape 3 (NOT_FOUND) is never schema-decidable
  // (liveness is not a shape/format rule) and is always reachable on both
  // POST and PATCH.
  describe('Maintenance-company assignment shapes 1-3 (design.md Decision 5, spec.md Create/Update User) — tasks.md 13.1', () => {
    let app: INestApplication<App>;
    let userRepository: UserRepository;
    const adminEmail = 'shapes-admin@example.com';
    const LIVE_COMPANY = 'shapes-live-company';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'shapes-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const manager = await buildSeedUser({
        id: 'shapes-manager-id',
        email: 'shapes-manager@example.com',
        role: 'MANAGER',
      });
      const technician = await buildSeedUser({
        id: 'shapes-technician-id',
        email: 'shapes-technician@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: LIVE_COMPANY,
      });
      ({ app, userRepository } = await buildApp(
        [admin, manager, technician],
        [LIVE_COMPANY],
      ));
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST with a maintenance role and no maintenanceCompanyId is rejected with code MAINTENANCE_COMPANY_REQUIRED and creates no user (spec: Missing company for a maintenance role rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/users')
        .send({
          email: 'shape1-create@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_REQUIRED',
      });
      const created = await userRepository.findByEmail(
        'shape1-create@example.com',
      );
      expect(created).toBeNull();
    });

    it('POST with a non-maintenance role and a maintenanceCompanyId is rejected with code MAINTENANCE_COMPANY_NOT_ALLOWED and creates no user (spec: Company id rejected for a non-maintenance role)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/users')
        .send({
          email: 'shape2-create@example.com',
          password: 'aValidPassw0rd',
          role: 'MANAGER',
          maintenanceCompanyId: LIVE_COMPANY,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
      });
      const created = await userRepository.findByEmail(
        'shape2-create@example.com',
      );
      expect(created).toBeNull();
    });

    it('POST with a maintenance role and an unknown/soft-deleted maintenanceCompanyId is rejected with code MAINTENANCE_COMPANY_NOT_FOUND (spec: Nonexistent or soft-deleted company rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/users')
        .send({
          email: 'shape3-create@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: 'dead-company-id',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_NOT_FOUND',
      });
      const created = await userRepository.findByEmail(
        'shape3-create@example.com',
      );
      expect(created).toBeNull();
    });

    it('PATCH changing role to a maintenance role without maintenanceCompanyId is rejected with code MAINTENANCE_COMPANY_REQUIRED, no field changed (spec: Missing company when changing role to a maintenance role rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await userRepository.findById('shapes-manager-id');
      const response = await agent
        .patch('/users/shapes-manager-id')
        .send({ role: 'MAINTENANCE_COMPANY_MANAGER' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_REQUIRED',
      });
      const after = await userRepository.findById('shapes-manager-id');
      expect(after).toEqual(before);
    });

    it('PATCH with role present (non-maintenance) and maintenanceCompanyId present in the same body is rejected with code MAINTENANCE_COMPANY_NOT_ALLOWED, no field changed (spec: Company id rejected when changing role to a non-maintenance role)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await userRepository.findById('shapes-manager-id');
      const response = await agent
        .patch('/users/shapes-manager-id')
        .send({ role: 'MANAGER', maintenanceCompanyId: LIVE_COMPANY })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
      });
      const after = await userRepository.findById('shapes-manager-id');
      expect(after).toEqual(before);
    });

    it('PATCH supplying only a maintenanceCompanyId for an existing non-maintenance user is rejected with code MAINTENANCE_COMPANY_NOT_ALLOWED, no field changed (spec: Update User conditional requirement)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await userRepository.findById('shapes-manager-id');
      const response = await agent
        .patch('/users/shapes-manager-id')
        .send({ maintenanceCompanyId: LIVE_COMPANY })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
      });
      const after = await userRepository.findById('shapes-manager-id');
      expect(after).toEqual(before);
    });

    it('PATCH supplying an unknown/soft-deleted maintenanceCompanyId for an existing maintenance-role user is rejected with code MAINTENANCE_COMPANY_NOT_FOUND, no field changed (spec: shape 3 via update)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await userRepository.findById('shapes-technician-id');
      const response = await agent
        .patch('/users/shapes-technician-id')
        .send({ maintenanceCompanyId: 'dead-company-id-2' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_NOT_FOUND',
      });
      const after = await userRepository.findById('shapes-technician-id');
      expect(after).toEqual(before);
    });
  });

  // maintenance-company design.md Decision 5 / Decision 7, spec.md "Update
  // User" — tasks.md 13.2: reassignment reflects immediately via GET;
  // demotion away from a maintenance role leaves maintenanceCompanyId
  // untouched (regression locking in the "no auto-clear, no rejection"
  // rule — the deliberately accepted anomaly this is NOT closing, design.md
  // Decision 6).
  describe('Reassignment and demotion (design.md Decision 5, spec.md Update User) — tasks.md 13.2', () => {
    it('PATCH reassigning a maintenance-role user to a different live company reflects immediately on GET', async () => {
      const admin = await buildSeedUser({
        id: 'reassign-admin-id',
        email: 'reassign-admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'reassign-technician-id',
        email: 'reassign-technician@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'reassign-company-a',
      });
      const { app } = await buildApp(
        [admin, technician],
        ['reassign-company-a', 'reassign-company-b'],
      );

      try {
        const agent = await loginAgent(app, 'reassign-admin@example.com');

        const patchResponse = await agent
          .patch(`/users/${technician.id}`)
          .send({ maintenanceCompanyId: 'reassign-company-b' })
          .expect(200);
        expect(patchResponse.body).toMatchObject({
          id: technician.id,
          maintenanceCompanyId: 'reassign-company-b',
        });

        const list = await agent.get('/users').expect(200);
        const found = (
          list.body as Array<{ id: string; maintenanceCompanyId: string }>
        ).find((user) => user.id === technician.id);
        expect(found?.maintenanceCompanyId).toBe('reassign-company-b');
      } finally {
        await app.close();
      }
    });

    it('PATCH demoting a maintenance-role user away from a maintenance role leaves maintenanceCompanyId untouched (spec: Role change away from a maintenance role leaves maintenanceCompanyId untouched)', async () => {
      const admin = await buildSeedUser({
        id: 'demote-admin-id',
        email: 'demote-admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'demote-technician-id',
        email: 'demote-technician@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'demote-company-a',
      });
      const { app } = await buildApp([admin, technician], ['demote-company-a']);

      try {
        const agent = await loginAgent(app, 'demote-admin@example.com');

        const patchResponse = await agent
          .patch(`/users/${technician.id}`)
          .send({ role: 'MANAGER' })
          .expect(200);
        expect(patchResponse.body).toMatchObject({
          id: technician.id,
          role: 'MANAGER',
          maintenanceCompanyId: 'demote-company-a',
        });

        const list = await agent.get('/users').expect(200);
        const found = (
          list.body as Array<{
            id: string;
            role: string;
            maintenanceCompanyId: string;
          }>
        ).find((user) => user.id === technician.id);
        expect(found?.role).toBe('MANAGER');
        expect(found?.maintenanceCompanyId).toBe('demote-company-a');
      } finally {
        await app.close();
      }
    });
  });

  // maintenance-company spec.md "Grandfathered Maintenance-Role Users
  // Without a Company" (OQ2) — tasks.md 13.3. Seeded directly via
  // userRepository.seed() (bypassing the create-user pipe/use case
  // entirely), the same way a pre-existing DB row from before this
  // migration would look: a maintenance-role user with
  // maintenanceCompanyId: null. User's constructor performs no validation
  // (design.md Decision 5's explicit landmine callout), so this seed is a
  // faithful hermetic stand-in for that historical row.
  describe('Grandfathered companyless maintenance-role user (spec.md OQ2) — tasks.md 13.3', () => {
    let app: INestApplication<App>;
    const adminEmail = 'grandfathered-admin@example.com';
    const grandfatheredId = 'grandfathered-technician-id';
    const LIVE_COMPANY = 'grandfathered-live-company';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'grandfathered-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const grandfathered = await buildSeedUser({
        id: grandfatheredId,
        email: 'grandfathered@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: null,
      });
      ({ app } = await buildApp([admin, grandfathered], [LIVE_COMPANY]));
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /users/:id (via list) returns the grandfathered user unchanged, unrestricted (spec: Grandfathered user remains readable and listable indefinitely)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const list = await agent.get('/users').expect(200);
      const found = (
        list.body as Array<{
          id: string;
          role: string;
          maintenanceCompanyId: string | null;
        }>
      ).find((user) => user.id === grandfatheredId);

      expect(found).toMatchObject({
        id: grandfatheredId,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: null,
      });
    });

    it('PATCH touching only an unrelated field is rejected with code MAINTENANCE_COMPANY_REQUIRED, user unchanged (spec: PATCH on a grandfathered user is rejected even for an unrelated field)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch(`/users/${grandfatheredId}`)
        .send({ email: 'grandfathered-renamed@example.com' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        code: 'MAINTENANCE_COMPANY_REQUIRED',
      });

      const list = await agent.get('/users').expect(200);
      const found = (list.body as Array<{ id: string; email: string }>).find(
        (user) => user.id === grandfatheredId,
      );
      expect(found?.email).toBe('grandfathered@example.com');
    });

    it('PATCH supplying a live maintenanceCompanyId resolves the invariant (spec: Supplying a company on that PATCH resolves the invariant)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch(`/users/${grandfatheredId}`)
        .send({ maintenanceCompanyId: LIVE_COMPANY })
        .expect(200);

      expect(response.body).toMatchObject({
        id: grandfatheredId,
        maintenanceCompanyId: LIVE_COMPANY,
      });

      const list = await agent.get('/users').expect(200);
      const found = (
        list.body as Array<{ id: string; maintenanceCompanyId: string }>
      ).find((user) => user.id === grandfatheredId);
      expect(found?.maintenanceCompanyId).toBe(LIVE_COMPANY);
    });
  });

  // authorization spec.md "Maintenance-Role Permissions Stay Inert" —
  // tasks.md 13.4. Unit-level exhaustive coverage of ROLE_PERMISSIONS
  // (SYSTEM_ADMIN gets everything, the other 4 roles including both
  // maintenance roles stay []) already exists in
  // role-permission.checker.spec.ts (tasks.md 4.2). The targeted addition
  // this suite is missing: confirming, at the HTTP/e2e level and from the
  // /users routes specifically, that a MAINTENANCE_TECHNICIAN or
  // MAINTENANCE_COMPANY_MANAGER caller — not just a generic non-admin
  // (MANAGER) as the existing "Anonymous and non-admin access control"
  // group already covers — gets 403 on every /users route, even though
  // their own maintenanceCompanyId is set (authorization spec: "A
  // maintenance-role user cannot access any endpoint via their company
  // association").
  describe('Maintenance-role holder gets 403 on /users (authorization spec) — tasks.md 13.4', () => {
    let app: INestApplication<App>;
    const technicianEmail = 'permissions-technician@example.com';
    let targetUserId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'permissions-admin-id',
        email: 'permissions-admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'permissions-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'permissions-company',
      });
      const target = await buildSeedUser({
        id: 'permissions-target-id',
        email: 'permissions-target@example.com',
        role: 'MANAGER',
      });
      targetUserId = target.id;
      ({ app } = await buildApp(
        [admin, technician, target],
        ['permissions-company'],
      ));
    });

    afterAll(async () => {
      await app.close();
    });

    it.each([
      ['POST', '/users'],
      ['GET', '/users'],
      ['PATCH', `/users/permissions-target-id`],
      ['DELETE', `/users/permissions-target-id`],
    ] as const)(
      'MAINTENANCE_TECHNICIAN caller (own maintenanceCompanyId set) -> 403 on %s %s',
      async (method, path) => {
        const agent = await loginAgent(app, technicianEmail);
        const req =
          method === 'POST'
            ? agent.post(path).send({
                email: 'blocked-by-technician@example.com',
                password: 'aValidPassw0rd',
                role: 'MANAGER',
              })
            : method === 'GET'
              ? agent.get(path)
              : method === 'PATCH'
                ? agent.patch(path).send({ email: 'blocked@example.com' })
                : agent.delete(path);

        const response = await req;
        expect(response.status).toBe(403);
      },
    );

    it('the targeted user is unaffected after every rejected attempt', async () => {
      const verifyAgent = await loginAgent(
        app,
        'permissions-admin@example.com',
      );
      const list = await verifyAgent.get('/users').expect(200);
      expect(
        (list.body as Array<{ id: string; role: string }>).find(
          (user) => user.id === targetUserId,
        )?.role,
      ).toBe('MANAGER');
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
