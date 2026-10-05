import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { COMMUNITY_REPOSITORY } from '../src/modules/community/application/ports/community.repository.port';
import { InMemoryCommunityRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community.repository';
import { COMMUNITY_TECHNICIAN_REPOSITORY } from '../src/modules/community/application/ports/community-technician.repository.port';
import { InMemoryCommunityTechnicianRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community-technician.repository';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from '../src/modules/community/application/ports/community-representative.repository.port';
import { InMemoryCommunityRepresentativeRepository } from '../src/modules/community/application/use-cases/testing/in-memory-community-representative.repository';
import {
  INSPECTABLE_ELEMENT_COUNTER,
  type InspectableElementCounter,
} from '../src/modules/community/application/ports/inspectable-element-counter.port';
import { MANAGER_CAPABILITY_CHECKER } from '../src/shared/application/authorization/manager-capability.checker.port';
import { CLOCK } from '../src/shared/application/ports/clock.port';
import { FixedClock } from '../src/shared/testing/fixed-clock';
import { REVIEW_SCHEDULE_READER } from '../src/modules/review-schedule/application/ports/review-schedule.reader.port';
import { InMemoryReviewScheduleReader } from '../src/modules/review-schedule/application/testing/in-memory-review-schedule.reader';
import type {
  SchedulePair,
  ScheduleScope,
} from '../src/modules/review-schedule/application/ports/review-schedule.reader.port';
import type { PairCoverage } from '../src/modules/review-schedule/domain/review-due.policy';
import { User } from '../src/modules/users/domain/user.entity';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import type { Role } from '../src/modules/users/domain/role';
import type { ManagerCapability } from '../src/modules/users/domain/manager-capability';

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

class FakeInspectableElementCounter implements InspectableElementCounter {
  countActiveByCommunity(): Promise<number> {
    return Promise.resolve(0);
  }
}

const DEFAULT_PASSWORD = 'correct-horse-battery-staple';

// Today is 15 November 2026 (Q4 2026, previous quarter Q3 2026).
const NOW = new Date('2026-11-15T10:00:00Z');

// One coverage shape per list rank the scenarios need (the due rule itself is
// covered by review-due.policy.spec.ts).
const OVERDUE: PairCoverage = {
  lastBeforeSinceAt: new Date('2026-05-10T12:00:00Z'),
  lastAnnualAt: null,
  recentCoveringAt: [],
};
const UPCOMING: PairCoverage = {
  lastBeforeSinceAt: null,
  lastAnnualAt: null,
  recentCoveringAt: [new Date('2026-08-10T12:00:00Z')],
};
const UP_TO_DATE: PairCoverage = {
  lastBeforeSinceAt: null,
  lastAnnualAt: new Date('2026-10-10T12:00:00Z'),
  recentCoveringAt: [new Date('2026-10-10T12:00:00Z')],
};

async function buildSeedUser(input: {
  id: string;
  email: string;
  role: Role;
  managerCapabilities?: ManagerCapability[];
}): Promise<User> {
  const now = new Date();
  return new User({
    id: input.id,
    email: input.email,
    passwordHash: await argon2.hash(DEFAULT_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
    role: input.role,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    maintenanceCompanyId: null,
    managerCapabilities: input.managerCapabilities ?? [],
  });
}

interface BuiltApp {
  app: INestApplication<App>;
  moduleRef: TestingModule;
  reader: InMemoryReviewScheduleReader;
  userRepository: InMemoryUserRepository;
}

// Minimal harness: the real AppModule with every repository in memory, the
// schedule reader in memory and a FixedClock. The real controller, guards,
// use case and checkers run.
async function buildApp(
  users: User[],
  options: { capabilityChecker?: unknown } = {},
): Promise<BuiltApp> {
  const userRepository = new InMemoryUserRepository();
  for (const user of users) {
    userRepository.seed(user);
  }
  const reader = new InMemoryReviewScheduleReader();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(new InMemoryTokenDenylist())
    .overrideProvider(COMMUNITY_REPOSITORY)
    .useValue(new InMemoryCommunityRepository())
    .overrideProvider(COMMUNITY_TECHNICIAN_REPOSITORY)
    .useValue(new InMemoryCommunityTechnicianRepository())
    .overrideProvider(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    .useValue(new InMemoryCommunityRepresentativeRepository())
    .overrideProvider(INSPECTABLE_ELEMENT_COUNTER)
    .useValue(new FakeInspectableElementCounter())
    .overrideProvider(REVIEW_SCHEDULE_READER)
    .useValue(reader)
    .overrideProvider(CLOCK)
    .useValue(new FixedClock(NOW))
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    });
  if (options.capabilityChecker !== undefined) {
    builder = builder
      .overrideProvider(MANAGER_CAPABILITY_CHECKER)
      .useValue(options.capabilityChecker);
  }
  const moduleRef = await builder.compile();

  const app: INestApplication<App> = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return { app, moduleRef, reader, userRepository };
}

async function loginAgent(app: INestApplication<App>, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .expect(200);
  return agent;
}

interface ScheduleRowBody {
  communityId: string;
  communityName: string;
  elementType: string;
  status: string;
  reasonCode: string;
  quarterYear: number | null;
  quarterNumber: number | null;
  deadline: string | null;
  lastCoveringSessionDate: string | null;
}

const pair = (
  communityId: string,
  communityName: string,
  coverage: PairCoverage,
): SchedulePair => ({
  communityId,
  communityName,
  elementType: 'EXTINGUISHER',
  coverage,
});

// review-schedule PR 6: the HTTP surface. Pairs A (overdue), B (up to date)
// and C (upcoming) sit in three communities; the technician is assigned to A
// and the representative to B, nobody to C.
describe('Review Schedule (e2e)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  const emails = {
    admin: 'rs-admin@example.com',
    technician: 'rs-technician@example.com',
    representative: 'rs-representative@example.com',
    manager: 'rs-manager@example.com',
    grantedManager: 'rs-manager-granted@example.com',
    companyManager: 'rs-company-manager@example.com',
  };

  let built: BuiltApp;
  let communityA: { id: string; name: string };
  let communityB: { id: string; name: string };
  let communityC: { id: string; name: string };

  async function seedUsers(): Promise<User[]> {
    return [
      await buildSeedUser({
        id: 'rs-admin-id',
        email: emails.admin,
        role: 'SYSTEM_ADMIN',
      }),
      await buildSeedUser({
        id: 'rs-technician-id',
        email: emails.technician,
        role: 'MAINTENANCE_TECHNICIAN',
      }),
      await buildSeedUser({
        id: 'rs-representative-id',
        email: emails.representative,
        role: 'COMMUNITY_REPRESENTATIVE',
      }),
      await buildSeedUser({
        id: 'rs-manager-id',
        email: emails.manager,
        role: 'MANAGER',
      }),
      await buildSeedUser({
        id: 'rs-manager-granted-id',
        email: emails.grantedManager,
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      }),
      await buildSeedUser({
        id: 'rs-company-manager-id',
        email: emails.companyManager,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      }),
    ];
  }

  async function seedSchedule(target: BuiltApp) {
    const adminAgent = await loginAgent(target.app, emails.admin);
    const create = async (name: string) =>
      (
        await adminAgent
          .post('/communities')
          .send({ name, address: 'Carrer Major 1, Girona', locale: 'ca' })
          .expect(201)
      ).body as { id: string; name: string };
    const a = await create('Schedule community A');
    const b = await create('Schedule community B');
    const c = await create('Schedule community C');
    await adminAgent
      .post(`/communities/${a.id}/technicians`)
      .send({ userId: 'rs-technician-id' })
      .expect(201);
    await adminAgent
      .post(`/communities/${b.id}/representatives`)
      .send({ userId: 'rs-representative-id' })
      .expect(201);
    target.reader.seed(
      pair(b.id, b.name, UP_TO_DATE),
      pair(c.id, c.name, UPCOMING),
      pair(a.id, a.name, OVERDUE),
    );
    return { a, b, c };
  }

  const idsOf = (body: unknown): string[] =>
    (body as ScheduleRowBody[]).map((row) => row.communityId);

  beforeAll(async () => {
    built = await buildApp(await seedUsers());
    ({
      a: communityA,
      b: communityB,
      c: communityC,
    } = await seedSchedule(built));
  });

  afterAll(async () => {
    await built.app.close();
  });

  beforeEach(() => {
    built.reader.calls.length = 0;
  });

  describe('Four roles are admitted', () => {
    it('SYSTEM_ADMIN receives every pair, worst first, in the flat DTO shape', async () => {
      const agent = await loginAgent(built.app, emails.admin);

      const response = await agent.get('/review-schedule').expect(200);

      expect(idsOf(response.body)).toEqual([
        communityA.id,
        communityC.id,
        communityB.id,
      ]);
      expect((response.body as ScheduleRowBody[])[0]).toEqual({
        communityId: communityA.id,
        communityName: communityA.name,
        elementType: 'EXTINGUISHER',
        status: 'OVERDUE',
        reasonCode: 'QUARTER_MISSED',
        quarterYear: 2026,
        quarterNumber: 3,
        deadline: '2026-09-30',
        lastCoveringSessionDate: '2026-05-10',
      });
    });

    it('a granted MANAGER receives the same list as the admin', async () => {
      const adminAgent = await loginAgent(built.app, emails.admin);
      const managerAgent = await loginAgent(built.app, emails.grantedManager);

      const adminBody = (await adminAgent.get('/review-schedule').expect(200))
        .body as unknown;
      const managerBody = (
        await managerAgent.get('/review-schedule').expect(200)
      ).body as unknown;

      expect(managerBody).toEqual(adminBody);
    });

    it('MAINTENANCE_TECHNICIAN receives only the pairs of the assigned community', async () => {
      const agent = await loginAgent(built.app, emails.technician);

      const response = await agent.get('/review-schedule').expect(200);

      expect(idsOf(response.body)).toEqual([communityA.id]);
    });

    it('COMMUNITY_REPRESENTATIVE receives only the pairs of the assigned community', async () => {
      const agent = await loginAgent(built.app, emails.representative);

      const response = await agent.get('/review-schedule').expect(200);

      expect(idsOf(response.body)).toEqual([communityB.id]);
    });
  });

  describe('Scope fails closed before any data read', () => {
    it('an ungranted MANAGER gets 200 [] and the reader is never called', async () => {
      const agent = await loginAgent(built.app, emails.manager);

      const response = await agent.get('/review-schedule').expect(200);

      expect(response.body).toEqual([]);
      expect(built.reader.calls).toEqual([]);
    });

    it('MAINTENANCE_COMPANY_MANAGER gets 403 and no schedule data', async () => {
      const agent = await loginAgent(built.app, emails.companyManager);

      const response = await agent.get('/review-schedule').expect(403);

      expect(JSON.stringify(response.body)).not.toContain(communityA.name);
      expect(built.reader.calls).toEqual([]);
    });

    it('a revoked capability empties the next read', async () => {
      const revokedId = 'rs-manager-revoked-id';
      const revoked = await buildSeedUser({
        id: revokedId,
        email: 'rs-manager-revoked@example.com',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });
      built.userRepository.seed(revoked);
      const agent = await loginAgent(
        built.app,
        'rs-manager-revoked@example.com',
      );
      expect(
        idsOf((await agent.get('/review-schedule').expect(200)).body),
      ).toHaveLength(3);

      // The grant is re-read on every request: replacing the record with an
      // ungranted one takes effect on the next call.
      built.userRepository.seed(
        await buildSeedUser({
          id: revokedId,
          email: 'rs-manager-revoked@example.com',
          role: 'MANAGER',
        }),
      );

      const after = await agent.get('/review-schedule').expect(200);
      expect(after.body).toEqual([]);
    });
  });

  describe('Authentication precedes authorization', () => {
    it('answers 401 without a session and resolves no capability or schedule data', async () => {
      const checker = built.moduleRef.get<{
        hasManagerCapability: (...args: unknown[]) => Promise<boolean>;
      }>(MANAGER_CAPABILITY_CHECKER, { strict: false });
      const spy = jest.spyOn(checker, 'hasManagerCapability');

      try {
        await request(built.app.getHttpServer())
          .get('/review-schedule')
          .expect(401);

        expect(spy).not.toHaveBeenCalled();
        expect(built.reader.calls).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('An infrastructure fault surfaces as an error', () => {
    it('answers an error, not an empty list, and reads no schedule data', async () => {
      const faulty = await buildApp(await seedUsers(), {
        capabilityChecker: {
          hasManagerCapability: () =>
            Promise.reject(new Error('connection refused')),
        },
      });
      try {
        await seedSchedule(faulty);
        faulty.reader.calls.length = 0;
        const agent = await loginAgent(faulty.app, emails.manager);

        const response = await agent.get('/review-schedule').expect(500);

        expect(response.body).not.toEqual([]);
        expect(faulty.reader.calls).toEqual([]);
      } finally {
        await faulty.app.close();
      }
    });
  });

  describe('The endpoint widens nothing', () => {
    it('a granted MANAGER is refused on administrative and review-session write endpoints', async () => {
      const agent = await loginAgent(built.app, emails.grantedManager);

      await agent.get('/users').expect(403);
      await agent.get('/communities').expect(403);
      await agent
        .post('/communities')
        .send({ name: 'x', address: 'y', locale: 'ca' })
        .expect(403);
      await agent.get('/checklist-questions').expect(403);
      await agent
        .post('/review-sessions')
        .send({ communityId: communityA.id, templateId: 'any' })
        .expect(403);
      await agent.delete('/review-sessions/any').expect(403);
    });
  });

  describe('No write route and no list controls', () => {
    it.each(['post', 'put', 'patch', 'delete'] as const)(
      'has no %s route on /review-schedule, even for the admin',
      async (method) => {
        const agent = await loginAgent(built.app, emails.admin);

        await agent[method]('/review-schedule').send({}).expect(404);
      },
    );

    it('ignores filter, sort, page and search parameters', async () => {
      const agent = await loginAgent(built.app, emails.admin);
      const plain = (await agent.get('/review-schedule').expect(200))
        .body as unknown;

      const withControls = await agent
        .get('/review-schedule')
        .query({
          communityId: communityB.id,
          status: 'UP_TO_DATE',
          sort: 'communityName',
          page: 2,
          limit: 1,
          q: 'nothing matches this',
        })
        .expect(200);

      expect(withControls.body).toEqual(plain);
    });

    it('reads with the scope resolved server-side, never from the request', async () => {
      const agent = await loginAgent(built.app, emails.technician);

      await agent
        .get('/review-schedule')
        .query({ communityId: communityB.id })
        .expect(200);

      const scope: ScheduleScope = built.reader.calls[0].scope;
      expect(scope).toEqual({
        kind: 'communities',
        communityIds: [communityA.id],
      });
    });
  });
});
