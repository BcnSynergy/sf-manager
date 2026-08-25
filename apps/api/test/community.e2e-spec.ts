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
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from '../src/modules/community/application/ports/community-representative.repository.port';
import { COMMUNITY_TECHNICIAN_REPOSITORY } from '../src/modules/community/application/ports/community-technician.repository.port';
import { InMemoryCommunityRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community.repository';
import { InMemoryCommunityRepresentativeRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community-representative.repository';
import { InMemoryCommunityTechnicianRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community-technician.repository';
import {
  Community,
  type Locale,
} from '../src/modules/community/domain/community.entity';
import { CommunityRepresentative } from '../src/modules/community/domain/community-representative.entity';
import { CommunityTechnician } from '../src/modules/community/domain/community-technician.entity';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';
// design.md Testing Strategy (E2E row) + tasks.md 11.x: reuse the SAME
// in-memory fakes the use-case unit specs already exercise (Phases 4/6/9),
// rather than hand-rolling new ones for this suite — mirrors
// test/users.e2e-spec.ts's reuse of InMemoryUserRepository.
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';

// design.md Testing Strategy (E2E row): hermetic, no test DB — mirrors
// test/users.e2e-spec.ts / test/auth.e2e-spec.ts (USER_REPOSITORY,
// TOKEN_DENYLIST, and the three community repository ports overridden with
// in-memory doubles; PrismaService stubbed only so nothing tries to open a
// real DB connection via the @Global() PrismaModule).
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

function buildRepresentative(input: {
  id: string;
  communityId: string;
  userId: string;
  deactivatedAt?: Date | null;
}): CommunityRepresentative {
  return new CommunityRepresentative({
    id: input.id,
    communityId: input.communityId,
    userId: input.userId,
    deactivatedAt: input.deactivatedAt ?? null,
  });
}

function buildTechnician(input: {
  id: string;
  communityId: string;
  userId: string;
  deactivatedAt?: Date | null;
}): CommunityTechnician {
  return new CommunityTechnician({
    id: input.id,
    communityId: input.communityId,
    userId: input.userId,
    deactivatedAt: input.deactivatedAt ?? null,
  });
}

// Builds a fully isolated Nest app + in-memory repositories per test group,
// so mutation-heavy scenarios (exclusivity swap, soft-delete cascade) never
// leak state into unrelated tests — mirrors test/users.e2e-spec.ts's
// buildApp isolation rationale (design.md Decision 2's countActiveByUser is
// a GLOBAL count, same isolation hazard as countActiveByRole there).
async function buildApp(seed: {
  users?: User[];
  communities?: Community[];
  representatives?: CommunityRepresentative[];
  technicians?: CommunityTechnician[];
}): Promise<{
  app: INestApplication<App>;
  userRepository: UserRepository;
  communityRepository: InMemoryCommunityRepository;
  representativeRepository: InMemoryCommunityRepresentativeRepository;
  technicianRepository: InMemoryCommunityTechnicianRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const communityRepository = new InMemoryCommunityRepository();
  for (const community of seed.communities ?? []) {
    communityRepository.seed(community);
  }

  const representativeRepository =
    new InMemoryCommunityRepresentativeRepository();
  for (const representative of seed.representatives ?? []) {
    representativeRepository.seed(representative);
  }

  const technicianRepository = new InMemoryCommunityTechnicianRepository();
  for (const technician of seed.technicians ?? []) {
    technicianRepository.seed(technician);
  }

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
    .overrideProvider(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    .useValue(representativeRepository)
    .overrideProvider(COMMUNITY_TECHNICIAN_REPOSITORY)
    .useValue(technicianRepository)
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return {
    app,
    userRepository,
    communityRepository,
    representativeRepository,
    technicianRepository,
  };
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

describe('Communities (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('Community CRUD happy paths (tasks.md 11.1)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'crud-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'crud-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const existing = buildCommunity({ id: 'existing-community-id' });
      ({ app } = await buildApp({ users: [admin], communities: [existing] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates a community (spec: Admin creates a community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/communities')
        .send({ name: 'Sunset Towers', address: '10 Main St', locale: 'en' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Sunset Towers',
        address: '10 Main St',
        locale: 'en',
      });
      expect(response.body).toHaveProperty('id');
    });

    it('rejects a request missing required fields (spec: Missing required field rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/communities')
        .send({ name: 'Incomplete Community' })
        .expect(400);
    });

    it('lists communities (spec: Admin lists communities)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/communities').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(
        (response.body as Array<{ id: string }>).some(
          (community) => community.id === 'existing-community-id',
        ),
      ).toBe(true);
    });

    it("updates a community's fields (spec: Admin updates a community)", async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch('/communities/existing-community-id')
        .send({ name: 'Renamed Community', locale: 'es' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'existing-community-id',
        name: 'Renamed Community',
        locale: 'es',
      });
    });

    it('returns 404 when updating a non-existent community (spec: Update targets a non-existent community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/communities/does-not-exist')
        .send({ name: 'Ghost' })
        .expect(404);
    });

    it('soft-deletes a community (spec: Admin soft-deletes a community)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const created = await agent
        .post('/communities')
        .send({ name: 'To Delete', address: '1 Gone Ave', locale: 'en' })
        .expect(201);

      await agent
        .delete(`/communities/${(created.body as { id: string }).id}`)
        .expect(204);

      const list = await agent.get('/communities').expect(200);
      expect(
        (list.body as Array<{ id: string }>).some(
          (community) => community.id === (created.body as { id: string }).id,
        ),
      ).toBe(false);
    });
  });

  describe('Soft-delete cascade to representative (tasks.md 11.2, community-management + community-assignments specs)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'cascade-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'cascade-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const repA = await buildSeedUser({
        id: 'cascade-rep-sole-id',
        email: 'cascade-rep-sole@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const repB = await buildSeedUser({
        id: 'cascade-rep-multi-id',
        email: 'cascade-rep-multi@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });

      const communitySole = buildCommunity({ id: 'cascade-community-sole' });
      const communityMultiC1 = buildCommunity({
        id: 'cascade-community-multi-c1',
      });
      const communityMultiC2 = buildCommunity({
        id: 'cascade-community-multi-c2',
      });

      const soleAssignment = buildRepresentative({
        id: 'cascade-assignment-sole',
        communityId: communitySole.id,
        userId: repA.id,
      });
      const multiAssignmentC1 = buildRepresentative({
        id: 'cascade-assignment-multi-c1',
        communityId: communityMultiC1.id,
        userId: repB.id,
      });
      const multiAssignmentC2 = buildRepresentative({
        id: 'cascade-assignment-multi-c2',
        communityId: communityMultiC2.id,
        userId: repB.id,
      });

      ({ app } = await buildApp({
        users: [admin, repA, repB],
        communities: [communitySole, communityMultiC1, communityMultiC2],
        representatives: [soleAssignment, multiAssignmentC1, multiAssignmentC2],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('deactivates the sole-community active representative on community soft-delete', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent.delete('/communities/cascade-community-sole').expect(204);

      const representatives = await agent
        .get('/communities/cascade-community-sole/representatives')
        .expect(200);

      const record = (
        representatives.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'cascade-rep-sole-id');
      expect(record?.deactivatedAt).not.toBeNull();
    });

    it('leaves an active-elsewhere representative unchanged on community soft-delete', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent.delete('/communities/cascade-community-multi-c1').expect(204);

      const representativesC1 = await agent
        .get('/communities/cascade-community-multi-c1/representatives')
        .expect(200);
      const recordC1 = (
        representativesC1.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'cascade-rep-multi-id');
      expect(recordC1?.deactivatedAt).toBeNull();

      const representativesC2 = await agent
        .get('/communities/cascade-community-multi-c2/representatives')
        .expect(200);
      const recordC2 = (
        representativesC2.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'cascade-rep-multi-id');
      expect(recordC2?.deactivatedAt).toBeNull();
    });
  });

  describe('Eligibility rejection on add (tasks.md 11.3, community-assignments spec: Ineligible role rejected)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'eligibility-admin@example.com';
    const communityId = 'eligibility-community-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'eligibility-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const wrongRoleUser = await buildSeedUser({
        id: 'eligibility-wrong-role-id',
        email: 'eligibility-wrong-role@example.com',
        role: 'MANAGER',
      });
      const community = buildCommunity({ id: communityId });
      ({ app } = await buildApp({
        users: [admin, wrongRoleUser],
        communities: [community],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects adding a wrong-role user as representative with 409, no assignment created', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/representatives`)
        .send({ userId: 'eligibility-wrong-role-id' })
        .expect(409);

      const representatives = await agent
        .get(`/communities/${communityId}/representatives`)
        .expect(200);
      expect(
        (representatives.body as Array<{ userId: string }>).some(
          (entry) => entry.userId === 'eligibility-wrong-role-id',
        ),
      ).toBe(false);
    });

    it('rejects adding a wrong-role user as technician with 409, no assignment created', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/technicians`)
        .send({ userId: 'eligibility-wrong-role-id' })
        .expect(409);

      const technicians = await agent
        .get(`/communities/${communityId}/technicians`)
        .expect(200);
      expect(
        (technicians.body as Array<{ userId: string }>).some(
          (entry) => entry.userId === 'eligibility-wrong-role-id',
        ),
      ).toBe(false);
    });
  });

  describe('Exclusivity swap, reactivation, and multi-community warning (tasks.md 11.4)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'exclusivity-admin@example.com';
    const communityId1 = 'exclusivity-community-1';
    const communityId2 = 'exclusivity-community-2';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'exclusivity-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const repA = await buildSeedUser({
        id: 'exclusivity-rep-a-id',
        email: 'exclusivity-rep-a@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const repB = await buildSeedUser({
        id: 'exclusivity-rep-b-id',
        email: 'exclusivity-rep-b@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const community1 = buildCommunity({ id: communityId1 });
      const community2 = buildCommunity({ id: communityId2 });
      ({ app } = await buildApp({
        users: [admin, repA, repB],
        communities: [community1, community2],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('first activation carries no warning (spec: First-time activation carries no warning)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(`/communities/${communityId1}/representatives`)
        .send({ userId: 'exclusivity-rep-a-id' })
        .expect(201);

      expect(response.body).not.toHaveProperty('warning');
    });

    it('activating a new representative deactivates the previous one, exactly one active (spec: Activating a new representative deactivates the previous one)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(`/communities/${communityId1}/representatives`)
        .send({ userId: 'exclusivity-rep-b-id' })
        .expect(201);
      expect(response.body).not.toHaveProperty('warning');

      const representatives = await agent
        .get(`/communities/${communityId1}/representatives`)
        .expect(200);
      const records = representatives.body as Array<{
        userId: string;
        deactivatedAt: string | null;
      }>;
      const active = records.filter((entry) => entry.deactivatedAt === null);
      expect(active).toHaveLength(1);
      expect(active[0]?.userId).toBe('exclusivity-rep-b-id');
      const repARecord = records.find(
        (entry) => entry.userId === 'exclusivity-rep-a-id',
      );
      expect(repARecord?.deactivatedAt).not.toBeNull();
    });

    it('reactivating a deactivated representative re-applies exclusivity (spec: Reactivating a deactivated representative re-applies exclusivity)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(
          `/communities/${communityId1}/representatives/exclusivity-rep-a-id/reactivate`,
        )
        .expect(200);
      expect(response.body).not.toHaveProperty('warning');

      const representatives = await agent
        .get(`/communities/${communityId1}/representatives`)
        .expect(200);
      const records = representatives.body as Array<{
        userId: string;
        deactivatedAt: string | null;
      }>;
      const active = records.filter((entry) => entry.deactivatedAt === null);
      expect(active).toHaveLength(1);
      expect(active[0]?.userId).toBe('exclusivity-rep-a-id');
    });

    it('activating an already-active-elsewhere representative succeeds with a warning (spec: Activating a representative already active elsewhere succeeds with a warning)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(`/communities/${communityId2}/representatives`)
        .send({ userId: 'exclusivity-rep-a-id' })
        .expect(201);

      expect(response.body).toMatchObject({
        warning: {
          code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES',
          communityCount: 2,
        },
      });

      const community1Reps = await agent
        .get(`/communities/${communityId1}/representatives`)
        .expect(200);
      const activeInC1 = (
        community1Reps.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find(
        (entry) =>
          entry.userId === 'exclusivity-rep-a-id' &&
          entry.deactivatedAt === null,
      );
      expect(activeInC1).toBeDefined();
    });
  });

  describe('Reactivation rejected for a soft-deleted user (tasks.md 11.5, spec: Reactivation rejected for a soft-deleted user)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'softdel-user-admin@example.com';
    const communityId = 'softdel-user-community-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'softdel-user-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const rep = await buildSeedUser({
        id: 'softdel-user-rep-id',
        email: 'softdel-user-rep@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const tech = await buildSeedUser({
        id: 'softdel-user-tech-id',
        email: 'softdel-user-tech@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const community = buildCommunity({ id: communityId });
      ({ app } = await buildApp({
        users: [admin, rep, tech],
        communities: [community],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects reactivating a representative assignment whose user was soft-deleted', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/representatives`)
        .send({ userId: 'softdel-user-rep-id' })
        .expect(201);
      await agent
        .delete(
          `/communities/${communityId}/representatives/softdel-user-rep-id`,
        )
        .expect(204);

      await agent.delete('/users/softdel-user-rep-id').expect(204);

      await agent
        .post(
          `/communities/${communityId}/representatives/softdel-user-rep-id/reactivate`,
        )
        .expect(404);

      const representatives = await agent
        .get(`/communities/${communityId}/representatives`)
        .expect(200);
      const record = (
        representatives.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'softdel-user-rep-id');
      expect(record?.deactivatedAt).not.toBeNull();
    });

    it('rejects reactivating a technician assignment whose user was soft-deleted', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/technicians`)
        .send({ userId: 'softdel-user-tech-id' })
        .expect(201);
      await agent
        .delete(`/communities/${communityId}/technicians/softdel-user-tech-id`)
        .expect(204);

      await agent.delete('/users/softdel-user-tech-id').expect(204);

      await agent
        .post(
          `/communities/${communityId}/technicians/softdel-user-tech-id/reactivate`,
        )
        .expect(404);

      const technicians = await agent
        .get(`/communities/${communityId}/technicians`)
        .expect(200);
      const record = (
        technicians.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'softdel-user-tech-id');
      expect(record?.deactivatedAt).not.toBeNull();
    });
  });

  describe("Accepted eligibility drift (tasks.md 11.6, spec: Changing an actively-assigned user's role leaves the assignment untouched)", () => {
    let app: INestApplication<App>;
    const adminEmail = 'drift-admin@example.com';
    const communityId = 'drift-community-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'drift-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const rep = await buildSeedUser({
        id: 'drift-rep-id',
        email: 'drift-rep@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const community = buildCommunity({ id: communityId });
      ({ app } = await buildApp({
        users: [admin, rep],
        communities: [community],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it("changing the active representative's global role via /users leaves the assignment active and unchanged", async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post(`/communities/${communityId}/representatives`)
        .send({ userId: 'drift-rep-id' })
        .expect(201);

      await agent
        .patch('/users/drift-rep-id')
        .send({ role: 'MANAGER' })
        .expect(200);

      const representatives = await agent
        .get(`/communities/${communityId}/representatives`)
        .expect(200);
      const record = (
        representatives.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'drift-rep-id');
      expect(record).toBeDefined();
      expect(record?.deactivatedAt).toBeNull();
    });
  });

  describe('Anonymous and non-admin access control on every /communities route (tasks.md 11.7, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'guard-admin@example.com';
    const nonAdminEmail = 'guard-manager@example.com';
    const communityId = 'guard-community-id';
    const repUserId = 'guard-rep-target-id';
    const techUserId = 'guard-tech-target-id';

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
      const repUser = await buildSeedUser({
        id: repUserId,
        email: 'guard-rep-target@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const techUser = await buildSeedUser({
        id: techUserId,
        email: 'guard-tech-target@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const community = buildCommunity({ id: communityId });
      const repAssignment = buildRepresentative({
        id: 'guard-rep-assignment-id',
        communityId,
        userId: repUserId,
      });
      const techAssignment = buildTechnician({
        id: 'guard-tech-assignment-id',
        communityId,
        userId: techUserId,
      });
      ({ app } = await buildApp({
        users: [admin, nonAdmin, repUser, techUser],
        communities: [community],
        representatives: [repAssignment],
        technicians: [techAssignment],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    const routes = [
      ['POST', '/communities'],
      ['GET', '/communities'],
      ['PATCH', `/communities/${communityId}`],
      ['DELETE', `/communities/${communityId}`],
      ['GET', `/communities/${communityId}/representatives`],
      ['POST', `/communities/${communityId}/representatives`],
      ['DELETE', `/communities/${communityId}/representatives/${repUserId}`],
      [
        'POST',
        `/communities/${communityId}/representatives/${repUserId}/reactivate`,
      ],
      ['GET', `/communities/${communityId}/technicians`],
      ['POST', `/communities/${communityId}/technicians`],
      ['DELETE', `/communities/${communityId}/technicians/${techUserId}`],
      [
        'POST',
        `/communities/${communityId}/technicians/${techUserId}/reactivate`,
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
            userId: 'irrelevant',
            name: 'x',
            address: 'x',
            locale: 'en',
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
    // check" — 401 on every /communities route, no session cookie at all.
    it.each(routes)('anonymous %s %s -> 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const response = await sendRoute(req, method, path);
      expect(response.status).toBe(401);
    });

    // authorization spec: "Non-admin role is rejected" — 403 on every
    // /communities route for an authenticated non-SYSTEM_ADMIN caller.
    it.each(routes)('non-admin %s %s -> 403', async (method, path) => {
      const agent = await loginAgent(app, nonAdminEmail);
      const response = await sendRoute(agent, method, path);
      expect(response.status).toBe(403);
    });

    it('SYSTEM_ADMIN is permitted through the guard (authorization spec: SYSTEM_ADMIN is permitted)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent.get('/communities').expect(200);
    });
  });

  describe('Multiple technicians, no exclusivity (tasks.md 11.8)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'multi-tech-admin@example.com';
    const communityId1 = 'multi-tech-community-1';
    const communityId2 = 'multi-tech-community-2';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'multi-tech-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const techA = await buildSeedUser({
        id: 'multi-tech-a-id',
        email: 'multi-tech-a@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const techB = await buildSeedUser({
        id: 'multi-tech-b-id',
        email: 'multi-tech-b@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const community1 = buildCommunity({ id: communityId1 });
      const community2 = buildCommunity({ id: communityId2 });
      ({ app } = await buildApp({
        users: [admin, techA, techB],
        communities: [community1, community2],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('multiple technicians remain active simultaneously in the same community, no warning (spec: Multiple technicians active in the same community)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const responseA = await agent
        .post(`/communities/${communityId1}/technicians`)
        .send({ userId: 'multi-tech-a-id' })
        .expect(201);
      expect(responseA.body).not.toHaveProperty('warning');

      const responseB = await agent
        .post(`/communities/${communityId1}/technicians`)
        .send({ userId: 'multi-tech-b-id' })
        .expect(201);
      expect(responseB.body).not.toHaveProperty('warning');

      const technicians = await agent
        .get(`/communities/${communityId1}/technicians`)
        .expect(200);
      const active = (
        technicians.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).filter((entry) => entry.deactivatedAt === null);
      expect(active.map((entry) => entry.userId).sort()).toEqual(
        ['multi-tech-a-id', 'multi-tech-b-id'].sort(),
      );
    });

    it('the same technician is active across multiple communities, no warning in either response (spec: Same technician active across multiple communities)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post(`/communities/${communityId2}/technicians`)
        .send({ userId: 'multi-tech-a-id' })
        .expect(201);
      expect(response.body).not.toHaveProperty('warning');

      const techniciansC1 = await agent
        .get(`/communities/${communityId1}/technicians`)
        .expect(200);
      const activeC1 = (
        techniciansC1.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'multi-tech-a-id');
      expect(activeC1?.deactivatedAt).toBeNull();

      const techniciansC2 = await agent
        .get(`/communities/${communityId2}/technicians`)
        .expect(200);
      const activeC2 = (
        techniciansC2.body as Array<{
          userId: string;
          deactivatedAt: string | null;
        }>
      ).find((entry) => entry.userId === 'multi-tech-a-id');
      expect(activeC2?.deactivatedAt).toBeNull();
    });
  });
});
