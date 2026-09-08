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
import { User } from '../src/modules/users/domain/user.entity';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import type { Role } from '../src/modules/users/domain/role';

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
  });
}

interface BuiltApp {
  app: INestApplication<App>;
}

async function buildApp(seed: { users: User[] }): Promise<BuiltApp> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users) {
    userRepository.seed(user);
  }

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
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app };
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

    it('MAINTENANCE_COMPANY_MANAGER gets 403 on both the list and the detail route', async () => {
      const companyManagerAgent = await loginAgent(
        built.app,
        companyManagerEmail,
      );

      await companyManagerAgent.get('/review-history').expect(403);
      await companyManagerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(403);
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
  });

  // review-history spec.md "History Access Requires a Currently Active
  // Community Assignment, Including for One's Own Sessions" — the
  // retroactive revocation matrix (tasks.md 4.9), deliberately deferred from
  // PR 1 to this PR.
  describe('Retroactive revocation on assignment deactivation', () => {
    let built: BuiltApp;
    const adminEmail = 'rhr-admin@example.com';
    const technicianEmail = 'rhr-technician@example.com';
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
      const representative = await buildSeedUser({
        id: 'rhr-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      built = await buildApp({ users: [admin, technician, representative] });

      const adminAgent = await loginAgent(built.app, adminEmail);
      community = await createCommunity(
        adminAgent,
        'Retroactive revocation community',
      );
      await assignTechnician(adminAgent, community.id, 'rhr-technician-id');
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

    it("a technician's own completed session becomes unreadable once their assignment is deactivated, and returns once reassigned", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const technicianAgent = await loginAgent(built.app, technicianEmail);

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

      // Successful before deactivation.
      const beforeList = await technicianAgent
        .get('/review-history')
        .expect(200);
      expect(
        (beforeList.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(completed.id);
      await technicianAgent.get(`/review-history/${completed.id}`).expect(200);

      await adminAgent
        .delete(`/communities/${community.id}/technicians/rhr-technician-id`)
        .expect(204);

      // The very next request, no grace period, no cached grant.
      const afterList = await technicianAgent
        .get('/review-history')
        .expect(200);
      expect(
        (afterList.body as HistoryRowBody[]).map((row) => row.id),
      ).not.toContain(completed.id);
      const afterDetailResponse = await technicianAgent
        .get(`/review-history/${completed.id}`)
        .expect(404);
      expect((afterDetailResponse.body as ErrorBody).code).toBe(
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
});
