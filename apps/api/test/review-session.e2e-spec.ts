import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

  // review-history-company-scope/design.md Decision 5/8: this e2e double
  // doesn't need the port's soft-delete-INCLUSIVE guarantee — this suite
  // doesn't exercise review-history routes — so `findById` (active users
  // only) is sufficient here. Kept in sync with review-history.e2e-spec.ts's
  // identical double so this class never silently drifts out of `UserDirectory`
  // conformance again (isolatedModules doesn't type-check `implements` here).
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

// design.md Decision 6 (checklist-management): the real
// PrismaDraftSelectionCleaner raw-SQLs "ReviewTemplate" through
// PrismaService, stubbed out here exactly like review-template.e2e-spec.ts —
// no draft-selection scenario is exercised by this suite, but
// ChecklistQuestionModule requires the binding to resolve at all.
class InMemoryDraftSelectionCleaner {
  removeQuestionFromDrafts(): Promise<void> {
    return Promise.resolve();
  }
}

// community/design.md Decision 4: owned by `community`, never touched in
// this suite's scenarios (no community soft-delete flow is exercised) —
// stubbed to avoid a real Prisma dependency, mirroring the `PrismaService`
// stub below.
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
  password?: string;
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
    deletedAt: null,
  });
}

interface BuiltApp {
  app: INestApplication<App>;
  questionRepository: InMemoryChecklistQuestionRepository;
  templateRepository: InMemoryReviewTemplateRepository;
  communityRepository: InMemoryCommunityRepository;
  technicianRepository: InMemoryCommunityTechnicianRepository;
  representativeRepository: InMemoryCommunityRepresentativeRepository;
  elementRepository: InMemoryInspectableElementRepository;
  sessionRepository: InMemoryReviewSessionRepository;
}

async function buildApp(seed: { users?: User[] }): Promise<BuiltApp> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
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
    .overrideProvider(USER_DIRECTORY)
    .useValue(new InMemoryUserRepositoryBackedUserDirectory(userRepository))
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
    questionRepository,
    templateRepository,
    communityRepository,
    technicianRepository,
    representativeRepository,
    elementRepository,
    sessionRepository,
  };
}

async function loginAgent(app: INestApplication<App>, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .expect(200);
  return agent;
}

type Agent = ReturnType<typeof request.agent>;

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
  text: string;
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
  communityId: string;
  templateId: string;
  performedById: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

async function openSession(
  agent: Agent,
  communityId: string,
  templateId: string,
): Promise<SessionBody> {
  const response = await agent
    .post('/review-sessions')
    .send({ communityId, templateId })
    .expect(201);
  return response.body as SessionBody;
}

describe('Review Sessions (e2e)', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  // tasks.md 6.3, spec: all "Performing a review" scenarios — one continuous
  // walk exercising every write in sequence.
  describe('Full lifecycle (tasks.md 6.3)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-lifecycle-admin@example.com';
    const technicianEmail = 'rs-lifecycle-technician@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-lifecycle-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-lifecycle-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('opens, resolves a code, records answers, marks an element unreviewed, resumes and completes', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Lifecycle community',
      );
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-lifecycle-technician-id',
      );
      const elementA = await createElement(
        adminAgent,
        community.id,
        'Extinguisher A',
      );
      const elementB = await createElement(
        adminAgent,
        community.id,
        'Extinguisher B',
      );
      const question = await createQuestion(adminAgent, 'Is the seal intact?');
      const template = await createActiveTemplate(
        adminAgent,
        'Lifecycle template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);

      // OPEN
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      expect(session.status).toBe('draft');

      // RESOLVE + RECORD (element A, answered)
      const resolvedA = await technicianAgent
        .get(`/review-sessions/${session.id}/elements/${elementA.code}`)
        .expect(200);
      expect((resolvedA.body as { element: { id: string } }).element.id).toBe(
        elementA.id,
      );

      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${elementA.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);

      // MARK UNREVIEWED WITH REASON (element B)
      await technicianAgent
        .get(`/review-sessions/${session.id}/elements/${elementB.code}`)
        .expect(200);
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${elementB.id}`)
        .send({ observations: 'sealed room, no access' })
        .expect(200);

      // RESUME — read back, both entries intact
      const resumed = await technicianAgent
        .get(`/review-sessions/${session.id}`)
        .expect(200);
      const resumedBody = resumed.body as {
        entries: Array<{ inspectableElementId: string; reviewed: boolean }>;
      };
      expect(resumedBody.entries).toHaveLength(2);
      expect(
        resumedBody.entries.find((e) => e.inspectableElementId === elementA.id)
          ?.reviewed,
      ).toBe(true);
      expect(
        resumedBody.entries.find((e) => e.inspectableElementId === elementB.id)
          ?.reviewed,
      ).toBe(false);

      // COMPLETE
      const completed = await technicianAgent
        .post(`/review-sessions/${session.id}/complete`)
        .expect(200);
      expect((completed.body as { status: string }).status).toBe('completed');
    });
  });

  // tasks.md 6.4, authorization spec "Refusal is proven on every endpoint,
  // not a sample": a correctly authenticated, correctly-permissioned but
  // UNASSIGNED technician hits all 8 declared routes.
  //
  // GET /review-scope and GET /review-sessions are self-scoped (they read
  // the CALLER's own assignments/drafts, never a named community or
  // session) — for those two, "refusal" surfaces as an empty result set
  // rather than a 403/404, since there is no third-party resource to name
  // and reject. The other 6 routes each name a session, community or
  // element and are asserted with their coded rejection.
  describe('Scope matrix — unassigned caller on every route (tasks.md 6.4)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-scope-admin@example.com';
    const ownerEmail = 'rs-scope-owner@example.com';
    const unassignedEmail = 'rs-scope-unassigned@example.com';
    let communityId: string;
    let templateId: string;
    let ownerSessionId: string;
    let elementId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-scope-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const owner = await buildSeedUser({
        id: 'rs-scope-owner-id',
        email: ownerEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const unassigned = await buildSeedUser({
        id: 'rs-scope-unassigned-id',
        email: unassignedEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, owner, unassigned] });

      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Scope-matrix community',
      );
      communityId = community.id;
      await assignTechnician(adminAgent, communityId, 'rs-scope-owner-id');
      const element = await createElement(
        adminAgent,
        communityId,
        'Extinguisher',
      );
      elementId = element.id;
      const question = await createQuestion(adminAgent, 'Is it charged?');
      const template = await createActiveTemplate(
        adminAgent,
        'Scope-matrix template',
        [question.id],
      );
      templateId = template.id;

      const ownerAgent = await loginAgent(built.app, ownerEmail);
      const session = await openSession(ownerAgent, communityId, templateId);
      ownerSessionId = session.id;
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('GET /review-scope returns an empty scope, not a 403 (self-scoped)', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent.get('/review-scope').expect(200);
      expect((response.body as { communities: unknown[] }).communities).toEqual(
        [],
      );
    });

    it('POST /review-sessions is refused with 403 COMMUNITY_NOT_IN_SCOPE', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .post('/review-sessions')
        .send({ communityId, templateId })
        .expect(403);
      expect(response.body).toMatchObject({ code: 'COMMUNITY_NOT_IN_SCOPE' });
    });

    it('GET /review-sessions returns an empty list, not a 403 (self-scoped)', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent.get('/review-sessions').expect(200);
      expect(response.body).toEqual([]);
    });

    it("GET /review-sessions/:sessionId on someone else's session is refused with 404 REVIEW_SESSION_NOT_FOUND", async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .get(`/review-sessions/${ownerSessionId}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_FOUND' });
    });

    it('GET .../elements/:code is refused with 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .get(`/review-sessions/${ownerSessionId}/elements/ANYCODE00`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_FOUND' });
    });

    it('PUT .../entries/:elementId is refused with 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .put(`/review-sessions/${ownerSessionId}/entries/${elementId}`)
        .send({ observations: 'irrelevant' })
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_FOUND' });
    });

    it('POST .../complete is refused with 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .post(`/review-sessions/${ownerSessionId}/complete`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_FOUND' });
    });

    it('DELETE /review-sessions/:sessionId is refused with 404 REVIEW_SESSION_NOT_FOUND', async () => {
      const agent = await loginAgent(built.app, unassignedEmail);
      const response = await agent
        .delete(`/review-sessions/${ownerSessionId}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_FOUND' });
    });
  });

  // tasks.md 6.5, spec "Rejected Codes Are Indistinguishable". Only
  // EXTINGUISHER is a declared ElementType in this slice (inspectable-
  // element/design.md Decision 1), so the "wrong element type" case has no
  // second type to construct — the same limitation
  // resolve-element-by-code.use-case.spec.ts documents, deferred here
  // verbatim rather than faked with an invalid type.
  describe('Code indistinguishability (tasks.md 6.5)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-indist-admin@example.com';
    const technicianEmail = 'rs-indist-technician@example.com';
    let sessionId: string;
    let foreignCode: string;
    let decommissionedCode: string;
    let deletedCode: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-indist-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-indist-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });

      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(adminAgent, 'Indist community');
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-indist-technician-id',
      );
      const foreignCommunity = await createCommunity(
        adminAgent,
        'Foreign community',
      );

      const decommissioned = await createElement(
        adminAgent,
        community.id,
        'Decommissioned extinguisher',
      );
      decommissionedCode = decommissioned.code;
      await adminAgent
        .patch(
          `/communities/${community.id}/inspectable-elements/${decommissioned.id}`,
        )
        .send({ deactivated: true })
        .expect(200);

      const deleted = await createElement(
        adminAgent,
        community.id,
        'Soon deleted extinguisher',
      );
      deletedCode = deleted.code;
      await adminAgent
        .delete(
          `/communities/${community.id}/inspectable-elements/${deleted.id}`,
        )
        .expect(204);

      const foreignElement = await createElement(
        adminAgent,
        foreignCommunity.id,
        'Foreign extinguisher',
      );
      foreignCode = foreignElement.code;

      const question = await createQuestion(adminAgent, 'Is the gauge green?');
      const template = await createActiveTemplate(
        adminAgent,
        'Indist template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      sessionId = session.id;
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('unknown, foreign-community, decommissioned and soft-deleted codes all produce byte-identical 404 bodies', async () => {
      const agent = await loginAgent(built.app, technicianEmail);

      const unknown = await agent
        .get(`/review-sessions/${sessionId}/elements/NOTREAL00`)
        .expect(404);
      const foreign = await agent
        .get(`/review-sessions/${sessionId}/elements/${foreignCode}`)
        .expect(404);
      const decommissioned = await agent
        .get(`/review-sessions/${sessionId}/elements/${decommissionedCode}`)
        .expect(404);
      const deleted = await agent
        .get(`/review-sessions/${sessionId}/elements/${deletedCode}`)
        .expect(404);

      expect(unknown.status).toBe(foreign.status);
      expect(unknown.body).toEqual(foreign.body);
      expect(unknown.body).toEqual(decommissioned.body);
      expect(unknown.body).toEqual(deleted.body);
      expect(unknown.body).toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
    });
  });

  // tasks.md 6.6, spec "Sessions Render the Template's Frozen Snapshot".
  describe('Frozen snapshot independence from the live pool (tasks.md 6.6)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-snapshot-admin@example.com';
    const technicianEmail = 'rs-snapshot-technician@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-snapshot-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-snapshot-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('editing the live pool after opening does not change the rendered wording; soft-deleting the pool question still renders it', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(adminAgent, 'Snapshot community');
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-snapshot-technician-id',
      );
      const element = await createElement(
        adminAgent,
        community.id,
        'Extinguisher',
      );
      const question = await createQuestion(adminAgent, 'Original wording');
      const template = await createActiveTemplate(
        adminAgent,
        'Snapshot template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );

      const before = await technicianAgent
        .get(`/review-sessions/${session.id}/elements/${element.code}`)
        .expect(200);
      expect(
        (before.body as { questions: Array<{ text: string }> }).questions[0]
          .text,
      ).toBe('Original wording');

      // Edit the LIVE pool question's wording.
      await adminAgent
        .patch(`/checklist-questions/${question.id}`)
        .send({ text: 'Changed wording' })
        .expect(200);

      const afterEdit = await technicianAgent
        .get(`/review-sessions/${session.id}/elements/${element.code}`)
        .expect(200);
      expect(afterEdit.body).toEqual(before.body);

      // Soft-delete the LIVE pool question.
      await adminAgent
        .delete(`/checklist-questions/${question.id}`)
        .expect(204);

      const afterDelete = await technicianAgent
        .get(`/review-sessions/${session.id}/elements/${element.code}`)
        .expect(200);
      expect(
        (afterDelete.body as { questions: Array<{ text: string }> }).questions,
      ).toEqual([
        (before.body as { questions: Array<{ text: string }> }).questions[0],
      ]);
    });
  });

  // tasks.md 6.7 + 6.8, spec "Completed Sessions Are Immutable". Two DISTINCT
  // rejection causes on the SAME 3 calls: SYSTEM_ADMIN never reaches the
  // domain guard (403, no reviewSession:* permission at all); the session's
  // OWN performer legitimately holds the permission and IS in scope, so
  // their identical calls reach the domain guard and are rejected there
  // (409) — the row that actually proves the immutability invariant, not
  // just the permission gate (design.md "corrected 2026-09-06").
  describe('Immutability after completion (tasks.md 6.7, 6.8)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-immutable-admin@example.com';
    const technicianEmail = 'rs-immutable-technician@example.com';
    let sessionId: string;
    let elementId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-immutable-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-immutable-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });

      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Immutable community',
      );
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-immutable-technician-id',
      );
      const element = await createElement(
        adminAgent,
        community.id,
        'Extinguisher',
      );
      elementId = element.id;
      const question = await createQuestion(adminAgent, 'Is it accessible?');
      const template = await createActiveTemplate(
        adminAgent,
        'Immutable template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      sessionId = session.id;
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${element.id}`)
        .send({ observations: 'sealed, no access' })
        .expect(200);
      await technicianAgent
        .post(`/review-sessions/${session.id}/complete`)
        .expect(200);
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('SYSTEM_ADMIN is refused with 403 on all three mutations (permission gate, never reaches the domain guard)', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);

      const put = await adminAgent
        .put(`/review-sessions/${sessionId}/entries/${elementId}`)
        .send({ observations: 'attempted after completion' })
        .expect(403);
      const complete = await adminAgent
        .post(`/review-sessions/${sessionId}/complete`)
        .expect(403);
      const del = await adminAgent
        .delete(`/review-sessions/${sessionId}`)
        .expect(403);

      // No reviewSession:* permission at all — the bare PermissionsGuard
      // rejection, no coded body (mirrors every other 403 in this codebase
      // before review-session/design.md Decision 4).
      expect(put.status).toBe(403);
      expect(complete.status).toBe(403);
      expect(del.status).toBe(403);
    });

    it("the session's own performer is refused with 409 REVIEW_SESSION_NOT_EDITABLE on all three mutations (the domain guard itself)", async () => {
      const technicianAgent = await loginAgent(built.app, technicianEmail);

      const put = await technicianAgent
        .put(`/review-sessions/${sessionId}/entries/${elementId}`)
        .send({ observations: 'attempted after completion' })
        .expect(409);
      expect(put.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_EDITABLE' });

      const complete = await technicianAgent
        .post(`/review-sessions/${sessionId}/complete`)
        .expect(409);
      expect(complete.body).toMatchObject({
        code: 'REVIEW_SESSION_NOT_EDITABLE',
      });

      const del = await technicianAgent
        .delete(`/review-sessions/${sessionId}`)
        .expect(409);
      expect(del.body).toMatchObject({ code: 'REVIEW_SESSION_NOT_EDITABLE' });
    });
  });

  // tasks.md 6.9, design.md Interfaces/Contracts `discardDraft`.
  describe('Discard cascade (tasks.md 6.9)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-discard-admin@example.com';
    const technicianEmail = 'rs-discard-technician@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-discard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-discard-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('discarding a draft with recorded entries removes it entirely — no residual open-draft row blocks a fresh open for the same pair', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(adminAgent, 'Discard community');
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-discard-technician-id',
      );
      const element = await createElement(
        adminAgent,
        community.id,
        'Extinguisher',
      );
      const question = await createQuestion(adminAgent, 'Is it charged?');
      const template = await createActiveTemplate(
        adminAgent,
        'Discard template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${element.id}`)
        .send({ observations: 'sealed, no access' })
        .expect(200);

      await technicianAgent
        .delete(`/review-sessions/${session.id}`)
        .expect(204);

      await technicianAgent.get(`/review-sessions/${session.id}`).expect(404);

      // If the discard had left a residual `draft` row (or its recorded
      // entry) behind, the hand-written partial unique index
      // (ReviewSession_open_draft_key) would collide here.
      const reopened = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      expect(reopened.status).toBe('draft');
    });

    it('discarding a completed session returns 409 and deletes nothing', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Discard-completed community',
      );
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-discard-technician-id',
      );
      const element = await createElement(
        adminAgent,
        community.id,
        'Extinguisher',
      );
      const question = await createQuestion(adminAgent, 'Is it charged?');
      const template = await createActiveTemplate(
        adminAgent,
        'Discard-completed template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${element.id}`)
        .send({ observations: 'sealed, no access' })
        .expect(200);
      await technicianAgent
        .post(`/review-sessions/${session.id}/complete`)
        .expect(200);

      const rejected = await technicianAgent
        .delete(`/review-sessions/${session.id}`)
        .expect(409);
      expect(rejected.body).toMatchObject({
        code: 'REVIEW_SESSION_NOT_EDITABLE',
      });

      const stillThere = await technicianAgent
        .get(`/review-sessions/${session.id}`)
        .expect(200);
      expect((stillThere.body as { status: string }).status).toBe('completed');
    });
  });

  // tasks.md 6.10, spec "Adjacent Review Capabilities Are Not Introduced" +
  // review-template-management spec "No Review Session Surface" (the
  // reverse direction). Mirrors review-template.e2e-spec.ts's own
  // forbidden-identifier scan.
  describe('Scope guards (tasks.md 6.10)', () => {
    const scanRoot = path.join(
      __dirname,
      '..',
      'src',
      'modules',
      'review-session',
    );
    const webScanRoot = path.join(__dirname, '..', '..', 'web', 'src');
    const excludedDirs = new Set(['node_modules', 'dist', '.turbo']);

    function collectFiles(target: string): string[] {
      if (!fs.existsSync(target)) {
        return [];
      }
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        return [target];
      }
      const entries = fs.readdirSync(target, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        if (excludedDirs.has(entry.name)) {
          continue;
        }
        const fullPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }
      return files;
    }

    // Concrete implementation-level symbols and library names, not prose —
    // this codebase's own comments freely discuss "history", "scheduling"
    // and "export" as things deliberately NOT built (see design.md/spec.md
    // in this very change), so a bare English-word scan would flag its own
    // documentation. These identifiers would only appear if the capability
    // itself had actually been introduced.
    it('no review-session file introduces a scheduling, reminder or export/signing mechanism', () => {
      const forbidden = [
        'dueDate',
        'overdue',
        'Overdue',
        'node-cron',
        'CronJob',
        'nodemailer',
        'PDFDocument',
        'pdfkit',
        'puppeteer',
        'ExportReviewSession',
        'GenerateReviewSessionPdf',
        'ReviewSessionHistoryController',
        'ReviewSessionHistoryUseCase',
        'ScheduleReviewSession',
      ];
      const offenders: string[] = [];
      for (const file of collectFiles(scanRoot)) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const term of forbidden) {
          if (content.includes(term)) {
            offenders.push(`${term} found in ${file}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('no review-session route path is a history/export/scheduling surface', () => {
      const controllerPath = path.join(
        scanRoot,
        'presentation',
        'review-session.controller.ts',
      );
      const content = fs.readFileSync(controllerPath, 'utf-8');
      const routeDecorator = /@(?:Get|Post|Put|Delete|Patch)\(([^)]*)\)/g;
      const forbiddenSegment =
        /history|export|schedule|reminder|sign(?!ed-in)/i;
      const offendingRoutes: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = routeDecorator.exec(content)) !== null) {
        if (forbiddenSegment.test(match[1])) {
          offendingRoutes.push(match[0]);
        }
      }
      expect(offendingRoutes).toEqual([]);
    });

    // Corrected review-session/08 (PR8/8, discovered during the PR8 full-
    // suite run, not something PR8 introduced): this assertion originally
    // proved the web flow did NOT exist yet, per its own title ("FR-007 web
    // flow ships in PR 7") — written in PR 6, before PR 7 shipped it. Once
    // PR 7 shipped `apps/web/src/pages/ReviewSession*.tsx` etc., the
    // assertion became permanently false by design, not a regression. There
    // is no longer a "not built yet" fact left to prove; the real ongoing
    // guarantee — no scheduling/reminder/export/history mechanism, on the
    // web side either — is the one worth keeping, mirroring the sibling
    // scanRoot check above for the API module.
    it('no review-session web file introduces a scheduling, reminder, export or history mechanism', () => {
      const forbidden = [
        'dueDate',
        'overdue',
        'Overdue',
        'PDFDocument',
        'pdfkit',
        'jspdf',
        'ExportReviewSession',
        'ReviewSessionHistory',
        'ScheduleReviewSession',
      ];
      const offenders: string[] = [];
      for (const file of collectFiles(webScanRoot)) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const term of forbidden) {
          if (content.includes(term)) {
            offenders.push(`${term} found in ${file}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('the ReviewSessionStatus Postgres enum declares no signed value', () => {
      const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const match = /enum ReviewSessionStatus \{([^}]*)\}/.exec(content);
      expect(match).not.toBeNull();
      expect(match?.[1]).not.toMatch(/signed/i);
    });
  });

  // tasks.md 6.11, spec "Complete a Session With Explained Gaps Only" —
  // "Decommissioned and soft-deleted elements do not block completion".
  describe('Partial completion with decommissioned/soft-deleted elements (tasks.md 6.11)', () => {
    let built: BuiltApp;
    const adminEmail = 'rs-partial-admin@example.com';
    const technicianEmail = 'rs-partial-technician@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rs-partial-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const technician = await buildSeedUser({
        id: 'rs-partial-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      built = await buildApp({ users: [admin, technician] });
    });

    afterAll(async () => {
      await built.app.close();
    });

    it('completes with one reviewed element plus a decommissioned and a soft-deleted one requiring no entry', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(adminAgent, 'Partial community');
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-partial-technician-id',
      );
      const reviewed = await createElement(
        adminAgent,
        community.id,
        'Reviewed',
      );
      const decommissioned = await createElement(
        adminAgent,
        community.id,
        'Decommissioned',
      );
      await adminAgent
        .patch(
          `/communities/${community.id}/inspectable-elements/${decommissioned.id}`,
        )
        .send({ deactivated: true })
        .expect(200);
      const deleted = await createElement(adminAgent, community.id, 'Deleted');
      await adminAgent
        .delete(
          `/communities/${community.id}/inspectable-elements/${deleted.id}`,
        )
        .expect(204);
      const question = await createQuestion(adminAgent, 'Is it charged?');
      const template = await createActiveTemplate(
        adminAgent,
        'Partial template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${reviewed.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);

      const completed = await technicianAgent
        .post(`/review-sessions/${session.id}/complete`)
        .expect(200);
      expect((completed.body as { status: string }).status).toBe('completed');
    });

    it('rejects completion when an active element has neither an answer nor a reason, listing its code', async () => {
      const adminAgent = await loginAgent(built.app, adminEmail);
      const community = await createCommunity(
        adminAgent,
        'Partial-gap community',
      );
      await assignTechnician(
        adminAgent,
        community.id,
        'rs-partial-technician-id',
      );
      const reviewed = await createElement(
        adminAgent,
        community.id,
        'Reviewed',
      );
      const gap = await createElement(adminAgent, community.id, 'Uncovered');
      const question = await createQuestion(adminAgent, 'Is it charged?');
      const template = await createActiveTemplate(
        adminAgent,
        'Partial-gap template',
        [question.id],
      );

      const technicianAgent = await loginAgent(built.app, technicianEmail);
      const session = await openSession(
        technicianAgent,
        community.id,
        template.id,
      );
      await technicianAgent
        .put(`/review-sessions/${session.id}/entries/${reviewed.id}`)
        .send({ answers: [{ questionId: question.id, value: 'YES' }] })
        .expect(200);

      const rejected = await technicianAgent
        .post(`/review-sessions/${session.id}/complete`)
        .expect(409);
      expect(rejected.body).toMatchObject({
        code: 'UNREVIEWED_ELEMENTS_WITHOUT_REASON',
        elementCodes: [gap.code],
      });

      const stillDraft = await technicianAgent
        .get(`/review-sessions/${session.id}`)
        .expect(200);
      expect((stillDraft.body as { status: string }).status).toBe('draft');
    });
  });
});
