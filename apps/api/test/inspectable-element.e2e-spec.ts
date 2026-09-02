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
import { COMMUNITY_REPOSITORY } from '../src/modules/community/application/ports/community.repository.port';
import { InMemoryCommunityRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community.repository';
import {
  Community,
  type Locale,
} from '../src/modules/community/domain/community.entity';
import { INSPECTABLE_ELEMENT_REPOSITORY } from '../src/modules/inspectable-element/application/ports/inspectable-element.repository.port';
import { InMemoryInspectableElementRepository } from '../src/modules/inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';
// design.md Testing Strategy (E2E row) + tasks.md 10.x: reuse the SAME
// in-memory fakes the use-case unit specs already exercise (Phase 5), rather
// than hand-rolling new ones for this suite — mirrors
// test/community.e2e-spec.ts's and test/maintenance-company.e2e-spec.ts's
// reuse of their own in-memory repositories.
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';

// design.md Testing Strategy (E2E row): hermetic, no test DB — mirrors
// test/community.e2e-spec.ts / test/maintenance-company.e2e-spec.ts
// (USER_REPOSITORY, TOKEN_DENYLIST, COMMUNITY_REPOSITORY, and
// INSPECTABLE_ELEMENT_REPOSITORY overridden with in-memory doubles;
// PrismaService stubbed only so nothing tries to open a real DB connection
// via the @Global() PrismaModule).
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

function buildCommunity(input: {
  id: string;
  name?: string;
  address?: string;
  locale?: Locale;
  deletedAt?: Date | null;
}): Community {
  return new Community({
    id: input.id,
    name: input.name ?? `Community ${input.id}`,
    address: input.address ?? '1 Example St',
    locale: input.locale ?? 'en',
    deletedAt: input.deletedAt ?? null,
  });
}

// Builds a fully isolated Nest app + in-memory repositories per test group,
// so mutation-heavy scenarios (cross-community isolation, guard rejections)
// never leak state into unrelated tests — mirrors
// test/community.e2e-spec.ts's buildApp isolation rationale.
async function buildApp(seed: {
  users?: User[];
  communities?: Community[];
}): Promise<{
  app: INestApplication<App>;
  userRepository: UserRepository;
  communityRepository: InMemoryCommunityRepository;
  elementRepository: InMemoryInspectableElementRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const communityRepository = new InMemoryCommunityRepository();
  for (const community of seed.communities ?? []) {
    communityRepository.seed(community);
  }

  const elementRepository = new InMemoryInspectableElementRepository();
  const tokenDenylist = new InMemoryTokenDenylist();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(tokenDenylist)
    .overrideProvider(COMMUNITY_REPOSITORY)
    .useValue(communityRepository)
    .overrideProvider(INSPECTABLE_ELEMENT_REPOSITORY)
    .useValue(elementRepository)
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, userRepository, communityRepository, elementRepository };
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

interface ElementResponseBody {
  id: string;
  communityId: string;
  elementType: string;
  name: string;
  description: string | null;
  location: string;
  serialNumber: string | null;
  installedAt: string;
}

describe('Inspectable Elements (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('CRUD full lifecycle + community-scoped isolation (tasks.md 10.1, inspectable-element-management spec)', () => {
    let app: INestApplication<App>;
    let elementRepository: InMemoryInspectableElementRepository;
    const adminEmail = 'ie-crud-admin@example.com';
    const communityAId = 'ie-crud-community-a';
    const communityBId = 'ie-crud-community-b';
    const softDeletedCommunityId = 'ie-crud-community-soft-deleted';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'ie-crud-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const communityA = buildCommunity({ id: communityAId });
      const communityB = buildCommunity({ id: communityBId });
      const softDeletedCommunity = buildCommunity({
        id: softDeletedCommunityId,
        deletedAt: new Date(),
      });
      ({ app, elementRepository } = await buildApp({
        users: [admin],
        communities: [communityA, communityB, softDeletedCommunity],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates an element under an existing community (spec: Admin creates an element under an existing community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Extintor pasillo',
          location: 'Planta baja',
          installedAt: '2026-03-15',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        communityId: communityAId,
        elementType: 'EXTINGUISHER',
        name: 'Extintor pasillo',
        location: 'Planta baja',
        installedAt: '2026-03-15',
        description: null,
        serialNumber: null,
      });
      expect(response.body).toHaveProperty('id');
    });

    it('rejects a request missing a required field (spec: Missing required field rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          name: 'No Type Extinguisher',
          location: 'Planta baja',
          installedAt: '2026-03-15',
        })
        .expect(400);
    });

    it('rejects create under a non-existent community, no element row created (spec: Non-existent community rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const createSpy = jest.spyOn(elementRepository, 'create');

      const response = await agent
        .post('/communities/does-not-exist/inspectable-elements')
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Ghost Extinguisher',
          location: 'Nowhere',
          installedAt: '2026-03-15',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'COMMUNITY_NOT_FOUND',
      });
      expect(createSpy).not.toHaveBeenCalled();
      createSpy.mockRestore();
    });

    it('rejects create under a soft-deleted community, no element row created (spec: Soft-deleted community rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const createSpy = jest.spyOn(elementRepository, 'create');

      const response = await agent
        .post(`/communities/${softDeletedCommunityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Ghost Extinguisher',
          location: 'Nowhere',
          installedAt: '2026-03-15',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'COMMUNITY_NOT_FOUND',
      });
      expect(createSpy).not.toHaveBeenCalled();
      createSpy.mockRestore();
    });

    it('lists a community’s active elements, scoped strictly per community (spec: Admin lists elements for an existing community, Elements are scoped strictly per community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Scoped Extinguisher',
          location: 'Roof',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;

      const listA = await agent
        .get(`/communities/${communityAId}/inspectable-elements`)
        .expect(200);
      expect(Array.isArray(listA.body)).toBe(true);
      expect(
        (listA.body as ElementResponseBody[]).some(
          (element) => element.id === elementId,
        ),
      ).toBe(true);

      const listB = await agent
        .get(`/communities/${communityBId}/inspectable-elements`)
        .expect(200);
      expect(
        (listB.body as ElementResponseBody[]).some(
          (element) => element.id === elementId,
        ),
      ).toBe(false);
    });

    it('rejects listing for a non-existent or soft-deleted community (spec: Non-existent or soft-deleted community rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const unknownResponse = await agent
        .get('/communities/does-not-exist/inspectable-elements')
        .expect(404);
      expect(unknownResponse.body).toMatchObject({
        statusCode: 404,
        code: 'COMMUNITY_NOT_FOUND',
      });

      const softDeletedResponse = await agent
        .get(`/communities/${softDeletedCommunityId}/inspectable-elements`)
        .expect(404);
      expect(softDeletedResponse.body).toMatchObject({
        statusCode: 404,
        code: 'COMMUNITY_NOT_FOUND',
      });
    });

    it("updates an element's fields (spec: Admin updates an element's fields)", async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'To Rename Extinguisher',
          location: 'Old Location',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;

      const response = await agent
        .patch(`/communities/${communityAId}/inspectable-elements/${elementId}`)
        .send({
          name: 'Renamed Extinguisher',
          location: 'New Location',
          description: 'Recently serviced',
          serialNumber: 'SN-UPDATED',
          installedAt: '2026-04-01',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: elementId,
        communityId: communityAId,
        name: 'Renamed Extinguisher',
        location: 'New Location',
        description: 'Recently serviced',
        serialNumber: 'SN-UPDATED',
        installedAt: '2026-04-01',
      });
    });

    it('returns 404 INSPECTABLE_ELEMENT_NOT_FOUND updating a non-existent element id (spec: Update targets a non-existent element id)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch(
          `/communities/${communityAId}/inspectable-elements/does-not-exist`,
        )
        .send({ name: 'Ghost' })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });
    });

    it('returns 404 INSPECTABLE_ELEMENT_NOT_FOUND updating a soft-deleted element (spec: Update targets a soft-deleted element)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Soon Deleted Extinguisher',
          location: 'Basement',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;

      await agent
        .delete(
          `/communities/${communityAId}/inspectable-elements/${elementId}`,
        )
        .expect(204);

      const response = await agent
        .patch(`/communities/${communityAId}/inspectable-elements/${elementId}`)
        .send({ name: 'Should Not Apply' })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });
    });

    it('returns 404 INSPECTABLE_ELEMENT_NOT_FOUND on PATCH/DELETE against a different community than the element’s own (spec: Update targets an element belonging to a different community, Delete targets an element in a different community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Cross Community Extinguisher',
          location: 'Lobby',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;

      const patchResponse = await agent
        .patch(`/communities/${communityBId}/inspectable-elements/${elementId}`)
        .send({ name: 'Should Not Apply' })
        .expect(404);
      expect(patchResponse.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });

      const deleteResponse = await agent
        .delete(
          `/communities/${communityBId}/inspectable-elements/${elementId}`,
        )
        .expect(404);
      expect(deleteResponse.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });

      // The element must still be listed, untouched, under its real
      // community (A) — the cross-community attempts must not have applied.
      const listA = await agent
        .get(`/communities/${communityAId}/inspectable-elements`)
        .expect(200);
      const stillThere = (listA.body as ElementResponseBody[]).find(
        (element) => element.id === elementId,
      );
      expect(stillThere).toMatchObject({
        id: elementId,
        name: 'Cross Community Extinguisher',
      });
    });

    it('soft-deletes an element, excluded from the list afterwards (spec: Admin soft-deletes an element, Soft-deleted elements excluded from the list)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'To Delete Extinguisher',
          location: 'Garage',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;

      await agent
        .delete(
          `/communities/${communityAId}/inspectable-elements/${elementId}`,
        )
        .expect(204);

      const list = await agent
        .get(`/communities/${communityAId}/inspectable-elements`)
        .expect(200);
      expect(
        (list.body as ElementResponseBody[]).some(
          (element) => element.id === elementId,
        ),
      ).toBe(false);
    });

    it('returns 404 INSPECTABLE_ELEMENT_NOT_FOUND deleting a missing or already soft-deleted element (spec: Delete targets an element that is missing, soft-deleted, or in a different community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const missingResponse = await agent
        .delete(
          `/communities/${communityAId}/inspectable-elements/does-not-exist`,
        )
        .expect(404);
      expect(missingResponse.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });

      const created = await agent
        .post(`/communities/${communityAId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Already Deleted Extinguisher',
          location: 'Attic',
          installedAt: '2026-03-15',
        })
        .expect(201);
      const elementId = (created.body as ElementResponseBody).id;
      await agent
        .delete(
          `/communities/${communityAId}/inspectable-elements/${elementId}`,
        )
        .expect(204);

      const repeatResponse = await agent
        .delete(
          `/communities/${communityAId}/inspectable-elements/${elementId}`,
        )
        .expect(404);
      expect(repeatResponse.body).toMatchObject({
        statusCode: 404,
        code: 'INSPECTABLE_ELEMENT_NOT_FOUND',
      });
    });
  });

  describe('No uniqueness on name, location, or serialNumber (tasks.md 10.1, spec: No Uniqueness Constraints on Name, Location, or Serial Number)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'ie-unique-admin@example.com';
    const communityId = 'ie-unique-community-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'ie-unique-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const community = buildCommunity({ id: communityId });
      ({ app } = await buildApp({ users: [admin], communities: [community] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('accepts two elements with identical name and location (spec: Two elements share the same name and location)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const first = await agent
        .post(`/communities/${communityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Extintor pasillo',
          location: 'Planta baja',
          installedAt: '2026-03-15',
        })
        .expect(201);

      const second = await agent
        .post(`/communities/${communityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Extintor pasillo',
          location: 'Planta baja',
          installedAt: '2026-03-16',
        })
        .expect(201);

      expect((first.body as ElementResponseBody).id).not.toBe(
        (second.body as ElementResponseBody).id,
      );

      const list = await agent
        .get(`/communities/${communityId}/inspectable-elements`)
        .expect(200);
      const ids = (list.body as ElementResponseBody[]).map(
        (element) => element.id,
      );
      expect(ids).toEqual(
        expect.arrayContaining([
          (first.body as ElementResponseBody).id,
          (second.body as ElementResponseBody).id,
        ]),
      );
    });

    it('accepts duplicated and absent serialNumber values (spec: serialNumber may be omitted or duplicated)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Serial Holder One',
          location: 'Zone A',
          installedAt: '2026-03-15',
          serialNumber: 'SN-001',
        })
        .expect(201);

      const duplicate = await agent
        .post(`/communities/${communityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Serial Holder Two',
          location: 'Zone B',
          installedAt: '2026-03-15',
          serialNumber: 'SN-001',
        })
        .expect(201);
      expect((duplicate.body as ElementResponseBody).serialNumber).toBe(
        'SN-001',
      );

      const noSerial = await agent
        .post(`/communities/${communityId}/inspectable-elements`)
        .send({
          elementType: 'EXTINGUISHER',
          name: 'Serial Holder Three',
          location: 'Zone C',
          installedAt: '2026-03-15',
        })
        .expect(201);
      expect((noSerial.body as ElementResponseBody).serialNumber).toBeNull();
    });
  });

  describe('Anonymous and non-admin access control on every inspectable-elements route (tasks.md 10.2, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'ie-guard-admin@example.com';
    const managerEmail = 'ie-guard-manager@example.com';
    const mcManagerEmail = 'ie-guard-mc-manager@example.com';
    const technicianEmail = 'ie-guard-technician@example.com';
    const representativeEmail = 'ie-guard-representative@example.com';
    const communityId = 'ie-guard-community-id';
    const elementId = 'ie-guard-element-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'ie-guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const manager = await buildSeedUser({
        id: 'ie-guard-manager-id',
        email: managerEmail,
        role: 'MANAGER',
      });
      const mcManager = await buildSeedUser({
        id: 'ie-guard-mc-manager-id',
        email: mcManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      const technician = await buildSeedUser({
        id: 'ie-guard-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'ie-guard-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const community = buildCommunity({ id: communityId });
      ({ app } = await buildApp({
        users: [admin, manager, mcManager, technician, representative],
        communities: [community],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    const routes = [
      ['POST', `/communities/${communityId}/inspectable-elements`],
      ['GET', `/communities/${communityId}/inspectable-elements`],
      [
        'PATCH',
        `/communities/${communityId}/inspectable-elements/${elementId}`,
      ],
      [
        'DELETE',
        `/communities/${communityId}/inspectable-elements/${elementId}`,
      ],
    ] as const;

    function sendRoute(
      agent: ReturnType<typeof request>,
      method: (typeof routes)[number][0],
      path: string,
    ) {
      switch (method) {
        case 'POST':
          return agent.post(path).send({
            elementType: 'EXTINGUISHER',
            name: 'x',
            location: 'x',
            installedAt: '2026-03-15',
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
    // check" — 401 on every inspectable-elements route, no session cookie.
    it.each(routes)('anonymous %s %s -> 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const response = await sendRoute(req, method, path);
      expect(response.status).toBe(401);
    });

    // authorization spec: "Non-admin role is rejected" — 403 for each of the
    // 4 named non-admin roles, proving the corresponding ROLE_PERMISSIONS
    // rows stay [] (spec: "Non-admin roles stay mapped to no permissions").
    const nonAdminEmails: Array<[Role, string]> = [
      ['MANAGER', managerEmail],
      ['MAINTENANCE_COMPANY_MANAGER', mcManagerEmail],
      ['MAINTENANCE_TECHNICIAN', technicianEmail],
      ['COMMUNITY_REPRESENTATIVE', representativeEmail],
    ];

    for (const [role, email] of nonAdminEmails) {
      it.each(routes)(`${role} %s %s -> 403`, async (method, path) => {
        const agent = await loginAgent(app, email);
        const response = await sendRoute(agent, method, path);
        expect(response.status).toBe(403);
      });
    }

    it('SYSTEM_ADMIN is permitted through the guard (authorization spec: SYSTEM_ADMIN is permitted)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent
        .get(`/communities/${communityId}/inspectable-elements`)
        .expect(200);
    });
  });
});
