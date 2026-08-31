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
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../src/modules/users/application/ports/maintenance-company-lookup.port';
import { MAINTENANCE_COMPANY_REPOSITORY } from '../src/modules/maintenance-company/application/ports/maintenance-company.repository.port';
import { InMemoryMaintenanceCompanyRepository } from '../src/modules/maintenance-company/application/use-cases/testing/in-memory-maintenance-company.repository';
// design.md Testing Strategy (E2E row) + tasks.md 12.x: reuse the SAME
// in-memory fakes the use-case unit specs already exercise (Phases 5/7),
// rather than hand-rolling new ones for this suite — mirrors
// test/community.e2e-spec.ts's and test/users.e2e-spec.ts's reuse of
// InMemoryUserRepository / InMemoryMaintenanceCompanyRepository.
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';
import { MaintenanceCompany } from '../src/modules/maintenance-company/domain/maintenance-company.entity';

// design.md Testing Strategy (E2E row): hermetic, no test DB — mirrors
// test/users.e2e-spec.ts / test/community.e2e-spec.ts (USER_REPOSITORY,
// TOKEN_DENYLIST, MAINTENANCE_COMPANY_REPOSITORY, and
// MAINTENANCE_COMPANY_LOOKUP overridden with in-memory doubles; PrismaService
// stubbed only so nothing tries to open a real DB connection via the
// @Global() PrismaModule).
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

// This suite exercises MaintenanceCompanyController, not the
// MAINTENANCE_COMPANY_LOOKUP cross-module contract (that belongs to
// users.e2e-spec.ts / tasks.md Phase 13, which covers the REQUIRED/
// NOT_ALLOWED/NOT_FOUND shapes precisely). A stub that treats every id as
// live keeps the PATCH /users/:id reassignment step in tasks.md 12.4 from
// needing to duplicate that coverage here.
class AlwaysLiveMaintenanceCompanyLookup implements MaintenanceCompanyLookup {
  existsActive(): Promise<boolean> {
    return Promise.resolve(true);
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

// Builds a fully isolated Nest app + in-memory repositories per test group,
// so mutation-heavy scenarios (duplicate taxId, delete-block, reassignment)
// never leak state into unrelated tests — mirrors test/community.e2e-spec.ts's
// buildApp isolation rationale.
async function buildApp(seed: { users?: User[] } = {}): Promise<{
  app: INestApplication<App>;
  userRepository: UserRepository;
  maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const maintenanceCompanyRepository =
    new InMemoryMaintenanceCompanyRepository();
  const tokenDenylist = new InMemoryTokenDenylist();
  const maintenanceCompanyLookup = new AlwaysLiveMaintenanceCompanyLookup();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(tokenDenylist)
    .overrideProvider(MAINTENANCE_COMPANY_REPOSITORY)
    .useValue(maintenanceCompanyRepository)
    .overrideProvider(MAINTENANCE_COMPANY_LOOKUP)
    .useValue(maintenanceCompanyLookup)
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, userRepository, maintenanceCompanyRepository };
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

describe('Maintenance Companies (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('Maintenance Company CRUD happy paths (tasks.md 12.1)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'mc-crud-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'mc-crud-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates a maintenance company (spec: Admin creates a maintenance company)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Acme Elevators',
          taxId: 'B11111111',
          contactInfo: 'ops@acme-elevators.example',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Acme Elevators',
        taxId: 'B11111111',
        contactInfo: 'ops@acme-elevators.example',
      });
      expect(response.body).toHaveProperty('id');
    });

    it('rejects a blank taxId (spec: Blank taxId rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/maintenance-companies')
        .send({ name: 'No Tax Id Co', taxId: '   ', contactInfo: 'x' })
        .expect(400);
    });

    it('lists maintenance companies (spec: Admin lists maintenance companies)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Listed Co',
          taxId: 'B22222222',
          contactInfo: 'contact@listed.example',
        })
        .expect(201);

      const response = await agent.get('/maintenance-companies').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(
        (response.body as Array<{ id: string }>).some(
          (company) => company.id === (created.body as { id: string }).id,
        ),
      ).toBe(true);
    });

    it("updates a maintenance company's fields (spec: Admin updates a maintenance company)", async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/maintenance-companies')
        .send({
          name: 'To Rename Co',
          taxId: 'B33333333',
          contactInfo: 'contact@torename.example',
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      const response = await agent
        .patch(`/maintenance-companies/${id}`)
        .send({
          name: 'Renamed Co',
          contactInfo: 'new-contact@renamed.example',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        name: 'Renamed Co',
        taxId: 'B33333333',
        contactInfo: 'new-contact@renamed.example',
      });
    });

    it('returns 404 when updating a non-existent company (spec: Update targets a non-existent company)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/maintenance-companies/does-not-exist')
        .send({ name: 'Ghost Co' })
        .expect(404);
    });

    it('soft-deletes a maintenance company (spec: Admin soft-deletes a company via delete + soft-deleted companies excluded from the list)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const created = await agent
        .post('/maintenance-companies')
        .send({
          name: 'To Delete Co',
          taxId: 'B44444444',
          contactInfo: 'contact@todelete.example',
        })
        .expect(201);
      const id = (created.body as { id: string }).id;

      await agent.delete(`/maintenance-companies/${id}`).expect(204);

      const list = await agent.get('/maintenance-companies').expect(200);
      expect(
        (list.body as Array<{ id: string }>).some(
          (company) => company.id === id,
        ),
      ).toBe(false);
    });
  });

  describe('taxId uniqueness among active companies (tasks.md 12.2, spec: taxId Uniqueness Among Active Companies)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'mc-taxid-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'mc-taxid-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects creating a second active company with a duplicate taxId (spec: Duplicate active taxId rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/maintenance-companies')
        .send({
          name: 'First Holder',
          taxId: 'B55555555',
          contactInfo: 'first@holder.example',
        })
        .expect(201);

      const response = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Second Holder',
          taxId: 'B55555555',
          contactInfo: 'second@holder.example',
        })
        .expect(409);

      // tasks.md 12.1: body.code asserted for TAX_ID_ALREADY_IN_USE.
      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'TAX_ID_ALREADY_IN_USE',
      });
      expect(typeof (response.body as { message: unknown }).message).toBe(
        'string',
      );
    });

    it('rejects updating a company to a taxId already held by another active company (spec: Duplicate active taxId rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/maintenance-companies')
        .send({
          name: 'Holder A',
          taxId: 'B66666666',
          contactInfo: 'a@holder.example',
        })
        .expect(201);
      const holderB = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Holder B',
          taxId: 'B77777777',
          contactInfo: 'b@holder.example',
        })
        .expect(201);

      const response = await agent
        .patch(`/maintenance-companies/${(holderB.body as { id: string }).id}`)
        .send({ taxId: 'B66666666' })
        .expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'TAX_ID_ALREADY_IN_USE',
      });
    });

    it('frees a soft-deleted company taxId for reuse (spec: Soft-deleted company taxId becomes reusable)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const original = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Original Co',
          taxId: 'B88888888',
          contactInfo: 'original@co.example',
        })
        .expect(201);
      await agent
        .delete(
          `/maintenance-companies/${(original.body as { id: string }).id}`,
        )
        .expect(204);

      const reused = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Reonboarded Co',
          taxId: 'B88888888',
          contactInfo: 'reonboarded@co.example',
        })
        .expect(201);

      expect(reused.body).toMatchObject({
        name: 'Reonboarded Co',
        taxId: 'B88888888',
      });
    });
  });

  describe('Refuse delete while active users attached (tasks.md 12.3, spec: Refuse Delete While Active Users Attached)', () => {
    let app: INestApplication<App>;
    let userRepository: UserRepository;
    let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
    const adminEmail = 'mc-block-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'mc-block-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app, userRepository, maintenanceCompanyRepository } = await buildApp({
        users: [admin],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('refuses to delete a company with an active user attached, leaves the company and the user untouched (spec: Delete refused while an active user is attached)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const company = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Blocked Co',
          taxId: 'B99999999',
          contactInfo: 'blocked@co.example',
        })
        .expect(201);
      const companyId = (company.body as { id: string }).id;

      const createdUser = await agent
        .post('/users')
        .send({
          email: 'mc-blocking-tech@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: companyId,
        })
        .expect(201);
      const userId = (createdUser.body as { id: string }).id;
      const userBeforeDeleteAttempt = await userRepository.findById(userId);

      const response = await agent
        .delete(`/maintenance-companies/${companyId}`)
        .expect(409);

      // tasks.md 12.1: body.code asserted for
      // MAINTENANCE_COMPANY_HAS_ACTIVE_USERS.
      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS',
      });
      expect(typeof (response.body as { message: unknown }).message).toBe(
        'string',
      );

      // Company's deletedAt MUST remain null.
      const companyAfterAttempt =
        await maintenanceCompanyRepository.findById(companyId);
      expect(companyAfterAttempt).not.toBeNull();
      expect(companyAfterAttempt?.deletedAt).toBeNull();

      // A refused delete attempt MUST NOT modify any user record.
      const userAfterDeleteAttempt = await userRepository.findById(userId);
      expect(userAfterDeleteAttempt).toEqual(userBeforeDeleteAttempt);
    });
  });

  describe('Delete succeeds after clearing the block (tasks.md 12.4, spec: Delete succeeds after reassigning or removing every active user + Soft-deleted users do not block deletion)', () => {
    let app: INestApplication<App>;
    let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
    const adminEmail = 'mc-clear-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'mc-clear-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app, maintenanceCompanyRepository } = await buildApp({
        users: [admin],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('succeeds once the blocking user is reassigned to a different company', async () => {
      const agent = await loginAgent(app, adminEmail);

      const companyA = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Reassign Source Co',
          taxId: 'B10000001',
          contactInfo: 'a@reassign.example',
        })
        .expect(201);
      const companyAId = (companyA.body as { id: string }).id;
      const companyB = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Reassign Target Co',
          taxId: 'B10000002',
          contactInfo: 'b@reassign.example',
        })
        .expect(201);
      const companyBId = (companyB.body as { id: string }).id;

      const createdUser = await agent
        .post('/users')
        .send({
          email: 'mc-reassign-tech@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: companyAId,
        })
        .expect(201);
      const userId = (createdUser.body as { id: string }).id;

      await agent.delete(`/maintenance-companies/${companyAId}`).expect(409);

      await agent
        .patch(`/users/${userId}`)
        .send({ maintenanceCompanyId: companyBId })
        .expect(200);

      await agent.delete(`/maintenance-companies/${companyAId}`).expect(204);

      const companyAfterDelete =
        await maintenanceCompanyRepository.findById(companyAId);
      expect(companyAfterDelete).toBeNull();
    });

    it('succeeds once the blocking user is soft-deleted', async () => {
      const agent = await loginAgent(app, adminEmail);

      const company = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Deactivate Blocker Co',
          taxId: 'B10000003',
          contactInfo: 'contact@deactivate.example',
        })
        .expect(201);
      const companyId = (company.body as { id: string }).id;

      const createdUser = await agent
        .post('/users')
        .send({
          email: 'mc-deactivated-tech@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: companyId,
        })
        .expect(201);
      const userId = (createdUser.body as { id: string }).id;

      await agent.delete(`/maintenance-companies/${companyId}`).expect(409);

      await agent.delete(`/users/${userId}`).expect(204);

      await agent.delete(`/maintenance-companies/${companyId}`).expect(204);

      const companyAfterDelete =
        await maintenanceCompanyRepository.findById(companyId);
      expect(companyAfterDelete).toBeNull();
    });

    it('a user already soft-deleted before the attempt never blocks deletion (spec: Soft-deleted users do not block deletion)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const company = await agent
        .post('/maintenance-companies')
        .send({
          name: 'Never Blocked Co',
          taxId: 'B10000004',
          contactInfo: 'contact@neverblocked.example',
        })
        .expect(201);
      const companyId = (company.body as { id: string }).id;

      const createdUser = await agent
        .post('/users')
        .send({
          email: 'mc-preexisting-softdeleted-tech@example.com',
          password: 'aValidPassw0rd',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: companyId,
        })
        .expect(201);
      const userId = (createdUser.body as { id: string }).id;

      // The user is soft-deleted BEFORE any delete attempt on the company —
      // it must never have counted against the block in the first place.
      await agent.delete(`/users/${userId}`).expect(204);

      await agent.delete(`/maintenance-companies/${companyId}`).expect(204);

      const companyAfterDelete =
        await maintenanceCompanyRepository.findById(companyId);
      expect(companyAfterDelete).toBeNull();
    });
  });

  describe('Anonymous and non-admin access control on every /maintenance-companies route (tasks.md 12.5, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'mc-guard-admin@example.com';
    const nonAdminEmail = 'mc-guard-manager@example.com';
    const maintenanceRoleEmail = 'mc-guard-technician@example.com';
    const companyId = 'mc-guard-company-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'mc-guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const nonAdmin = await buildSeedUser({
        id: 'mc-guard-manager-id',
        email: nonAdminEmail,
        role: 'MANAGER',
      });
      // authorization spec: "Non-admin role is rejected, including a
      // maintenance-role holder" — MAINTENANCE_TECHNICIAN gets [] for all 4
      // maintenanceCompany:* permissions despite the company id being "their
      // own" domain (design.md RBAC table). The technician's
      // maintenanceCompanyId deliberately matches `companyId` below —
      // "regardless of whether that caller's own maintenanceCompanyId
      // matches the resource being accessed" (authorization spec scenario).
      const maintenanceTechnician = await buildSeedUser({
        id: 'mc-guard-technician-id',
        email: maintenanceRoleEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: companyId,
      });
      let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
      ({ app, maintenanceCompanyRepository } = await buildApp({
        users: [admin, nonAdmin, maintenanceTechnician],
      }));
      maintenanceCompanyRepository.seed(
        new MaintenanceCompany({
          id: companyId,
          name: 'Guard Co',
          taxId: 'B10000005',
          contactInfo: 'contact@guard.example',
          deletedAt: null,
        }),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    const routes = [
      ['POST', '/maintenance-companies'],
      ['GET', '/maintenance-companies'],
      ['PATCH', `/maintenance-companies/${companyId}`],
      ['DELETE', `/maintenance-companies/${companyId}`],
    ] as const;

    function sendRoute(
      agent: ReturnType<typeof request>,
      method: (typeof routes)[number][0],
      path: string,
    ) {
      switch (method) {
        case 'POST':
          return agent.post(path).send({
            name: 'x',
            taxId: 'IRRELEVANT',
            contactInfo: 'x',
          });
        case 'GET':
          return agent.get(path);
        case 'PATCH':
          return agent.patch(path).send({ name: 'x' });
        case 'DELETE':
          return agent.delete(path);
      }
    }

    // authorization spec: "Unauthenticated caller is rejected before role
    // check" — 401 on every /maintenance-companies route, no session cookie
    // at all.
    it.each(routes)('anonymous %s %s -> 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const response = await sendRoute(req, method, path);
      expect(response.status).toBe(401);
    });

    // authorization spec: "Non-admin role is rejected, including a
    // maintenance-role holder" — 403 for a non-SYSTEM_ADMIN caller.
    it.each(routes)('non-admin %s %s -> 403', async (method, path) => {
      const agent = await loginAgent(app, nonAdminEmail);
      const response = await sendRoute(agent, method, path);
      expect(response.status).toBe(403);
    });

    // authorization spec: explicit maintenance-role-holder case — a
    // MAINTENANCE_TECHNICIAN with a set maintenanceCompanyId is rejected the
    // same as any other non-admin, even against the company matching their
    // own maintenanceCompanyId.
    it.each(routes)(
      'maintenance-role holder %s %s -> 403',
      async (method, path) => {
        const agent = await loginAgent(app, maintenanceRoleEmail);
        const response = await sendRoute(agent, method, path);
        expect(response.status).toBe(403);
      },
    );

    it('SYSTEM_ADMIN is permitted through the guard (authorization spec: SYSTEM_ADMIN is permitted)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent.get('/maintenance-companies').expect(200);
    });
  });
});
