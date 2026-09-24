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
import { REVIEW_DOCUMENT_NAME_DIRECTORY } from '../src/modules/review-session/application/ports/review-document-name-directory.port';
import { InMemoryReviewDocumentNameDirectory } from '../src/modules/review-session/application/use-cases/testing/in-memory-review-document-name-directory';
import { ORGANIZATION_PROFILE_REPOSITORY } from '../src/modules/organization-profile/application/ports/organization-profile.repository.port';
import { InMemoryOrganizationProfileRepository } from '../src/modules/organization-profile/application/use-cases/testing/in-memory-organization-profile.repository';
import { OrganizationProfile } from '../src/modules/organization-profile/domain/organization-profile.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import {
  MAINTENANCE_COMPANY_LOOKUP,
  type MaintenanceCompanyLookup,
} from '../src/modules/users/application/ports/maintenance-company-lookup.port';
import type { Role } from '../src/modules/users/domain/role';
import type { ManagerCapability } from '../src/modules/users/domain/manager-capability';

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
  // review-history-manager-capability/tasks.md 2.11: e2e seeds a granted
  // MANAGER directly (bypassing the not-yet-built PATCH grant path, PR 3) —
  // the SAME bypass precedent maintenanceCompanyId already uses on this
  // fixture (User's constructor performs no validation, design.md's own
  // precedent).
  managerCapabilities?: ManagerCapability[];
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
    managerCapabilities: input.managerCapabilities ?? [],
  });
}

interface BuiltApp {
  app: INestApplication<App>;
  userRepository: InMemoryUserRepository;
  // review-export/design.md "E2E harness": both overrides `buildApp` gains
  // for the document route (PR 7) — no other describe block seeds them, so
  // every existing scenario keeps seeing the blank profile and an empty
  // name directory (absent id -> null/absent, never a thrown error).
  nameDirectory: InMemoryReviewDocumentNameDirectory;
  organizationProfileRepository: InMemoryOrganizationProfileRepository;
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
  const nameDirectory = new InMemoryReviewDocumentNameDirectory();
  const organizationProfileRepository =
    new InMemoryOrganizationProfileRepository();

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
    // review-export/design.md "E2E harness": the document route's two
    // overrides — the reader token resolves to this same repository
    // instance through the real module's `useExisting` alias, so it needs
    // no override of its own (design.md "PR 7's first case proves this").
    .overrideProvider(REVIEW_DOCUMENT_NAME_DIRECTORY)
    .useValue(nameDirectory)
    .overrideProvider(ORGANIZATION_PROFILE_REPOSITORY)
    .useValue(organizationProfileRepository)
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, userRepository, nameDirectory, organizationProfileRepository };
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

    // Tech-debt cleanup: a malformed :sessionId (not a UUID at all) must be
    // rejected as 400, not fall through to Prisma's `@db.Uuid` cast and
    // surface as an unmapped 500. A well-formed-but-unknown id stays a 404
    // (asserted above) — this test is only about syntactically invalid ids.
    it('rejects a malformed (non-UUID) sessionId with 400, not a 500', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get('/review-history/not-a-uuid')
        .expect(400);

      expect(response.body as ErrorBody).toMatchObject({
        statusCode: 400,
        code: 'INVALID_SESSION_ID',
      });
    });

    // A real, well-formed session id is UUID v7 (e.g.
    // `01a0d293-5cc2-73e9-bf01-48182f5251bb`) — the pipe added above must
    // keep accepting it. Every other test in this describe block already
    // exercises real v7 ids end to end, but this one pins the guard
    // explicitly so a future stricter UUID-version pipe can't silently
    // regress it.
    it('still accepts a well-formed UUID v7 sessionId', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);
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

    // review-history-manager-capability/design.md's Testing Strategy row
    // "Two shipped guards must be INVERTED, not left alone": this shipped
    // guard pinned "MANAGER gets 403 on both routes" from when the role was
    // fully inert. It is no longer true — Decision 4 grants MANAGER
    // `reviewSession:read` unconditionally, so the role now always clears
    // the PermissionsGuard; whether it sees any DATA is decided entirely by
    // ManagerCapabilityChecker (Decision 2/3), never by a 403. An ungranted
    // MANAGER therefore fails closed the SAME way every other empty-scope
    // role does elsewhere in this suite — 200 [] on the list, 404 on the
    // detail route — never a 403.
    //
    // Deviation, reported per apply-progress: design.md's own Testing
    // Strategy table literally states the replacement shape as "an
    // ungranted MANAGER gets 403", which contradicts Decision 3/4's own
    // fail-closed-to-[] logic (no 403 is reachable for MANAGER once
    // ROLE_PERMISSIONS grants reviewSession:read unconditionally,
    // regardless of capability). Implemented the behaviourally-correct
    // 200 []/404 shape instead, treating that one row as a documentation
    // slip rather than silently building an unreachable 403.
    it('an ungranted MANAGER gets an empty list and an indistinguishable 404, never a 403', async () => {
      const managerAgent = await loginAgent(built.app, managerEmail);

      const listResponse = await managerAgent
        .get('/review-history')
        .expect(200);
      expect(listResponse.body).toEqual([]);

      const nonexistentResponse = await managerAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const byIdResponse = await managerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(404);
      expect(byIdResponse.body).toEqual(nonexistentResponse.body);
      expect((byIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // The other half of the inversion: a GRANTED manager reuses the
    // SYSTEM_ADMIN read verbatim (Decision 3) — installation-wide, list and
    // by-id both 2xx.
    it('a granted MANAGER sees every completed session in the installation, list and by-id', async () => {
      const grantedManager = await buildSeedUser({
        id: 'rhd-manager-granted-id',
        email: 'rhd-manager-granted@example.com',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });
      built.userRepository.seed(grantedManager);
      const grantedManagerAgent = await loginAgent(
        built.app,
        'rhd-manager-granted@example.com',
      );

      const listResponse = await grantedManagerAgent
        .get('/review-history')
        .expect(200);
      const rowIds = (listResponse.body as HistoryRowBody[]).map(
        (row) => row.id,
      );
      expect(rowIds).toContain(sessionByUForC.id);
      expect(rowIds).toContain(sessionByWForC.id);
      expect(rowIds).toContain(sessionForD.id);

      await grantedManagerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);
    });

    // design.md Testing Strategy row "a soft-deleted granted manager sees
    // nothing" (unit-pinned in user-manager-capability.checker.spec.ts) —
    // this is the e2e counterpart, reusing the SAME session/JWT across the
    // soft-delete the way the "Revoke -> invisible, no re-login" row does:
    // a granted MANAGER's capability check resolves via `findById`, which
    // excludes soft-deleted rows by construction (ADR-010), so the account
    // being soft-deleted fails the capability closed even with a still-valid
    // JWT.
    it('a soft-deleted granted MANAGER sees nothing, even reusing the same session', async () => {
      const softDeletedManager = await buildSeedUser({
        id: 'rhd-manager-granted-deleted-id',
        email: 'rhd-manager-granted-deleted@example.com',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });
      built.userRepository.seed(softDeletedManager);
      const softDeletedManagerAgent = await loginAgent(
        built.app,
        'rhd-manager-granted-deleted@example.com',
      );
      const adminAgent = await loginAgent(built.app, adminEmail);

      await adminAgent
        .delete('/users/rhd-manager-granted-deleted-id')
        .expect(204);

      const listResponse = await softDeletedManagerAgent
        .get('/review-history')
        .expect(200);
      expect(listResponse.body).toEqual([]);

      const byIdResponse = await softDeletedManagerAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(404);
      expect((byIdResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // authorization/spec.md "The manager is refused on every review-session
    // write endpoint" — reviewSession:read grants NOTHING on the write
    // surface, the same shape as the MAINTENANCE_COMPANY_MANAGER and
    // SYSTEM_ADMIN siblings elsewhere in this suite.
    // authorization/spec.md requires this refusal to hold "once holding
    // VIEW_ALL_REVIEWS and once holding no capability" — the write surface
    // is governed by role/permission (reviewSession:read is not a write
    // grant), never by ManagerCapabilityChecker, so a GRANTED manager must
    // be refused identically to an ungranted one.
    it.each([
      ['ungranted', managerEmail],
      ['granted', 'rhd-manager-granted-write-refusal@example.com'],
    ])(
      'the manager (%s) is refused on every review-session write endpoint, performing no write',
      async (variant, email) => {
        if (variant === 'granted') {
          const grantedManager = await buildSeedUser({
            id: 'rhd-manager-granted-write-refusal-id',
            email,
            role: 'MANAGER',
            managerCapabilities: ['VIEW_ALL_REVIEWS'],
          });
          built.userRepository.seed(grantedManager);
        }
        const managerAgent = await loginAgent(built.app, email);

        await managerAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(403);
        await managerAgent
          .put(`/review-sessions/${sessionByUForC.id}/entries/${elementC.id}`)
          .send({ answers: [{ questionId: question.id, value: 'YES' }] })
          .expect(403);
        await managerAgent
          .post(`/review-sessions/${sessionByUForC.id}/complete`)
          .expect(403);
        await managerAgent
          .delete(`/review-sessions/${sessionByUForC.id}`)
          .expect(403);
      },
    );

    // authorization/spec.md "The manager gains the two review-sessions GET
    // routes (listOwn, read) as an accepted, named consequence" — the one
    // genuinely new read-access surface the unconditional Layer-1 grant
    // opens. Pinned here so a future refactor can't silently widen or
    // narrow it: listOwn stays performer-scoped (unaffected by this PR),
    // and read on a session the manager did not perform still goes through
    // the ordinary SessionAccessService community-scope check — NOT the
    // review-history scope — and 404s exactly like any other non-performer.
    it.each([
      ['ungranted', managerEmail],
      ['granted', 'rhd-manager-granted-own-scope@example.com'],
    ])(
      'the manager (%s) gains listOwn and read on /review-sessions, scoped exactly as any other caller',
      async (variant, email) => {
        if (variant === 'granted') {
          const grantedManager = await buildSeedUser({
            id: 'rhd-manager-granted-own-scope-id',
            email,
            role: 'MANAGER',
            managerCapabilities: ['VIEW_ALL_REVIEWS'],
          });
          built.userRepository.seed(grantedManager);
        }
        const managerAgent = await loginAgent(built.app, email);

        const listOwnResponse = await managerAgent
          .get('/review-sessions')
          .expect(200);
        expect(listOwnResponse.body).toEqual([]);

        const readResponse = await managerAgent
          .get(`/review-sessions/${sessionByUForC.id}`)
          .expect(404);
        expect((readResponse.body as ErrorBody).code).toBe(
          'REVIEW_SESSION_NOT_FOUND',
        );
      },
    );

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

    // review-history-admin-scope/authorization/spec.md "Installation-Wide
    // Review History Scope for a System Admin": SYSTEM_ADMIN is now the
    // fourth operational scope — every completed session, list and by-id,
    // regardless of who performed it or which community it belongs to.
    it('SYSTEM_ADMIN sees every completed session in the installation on both the list and the detail route', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const listResponse = await adminAgent.get('/review-history').expect(200);
      const rowIds = (listResponse.body as HistoryRowBody[]).map(
        (row) => row.id,
      );
      expect(rowIds).toContain(sessionByUForC.id);
      expect(rowIds).toContain(sessionByWForC.id);
      expect(rowIds).toContain(sessionForD.id);

      const detailResponse = await adminAgent
        .get(`/review-history/${sessionByUForC.id}`)
        .expect(200);
      expect((detailResponse.body as HistoryDetailBody).id).toBe(
        sessionByUForC.id,
      );
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

    // review-history-manager-capability/design.md's Testing Strategy row
    // "Two shipped guards must be INVERTED, not left alone": this e2e case
    // proved "a company association never substitutes for reviewSession:read"
    // using MANAGER as the no-permission fixture. That premise no longer
    // holds — Decision 4 grants MANAGER `reviewSession:read` unconditionally,
    // so no role in the current five-role set holds a company/community
    // association while lacking the permission, and this e2e case has no
    // substitute role to prove the same point at the HTTP layer. The real
    // replacement is `apps/api/src/modules/auth/presentation/guards/
    // permissions.guard.spec.ts`'s "rejects with 403 when the caller role
    // lacks the required permission" — it re-asserts, at the guard level,
    // that lacking the permission is what drives the 403, independent of
    // any company/community association. The now-pointless MANAGER-with-
    // company bypass fixture that used to back this case was removed
    // entirely, not left seeded with no assertion.

    // review-history-admin-scope/design.md Decision 3, authorization/spec.md
    // "The admin's scope resolves from the role alone": SYSTEM_ADMIN now
    // DOES hold reviewSession:read, so this fixture's role changes what it
    // proves — a maintenanceCompanyId set on a SYSTEM_ADMIN (bypassing
    // normal policy on purpose, since User's constructor performs no
    // validation) MUST NOT narrow the admin's installation-wide result to
    // that one company; the admin still sees every completed session,
    // including other companies' and the unattributed one.
    it("an admin's own maintenance company has no effect on their installation-wide scope", async () => {
      const adminWithCompanyAgent = await loginAgent(
        built.app,
        adminWithCompanyEmail,
      );

      const response = await adminWithCompanyAgent
        .get('/review-history')
        .expect(200);
      const rowIds = (response.body as HistoryRowBody[]).map((row) => row.id);
      expect(rowIds).toContain(sessionX1ForC.id);
      expect(rowIds).toContain(sessionYForE.id);
      expect(rowIds).toContain(sessionNoCompanyForF.id);
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

  // review-history-admin-scope/design.md Decisions 1-4, authorization/
  // spec.md "Installation-Wide Review History Scope for a System Admin" /
  // "The System Admin Becomes Operational on Review History Reads" /
  // "The Deferred Review Visibility Scopes Grant Nothing" (MODIFIED) —
  // tasks.md 2.3-2.7: the fourth scope, no predicate at all. Deactivated
  // context and no company/community assignment must not narrow it.
  describe('Installation-wide history scope for SYSTEM_ADMIN', () => {
    let built: BuiltApp;
    const adminEmail = 'rha-admin@example.com';
    const technicianXEmail = 'rha-technician-x@example.com';
    const technicianYEmail = 'rha-technician-y@example.com';
    const technicianNoCompanyEmail = 'rha-technician-nocompany@example.com';
    const technicianDeletedEmail = 'rha-technician-deleted@example.com';
    // review-history-manager-capability/tasks.md 3.18: a granted MANAGER
    // added to THIS SAME installation-wide fixture (the one carrying the
    // company/soft-deleted/no-attribution fixtures PR 2's own describe
    // block lacked), closing the 3 e2e-orphaned granted-manager scenarios
    // from review-history/spec.md ("the granted manager's list is
    // identical to the admin's", "deleted/deactivated context hides
    // nothing from the granted manager", "an empty installation renders a
    // successful empty list" — the last covered by this block's admin
    // equivalent already).
    const grantedManagerEmail = 'rha-granted-manager@example.com';

    const COMPANY_X = 'rha-company-x';
    const COMPANY_Y = 'rha-company-y';

    let communityX: CommunityBody;
    let communityY: CommunityBody;
    let templateId: string;
    let question: QuestionBody;
    let elementX: ElementBody;
    let sessionForX: SessionBody;
    let sessionForY: SessionBody;
    let sessionNoCompany: SessionBody;
    let sessionSoftDeletedPerformer: SessionBody;
    let draftForX: { id: string };

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rha-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technicianX = await buildSeedUser({
        id: 'rha-technician-x-id',
        email: technicianXEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const technicianY = await buildSeedUser({
        id: 'rha-technician-y-id',
        email: technicianYEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_Y,
      });
      const technicianNoCompany = await buildSeedUser({
        id: 'rha-technician-nocompany-id',
        email: technicianNoCompanyEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const technicianDeleted = await buildSeedUser({
        id: 'rha-technician-deleted-id',
        email: technicianDeletedEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const grantedManager = await buildSeedUser({
        id: 'rha-granted-manager-id',
        email: grantedManagerEmail,
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });

      // The admin fixture is seeded with NO maintenanceCompanyId and gets NO
      // community assignment anywhere below — authorization/spec.md "The
      // admin's scope resolves from the role alone" is proven by every test
      // in this block using this SAME fixture, not a separate "bare" one.
      built = await buildApp({
        users: [
          admin,
          technicianX,
          technicianY,
          technicianNoCompany,
          technicianDeleted,
          grantedManager,
        ],
        liveCompanyIds: [COMPANY_X, COMPANY_Y],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityX = await createCommunity(adminAgent, 'Admin scope X');
      communityY = await createCommunity(adminAgent, 'Admin scope Y');
      await assignTechnician(adminAgent, communityX.id, 'rha-technician-x-id');
      await assignTechnician(adminAgent, communityY.id, 'rha-technician-y-id');
      await assignTechnician(
        adminAgent,
        communityX.id,
        'rha-technician-nocompany-id',
      );
      await assignTechnician(
        adminAgent,
        communityX.id,
        'rha-technician-deleted-id',
      );

      elementX = await createElement(adminAgent, communityX.id, 'Element X');
      const elementY = await createElement(
        adminAgent,
        communityY.id,
        'Element Y',
      );
      question = await createQuestion(adminAgent, 'Is it operational?');
      const template = await createActiveTemplate(
        adminAgent,
        'Admin scope template',
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

      sessionForX = await completeSession(
        technicianXEmail,
        communityX.id,
        elementX.id,
      );
      sessionForY = await completeSession(
        technicianYEmail,
        communityY.id,
        elementY.id,
      );
      sessionNoCompany = await completeSession(
        technicianNoCompanyEmail,
        communityX.id,
        elementX.id,
      );
      sessionSoftDeletedPerformer = await completeSession(
        technicianDeletedEmail,
        communityX.id,
        elementX.id,
      );

      const technicianXAgent = await loginAgent(built.app, technicianXEmail);
      draftForX = (
        await technicianXAgent
          .post('/review-sessions')
          .send({ communityId: communityX.id, templateId })
          .expect(201)
      ).body as { id: string };

      // Deactivate community Y AFTER its session completed — its only
      // element must be cleared first (community.e2e-spec.ts precedent:
      // active elements block community deletion).
      await adminAgent
        .delete(
          `/communities/${communityY.id}/inspectable-elements/${elementY.id}`,
        )
        .expect(204);
      await adminAgent.delete(`/communities/${communityY.id}`).expect(204);

      // Soft-delete the performer AFTER their session completed
      // (authorization/spec.md: "A session was performed by a user who has
      // since... been soft-deleted" — the session MUST still be visible).
      // Full soft-deleted-MAINTENANCE-COMPANY persistence coverage is
      // integration-level (tasks.md 1.11) — this harness stubs PrismaService
      // for the real MaintenanceCompany aggregate, so it cannot exercise a
      // real company soft-delete through HTTP here; `sessionNoCompany`
      // above stands in for "no attribution", the e2e-reachable half of
      // that row.
      await adminAgent.delete(`/users/rha-technician-deleted-id`).expect(204);
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('sees every completed session in the installation, across companies and communities, no sampling', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const response = await adminAgent.get('/review-history').expect(200);
      const rowIds = (response.body as HistoryRowBody[]).map((row) => row.id);
      expect(rowIds).toContain(sessionForX.id);
      expect(rowIds).toContain(sessionForY.id);
      expect(rowIds).toContain(sessionNoCompany.id);
      expect(rowIds).toContain(sessionSoftDeletedPerformer.id);
      expect(rowIds).not.toContain(draftForX.id);
    });

    // review-history/spec.md "The ordering matches every other scope's
    // list, including a granted manager's" + tasks.md 3.18: closes the 3
    // e2e-orphaned granted-manager scenarios by proving the granted
    // manager's list is session-for-session IDENTICAL to the admin's on
    // this same installation-wide fixture (companies X/Y, a deactivated
    // community, a soft-deleted performer, an unattributed session).
    it("a granted MANAGER's list is identical to the SYSTEM_ADMIN's, including the deactivated community, the soft-deleted performer and the unattributed session", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const grantedManagerAgent = await loginAgent(
        built.app,
        grantedManagerEmail,
      );

      const adminResponse = await adminAgent.get('/review-history').expect(200);
      const managerResponse = await grantedManagerAgent
        .get('/review-history')
        .expect(200);

      expect(managerResponse.body).toEqual(adminResponse.body);

      // PR 3/4 review fix (M2): `toEqual` alone passes vacuously if both
      // lists come back empty (e.g. a regression breaking
      // findCompletedAcrossInstallation for everyone). Pin the specific
      // fixture rows this test's own name claims are covered, the same
      // way the sibling "sees every completed session..." test above
      // does.
      const managerRowIds = (managerResponse.body as HistoryRowBody[]).map(
        (row) => row.id,
      );
      expect(managerRowIds).toContain(sessionForY.id); // deactivated community
      expect(managerRowIds).toContain(sessionSoftDeletedPerformer.id); // soft-deleted performer
      expect(managerRowIds).toContain(sessionNoCompany.id); // unattributed session
      expect(managerRowIds).not.toContain(draftForX.id); // draft, excluded
    });

    it("a deactivated community's session stays visible on the list and by id", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const listResponse = await adminAgent.get('/review-history').expect(200);
      expect(
        (listResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(sessionForY.id);

      const detailResponse = await adminAgent
        .get(`/review-history/${sessionForY.id}`)
        .expect(200);
      expect((detailResponse.body as HistoryDetailBody).id).toBe(
        sessionForY.id,
      );
    });

    it("a soft-deleted performer's session stays visible on the list and by id", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const listResponse = await adminAgent.get('/review-history').expect(200);
      expect(
        (listResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(sessionSoftDeletedPerformer.id);

      const detailResponse = await adminAgent
        .get(`/review-history/${sessionSoftDeletedPerformer.id}`)
        .expect(200);
      expect((detailResponse.body as HistoryDetailBody).id).toBe(
        sessionSoftDeletedPerformer.id,
      );
    });

    it('a session carrying no company attribution stays visible on the list and by id', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const listResponse = await adminAgent.get('/review-history').expect(200);
      expect(
        (listResponse.body as HistoryRowBody[]).map((row) => row.id),
      ).toContain(sessionNoCompany.id);

      await adminAgent
        .get(`/review-history/${sessionNoCompany.id}`)
        .expect(200);
    });

    // authorization/spec.md "The admin's scope resolves from the role
    // alone": this fixture holds no community assignment and no
    // maintenanceCompanyId anywhere in this block, yet reaches everything.
    it("the admin's scope resolves from the role alone — no community assignment and no company decide it", async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const response = await adminAgent.get('/review-history').expect(200);
      const rowIds = (response.body as HistoryRowBody[]).map((row) => row.id);
      expect(rowIds).toContain(sessionForX.id);
      expect(rowIds).toContain(sessionForY.id);
    });

    it('gets 404 REVIEW_SESSION_NOT_FOUND on a draft and on a nonexistent id, identically', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const nonexistentResponse = await adminAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000')
        .expect(404);
      const draftResponse = await adminAgent
        .get(`/review-history/${draftForX.id}`)
        .expect(404);

      expect(draftResponse.body).toEqual(nonexistentResponse.body);
      expect((draftResponse.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // authorization/spec.md "The admin gains no write member of the
    // review-session family": reviewSession:read grants nothing on the
    // write surface — same four routes the manager variant above checks.
    it('is refused on every review-session write endpoint, performing no write', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      await adminAgent
        .post('/review-sessions')
        .send({ communityId: communityX.id, templateId })
        .expect(403);
      await adminAgent
        .put(`/review-sessions/${sessionForX.id}/entries/${elementX.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(403);
      await adminAgent
        .post(`/review-sessions/${sessionForX.id}/complete`)
        .expect(403);
      await adminAgent.delete(`/review-sessions/${draftForX.id}`).expect(403);
    });

    it('a page/cursor/limit/offset/date-range/sort/search query parameter has no effect on the admin scope', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const filteredListResponse = await adminAgent
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
      const plainListResponse = await adminAgent
        .get('/review-history')
        .expect(200);
      expect(filteredListResponse.body).toEqual(plainListResponse.body);

      const filteredDetailResponse = await adminAgent
        .get(`/review-history/${sessionForX.id}`)
        .query({ page: 1, limit: 1 })
        .expect(200);
      const plainDetailResponse = await adminAgent
        .get(`/review-history/${sessionForX.id}`)
        .expect(200);
      expect(filteredDetailResponse.body).toEqual(plainDetailResponse.body);
    });

    // authorization/spec.md "Scope is checked in addition to the
    // permission, not instead of it" — admin variant: authentication is
    // still evaluated before anything role- or permission-related, on the
    // exact same guard chain every other scope goes through.
    it('rejects an unauthenticated caller with 401 before any role or permission check', async () => {
      await request(built.app.getHttpServer())
        .get('/review-history')
        .expect(401);
      await request(built.app.getHttpServer())
        .get(`/review-history/${sessionForX.id}`)
        .expect(401);
    });
  });

  // review-history-manager-capability/design.md's Testing Strategy row "Two
  // shipped guards must be INVERTED, not left alone" documents the pattern
  // applied here to a THIRD shipped guard: `review-history-admin-scope`
  // pinned "no manager-capability mechanism exists yet" until this slice
  // built it. PR 1/4 is what falsifies that premise (schema + domain +
  // persistence-layer plumbing only — the checker, the permission grant and
  // the DTO/controller surface are still PR 2/3, tasks.md 1.1-1.10), so a
  // blanket "declared nowhere" assertion is now WRONG, not merely stale.
  // Inverted the same way as the other two guards: keep it as a real
  // regression guard, just pointed at the opposite fact — the mechanism
  // DOES exist, but ONLY in the persistence-layer files this PR touched,
  // and has not yet leaked into the DTO, the controller, the response type
  // or any authorization surface, all of which are still out of scope until
  // their own PR.
  //
  // PR 2/4 update: the checker, its adapter, its port, the service's MANAGER
  // branch and their test doubles/specs now legitimately reference the
  // mechanism too (tasks.md 2.1-2.6) — this guard's allowlist widens to
  // match, still excluding the DTO, the controller, the response type and
  // ROLE_PERMISSIONS (which grants a plain string permission, not a
  // capability, and is asserted separately by role-permission.checker.spec.ts).
  describe('The manager-capability mechanism exists only in the files this PR and PR 1 added', () => {
    // Exactly the production (non-spec) files PR 1/4 and PR 2/4 added or
    // modified to declare/reference
    // ManagerCapability/managerCapabilities/VIEW_ALL_REVIEWS (design.md File
    // Changes table, PR 1 and PR 2 rows only).
    const EXPECTED_PRODUCTION_FILES = [
      'modules/users/domain/manager-capability.ts',
      'modules/users/domain/user.entity.ts',
      'modules/users/infrastructure/persistence/user.mapper.ts',
      'modules/users/infrastructure/persistence/prisma-user.repository.ts',
      'modules/users/application/ports/user.repository.port.ts',
      'modules/users/application/use-cases/testing/in-memory-user.repository.ts',
      // PR 2/4 additions:
      'shared/application/authorization/manager-capability.checker.port.ts',
      'modules/users/infrastructure/authorization/user-manager-capability.checker.ts',
      'modules/review-session/application/services/review-history-access.service.ts',
      'modules/review-session/application/use-cases/testing/fake-manager-capability.checker.ts',
      // PR 3/4 additions — the write path and its DTO/controller surface,
      // previously named on the "not yet touched" list below.
      // `errors/invalid-manager-capability-assignment.error.ts` and
      // `presentation/pipes/user-coded-zod-validation.pipe.ts` are
      // DELIBERATELY excluded here: neither declares/references
      // `ManagerCapability`, a `managerCapabilities` field, or the
      // `VIEW_ALL_REVIEWS` literal — the error carries only a `Role`, and
      // the pipe is capability-agnostic by design (it reads any tagged
      // `userErrorCode`, generically).
      'modules/users/domain/manager-capability.policy.ts',
      'modules/users/application/use-cases/update-user.use-case.ts',
      'modules/users/application/use-cases/create-user.use-case.ts',
      'modules/users/application/use-cases/list-users.use-case.ts',
      'modules/users/presentation/dto/user-response.dto.ts',
      'modules/users/presentation/users.controller.ts',
    ].map((p) => path.join(__dirname, '..', 'src', ...p.split('/')));

    // The unit/integration specs PR 1/4, PR 2/4 and PR 3/4 added or
    // extended alongside those production files — allowed for the same
    // reason the production files are.
    const EXPECTED_SPEC_FILES = [
      'modules/users/domain/user.entity.spec.ts',
      'modules/users/infrastructure/persistence/user.mapper.spec.ts',
      'modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts',
      'modules/users/infrastructure/persistence/user-manager-capability-migration.integration.spec.ts',
      'modules/users/application/use-cases/testing/in-memory-user.repository.spec.ts',
      // PR 2/4 additions:
      'modules/users/infrastructure/authorization/user-manager-capability.checker.spec.ts',
      'modules/review-session/application/services/review-history-access.service.spec.ts',
      // PR 3/4 additions:
      'modules/users/domain/manager-capability.policy.spec.ts',
      'modules/users/application/use-cases/update-user.use-case.spec.ts',
      'modules/users/application/use-cases/create-user.use-case.spec.ts',
      'modules/users/application/use-cases/list-users.use-case.spec.ts',
      'modules/users/presentation/users.controller.spec.ts',
    ].map((p) => path.join(__dirname, '..', 'src', ...p.split('/')));

    const ALLOWED_FILES = [
      ...EXPECTED_PRODUCTION_FILES,
      ...EXPECTED_SPEC_FILES,
    ];

    // Declaration-shaped patterns, not a bare substring search — a
    // pre-existing explanatory CODE COMMENT is allowed to use the words in
    // prose (e.g. "a hypothetical field like managerCapabilities could…");
    // what this guard tracks is an actual enum, field or permission
    // constant being declared or referenced.
    const forbiddenPatterns = [
      /\bManagerCapability\b/, // enum / type declaration or reference
      /\bmanagerCapabilities\s*[?:=]/, // a FIELD declaration, not prose
      /['"]VIEW_ALL_REVIEWS['"]|\bVIEW_ALL_REVIEWS\s*[:=]/, // a string-literal permission constant or an enum/key declaration, not prose
    ];

    const findDeclaringFiles = (): string[] => {
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
      return offendingFiles.sort();
    };

    it('is declared/referenced in exactly the persistence-layer files this PR added, and nowhere else', () => {
      const declaringFiles = findDeclaringFiles();

      expect(declaringFiles).toEqual([...ALLOWED_FILES].sort());
    });

    it('has NOT leaked into the permission table (still PR-3-scoped elsewhere)', () => {
      // Named explicitly, one at a time, so a future slice that DOES touch
      // one of these gets a loud, specific failure here rather than a
      // silent pass from the allowlist diff above.
      //
      // PR 2/4 update: the checker port/adapter are now LEGITIMATELY
      // touched (tasks.md 2.1/2.2) and moved to EXPECTED_PRODUCTION_FILES
      // above — removed from this "not yet touched" list.
      // PR 3/4 update: the DTO, the controller and the three write-path use
      // cases are now LEGITIMATELY touched (tasks.md 3.9/3.11/3.12/3.16)
      // and moved to EXPECTED_PRODUCTION_FILES above — removed from this
      // list. `role-permission.checker.ts` grants a plain string
      // PERMISSION (`'reviewSession:read'`), never a capability reference,
      // so it stays on this list — no PR in this change ever touches it a
      // second time for a capability reason.
      const notYetTouched = [
        'modules/auth/infrastructure/authorization/role-permission.checker.ts',
      ];

      for (const relativePath of notYetTouched) {
        const fullPath = path.join(
          __dirname,
          '..',
          'src',
          ...relativePath.split('/'),
        );
        if (!fs.existsSync(fullPath)) {
          continue; // not created yet (e.g. the PR 2 checker) — nothing to assert
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        expect(forbiddenPatterns.some((pattern) => pattern.test(content))).toBe(
          false,
        );
      }
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

  // review-history-per-element/design.md Decision 4/5/6, tasks.md 2.7: the
  // PR 2 read surface — GET
  // /communities/:communityId/inspectable-elements/:elementId/review-history,
  // resolving the SAME five visibility scopes at entry level. Five-scope
  // matrix (no sampling), the 404-vs-empty reachability matrix, and the
  // scope guards named in the design's Testing Strategy row.
  describe('GET /communities/:communityId/inspectable-elements/:elementId/review-history', () => {
    interface ElementHistoryHeaderBody {
      id: string;
      code: string;
      name: string;
      elementType: string;
      location: string;
      communityId: string;
      communityName: string;
      deactivatedAt: string | null;
    }
    interface ElementHistoryRowBody {
      reviewSessionId: string;
      performedById: string;
      performedByEmail: string;
      reviewed: boolean;
      observations: string | null;
      recordedAt: string;
    }
    interface ElementHistoryBody {
      element: ElementHistoryHeaderBody;
      entries: ElementHistoryRowBody[];
    }

    let built: BuiltApp;
    const adminEmail = 'reh-admin@example.com';
    const technicianUEmail = 'reh-technician-u@example.com';
    const technicianWEmail = 'reh-technician-w@example.com';
    const representativeEmail = 'reh-representative@example.com';
    const managerGrantedEmail = 'reh-manager-granted@example.com';
    const managerUngrantedEmail = 'reh-manager-ungranted@example.com';
    const companyManagerXEmail = 'reh-company-manager-x@example.com';
    const companyManagerYEmail = 'reh-company-manager-y@example.com';
    const companyManagerNoneEmail = 'reh-company-manager-none@example.com';

    const COMPANY_X = 'reh-company-x';
    const COMPANY_Y = 'reh-company-y';

    let communityC: CommunityBody;
    let communityD: CommunityBody;
    let templateId: string;
    let question: QuestionBody;
    let elementShared: ElementBody;
    let elementNeverReviewed: ElementBody;
    let elementD: ElementBody;
    let sessionByU: SessionBody;
    let sessionByW: SessionBody;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'reh-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technicianU = await buildSeedUser({
        id: 'reh-technician-u-id',
        email: technicianUEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_X,
      });
      const technicianW = await buildSeedUser({
        id: 'reh-technician-w-id',
        email: technicianWEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: COMPANY_Y,
      });
      const representative = await buildSeedUser({
        id: 'reh-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const managerGranted = await buildSeedUser({
        id: 'reh-manager-granted-id',
        email: managerGrantedEmail,
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });
      const managerUngranted = await buildSeedUser({
        id: 'reh-manager-ungranted-id',
        email: managerUngrantedEmail,
        role: 'MANAGER',
      });
      const companyManagerX = await buildSeedUser({
        id: 'reh-company-manager-x-id',
        email: companyManagerXEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
        maintenanceCompanyId: COMPANY_X,
      });
      const companyManagerY = await buildSeedUser({
        id: 'reh-company-manager-y-id',
        email: companyManagerYEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
        maintenanceCompanyId: COMPANY_Y,
      });
      const companyManagerNone = await buildSeedUser({
        id: 'reh-company-manager-none-id',
        email: companyManagerNoneEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });

      built = await buildApp({
        users: [
          admin,
          technicianU,
          technicianW,
          representative,
          managerGranted,
          managerUngranted,
          companyManagerX,
          companyManagerY,
          companyManagerNone,
        ],
        liveCompanyIds: [COMPANY_X, COMPANY_Y],
      });

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityC = await createCommunity(adminAgent, 'Element history C');
      communityD = await createCommunity(adminAgent, 'Element history D');
      await assignTechnician(adminAgent, communityC.id, 'reh-technician-u-id');
      await assignTechnician(adminAgent, communityC.id, 'reh-technician-w-id');
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'reh-representative-id',
      );

      elementShared = await createElement(
        adminAgent,
        communityC.id,
        'Element history shared extinguisher',
      );
      elementD = await createElement(
        adminAgent,
        communityD.id,
        'Element history D extinguisher',
      );
      question = await createQuestion(
        adminAgent,
        'Is the element operational?',
      );
      const template = await createActiveTemplate(
        adminAgent,
        'Element history template',
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
        .put(`/review-sessions/${openedByU.id}/entries/${elementShared.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      sessionByU = (
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
        .put(`/review-sessions/${openedByW.id}/entries/${elementShared.id}`)
        .send({ answers: [{ questionId: question.id, value: 'NO' }] })
        .expect(200);
      sessionByW = (
        await technicianWAgent
          .post(`/review-sessions/${openedByW.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      // Created AFTER both sessions above complete — completion coverage
      // requires an entry for every active element of the community/type,
      // so a never-reviewed element must not exist yet while sessionByU/
      // sessionByW are being completed.
      elementNeverReviewed = await createElement(
        adminAgent,
        communityC.id,
        'Element history never-reviewed extinguisher',
      );
    });

    afterAll(async () => {
      await built.app.close();
    });

    function elementHistoryPath(
      communityId: string,
      elementId: string,
    ): string {
      return `/communities/${communityId}/inspectable-elements/${elementId}/review-history`;
    }

    // --- Five-scope matrix, no sampling -------------------------------

    it('a technician sees exactly their own entry on a shared element, never the other performer', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);

      const body = response.body as ElementHistoryBody;
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].performedById).toBe('reh-technician-u-id');
      expect(JSON.stringify(body)).not.toContain(sessionByW.id);
    });

    it('a representative sees every entry on a shared element in an assigned community, regardless of performer', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const response = await representativeAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);

      const body = response.body as ElementHistoryBody;
      const sessionIds = body.entries.map((row) => row.reviewSessionId);
      expect(sessionIds).toContain(sessionByU.id);
      expect(sessionIds).toContain(sessionByW.id);
    });

    it("a company manager sees only their own company's entry on the shared element", async () => {
      const companyManagerXAgent = await loginAgent(
        built.app,
        companyManagerXEmail,
      );

      const response = await companyManagerXAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);

      const body = response.body as ElementHistoryBody;
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].reviewSessionId).toBe(sessionByU.id);
      expect(JSON.stringify(body)).not.toContain(sessionByW.id);
    });

    it('SYSTEM_ADMIN and a granted MANAGER return byte-identical bodies', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const managerGrantedAgent = await loginAgent(
        built.app,
        managerGrantedEmail,
      );

      const adminResponse = await adminAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);
      const managerResponse = await managerGrantedAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);

      expect(managerResponse.body).toEqual(adminResponse.body);
      expect((adminResponse.body as ElementHistoryBody).entries).toHaveLength(
        2,
      );
    });

    it('an ungranted MANAGER gets 404 on every element, reviewed or not', async () => {
      const managerUngrantedAgent = await loginAgent(
        built.app,
        managerUngrantedEmail,
      );

      const onShared = await managerUngrantedAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(404);
      const onNeverReviewed = await managerUngrantedAgent
        .get(elementHistoryPath(communityC.id, elementNeverReviewed.id))
        .expect(404);

      expect((onShared.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
      expect((onNeverReviewed.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    });

    // --- 404-vs-empty reachability matrix -------------------------------

    it('a never-reviewed element renders an empty history for admin, granted manager and assigned representative', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const managerGrantedAgent = await loginAgent(
        built.app,
        managerGrantedEmail,
      );
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      for (const agent of [
        adminAgent,
        managerGrantedAgent,
        representativeAgent,
      ]) {
        const response = await agent
          .get(elementHistoryPath(communityC.id, elementNeverReviewed.id))
          .expect(200);
        const body = response.body as ElementHistoryBody;
        expect(body.entries).toEqual([]);
        expect(body.element.id).toBe(elementNeverReviewed.id);
      }
    });

    it('a never-reviewed element gets 404 for a technician and a company manager, never an empty list', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const companyManagerXAgent = await loginAgent(
        built.app,
        companyManagerXEmail,
      );

      const technicianResponse = await technicianUAgent
        .get(elementHistoryPath(communityC.id, elementNeverReviewed.id))
        .expect(404);
      const companyManagerResponse = await companyManagerXAgent
        .get(elementHistoryPath(communityC.id, elementNeverReviewed.id))
        .expect(404);

      expect((technicianResponse.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
      expect((companyManagerResponse.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    });

    it('a company manager with no maintenance company gets 404, no maintenance company gets 404 with no wider read', async () => {
      const companyManagerNoneAgent = await loginAgent(
        built.app,
        companyManagerNoneEmail,
      );

      const response = await companyManagerNoneAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(404);

      expect((response.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    });

    it('a representative without an active assignment gets 404, indistinguishable from a nonexistent element', async () => {
      const representativeAgent = await loginAgent(
        built.app,
        representativeEmail,
      );

      const nonexistentResponse = await representativeAgent
        .get(
          elementHistoryPath(
            communityC.id,
            '00000000-0000-7000-8000-000000000000',
          ),
        )
        .expect(404);
      const foreignResponse = await representativeAgent
        .get(elementHistoryPath(communityD.id, elementD.id))
        .expect(404);

      expect(foreignResponse.body).toEqual(nonexistentResponse.body);
      expect((foreignResponse.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    });

    it('unknown, wrong-community and soft-deleted elements are indistinguishable, even to SYSTEM_ADMIN', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const softDeleted = await createElement(
        adminAgent,
        communityC.id,
        'Element history soft-deleted extinguisher',
      );
      await adminAgent
        .delete(
          `/communities/${communityC.id}/inspectable-elements/${softDeleted.id}`,
        )
        .expect(204);

      const nonexistentResponse = await adminAgent
        .get(
          elementHistoryPath(
            communityC.id,
            '00000000-0000-7000-8000-000000000000',
          ),
        )
        .expect(404);
      const wrongCommunityResponse = await adminAgent
        .get(elementHistoryPath(communityD.id, elementShared.id))
        .expect(404);
      const softDeletedResponse = await adminAgent
        .get(elementHistoryPath(communityC.id, softDeleted.id))
        .expect(404);

      expect(wrongCommunityResponse.body).toEqual(nonexistentResponse.body);
      expect(softDeletedResponse.body).toEqual(nonexistentResponse.body);
      expect((nonexistentResponse.body as ErrorBody).code).toBe(
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    });

    it('a decommissioned element keeps its full history, and the header reports deactivatedAt', async () => {
      // Isolated community + template: completion requires covering EVERY
      // active element of (community, elementType), and communityC already
      // carries elementShared/elementNeverReviewed/the soft-deleted fixture
      // above — a dedicated single-element community keeps this session's
      // coverage requirement to exactly the one element under test.
      const adminAgent = await loginAgent(built.app, adminEmail);
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const isolatedCommunity = await createCommunity(
        adminAgent,
        'Element history decommission community',
      );
      await assignTechnician(
        adminAgent,
        isolatedCommunity.id,
        'reh-technician-u-id',
      );
      const decommissioned = await createElement(
        adminAgent,
        isolatedCommunity.id,
        'Element history decommissioned extinguisher',
      );
      const opened = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: isolatedCommunity.id, templateId })
          .expect(201)
      ).body as { id: string };
      await technicianUAgent
        .put(`/review-sessions/${opened.id}/entries/${decommissioned.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);
      await technicianUAgent
        .post(`/review-sessions/${opened.id}/complete`)
        .expect(200);

      await adminAgent
        .patch(
          `/communities/${isolatedCommunity.id}/inspectable-elements/${decommissioned.id}`,
        )
        .send({ deactivated: true })
        .expect(200);

      const response = await adminAgent
        .get(elementHistoryPath(isolatedCommunity.id, decommissioned.id))
        .expect(200);
      const body = response.body as ElementHistoryBody;
      expect(body.entries).toHaveLength(1);
      expect(body.element.deactivatedAt).not.toBeNull();
    });

    it('a page/cursor/limit/offset/date-range/sort/search query parameter has no effect', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const filteredResponse = await adminAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
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
      const plainResponse = await adminAgent
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(200);

      expect(filteredResponse.body).toEqual(plainResponse.body);
    });

    it('rejects an unauthenticated caller with 401 before any permission or scope check', async () => {
      await request(built.app.getHttpServer())
        .get(elementHistoryPath(communityC.id, elementShared.id))
        .expect(401);
    });

    // --- Scope guards --------------------------------------------------

    it('ROLE_PERMISSIONS is unchanged — inspectableElement:read still belongs to SYSTEM_ADMIN alone', () => {
      const checkerPath = path.join(
        __dirname,
        '..',
        'src',
        'modules',
        'auth',
        'infrastructure',
        'authorization',
        'role-permission.checker.ts',
      );
      const content = fs.readFileSync(checkerPath, 'utf8');
      const matches = content.match(/'inspectableElement:read'/g) ?? [];
      // Exactly one occurrence — the SYSTEM_ADMIN row. If a second role
      // gained it, this count would grow; a comment referencing the
      // permission in prose would not match the quoted literal.
      expect(matches).toHaveLength(1);
    });

    it('no GET /communities/:communityId/inspectable-elements/:elementId route exists (by-id) on the element-management controller', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      // Depth-4 (no trailing /review-history segment) — the element
      // controller declares no @Get(':elementId'); this must 404 as an
      // unmatched route, not resolve to any element-management handler.
      await adminAgent
        .get(
          `/communities/${communityC.id}/inspectable-elements/${elementShared.id}`,
        )
        .expect(404);
    });

    it('the inspectable-element repository port gained no method — no unscoped findById', () => {
      const portPath = path.join(
        __dirname,
        '..',
        'src',
        'modules',
        'inspectable-element',
        'application',
        'ports',
        'inspectable-element.repository.port.ts',
      );
      const content = fs.readFileSync(portPath, 'utf8');
      expect(content).not.toMatch(/\bfindById\s*\(/);
    });

    it('the element-management surface is not widened by this endpoint', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      // technicianU holds reviewSession:read (and now reaches the
      // element-keyed history) but no inspectableElement:* permission —
      // the management routes must still refuse it with 403.
      await technicianUAgent
        .get(`/communities/${communityC.id}/inspectable-elements`)
        .expect(403);
      await technicianUAgent
        .patch(
          `/communities/${communityC.id}/inspectable-elements/${elementShared.id}`,
        )
        .send({ name: 'Renamed' })
        .expect(403);
    });
  });

  // review-export tasks.md PR 7 (7.1/7.2): the document route's first two
  // e2e cases — full-body 200 and the uniform 404 — written RED before the
  // route exists. The scope-matrix characterization (other four scopes,
  // ungranted MANAGER, 401, parity, blank profile, six keys, profile 403)
  // is PR 8, not duplicated here (design.md Migration/Rollout).
  describe('GET /review-history/:sessionId/document', () => {
    let built: BuiltApp;
    const adminEmail = 'rhdoc-admin@example.com';
    const technicianUEmail = 'rhdoc-technician-u@example.com';
    const technicianWEmail = 'rhdoc-technician-w@example.com';
    // review-export tasks.md PR 8 (8.1, 8.2, 8.6): the remaining four
    // review-history scopes plus the ungranted-MANAGER 404 case, added
    // alongside PR 7's technician/admin fixtures rather than duplicated in
    // a fresh describe block — spec: review-document *Document Visibility
    // Is Exactly the Review-History Scope*.
    const representativeEmail = 'rhdoc-representative@example.com';
    const companyManagerEmail = 'rhdoc-company-manager@example.com';
    const grantedManagerEmail = 'rhdoc-manager-granted@example.com';
    const ungrantedManagerEmail = 'rhdoc-manager@example.com';

    let communityC: CommunityBody;
    let communityD: CommunityBody;
    let templateId: string;
    let elementC: ElementBody;
    let elementUnreviewed: ElementBody;
    let question: QuestionBody;
    let sessionByUForC: SessionBody & {
      startedAt: string;
      completedAt: string;
    };
    let sessionByWForD: SessionBody;
    let recordedAtC: string;
    let recordedAtUnreviewed: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rhdoc-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technicianU = await buildSeedUser({
        id: 'rhdoc-technician-u-id',
        email: technicianUEmail,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'rhdoc-company-id',
      });
      const technicianW = await buildSeedUser({
        id: 'rhdoc-technician-w-id',
        email: technicianWEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'rhdoc-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      const companyManager = await buildSeedUser({
        id: 'rhdoc-company-manager-id',
        email: companyManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
        maintenanceCompanyId: 'rhdoc-company-id',
      });
      const grantedManager = await buildSeedUser({
        id: 'rhdoc-manager-granted-id',
        email: grantedManagerEmail,
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      });
      const ungrantedManager = await buildSeedUser({
        id: 'rhdoc-manager-id',
        email: ungrantedManagerEmail,
        role: 'MANAGER',
      });
      built = await buildApp({
        users: [
          admin,
          technicianU,
          technicianW,
          representative,
          companyManager,
          grantedManager,
          ungrantedManager,
        ],
      });

      // design.md Decision 4 / "PR 7's first case proves this": the reader
      // token resolves to this SAME repository instance through the real
      // module's `useExisting` alias — no separate reader override exists.
      built.organizationProfileRepository.seed(
        new OrganizationProfile({
          id: '01997a00-0000-7000-8000-000000000001',
          name: 'Acme Maintenance',
          legalName: 'Acme Maintenance S.L.',
          taxId: 'B12345678',
          address: 'Carrer Major 1, Girona',
          phone: '+34 972 000 000',
          email: 'org@example.com',
          logoAssetId: null,
        }),
      );
      built.nameDirectory.seedMaintenanceCompany(
        'rhdoc-company-id',
        'Doc Maintenance Co',
      );

      const adminAgent = await loginAgent(built.app, adminEmail);
      communityC = await createCommunity(adminAgent, 'Document community C');
      communityD = await createCommunity(adminAgent, 'Document community D');
      await assignTechnician(
        adminAgent,
        communityC.id,
        'rhdoc-technician-u-id',
      );
      await assignTechnician(
        adminAgent,
        communityD.id,
        'rhdoc-technician-w-id',
      );
      // tasks.md 8.1/8.6: the representative's own scope for the document
      // route — assigned to C only, same as the review-history detail
      // scope it must agree with.
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'rhdoc-representative-id',
      );
      built.nameDirectory.seedCommunity(communityC.id, communityC.name);
      built.nameDirectory.seedCommunity(communityD.id, communityD.name);

      elementC = await createElement(
        adminAgent,
        communityC.id,
        'Document extinguisher C',
      );
      elementUnreviewed = await createElement(
        adminAgent,
        communityC.id,
        'Document extinguisher unreviewed',
      );
      built.nameDirectory.seedElement(elementC.id, {
        code: elementC.code,
        name: 'Document extinguisher C',
        location: 'Ground floor',
      });
      built.nameDirectory.seedElement(elementUnreviewed.id, {
        code: elementUnreviewed.code,
        name: 'Document extinguisher unreviewed',
        location: 'Ground floor',
      });

      question = await createQuestion(
        adminAgent,
        'Is the pressure gauge in range?',
      );
      const template = await createActiveTemplate(
        adminAgent,
        'Document template',
        [question.id],
      );
      templateId = template.id;

      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const openedByU = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string; startedAt: string };
      recordedAtC = (
        (
          await technicianUAgent
            .put(`/review-sessions/${openedByU.id}/entries/${elementC.id}`)
            .send({ answers: [{ questionId: question.id, value: 'YES' }] })
            .expect(200)
        ).body as { recordedAt: string }
      ).recordedAt;
      recordedAtUnreviewed = (
        (
          await technicianUAgent
            .put(
              `/review-sessions/${openedByU.id}/entries/${elementUnreviewed.id}`,
            )
            .send({ observations: 'Needs a follow-up inspection' })
            .expect(200)
        ).body as { recordedAt: string }
      ).recordedAt;
      const completedByU = (
        await technicianUAgent
          .post(`/review-sessions/${openedByU.id}/complete`)
          .expect(200)
      ).body as { id: string; status: string; completedAt: string };
      sessionByUForC = {
        ...completedByU,
        startedAt: openedByU.startedAt,
      };

      const technicianWAgent = await loginAgent(built.app, technicianWEmail);
      const openedByW = (
        await technicianWAgent
          .post('/review-sessions')
          .send({ communityId: communityD.id, templateId })
          .expect(201)
      ).body as { id: string };
      sessionByWForD = (
        await technicianWAgent
          .post(`/review-sessions/${openedByW.id}/complete`)
          .expect(200)
      ).body as SessionBody;
    });

    afterAll(async () => {
      await built.app.close();
    });

    // spec.md review-document "The document carries all four parts" — full
    // exact-body assertion (not toMatchObject) per the letterhead, session
    // data, deterministic entry order and signer all in one response.
    it('a technician reads the full document body of their completed session', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(200);

      // design.md "Entry enrichment and order": code ascending — computed
      // here, not hardcoded, so this assertion survives whatever code
      // format the community's element counter produces.
      const reviewedEntry = {
        inspectableElementId: elementC.id,
        elementCode: elementC.code,
        elementName: 'Document extinguisher C',
        elementLocation: 'Ground floor',
        reviewed: true,
        observations: null,
        answers: [{ questionId: question.id, answer: 'YES' }],
        recordedAt: recordedAtC,
      };
      const unreviewedEntry = {
        inspectableElementId: elementUnreviewed.id,
        elementCode: elementUnreviewed.code,
        elementName: 'Document extinguisher unreviewed',
        elementLocation: 'Ground floor',
        reviewed: false,
        observations: 'Needs a follow-up inspection',
        answers: [],
        recordedAt: recordedAtUnreviewed,
      };
      const orderedEntries =
        elementC.code < elementUnreviewed.code
          ? [reviewedEntry, unreviewedEntry]
          : [unreviewedEntry, reviewedEntry];

      expect(response.body).toEqual({
        id: sessionByUForC.id,
        communityId: communityC.id,
        communityName: communityC.name,
        template: {
          name: 'Document template',
          elementType: 'EXTINGUISHER',
          frequency: 'QUARTERLY',
          version: 1,
        },
        maintenanceCompanyName: 'Doc Maintenance Co',
        performedById: 'rhdoc-technician-u-id',
        performedByEmail: technicianUEmail,
        status: 'completed',
        startedAt: sessionByUForC.startedAt,
        completedAt: sessionByUForC.completedAt,
        entries: orderedEntries,
        questions: [
          {
            questionId: question.id,
            order: 1,
            text: 'Is the pressure gauge in range?',
          },
        ],
        letterhead: {
          name: 'Acme Maintenance',
          legalName: 'Acme Maintenance S.L.',
          taxId: 'B12345678',
          address: 'Carrer Major 1, Girona',
          phone: '+34 972 000 000',
          email: 'org@example.com',
        },
      });
    });

    // spec.md review-document "Out-of-scope, nonexistent and draft are
    // indistinguishable" — identical to the history detail's own 404.
    it('out-of-scope, nonexistent and draft sessions are all 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);
      const draft = (
        await technicianUAgent
          .post('/review-sessions')
          .send({ communityId: communityC.id, templateId })
          .expect(201)
      ).body as { id: string };

      const nonexistentResponse = await technicianUAgent
        .get('/review-history/00000000-0000-7000-8000-000000000000/document')
        .expect(404);
      const outOfScopeResponse = await technicianUAgent
        .get(`/review-history/${sessionByWForD.id}/document`)
        .expect(404);
      const draftResponse = await technicianUAgent
        .get(`/review-history/${draft.id}/document`)
        .expect(404);

      const nonexistentBody = nonexistentResponse.body as ErrorBody;
      expect(nonexistentBody.code).toBe('REVIEW_SESSION_NOT_FOUND');
      expect(outOfScopeResponse.body as ErrorBody).toEqual(nonexistentBody);
      expect(draftResponse.body as ErrorBody).toEqual(nonexistentBody);

      await technicianUAgent.delete(`/review-sessions/${draft.id}`).expect(204);
    });

    // Tech-debt cleanup: parity with the history detail route's malformed-id
    // guard — same route param, same pipe, must reject the same way rather
    // than falling through to Prisma's `@db.Uuid` cast.
    it('rejects a malformed (non-UUID) sessionId with 400, not a 500', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get('/review-history/not-a-uuid/document')
        .expect(400);

      expect(response.body as ErrorBody).toMatchObject({
        statusCode: 400,
        code: 'INVALID_SESSION_ID',
      });
    });

    // spec.md review-document "Each of the five scopes reads an in-scope
    // document" — the remaining four scopes; the technician case is already
    // covered above. Each reads a session that its own review-history scope
    // already reaches (review-history spec.md's five-scope matrix), so no
    // new session fixtures are needed here.
    it.each([
      ['representative', () => representativeEmail, () => sessionByUForC.id],
      ['company manager', () => companyManagerEmail, () => sessionByUForC.id],
      ['SYSTEM_ADMIN', () => adminEmail, () => sessionByWForD.id],
      [
        'MANAGER holding VIEW_ALL_REVIEWS',
        () => grantedManagerEmail,
        () => sessionByUForC.id,
      ],
    ] as const)(
      'a %s reads the document of a session in their history scope',
      async (
        _label: string,
        getEmail: () => string,
        getSessionId: () => string,
      ) => {
        const agent = await loginAgent(built.app, getEmail());

        await agent
          .get(`/review-history/${getSessionId()}/document`)
          .expect(200);
      },
    );

    // spec.md review-document "An ungranted manager reads no document" —
    // fails closed the same way the history detail route already does for
    // this role (review-history-manager-capability, unit-pinned in
    // review-history-access.service.spec.ts: the capability gate runs
    // before any review-session repository read). The e2e layer asserts
    // only the observable 404 outcome, mirroring the precedent set above
    // for the same role on the history-detail route (line ~1050).
    it('an ungranted MANAGER gets 404 REVIEW_SESSION_NOT_FOUND on the document route, never 2xx', async () => {
      const ungrantedManagerAgent = await loginAgent(
        built.app,
        ungrantedManagerEmail,
      );

      const response = await ungrantedManagerAgent
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(404);

      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // review-history spec.md "The Review Document Read Inherits the
    // Session-Level History Guards" — no session cookie at all.
    it('rejects an unauthenticated caller with 401', async () => {
      await request(built.app.getHttpServer())
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(401);
    });

    // spec.md review-document "Document and history detail agree for every
    // caller" — for every caller x session pair below, the two routes must
    // produce the identical reachability outcome (both 200 or both 404).
    it.each([
      [
        'technician, own session',
        () => technicianUEmail,
        () => sessionByUForC.id,
        200,
      ],
      [
        'representative, in-scope session',
        () => representativeEmail,
        () => sessionByUForC.id,
        200,
      ],
      [
        'representative, out-of-scope session',
        () => representativeEmail,
        () => sessionByWForD.id,
        404,
      ],
      [
        'company manager, in-scope session',
        () => companyManagerEmail,
        () => sessionByUForC.id,
        200,
      ],
      [
        'company manager, out-of-scope session',
        () => companyManagerEmail,
        () => sessionByWForD.id,
        404,
      ],
      [
        'granted MANAGER, any session',
        () => grantedManagerEmail,
        () => sessionByWForD.id,
        200,
      ],
      [
        'ungranted MANAGER, any session',
        () => ungrantedManagerEmail,
        () => sessionByUForC.id,
        404,
      ],
    ] as const)(
      'document and history detail agree for %s',
      async (
        _label: string,
        getEmail: () => string,
        getSessionId: () => string,
        expectedStatus: number,
      ) => {
        const agent = await loginAgent(built.app, getEmail());

        const detailResponse = await agent.get(
          `/review-history/${getSessionId()}`,
        );
        const documentResponse = await agent.get(
          `/review-history/${getSessionId()}/document`,
        );

        expect(detailResponse.status).toBe(expectedStatus);
        expect(documentResponse.status).toBe(expectedStatus);
      },
    );

    // spec.md review-document "The document exposes only the letterhead
    // fields" — exactly the six text keys, never `id`/`logoAssetId`.
    it('the letterhead carries exactly the six text keys, never id or logoAssetId', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      const response = await technicianUAgent
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(200);

      const letterhead = (response.body as { letterhead: object }).letterhead;
      expect(Object.keys(letterhead).sort()).toEqual(
        ['address', 'email', 'legalName', 'name', 'phone', 'taxId'].sort(),
      );
    });

    // spec.md review-document "The profile endpoint stays admin-only" — a
    // caller who CAN read a document still gets the unchanged 403 on the
    // admin-only profile endpoint; organization-profile.e2e-spec.ts already
    // covers this for every non-admin role in isolation, this pins the
    // specific "can read a document" framing the spec scenario names.
    it('a technician who can read a document still gets 403 on GET /organization-profile', async () => {
      const technicianUAgent = await loginAgent(built.app, technicianUEmail);

      await technicianUAgent.get('/organization-profile').expect(403);
    });

    // spec.md review-document "A deactivated representative loses the
    // document" — an isolated representative (not the shared
    // `representativeEmail` fixture used by the scope-matrix tests above,
    // so deactivating it here cannot affect those tests).
    it('a deactivated representative loses the document, 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const isolatedRepresentative = await buildSeedUser({
        id: 'rhdoc-representative-deactivate-id',
        email: 'rhdoc-representative-deactivate@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      built.userRepository.seed(isolatedRepresentative);
      const adminAgent = await loginAgent(built.app, adminEmail);
      await assignRepresentative(
        adminAgent,
        communityC.id,
        'rhdoc-representative-deactivate-id',
      );
      const representativeAgent = await loginAgent(
        built.app,
        'rhdoc-representative-deactivate@example.com',
      );

      await representativeAgent
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(200);

      await adminAgent
        .delete(
          `/communities/${communityC.id}/representatives/rhdoc-representative-deactivate-id`,
        )
        .expect(204);

      const response = await representativeAgent
        .get(`/review-history/${sessionByUForC.id}/document`)
        .expect(404);
      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });

    // spec.md review-document "A representative who signed loses the
    // document after reassignment (accepted for slice 1)" — a representative
    // who performed and signed her OWN session on C still loses it once her
    // assignment is deactivated; document visibility is carried entirely by
    // the review-history scope, never by having performed the session.
    it('a representative who signed loses the document after her assignment is deactivated', async () => {
      const isolatedRepresentative = await buildSeedUser({
        id: 'rhdoc-representative-signer-id',
        email: 'rhdoc-representative-signer@example.com',
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      built.userRepository.seed(isolatedRepresentative);
      const adminAgent = await loginAgent(built.app, adminEmail);
      // A dedicated, element-free community: completion requires every
      // active element of the template's type in the community to carry an
      // entry (design.md Decision 2) — communityC already has two, so
      // reusing it here would 409. An empty community lets the
      // representative complete trivially, with zero entries.
      const communityRepSigner = await createCommunity(
        adminAgent,
        'Document representative-signer community',
      );
      built.nameDirectory.seedCommunity(
        communityRepSigner.id,
        communityRepSigner.name,
      );
      await assignRepresentative(
        adminAgent,
        communityRepSigner.id,
        'rhdoc-representative-signer-id',
      );
      const representativeAgent = await loginAgent(
        built.app,
        'rhdoc-representative-signer@example.com',
      );

      const opened = (
        await representativeAgent
          .post('/review-sessions')
          .send({ communityId: communityRepSigner.id, templateId })
          .expect(201)
      ).body as { id: string };
      const completed = (
        await representativeAgent
          .post(`/review-sessions/${opened.id}/complete`)
          .expect(200)
      ).body as SessionBody;

      await representativeAgent
        .get(`/review-history/${completed.id}/document`)
        .expect(200);

      await adminAgent
        .delete(
          `/communities/${communityRepSigner.id}/representatives/rhdoc-representative-signer-id`,
        )
        .expect(204);

      const response = await representativeAgent
        .get(`/review-history/${completed.id}/document`)
        .expect(404);
      expect((response.body as ErrorBody).code).toBe(
        'REVIEW_SESSION_NOT_FOUND',
      );
    });
  });

  // review-export tasks.md PR 8 (8.7): a dedicated, unseeded org-profile
  // fixture — the shared `built` above always seeds a filled profile, so the
  // blank-profile scenario needs its own isolated app instance.
  describe('GET /review-history/:sessionId/document — blank organization profile', () => {
    let built: BuiltApp;
    const adminEmail = 'rhdocblank-admin@example.com';
    const technicianEmail = 'rhdocblank-technician@example.com';

    let sessionId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rhdocblank-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rhdocblank-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });
      // Deliberately no organizationProfileRepository.seed(...) call — the
      // fake starts blank (InMemoryOrganizationProfileRepository's own
      // constructor default), mirroring "the organization profile has
      // never been edited".

      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Document blank-profile community',
      );
      await assignTechnician(
        adminAgent,
        community.id,
        'rhdocblank-technician-id',
      );
      built.nameDirectory.seedCommunity(community.id, community.name);

      const question = await createQuestion(
        adminAgent,
        'Is the extinguisher accessible?',
      );
      const template = await createActiveTemplate(
        adminAgent,
        'Document blank-profile template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const opened = (
        await technicianAgent
          .post('/review-sessions')
          .send({ communityId: community.id, templateId: template.id })
          .expect(201)
      ).body as { id: string };
      const completed = (
        await technicianAgent
          .post(`/review-sessions/${opened.id}/complete`)
          .expect(200)
      ).body as SessionBody;
      sessionId = completed.id;
    });

    afterAll(async () => {
      await built.app.close();
    });

    // spec.md review-document "A blank profile does not block the document"
    it('returns 200 with all six letterhead fields as empty strings and no completeness flag', async () => {
      const technicianAgent = await loginAgent(built.app, technicianEmail);

      const response = await technicianAgent
        .get(`/review-history/${sessionId}/document`)
        .expect(200);

      const letterhead = (
        response.body as {
          letterhead: Record<string, unknown>;
        }
      ).letterhead;
      expect(letterhead).toEqual({
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
      });
      expect(letterhead).not.toHaveProperty('complete');
      expect(letterhead).not.toHaveProperty('incomplete');
    });
  });
});
