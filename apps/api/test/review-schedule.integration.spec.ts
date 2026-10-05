import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { UuidV7IdGenerator } from '../src/shared/infrastructure/id/uuid-v7.id-generator';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../src/shared/application/ports/password-hasher.port';
import { CLOCK } from '../src/shared/application/ports/clock.port';
import { FixedClock } from '../src/shared/testing/fixed-clock';

// review-schedule design.md Testing Strategy, "Integration (wiring)" and Test
// isolation: the real AppModule against the per-run hermetic database (migrated,
// not seeded), the real Prisma reader behind the real controller, `CLOCK` as
// the only override. The spec inserts its own run-unique users, communities,
// elements, templates and sessions, filters every response to its own
// communities by id and removes what it inserted in `afterAll`.
//
// Today is 15 November 2026 (Q4 2026). Expected rows, worst first:
//   A  OVERDUE         a QUARTERLY session in Q2 only (Q3 2026 missed)
//   C  NEVER_REVIEWED  no session
//   B  UP_TO_DATE      an ANNUAL session this quarter
const NOW = new Date('2026-11-15T10:00:00Z');
const PASSWORD = 'integration-password-1';

const idGenerator = new UuidV7IdGenerator();

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

describe('GET /review-schedule through the real Prisma reader (integration)', () => {
  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const userIds: string[] = [];
  const communityIds: string[] = [];
  const templateIds: string[] = [];
  const emailOf = { admin: '', manager: '' };
  let communityA: { id: string; name: string };
  let communityB: { id: string; name: string };
  let communityC: { id: string; name: string };

  const createUser = async (
    label: string,
    role: 'SYSTEM_ADMIN' | 'MANAGER',
    passwordHash: string,
    managerCapabilities: 'VIEW_ALL_REVIEWS'[] = [],
  ): Promise<{ id: string; email: string }> => {
    const email = `schedule-wiring-${label}-${randomUUID()}@example.com`;
    const id = idGenerator.generate();
    await prisma.user.create({
      data: { id, email, passwordHash, role, managerCapabilities },
    });
    userIds.push(id);
    return { id, email };
  };

  const createCommunity = async (
    label: string,
  ): Promise<{ id: string; name: string }> => {
    const id = idGenerator.generate();
    const name = `Schedule wiring ${label} ${randomUUID()}`;
    await prisma.community.create({
      data: {
        id,
        name,
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      },
    });
    await prisma.inspectableElement.create({
      data: {
        id: idGenerator.generate(),
        communityId: id,
        elementType: 'EXTINGUISHER',
        name: `Extinguisher ${randomUUID()}`,
        location: 'Lobby',
        installedAt: new Date('2024-01-01'),
        code: randomUUID().slice(0, 10),
      },
    });
    communityIds.push(id);
    return { id, name };
  };

  // Retired, run-unique high version: neither the lineage unique index nor the
  // one-active-per-lineage partial index can be hit, and no other spec's
  // templates are touched.
  const createRetiredTemplate = async (
    frequency: 'QUARTERLY' | 'ANNUAL',
  ): Promise<string> => {
    const id = idGenerator.generate();
    await prisma.reviewTemplate.create({
      data: {
        id,
        elementType: 'EXTINGUISHER',
        frequency,
        name: `Schedule wiring ${frequency} ${randomUUID()}`,
        version: 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
        status: 'retired',
      },
    });
    templateIds.push(id);
    return id;
  };

  const createSession = async (
    communityId: string,
    templateId: string,
    performedById: string,
    completedAt: string,
  ): Promise<void> => {
    await prisma.reviewSession.create({
      data: {
        id: idGenerator.generate(),
        communityId,
        templateId,
        performedById,
        status: 'completed',
        completedAt: new Date(completedAt),
      },
    });
  };

  const login = async (email: string) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  };

  const ownRows = (body: unknown): ScheduleRowBody[] => {
    const own = new Set(communityIds);
    return (body as ScheduleRowBody[]).filter((row) =>
      own.has(row.communityId),
    );
  };

  const rowCounts = async () => ({
    users: await prisma.user.count(),
    communities: await prisma.community.count(),
    elements: await prisma.inspectableElement.count(),
    templates: await prisma.reviewTemplate.count(),
    sessions: await prisma.reviewSession.count(),
  });

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .compile();
    app = moduleRef.createNestApplication();
    // cookie-parser is installed only in main.ts, not in AppModule: without it
    // the login succeeds and the read answers 401.
    app.use(cookieParser());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const hasher = moduleRef.get<PasswordHasher>(PASSWORD_HASHER, {
      strict: false,
    });
    const passwordHash = await hasher.hash(PASSWORD);
    emailOf.admin = (
      await createUser('admin', 'SYSTEM_ADMIN', passwordHash)
    ).email;
    emailOf.manager = (
      await createUser('manager', 'MANAGER', passwordHash, ['VIEW_ALL_REVIEWS'])
    ).email;
    const performer = await createUser(
      'performer',
      'SYSTEM_ADMIN',
      passwordHash,
    );

    communityA = await createCommunity('A');
    communityB = await createCommunity('B');
    communityC = await createCommunity('C');
    await createSession(
      communityA.id,
      await createRetiredTemplate('QUARTERLY'),
      performer.id,
      '2026-05-10T12:00:00.000Z',
    );
    await createSession(
      communityB.id,
      await createRetiredTemplate('ANNUAL'),
      performer.id,
      '2026-10-10T12:00:00.000Z',
    );
  });

  afterAll(async () => {
    await prisma.reviewSession.deleteMany({
      where: { communityId: { in: communityIds } },
    });
    await prisma.reviewTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
    await prisma.inspectableElement.deleteMany({
      where: { communityId: { in: communityIds } },
    });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('returns the admin every own pair with the expected content, worst first', async () => {
    const agent = await login(emailOf.admin);

    const response = await agent.get('/review-schedule').expect(200);

    const rows = ownRows(response.body);
    expect(rows.map((row) => row.communityId)).toEqual([
      communityA.id,
      communityC.id,
      communityB.id,
    ]);
    expect(rows).toEqual([
      {
        communityId: communityA.id,
        communityName: communityA.name,
        elementType: 'EXTINGUISHER',
        status: 'OVERDUE',
        reasonCode: 'QUARTER_MISSED',
        quarterYear: 2026,
        quarterNumber: 3,
        deadline: '2026-09-30',
        lastCoveringSessionDate: '2026-05-10',
      },
      {
        communityId: communityC.id,
        communityName: communityC.name,
        elementType: 'EXTINGUISHER',
        status: 'NEVER_REVIEWED',
        reasonCode: 'NEVER_REVIEWED',
        quarterYear: null,
        quarterNumber: null,
        deadline: null,
        lastCoveringSessionDate: null,
      },
      expect.objectContaining({
        communityId: communityB.id,
        status: 'UP_TO_DATE',
        reasonCode: 'UP_TO_DATE',
        lastCoveringSessionDate: '2026-10-10',
      }),
    ]);
  });

  it('returns a granted manager the same own rows in the same order', async () => {
    const adminAgent = await login(emailOf.admin);
    const managerAgent = await login(emailOf.manager);

    const adminRows = ownRows(
      (await adminAgent.get('/review-schedule').expect(200)).body,
    );
    const managerRows = ownRows(
      (await managerAgent.get('/review-schedule').expect(200)).body,
    );

    expect(managerRows).toHaveLength(3);
    expect(managerRows).toEqual(adminRows);
  });

  it('writes nothing: row counts are identical before and after reads', async () => {
    const agent = await login(emailOf.admin);
    const before = await rowCounts();

    await agent.get('/review-schedule').expect(200);
    await agent.get('/review-schedule').expect(200);

    expect(await rowCounts()).toEqual(before);
  });
});
