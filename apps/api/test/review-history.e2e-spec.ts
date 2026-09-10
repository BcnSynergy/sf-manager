import * as fs from 'node:fs';
import * as path from 'node:path';
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
import { CHECKLIST_QUESTION_REPOSITORY } from '../src/modules/checklist-question/application/ports/checklist-question.repository.port';
import { DRAFT_SELECTION_CLEANER } from '../src/modules/checklist-question/application/ports/draft-selection-cleaner.port';
import { InMemoryChecklistQuestionRepository } from '../src/modules/checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { REVIEW_TEMPLATE_REPOSITORY } from '../src/modules/review-template/application/ports/review-template.repository.port';
import { InMemoryReviewTemplateRepository } from '../src/modules/review-template/application/use-cases/testing/in-memory-review-template.repository';
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
import { INSPECTABLE_ELEMENT_REPOSITORY } from '../src/modules/inspectable-element/application/ports/inspectable-element.repository.port';
import { InMemoryInspectableElementRepository } from '../src/modules/inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { REVIEW_SESSION_REPOSITORY } from '../src/modules/review-session/application/ports/review-session.repository.port';
import { InMemoryReviewSessionRepository } from '../src/modules/review-session/application/use-cases/testing/in-memory-review-session.repository';
import {
  USER_DIRECTORY,
  type UserDirectory,
} from '../src/modules/review-session/application/ports/user-directory.port';
import { User } from '../src/modules/users/domain/user.entity';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../src/modules/users/application/ports/maintenance-company-lookup.port';
import type { Role } from '../src/modules/users/domain/role';

// review-history-company-scope/design.md Decision 1/5: e2e's own
// UserDirectory double, backed by the SAME InMemoryUserRepository this
// suite already seeds — real DB access is stubbed out (PrismaService below)
// so the real PrismaUserDirectory cannot run here.
class InMemoryUserRepositoryBackedUserDirectory implements UserDirectory {
  constructor(private readonly users: InMemoryUserRepository) {}

  async findMaintenanceCompanyId(userId: string): Promise<string | null> {
    const user = await this.users.findById(userId);
    return user?.maintenanceCompanyId ?? null;
  }

  // design.md Decision 5/8: this e2e double doesn't need the port's
  // soft-delete-INCLUSIVE guarantee — no scenario in this suite reads a
  // soft-deleted performer's email — so `findById` (active users only) is
  // sufficient here. One batched resolve, mirroring the real adapter's "one
  // query, not N" contract.
  async findEmailsByIds(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const userId of new Set(userIds)) {
      const user = await this.users.findById(userId);
      if (user) {
        result.set(userId, user.email);
      }
    }
    return result;
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

class InMemoryDraftSelectionCleaner {
  removeQuestionFromDrafts(): Promise<void> {
    return Promise.resolve();
  }
}

// review-history-company-scope tasks.md 4.5: the company-transfer scenario
// PATCHes /users/:id, which routes through UpdateUserUseCase's resulting-
// state existsActive() check (users.e2e-spec.ts precedent) — a hermetic
// double, no real Prisma-backed MaintenanceCompany table needed here.
class InMemoryMaintenanceCompanyLookup implements MaintenanceCompanyLookup {
  constructor(private readonly liveCompanyIds: ReadonlySet<string>) {}

  existsActive(id: string): Promise<boolean> {
    return Promise.resolve(this.liveCompanyIds.has(id));
  }
}

class FakeInspectableElementCounter implements InspectableElementCounter {
  countActiveByCommunity(): Promise<number> {
    return Promise.resolve(0);
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
  maintenanceCompanyId?: string | null;
}

async function buildSeedUser(input: SeedUserInput): Promise<User> {
  const now = new Date();
  return new User({
    id: input.id,
    email: input.email,
    passwordHash: await hashPassword(DEFAULT_PASSWORD),
    role: input.role,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    maintenanceCompanyId: input.maintenanceCompanyId ?? null,
  });
}

interface BuiltApp {
  app: INestApplication<App>;
  userRepository: InMemoryUserRepository;
}

async function buildApp(seed: {
  users: User[];
  liveCompanyIds?: string[];
}): Promise<BuiltApp> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users) {
    userRepository.seed(user);
  }
  const maintenanceCompanyLookup = new InMemoryMaintenanceCompanyLookup(
    new Set(seed.liveCompanyIds ?? []),
  );

  const questionRepository = new InMemoryChecklistQuestionRepository();
  const templateRepository = new InMemoryReviewTemplateRepository(
    questionRepository,
  );
  const communityRepository = new InMemoryCommunityRepository();
  const technicianRepository = new InMemoryCommunityTechnicianRepository();
  const representativeRepository =
    new InMemoryCommunityRepresentativeRepository();
  const elementRepository = new InMemoryInspectableElementRepository();
  const sessionRepository = new InMemoryReviewSessionRepository();
  const tokenDenylist = new InMemoryTokenDenylist();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(tokenDenylist)
    .overrideProvider(CHECKLIST_QUESTION_REPOSITORY)
    .useValue(questionRepository)
    .overrideProvider(REVIEW_TEMPLATE_REPOSITORY)
    .useValue(templateRepository)
    .overrideProvider(DRAFT_SELECTION_CLEANER)
    .useValue(new InMemoryDraftSelectionCleaner())
    .overrideProvider(COMMUNITY_REPOSITORY)
    .useValue(communityRepository)
    .overrideProvider(COMMUNITY_TECHNICIAN_REPOSITORY)
    .useValue(technicianRepository)
    .overrideProvider(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    .useValue(representativeRepository)
    .overrideProvider(INSPECTABLE_ELEMENT_COUNTER)
    .useValue(new FakeInspectableElementCounter())
    .overrideProvider(INSPECTABLE_ELEMENT_REPOSITORY)
    .useValue(elementRepository)
    .overrideProvider(REVIEW_SESSION_REPOSITORY)
    .useValue(sessionRepository)
    .overrideProvider(USER_DIRECTORY)
    .useValue(new InMemoryUserRepositoryBackedUserDirectory(userRepository))
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

  return { app, userRepository };
}

type Agent = ReturnType<typeof request.agent>;

async function loginAgent(app: INestApplication<App>, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .expect(200);
  return agent;
}

interface CommunityBody {
  id: string;
  name: string;
}

async function createCommunity(
  adminAgent: Agent,
  label: string,
): Promise<CommunityBody> {
  const response = await adminAgent
    .post('/communities')
    .send({ name: label, address: 'Carrer Major 1, Girona', locale: 'ca' })
    .expect(201);
  return response.body as CommunityBody;
}

async function assignTechnician(
  adminAgent: Agent,
  communityId: string,
  userId: string,
): Promise<void> {
  await adminAgent
    .post(`/communities/${communityId}/technicians`)
    .send({ userId })
    .expect(201);
}

async function assignRepresentative(
  adminAgent: Agent,
  communityId: string,
  userId: string,
): Promise<void> {
  await adminAgent
    .post(`/communities/${communityId}/representatives`)
    .send({ userId })
    .expect(201);
}

interface ElementBody {
  id: string;
  code: string;
}

async function createElement(
  adminAgent: Agent,
  communityId: string,
  label: string,
): Promise<ElementBody> {
  const response = await adminAgent
    .post(`/communities/${communityId}/inspectable-elements`)
    .send({
      elementType: 'EXTINGUISHER',
      name: label,
      location: 'Ground floor',
      installedAt: '2026-01-15',
    })
    .expect(201);
  return response.body as ElementBody;
}

interface QuestionBody {
  id: string;
}

async function createQuestion(
  adminAgent: Agent,
  text: string,
): Promise<QuestionBody> {
  const response = await adminAgent
    .post('/checklist-questions')
    .send({
      elementType: 'EXTINGUISHER',
      frequencies: ['QUARTERLY'],
      text,
    })
    .expect(201);
  return response.body as QuestionBody;
}

interface TemplateBody {
  id: string;
}

async function createActiveTemplate(
  adminAgent: Agent,
  name: string,
  questionIds: string[],
): Promise<TemplateBody> {
  const draft = (
    await adminAgent
      .post('/review-templates')
      .send({ elementType: 'EXTINGUISHER', frequency: 'QUARTERLY', name })
      .expect(201)
  ).body as TemplateBody;
  await adminAgent
    .put(`/review-templates/${draft.id}/questions`)
    .send({ questionIds })
    .expect(200);
  await adminAgent.post(`/review-templates/${draft.id}/activate`).expect(201);
  return draft;
}

interface SessionBody {
  id: string;
  status: string;
}

interface HistoryRowBody {
  id: string;
  communityId: string;
  communityName: string;
  performedById: string;
}

interface HistoryDetailEntryBody {
  inspectableElementId: string;
  elementCode: string | null;
  reviewed: boolean;
  observations: string | null;
  answers: Array<{ questionId: string; answer: string }>;
}

interface HistoryDetailBody {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: string;
  entries: HistoryDetailEntryBody[];
  questions: Array<{ questionId: string; order: number; text: string }>;
}

interface ErrorBody {
  code?: string;
  message?: string;
  statusCode?: number;
}

// review-history spec.md "A Performer's Own Completed Review History" /
// "A Representative's Community-Scoped Completed Review History" /
// "Only Completed Sessions Appear in History" — the PR 1 read surface:
// GET /review-history for both in-scope roles, drafts excluded.
describe('Review History (e2e)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('GET /review-history', () => {
    let built: BuiltApp;
    const adminEmail = 'rh-admin@example.com';
    const technicianUEmail = 'rh-technician-u@example.com';
    const technicianWEmail = 'rh-technician-w@example.com';
    const representativeEmail = 'rh-representative@example.com';

    let communityC: CommunityBody;
    let communityD: CommunityBody;
    let templateId: string;
    let sessionByUForC: SessionBody;
    let sessionByWForC: SessionBody;
    let sessionForD: SessionBody;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rh-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technicianU = await buildSeedUser({
        id: 'rh-technician-u-id',
        email: technicianUEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const technicianW = await buildSeedUser({
        id: 'rh-technician-w-id',
        email: technicianWEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'rh-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      built = await buildApp({
        users: [admin, technicianU, technicianW, representative],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityC = await createCommunity(adminAgent, 'History community C');
      communityD = await createCommunity(adminAgent, 'History community D');
      await assignTechnician(adminAgent, communityC.id, 'rh-technician-u-id');
      await assignTechnician(adminAgent, communityC.id, 'rh-technician-w-id');
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'rh-representative-id',
      );

      const elementC = await createElement(
        adminAgent,
        communityC.id,
        'History extinguisher C',
      );
      const elementD = await createElement(
        adminAgent,
        communityD.id,
        'History extinguisher D',
      );
      const question = await createQuestion(adminAgent, 'Is the seal intact?');
      const template = await createActiveTemplate(
        adminAgent,
        'History template',
        [question.id],
      );
      templateId = template.id;

      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const technicianWAgent = await loginAgent(built.app, technicianWEmail);

      // Own-history session for technician U on community C.
      const openedByU = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${openedByU.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completedByU = await technicianUAgent
        .post(`/review-sessions/${openedByU.id}/complete`)
        .expect(200);
      sessionByUForC = completedByU.body as SessionBody;

      // Technician-performed session for W on community C — the
      // representative must see it; technician U must not.
      const openedByW = (
        await technicianWAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianWAgent
        .put(`/review-sessions/${openedByW.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completedByW = await technicianWAgent
        .post(`/review-sessions/${openedByW.id}/complete`)
        .expect(200);
      sessionByWForC = completedByW.body as SessionBody;

      // A second admin technician assignment + session on community D, so
      // the representative (only assigned to C) never sees it.
      await assignTechnician(adminAgent, communityD.id, 'rh-technician-u-id');
      const openedForD = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityD.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${openedForD.id}/entries/${elementD.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completedForD = await technicianUAgent
        .post(`/review-sessions/${openedForD.id}/complete`)
        .expect(200);
      sessionForD = completedForD.body as SessionBody;
    });

    afterAll(async () => {
      await built.app.close();
    });

    it("returns only the caller's own completed sessions for a technician, across every community they are assigned to", async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      const rowIds = rows.map((row) => row.id);
      expect(rowIds).toContain(sessionByUForC.id);
      expect(rowIds).toContain(sessionForD.id);
      expect(rowIds).not.toContain(sessionByWForC.id);
      expect(
        rows.every((row) => row.performedById === 'rh-technician-u-id'),
      ).toBe(true);
    });

    it("does not return another technician's session under any field", async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      expect(JSON.stringify(rows)).not.toContain(sessionByWForC.id);
    });

    it('an empty history is a successful empty list, not an error', async () => {
      const admin = await buildSeedUser({
        id: 'rh-empty-technician-id',
        email: 'rh-empty-technician@example.com',
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const emptyBuilt = await buildApp({ users: [admin] });
      const agent = await loginAgent(
        emptyBuilt.app,
        'rh-empty-technician@example.com',
      );

      const response = await agent.get('/review-history').expect(200);

      expect(response.body).toEqual([]);
      await emptyBuilt.app.close();
    });

    it('a representative sees every completed session on their community, including sessions they did not perform', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const response = await representativeAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      const rowIds = rows.map((row) => row.id);
      expect(rowIds).toContain(sessionByUForC.id);
      expect(rowIds).toContain(sessionByWForC.id);
    });

    it("does not return another community's sessions to the representative", async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const response = await representativeAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      expect(rows.map((row) => row.id)).not.toContain(sessionForD.id);
      expect(rows.every((row) => row.communityId === communityC.id)).toBe(true);
    });

    it('a draft session never appears in the technician own-history list', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const draft = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };

      const response = await technicianUAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      expect(rows.map((row) => row.id)).not.toContain(draft.id);

      await technicianUAgent.delete(`/review-sessions/${draft.id}`).expect(204);
    });

    it('a draft session never appears in the representative community-history list', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const draft = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };

      const response = await representativeAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      expect(rows.map((row) => row.id)).not.toContain(draft.id);

      await technicianUAgent.delete(`/review-sessions/${draft.id}`).expect(204);
    });

    it('rejects an unauthenticated caller with 401', async () => {
      await request(built.app.getHttpServer())
        .get('/review-history')
        .expect(401);
    });

    it('resolves communityId, communityName and startedAt/completedAt on each row', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get('/review-history')
        .expect(200);

      const rows = response.body as HistoryRowBody[];
      const row = rows.find((r) => r.id === sessionByUForC.id);
      expect(row).toMatchObject({
        communityId: communityC.id,
        communityName: communityC.name,
        performedById: 'rh-technician-u-id',
      });
    });
  });

  // review-history spec.md "Scoped Read-Back of One Historical Session" /
  // "An Out-of-Scope Historical Session Is Indistinguishable From a
  // Nonexistent One" — PR 2's by-id detail read.
  describe('GET /review-history/:sessionId', () => {
    let built: BuiltApp;
    const adminEmail = 'rhd-admin@example.com';
    const technicianUEmail = 'rhd-technician-u@example.com';
    const technicianWEmail = 'rhd-technician-w@example.com';
    const representativeEmail = 'rhd-representative@example.com';
    const managerEmail = 'rhd-manager@example.com';
    const companyManagerEmail = 'rhd-company-manager@example.com';

    let communityC: CommunityBody;
    let communityD: CommunityBody;
    let templateId: string;
    let question: QuestionBody;
    let elementC: ElementBody;
    let sessionByUForC: SessionBody;
    let sessionByWForC: SessionBody;
    let sessionForD: SessionBody;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rhd-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technicianU = await buildSeedUser({
        id: 'rhd-technician-u-id',
        email: technicianUEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const technicianW = await buildSeedUser({
        id: 'rhd-technician-w-id',
        email: technicianWEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'rhd-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const manager = await buildSeedUser({
        id: 'rhd-manager-id',
        email: managerEmail,
        role: 'MANAGER',
      });
      const companyManager = await buildSeedUser({
        id: 'rhd-company-manager-id',
        email: companyManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      built = await buildApp({
        users: [
          admin,
          technicianU,
          technicianW,
          representative,
          manager,
          companyManager,
        ],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityC = await createCommunity(
        adminAgent,
        'History detail community C',
      );
      communityD = await createCommunity(
        adminAgent,
        'History detail community D',
      );
      await assignTechnician(adminAgent, communityC.id, 'rhd-technician-u-id');
      await assignTechnician(adminAgent, communityC.id, 'rhd-technician-w-id');
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'rhd-representative-id',
      );

      elementC = await createElement(
        adminAgent,
        communityC.id,
        'History detail extinguisher C',
      );
      const elementD = await createElement(
        adminAgent,
        communityD.id,
        'History detail extinguisher D',
      );
      question = await createQuestion(
        adminAgent,
        'Is the pressure gauge in range?',
      );
      const template = await createActiveTemplate(
        adminAgent,
        'History detail template',
        [question.id],
      );
      templateId = template.id;

      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const technicianWAgent = await loginAgent(built.app, technicianWEmail);

      const openedByU = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${openedByU.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      sessionByUForC = (
        await technicianUAgent
          .post(`/review-sessions/${openedByU.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      const openedByW = (
        await technicianWAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianWAgent
        .put(`/review-sessions/${openedByW.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'NO' }] })
        .expect(200);
      sessionByWForC = (
        await technicianWAgent
          .post(`/review-sessions/${openedByW.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      await assignTechnician(adminAgent, communityD.id, 'rhd-technician-u-id');
      const openedForD = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityD.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${openedForD.id}/entries/${elementD.id}`)
        .send({ observations: 'Element inaccessible for inspection' })
        .expect(200);
      sessionForD = (
        await technicianUAgent
          .post(`/review-sessions/${openedForD.id}/complete`)
          .expect(200)
      ).body as SessionBody;
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('a performer reads back their own completed session with the full recorded record', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);

      const body = response.body as HistoryDetailBody;
      expect(body.id).toBe(sessionByUForC.id);
      expect(body.status).toBe('completed');
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0]).toMatchObject({
        inspectableElementId: elementC.id,
        elementCode: elementC.code,
        reviewed: true,
        observations: null,
      });
      expect(body.entries[0].answers).toEqual([
        { questionId: question.id, answer: 'YES' },
      ]);
      expect(body.questions).toEqual([
        expect.objectContaining({ questionId: question.id }),
      ]);
    });

    it('a performer reads back an unreviewed entry with its recorded reason', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(`/review-history/${sessionForD.id}`)
        .expect(200);

      const body = response.body as HistoryDetailBody;
      expect(body.entries[0]).toMatchObject({
        reviewed: false,
        observations: 'Element inaccessible for inspection',
        answers: [],
      });
    });

    it('a representative reads back a technician-performed session they did not perform', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const response = await representativeAgent
        .get(`/review-history/${sessionByWForC.id}`)
        .expect(200);

      const body = response.body as HistoryDetailBody;
      expect(body.id).toBe(sessionByWForC.id);
      expect(body.entries[0]).toMatchObject({
        inspectableElementId: elementC.id,
        elementCode: elementC.code,
      });
    });

    it('each entry identifies the element it records', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);

      const body = response.body as HistoryDetailBody;
      expect(
        body.entries.every((entry) => entry.inspectableElementId != null),
      ).toBe(true);
    });

    it('a decommissioned element still returns its entry with elementCode: null', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const adminAgent = await loginAgent(built.app, adminEmail);

      const opened = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${opened.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completed = (
        await technicianUAgent
          .post(`/review-sessions/${opened.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      await adminAgent
        .patch(
          `/communities/${communityC.id}/inspectable-elements/${elementC.id}`,
        )
        .send({ deactivated: true })
        .expect(200);

      const response = await technicianUAgent
        .get(`/review-history/${completed.id}`)
        .expect(200);
      const body = response.body as HistoryDetailBody;
      expect(body.entries[0]).toMatchObject({
        inspectableElementId: elementC.id,
        elementCode: null,
      });

      // Reactivate so later tests in this describe block are unaffected.
      await adminAgent
        .patch(
          `/communities/${communityC.id}/inspectable-elements/${elementC.id}`,
        )
        .send({ deactivated: false })
        .expect(200);
    });

    it('an out-of-scope session behaves exactly like a nonexistent one (indistinguishable 404)', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const nonexistentResponse = await technicianUAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const foreignResponse = await technicianUAgent
        .get(`/review-history/${sessionByWForC.id}`)
        .expect(404);

      const nonexistentBody = nonexistentResponse.body as ErrorBody;
      const foreignBody = foreignResponse.body as ErrorBody;
      expect(foreignBody).toEqual(nonexistentBody);
      expect(nonexistentBody.code).toBe('REVIEW_SESSION_NOT_FOUND');
    });

    it("does not disclose another technician's completed session", async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const nonexistentResponse = await technicianUAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const response = await technicianUAgent
        .get(`/review-history/${sessionByWForC.id}`)
        .expect(404);

      expect(response.body).toEqual(nonexistentResponse.body);
      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    it("does not disclose another community's completed session to the representative", async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const nonexistentResponse = await representativeAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const response = await representativeAgent
        .get(`/review-history/${sessionForD.id}`)
        .expect(404);

      expect(response.body).toEqual(nonexistentResponse.body);
      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    it('a draft session is rejected as 404, identically to a nonexistent one', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const draft = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };

      const nonexistentResponse = await technicianUAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const response = await technicianUAgent
        .get(`/review-history/${draft.id}`)
        .expect(404);

      expect(response.body).toEqual(nonexistentResponse.body);
      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );

      await technicianUAgent.delete(`/review-sessions/${draft.id}`).expect(204);
    });

    // review-history spec.md "The Deferred Review Visibility Scopes Are Not
    // Built" / authorization spec "The Deferred Review Visibility Scopes
    // Grant Nothing" — tasks.md 4.10.
    it('MANAGER gets 403 on both the list and the detail route', async () => {
      const managerAgent = await loginAgent(built.app, managerEmail);

      await managerAgent.get('/review-history').expect(403);
      await managerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(403);
    });

    // review-history-company-scope/tasks.md 4.4: MAINTENANCE_COMPANY_MANAGER
    // is no longer denied by permission (authorization/spec.md "The
    // Maintenance Company Manager Becomes Operational") — this seeded
    // manager has NO maintenanceCompanyId, so the company scope fails
    // closed instead: an empty list, never a 403, and the by-id request
    // collapses into the SAME indistinguishable 404 as any other
    // out-of-scope caller (spec: "A manager with no maintenance company
    // sees nothing"). The full company-scoped matrix (a manager WITH a
    // company) lives in its own describe block below.
    it('MAINTENANCE_COMPANY_MANAGER with no maintenance company gets an empty list and an indistinguishable 404, never a 403', async () => {
      const companyManagerAgent = await loginAgent(
        built.app,
        companyManagerEmail,
      );

      const listResponse = await companyManagerAgent
        .get('/review-history')
        .expect(200);
      expect(listResponse.body).toEqual([]);

      const nonexistentResponse = await companyManagerAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const byIdResponse = await companyManagerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(404);
      expect(byIdResponse.body).toEqual(nonexistentResponse.body);
      expect((byIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    it('SYSTEM_ADMIN gets 403 on both the list and the detail route', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      await adminAgent.get('/review-history').expect(403);
      await adminAgent.get(`/review-history/${sessionByUForC.id}`).expect(403);
    });

    it('a page/cursor/limit/offset/date-range/sort/search query parameter has no effect on either route', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const filteredListResponse = await technicianUAgent
        .get('/review-history')
        .query({
          page: 1,
          cursor: 'x',
          limit: 1,
          offset: 1,
          from: '2020-01-01',
          to: '2020-01-02',
          sort: 'asc',
          search: 'anything',
        })
        .expect(200);
      const plainListResponse = await technicianUAgent
        .get('/review-history')
        .expect(200);
      expect(filteredListResponse.body).toEqual(plainListResponse.body);

      const filteredDetailResponse = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .query({ page: 1, limit: 1 })
        .expect(200);
      const plainDetailResponse = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);
      expect(filteredDetailResponse.body).toEqual(plainDetailResponse.body);
    });

    // tasks.md 4.11: "no page/cursor/limit/offset/date-range/sort/search
    // parameter accepted on any of the three scopes" — the representative
    // (community) scope's variant of the test above.
    it('a page/cursor/limit/offset/date-range/sort/search query parameter has no effect on the representative scope', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const filteredListResponse = await representativeAgent
        .get('/review-history')
        .query({
          page: 1,
          cursor: 'x',
          limit: 1,
          offset: 1,
          from: '2020-01-01',
          to: '2020-01-02',
          sort: 'asc',
          search: 'anything',
        })
        .expect(200);
      const plainListResponse = await representativeAgent
        .get('/review-history')
        .expect(200);
      expect(filteredListResponse.body).toEqual(plainListResponse.body);
    });
  });

  // review-history spec.md "History Access Requires a Currently Active
  // Community Assignment, Including for One's Own Sessions" — the
  // retroactive revocation matrix (tasks.md 4.9), deliberately deferred from
  // PR 1 to this PR.
  describe('Retroactive revocation on assignment deactivation', () => {
    let built: BuiltApp;
    const adminEmail = 'rhr-admin@example.com';
    const technicianEmail = 'rhr-technician@example.com';
    const communityMateEmail = 'rhr-technician-mate@example.com';
    const representativeEmail = 'rhr-representative@example.com';

    let community: CommunityBody;
    let templateId: string;
    let question: QuestionBody;
    let element: ElementBody;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rhr-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rhr-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const communityMate = await buildSeedUser({
        id: 'rhr-technician-mate-id',
        email: communityMateEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'rhr-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      built = await buildApp({
        users: [admin, technician, communityMate, representative],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      community = await createCommunity(
        adminAgent,
        'Retroactive revocation community',
      );
      await assignTechnician(adminAgent, community.id, 'rhr-technician-id');
      await assignTechnician(
        adminAgent,
        community.id,
        'rhr-technician-mate-id',
      );
      await assignRepresentative(
        adminAgent,
        community.id,
        'rhr-representative-id',
      );

      element = await createElement(
        adminAgent,
        community.id,
        'Retroactive revocation extinguisher',
      );
      question = await createQuestion(adminAgent, 'Is the seal intact?');
      const template = await createActiveTemplate(
        adminAgent,
        'Retroactive revocation template',
        [question.id],
      );
      templateId = template.id;
    });

    afterAll(async () => {
      await built.app.close();
    });

    // REVERSED 2026-09-09 (review-history/spec.md "History Access Requires a
    // Currently Active Community Assignment, Except for One's Own Performed
    // Sessions"): the technician's OWN completed session now stays readable
    // after their assignment is deactivated — tasks.md 4.6 inverts the
    // pre-reversal version of this test rather than deleting it, so the
    // reversal itself stays regression-guarded. A community-mate's session
    // (never performed by this technician) still 404s identically, before
    // and after the deactivation — the reversal widens nothing beyond the
    // caller's own work.
    it("a technician's own completed session stays readable after their assignment is deactivated, and a community-mate's session stays a 404 throughout", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const mateAgent = await loginAgent(built.app, communityMateEmail);

      const opened = (
        await technicianAgent
          .post('/review-sessions')
          .send({ communityId: community.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianAgent
        .put(`/review-sessions/${opened.id}/entries/${element.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completed = (
        await technicianAgent
          .post(`/review-sessions/${opened.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      // The community-mate's own session on the same community — U's
      // deactivation must never grant or deny anything about it, in either
      // direction.
      const mateOpened = (
        await mateAgent
          .post('/review-sessions')
          .send({ communityId: community.id, templateId })
          .expect(201)
      ).body as { id: string };
      await mateAgent
        .put(`/review-sessions/${mateOpened.id}/entries/${element.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const mateCompleted = (
        await mateAgent
          .post(`/review-sessions/${mateOpened.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      // Successful before deactivation; the mate's session already 404s.
      const beforeList = await technicianAgent
        .get('/review-history')
        .expect(200);
      expect(
        (beforeList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await technicianAgent.get(`/review-history/${completed.id}`).expect(200);
      const beforeMateResponse = await technicianAgent
        .get(`/review-history/${mateCompleted.id}`)
        .expect(404);
      expect((beforeMateResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );

      await adminAgent
        .delete(`/communities/${community.id}/technicians/rhr-technician-id`)
        .expect(204);

      // The very next request, no grace period: own work is UNCHANGED —
      // still listed, still readable by id.
      const afterList = await technicianAgent
        .get('/review-history')
        .expect(200);
      expect(
        (afterList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await technicianAgent.get(`/review-history/${completed.id}`).expect(200);

      // The mate's session is still, and only ever, a 404 — the
      // deactivation widened nothing.
      const afterMateResponse = await technicianAgent
        .get(`/review-history/${mateCompleted.id}`)
        .expect(404);
      expect((afterMateResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );

      await adminAgent
        .post(
          `/communities/${community.id}/technicians/rhr-technician-id/reactivate`,
        )
        .expect(200);

      const reassignedList = await technicianAgent
        .get('/review-history')
        .expect(200);
      expect(
        (reassignedList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await technicianAgent.get(`/review-history/${completed.id}`).expect(200);
    });

    it('a representative loses community history on deactivation and regains it on reassignment', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const opened = (
        await technicianAgent
          .post('/review-sessions')
          .send({ communityId: community.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianAgent
        .put(`/review-sessions/${opened.id}/entries/${element.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      const completed = (
        await technicianAgent
          .post(`/review-sessions/${opened.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      const beforeList = await representativeAgent
        .get('/review-history')
        .expect(200);
      expect(
        (beforeList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await representativeAgent
        .get(`/review-history/${completed.id}`)
        .expect(200);

      await adminAgent
        .delete(
          `/communities/${community.id}/representatives/rhr-representative-id`,
        )
        .expect(204);

      const afterList = await representativeAgent
        .get('/review-history')
        .expect(200);
      expect(
        (afterList.body as HistoryRowBody[]).map((row) => row.id),
      ).not.toContain(completed.id);
      const afterDetailResponse = await representativeAgent
        .get(`/review-history/${completed.id}`)
        .expect(404);
      expect((afterDetailResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );

      await adminAgent
        .post(
          `/communities/${community.id}/representatives/rhr-representative-id/reactivate`,
        )
        .expect(200);

      const reassignedList = await representativeAgent
        .get('/review-history')
        .expect(200);
      expect(
        (reassignedList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await representativeAgent
        .get(`/review-history/${completed.id}`)
        .expect(200);
    });
  });

  // authorization/spec.md "Company-Wide Review History Scope for a
  // Maintenance Company Manager" + review-history/spec.md "A Maintenance
  // Company Manager's Company-Wide Completed Review History" — tasks.md
  // 4.4, 4.5, 4.8, 4.9, 4.10, 4.12: the third scope, resolved through
  // CompanyScopeChecker, never through a community assignment.
  describe('Company-scoped history for MAINTENANCE_COMPANY_MANAGER', () => {
    let built: BuiltApp;
    const adminEmail = 'rhc-admin@example.com';
    const managerXEmail = 'rhc-manager-x@example.com';
    const managerYEmail = 'rhc-manager-y@example.com';
    const managerNoneEmail = 'rhc-manager-none@example.com';
    const technicianX1Email = 'rhc-technician-x1@example.com';
    const technicianX2Email = 'rhc-technician-x2@example.com';
    const technicianYEmail = 'rhc-technician-y@example.com';
    const technicianNoCompanyEmail = 'rhc-technician-nocompany@example.com';
    const technicianTransferEmail = 'rhc-technician-transfer@example.com';
    // Cross-role 404-parity fixture (tasks.md 4.10): a representative on
    // communityC, alongside technicianX1 and managerX, so the "byte-identical
    // ACROSS roles" test below can compare all three roles' out-of-scope 404
    // for the SAME foreign session, not just each role against itself.
    const representativeCEmail = 'rhc-representative-c@example.com';
    // Bypasses normal maintenance-company-assignment policy on purpose
    // (User's constructor performs no validation — design.md's own
    // precedent): a company set on a role that holds no reviewSession:read
    // at all, to prove the company association never substitutes for the
    // permission (tasks.md 4.12, "both roles' variant").
    const managerRoleNoPermissionEmail = 'rhc-manager-role@example.com';
    const adminWithCompanyEmail = 'rhc-admin-with-company@example.com';

    const COMPANY_X = 'rhc-company-x';
    const COMPANY_Y = 'rhc-company-y';

    let communityC: CommunityBody;
    let communityD: CommunityBody;
    let communityE: CommunityBody;
    let communityF: CommunityBody;
    let communityG: CommunityBody;
    let templateId: string;
    let question: QuestionBody;
    let elementC: ElementBody;
    let elementD: ElementBody;
    let elementE: ElementBody;
    let elementF: ElementBody;
    let elementG: ElementBody;

    let sessionX1ForC: SessionBody;
    let sessionX2ForD: SessionBody;
    let sessionYForE: SessionBody;
    let sessionNoCompanyForF: SessionBody;
    let draftXForC: { id: string };
    let sessionTransferredForG: SessionBody;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rhc-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const managerX = await buildSeedUser({
        id: 'rhc-manager-x-id',
        email: managerXEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
        maintenanceCompanyId: COMPANY_X,
      });
      const managerY = await buildSeedUser({
        id: 'rhc-manager-y-id',
        email: managerYEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
        maintenanceCompanyId: COMPANY_Y,
      });
      const managerNone = await buildSeedUser({
        id: 'rhc-manager-none-id',
        email: managerNoneEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      const technicianX1 = await buildSeedUser({
        id: 'rhc-technician-x1-id',
        email: technicianX1Email,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const technicianX2 = await buildSeedUser({
        id: 'rhc-technician-x2-id',
        email: technicianX2Email,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const technicianY = await buildSeedUser({
        id: 'rhc-technician-y-id',
        email: technicianYEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_Y,
      });
      const technicianNoCompany = await buildSeedUser({
        id: 'rhc-technician-nocompany-id',
        email: technicianNoCompanyEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const technicianTransfer = await buildSeedUser({
        id: 'rhc-technician-transfer-id',
        email: technicianTransferEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const managerRoleNoPermission = await buildSeedUser({
        id: 'rhc-manager-role-id',
        email: managerRoleNoPermissionEmail,
        role: 'MANAGER',
        maintenanceCompanyId: COMPANY_X,
      });
      const adminWithCompany = await buildSeedUser({
        id: 'rhc-admin-with-company-id',
        email: adminWithCompanyEmail,
        role: 'SYSTEM_ADMIN',
        maintenanceCompanyId: COMPANY_X,
      });
      const representativeC = await buildSeedUser({
        id: 'rhc-representative-c-id',
        email: representativeCEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });

      built = await buildApp({
        users: [
          admin,
          managerX,
          managerY,
          managerNone,
          technicianX1,
          technicianX2,
          technicianY,
          technicianNoCompany,
          technicianTransfer,
          managerRoleNoPermission,
          adminWithCompany,
          representativeC,
        ],
        liveCompanyIds: [COMPANY_X, COMPANY_Y],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityC = await createCommunity(adminAgent, 'Company scope C');
      communityD = await createCommunity(adminAgent, 'Company scope D');
      communityE = await createCommunity(adminAgent, 'Company scope E');
      communityF = await createCommunity(adminAgent, 'Company scope F');
      communityG = await createCommunity(adminAgent, 'Company scope G');

      await assignTechnician(adminAgent, communityC.id, 'rhc-technician-x1-id');
      await assignTechnician(adminAgent, communityD.id, 'rhc-technician-x2-id');
      await assignTechnician(adminAgent, communityE.id, 'rhc-technician-y-id');
      await assignTechnician(
        adminAgent,
        communityF.id,
        'rhc-technician-nocompany-id',
      );
      await assignTechnician(
        adminAgent,
        communityG.id,
        'rhc-technician-transfer-id',
      );
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'rhc-representative-c-id',
      );

      elementC = await createElement(adminAgent, communityC.id, 'Element C');
      elementD = await createElement(adminAgent, communityD.id, 'Element D');
      elementE = await createElement(adminAgent, communityE.id, 'Element E');
      elementF = await createElement(adminAgent, communityF.id, 'Element F');
      elementG = await createElement(adminAgent, communityG.id, 'Element G');
      question = await createQuestion(adminAgent, 'Is it operational?');
      const template = await createActiveTemplate(
        adminAgent,
        'Company scope template',
        [question.id],
      );
      templateId = template.id;

      async function completeSession(
        email: string,
        communityId: string,
        elementId: string,
      ): Promise<SessionBody> {
        const agent = await loginAgent(built.app, email);
        const opened = (
          await agent
            .post('/review-sessions')
            .send({ communityId, templateId })
            .expect(201)
        ).body as { id: string };
        await agent
          .put(`/review-sessions/${opened.id}/entries/${elementId}`)
          .send({ answers: [{ questionId: question.id, value: 'YES' }] })
          .expect(200);
        return (
          await agent.post(`/review-sessions/${opened.id}/complete`).expect(200)
        ).body as SessionBody;
      }

      sessionX1ForC = await completeSession(
        technicianX1Email,
        communityC.id,
        elementC.id,
      );
      sessionX2ForD = await completeSession(
        technicianX2Email,
        communityD.id,
        elementD.id,
      );
      sessionYForE = await completeSession(
        technicianYEmail,
        communityE.id,
        elementE.id,
      );
      sessionNoCompanyForF = await completeSession(
        technicianNoCompanyEmail,
        communityF.id,
        elementF.id,
      );

      // A completed session performed while the technician was still
      // employed by X (design.md Decision 1: frozen at creation).
      sessionTransferredForG = await completeSession(
        technicianTransferEmail,
        communityG.id,
        elementG.id,
      );

      // A draft, never completed, for X's own community — MUST stay out of
      // the manager's scope entirely (tasks.md 4.9).
      const technicianX1Agent = await loginAgent(built.app, technicianX1Email);
      draftXForC = (
        await technicianX1Agent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };

      // Transfer the technician from X to Y AFTER completing the session —
      // attribution MUST stay with X (authorization/spec.md "Attribution
      // survives the performer's transfer").
      await adminAgent
        .patch(`/users/rhc-technician-transfer-id`)
        .send({ maintenanceCompanyId: COMPANY_Y })
        .expect(200);
    });

    afterAll(async () => {
      await built.app.close();
    });

    // tasks.md 4.4: company-wide visibility across every technician and
    // community, cross-company isolation, no-company manager gets empty,
    // and an unattributed session is invisible to every manager.
    it("a manager sees every one of their company's technicians' work across communities, and only their own company's", async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      const response = await managerXAgent.get('/review-history').expect(200);
      const rowIds = (response.body as HistoryRowBody[]).map((row) => row.id);

      expect(rowIds).toContain(sessionX1ForC.id);
      expect(rowIds).toContain(sessionX2ForD.id);
      expect(rowIds).not.toContain(sessionYForE.id);
      expect(rowIds).not.toContain(sessionNoCompanyForF.id);
    });

    it("another company's session is never visible to X's manager, on list or by id", async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      const listResponse = await managerXAgent
        .get('/review-history')
        .expect(200);
      expect(
        (listResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).not.toContain(sessionYForE.id);

      const byIdResponse = await managerXAgent
        .get(`/review-history/${sessionYForE.id}`)
        .expect(404);
      expect((byIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    it('a manager with no maintenance company gets an empty list, not everything', async () => {
      const managerNoneAgent = await loginAgent(built.app, managerNoneEmail);

      const response = await managerNoneAgent
        .get('/review-history')
        .expect(200);
      expect(response.body).toEqual([]);

      const byIdResponse = await managerNoneAgent
        .get(`/review-history/${sessionX1ForC.id}`)
        .expect(404);
      expect((byIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    it('a session with no attributed company is invisible to every manager', async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);
      const managerYAgent = await loginAgent(built.app, managerYEmail);

      for (const agent of [managerXAgent, managerYAgent]) {
        const listResponse = await agent.get('/review-history').expect(200);
        expect(
          (listResponse.body as HistoryRowBody[]).map((row) => row.id),
        ).not.toContain(sessionNoCompanyForF.id);

        const byIdResponse = await agent
          .get(`/review-history/${sessionNoCompanyForF.id}`)
          .expect(404);
        expect((byIdResponse.body as ErrorBody).code).toBe(
          'REVIEW_SESSION_NOT_FOUND',
        );
      }
    });

    // tasks.md 4.5: attribution is frozen at completion time, not derived
    // from the performer's current employer.
    it("attribution survives the performer's transfer — the session stays with the ORIGINAL company's manager", async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);
      const managerYAgent = await loginAgent(built.app, managerYEmail);

      const xListResponse = await managerXAgent
        .get('/review-history')
        .expect(200);
      expect(
        (xListResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(sessionTransferredForG.id);
      await managerXAgent
        .get(`/review-history/${sessionTransferredForG.id}`)
        .expect(200);

      const yListResponse = await managerYAgent
        .get('/review-history')
        .expect(200);
      expect(
        (yListResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).not.toContain(sessionTransferredForG.id);
      const yByIdResponse = await managerYAgent
        .get(`/review-history/${sessionTransferredForG.id}`)
        .expect(404);
      expect((yByIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // tasks.md 4.8: no community assignment is involved in the manager's
    // scope at all — X's manager holds none, yet sees X's full history.
    it("the manager's scope requires no community assignment of any kind", async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      const response = await managerXAgent.get('/review-history').expect(200);
      const rowIds = (response.body as HistoryRowBody[]).map((row) => row.id);
      expect(rowIds).toContain(sessionX1ForC.id);
      expect(rowIds).toContain(sessionX2ForD.id);
    });

    // tasks.md 4.9: drafts stay out of the company scope exactly as they do
    // for the other two scopes.
    it("a company's draft session is excluded from the manager's list and refused by id, indistinguishably from nonexistent", async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      const listResponse = await managerXAgent
        .get('/review-history')
        .expect(200);
      expect(
        (listResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).not.toContain(draftXForC.id);

      const nonexistentResponse = await managerXAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const draftResponse = await managerXAgent
        .get(`/review-history/${draftXForC.id}`)
        .expect(404);
      expect(draftResponse.body).toEqual(nonexistentResponse.body);
    });

    // tasks.md 4.12: the company association is checked IN ADDITION to the
    // permission, never instead of it — both roles' variant: MANAGER and
    // SYSTEM_ADMIN each have a company set (bypassing normal policy) but
    // neither role holds reviewSession:read.
    it('a caller with a set company but no reviewSession:read gets 403 on every history endpoint (MANAGER variant)', async () => {
      const managerRoleAgent = await loginAgent(
        built.app,
        managerRoleNoPermissionEmail,
      );

      await managerRoleAgent.get('/review-history').expect(403);
      await managerRoleAgent
        .get(`/review-history/${sessionX1ForC.id}`)
        .expect(403);
    });

    it('a caller with a set company but no reviewSession:read gets 403 on every history endpoint (SYSTEM_ADMIN variant)', async () => {
      const adminWithCompanyAgent = await loginAgent(
        built.app,
        adminWithCompanyEmail,
      );

      await adminWithCompanyAgent.get('/review-history').expect(403);
      await adminWithCompanyAgent
        .get(`/review-history/${sessionX1ForC.id}`)
        .expect(403);
    });

    // tasks.md 4.10: the 404 is not just identical to "nonexistent" per
    // role — it is identical ACROSS roles, so there is no distinct
    // "exists but not yours" shape leaking anywhere. sessionYForE (company Y,
    // community E) is out of scope for all three: technicianX1 never
    // performed it, representativeC's community is C (not E), and managerX's
    // company is X (not Y).
    it('the out-of-scope 404 is byte-identical across all three roles', async () => {
      const technicianX1Agent = await loginAgent(built.app, technicianX1Email);
      const representativeCAgent = await loginAgent(
        built.app,
        representativeCEmail,
      );
      const managerXAgent = await loginAgent(built.app, managerXEmail);
      const nonexistentId = '00000000-0000-7000-8000-000000000000';

      const technicianResponse = await technicianX1Agent
        .get(`/review-history/${sessionYForE.id}`)
        .expect(404);
      const representativeResponse = await representativeCAgent
        .get(`/review-history/${sessionYForE.id}`)
        .expect(404);
      const managerResponse = await managerXAgent
        .get(`/review-history/${sessionYForE.id}`)
        .expect(404);
      const managerNonexistentResponse = await managerXAgent
        .get(`/review-history/${nonexistentId}`)
        .expect(404);

      expect(representativeResponse.body).toEqual(technicianResponse.body);
      expect(managerResponse.body).toEqual(technicianResponse.body);
      expect(managerNonexistentResponse.body).toEqual(technicianResponse.body);
      expect((technicianResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // tasks.md 4.11: no list-control parameter has any effect on the
    // manager's scope either.
    it('a page/cursor/limit/offset/date-range/sort/search query parameter has no effect on the manager scope', async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      const filteredResponse = await managerXAgent
        .get('/review-history')
        .query({
          page: 1,
          cursor: 'x',
          limit: 1,
          offset: 1,
          from: '2020-01-01',
          to: '2020-01-02',
          sort: 'asc',
          search: 'anything',
        })
        .expect(200);
      const plainResponse = await managerXAgent
        .get('/review-history')
        .expect(200);
      expect(filteredResponse.body).toEqual(plainResponse.body);
    });

    // tasks.md 4.11: the manager holds no write access to the review-session
    // surface — reviewSession:read grants nothing beyond history reads.
    it('the manager is refused on every review-session write endpoint, performing no write', async () => {
      const managerXAgent = await loginAgent(built.app, managerXEmail);

      await managerXAgent
        .post('/review-sessions')
        .send({ communityId: communityC.id, templateId })
        .expect(403);
      await managerXAgent
        .put(`/review-sessions/${sessionX1ForC.id}/entries/${elementC.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(403);
      await managerXAgent
        .post(`/review-sessions/${sessionX1ForC.id}/complete`)
        .expect(403);
      await managerXAgent
        .delete(`/review-sessions/${draftXForC.id}`)
        .expect(403);
    });
  });

  // tasks.md 4.11: no manager-capability mechanism or global-review symbol
  // was introduced anywhere by this slice, and the migration directory
  // still contains only the one attribution-column migration (spec: "No
  // manager capability or global-review mechanism is introduced", "The only
  // migration is the attribution column and its backfill").
  describe('No manager-capability mechanism or extra migration was introduced', () => {
    it('no ManagerCapability/managerCapabilities/VIEW_ALL_REVIEWS symbol is DECLARED anywhere under apps/api/src', () => {
      // Declaration-shaped patterns, not a bare substring search — a
      // pre-existing explanatory CODE COMMENT is allowed to use the words
      // in prose (e.g. "a hypothetical field like managerCapabilities
      // could…"); what the spec forbids is an actual enum, field or
      // permission constant being introduced.
      const forbiddenPatterns = [
        /\bManagerCapability\b/, // enum / type declaration or reference
        /\bmanagerCapabilities\s*[?:=]/, // a FIELD declaration, not prose
        /\bVIEW_ALL_REVIEWS\b/, // permission/capability constant
      ];
      const srcRoot = path.join(__dirname, '..', 'src');
      const offendingFiles: string[] = [];

      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
            continue;
          }
          if (!entry.name.endsWith('.ts')) continue;
          const content = fs.readFileSync(fullPath, 'utf8');
          if (forbiddenPatterns.some((pattern) => pattern.test(content))) {
            offendingFiles.push(fullPath);
          }
        }
      };
      walk(srcRoot);

      expect(offendingFiles).toEqual([]);
    });

    it('the migration directory contains only the one attribution-column migration added by this change', () => {
      const migrationsRoot = path.join(__dirname, '..', 'prisma', 'migrations');
      const migrationDirs = fs
        .readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const attributionMigrations = migrationDirs.filter((name) =>
        name.includes('performed_by_company'),
      );
      expect(attributionMigrations).toHaveLength(1);
    });
  });
});
