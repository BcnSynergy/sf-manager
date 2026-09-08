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
});
