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
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';
// design.md Testing Strategy (E2E row) + tasks.md 11.1: reuse the SAME
// in-memory fakes the use-case unit specs already exercise (Phase 3 and
// Phase 8), mirroring test/checklist-question.e2e-spec.ts. This spec spins
// up BOTH modules (checklist-question + review-template) in one app
// instance, because several scenarios in review-template-management spec.md
// cross the module boundary (draft-selection-cleaner cascade, frozen
// snapshot independence from live pool edits).
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';

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

// design.md Decision 6: the real PrismaDraftSelectionCleaner raw-SQLs
// "ReviewTemplate" through PrismaService, which this spec stubs out (same
// as checklist-question.e2e-spec.ts). This fake reproduces the exact
// contract (`array_remove` semantics) directly against the SAME
// InMemoryReviewTemplateRepository instance the review-template module is
// wired to, so the soft-delete -> cleanup cascade is exercised end-to-end
// through the real HTTP DELETE route, not mocked away.
class InMemoryDraftSelectionCleaner {
  constructor(
    private readonly templateRepository: InMemoryReviewTemplateRepository,
  ) {}

  async removeQuestionFromDrafts(questionId: string): Promise<void> {
    const templates = await this.templateRepository.findAll();
    for (const template of templates) {
      if (
        template.status === 'draft' &&
        template.draftQuestionIds.includes(questionId)
      ) {
        await this.templateRepository.replaceDraftQuestions(
          template.id,
          template.draftQuestionIds.filter((id) => id !== questionId),
        );
      }
    }
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

async function buildApp(seed: { users?: User[] }): Promise<{
  app: INestApplication<App>;
  questionRepository: InMemoryChecklistQuestionRepository;
  templateRepository: InMemoryReviewTemplateRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const questionRepository = new InMemoryChecklistQuestionRepository();
  const templateRepository = new InMemoryReviewTemplateRepository(
    questionRepository,
  );
  const draftSelectionCleaner = new InMemoryDraftSelectionCleaner(
    templateRepository,
  );
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
    .useValue(draftSelectionCleaner)
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, questionRepository, templateRepository };
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

interface QuestionResponseBody {
  id: string;
  elementType: string;
  frequencies: string[];
  text: string;
}

interface TemplateListItemBody {
  id: string;
  elementType: string;
  frequency: string;
  name: string;
  version: number | null;
  status: string;
}

interface TemplateQuestionBody {
  questionId: string;
  order: number;
  text: string;
}

interface TemplateBody extends TemplateListItemBody {
  questions: TemplateQuestionBody[];
}

async function createQuestion(
  app: INestApplication<App>,
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<{
    elementType: string;
    frequencies: string[];
    text: string;
  }> = {},
): Promise<QuestionResponseBody> {
  const response = await agent
    .post('/checklist-questions')
    .send({
      elementType: overrides.elementType ?? 'EXTINGUISHER',
      frequencies: overrides.frequencies ?? ['QUARTERLY'],
      text: overrides.text ?? 'Check the pressure gauge',
    })
    .expect(201);
  return response.body as QuestionResponseBody;
}

describe('Review Templates (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('Full lifecycle (tasks.md 11.1, spec: review-template-management)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-lifecycle-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-lifecycle-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('creates a draft, sets/reorders its questions, activates it, and reads the frozen snapshot end to end', async () => {
      const agent = await loginAgent(app, adminEmail);

      // spec: "Admin creates the first draft for a lineage"
      const created = await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'QUARTERLY',
          name: 'Quarterly extinguisher review',
        })
        .expect(201);
      const template = created.body as TemplateListItemBody;
      expect(template.status).toBe('draft');
      expect(template.version).toBeNull();

      const questionA = await createQuestion(app, agent, { text: 'A' });
      const questionB = await createQuestion(app, agent, { text: 'B' });
      const questionC = await createQuestion(app, agent, { text: 'C' });

      // spec: "Admin sets and reorders a draft's questions"
      const firstOrder = await agent
        .put(`/review-templates/${template.id}/questions`)
        .send({ questionIds: [questionA.id, questionB.id, questionC.id] })
        .expect(200);
      expect(
        (firstOrder.body as TemplateBody).questions.map((q) => q.questionId),
      ).toEqual([questionA.id, questionB.id, questionC.id]);

      const reordered = await agent
        .put(`/review-templates/${template.id}/questions`)
        .send({ questionIds: [questionC.id, questionA.id, questionB.id] })
        .expect(200);
      expect(
        (reordered.body as TemplateBody).questions.map((q) => q.questionId),
      ).toEqual([questionC.id, questionA.id, questionB.id]);

      // spec: "Replacing the selection is a full replace, not a merge"
      const fullReplace = await agent
        .put(`/review-templates/${template.id}/questions`)
        .send({ questionIds: [questionB.id] })
        .expect(200);
      expect(
        (fullReplace.body as TemplateBody).questions.map((q) => q.questionId),
      ).toEqual([questionB.id]);

      // spec: "Admin activates the first version of a lineage"
      const activated = await agent
        .post(`/review-templates/${template.id}/activate`)
        .expect(201);
      expect(activated.body).toMatchObject({
        id: template.id,
        status: 'active',
        version: 1,
      });

      // spec: "Admin reads a template with its ordered questions" +
      // "Activation Snapshots Each Question's Wording"
      const frozenRead = await agent
        .get(`/review-templates/${template.id}`)
        .expect(200);
      const frozenBody = frozenRead.body as TemplateBody;
      expect(frozenBody.status).toBe('active');
      expect(frozenBody.questions).toEqual([
        { questionId: questionB.id, order: 1, text: 'B' },
      ]);

      // spec: "Activation retires the previous active version"
      const secondDraft = await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'QUARTERLY',
          name: 'Quarterly extinguisher review v2',
        })
        .expect(201);
      const secondTemplate = secondDraft.body as TemplateListItemBody;

      await agent
        .put(`/review-templates/${secondTemplate.id}/questions`)
        .send({ questionIds: [questionA.id] })
        .expect(200);

      const secondActivation = await agent
        .post(`/review-templates/${secondTemplate.id}/activate`)
        .expect(201);
      expect(secondActivation.body).toMatchObject({
        id: secondTemplate.id,
        status: 'active',
        version: 2,
      });

      const predecessorRead = await agent
        .get(`/review-templates/${template.id}`)
        .expect(200);
      expect((predecessorRead.body as TemplateBody).status).toBe('retired');

      // spec: "Admin lists templates across lineages and statuses"
      const list = await agent.get('/review-templates').expect(200);
      const listBody = list.body as TemplateListItemBody[];
      expect(listBody.find((t) => t.id === template.id)?.status).toBe(
        'retired',
      );
      expect(listBody.find((t) => t.id === secondTemplate.id)?.status).toBe(
        'active',
      );
    });
  });

  describe('Second draft on the same lineage is rejected (spec: Second draft for the same lineage rejected)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-draft-exists-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-draft-exists-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects a second draft with 409 DRAFT_EXISTS and creates no row', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'MONTHLY',
          name: 'First draft',
        })
        .expect(201);

      const rejected = await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'MONTHLY',
          name: 'Second draft',
        })
        .expect(409);
      expect(rejected.body).toMatchObject({
        statusCode: 409,
        code: 'REVIEW_TEMPLATE_DRAFT_EXISTS',
      });

      const list = await agent.get('/review-templates').expect(200);
      expect(
        (list.body as TemplateListItemBody[]).filter(
          (t) => t.frequency === 'MONTHLY',
        ),
      ).toHaveLength(1);
    });
  });

  describe('Activating an empty draft is rejected without consuming a version (spec: Activating an empty template rejected without consuming a version)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-empty-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-empty-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 409 EMPTY, leaves the draft a draft, and the next real activation still gets version 1', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'SEMIANNUAL',
          name: 'Empty draft',
        })
        .expect(201);
      const template = created.body as TemplateListItemBody;

      const rejected = await agent
        .post(`/review-templates/${template.id}/activate`)
        .expect(409);
      expect(rejected.body).toMatchObject({
        statusCode: 409,
        code: 'REVIEW_TEMPLATE_EMPTY',
      });

      const stillDraft = await agent
        .get(`/review-templates/${template.id}`)
        .expect(200);
      expect((stillDraft.body as TemplateBody).status).toBe('draft');
      expect((stillDraft.body as TemplateBody).version).toBeNull();

      // No version number was consumed by the failed activation: fill the
      // selection and activate for real — it must still land on version 1,
      // not 2.
      const question = await createQuestion(app, agent, {
        frequencies: ['SEMIANNUAL'],
      });
      await agent
        .put(`/review-templates/${template.id}/questions`)
        .send({ questionIds: [question.id] })
        .expect(200);
      const activated = await agent
        .post(`/review-templates/${template.id}/activate`)
        .expect(201);
      expect((activated.body as { version: number }).version).toBe(1);
    });
  });

  describe('Discarded draft leaves no version gap (spec: Discarded draft leaves no gap)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-version-gap-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-version-gap-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('a soft-deleted draft never consumed a version, so the next real activation still gets the correct next sequential number', async () => {
      const agent = await loginAgent(app, adminEmail);
      const questionOne = await createQuestion(app, agent, {
        frequencies: ['ANNUAL'],
      });

      // Activate a real version 1 for the lineage first.
      const draftOne = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'ANNUAL',
            name: 'v1',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${draftOne.id}/questions`)
        .send({ questionIds: [questionOne.id] })
        .expect(200);
      const activatedOne = await agent
        .post(`/review-templates/${draftOne.id}/activate`)
        .expect(201);
      expect((activatedOne.body as { version: number }).version).toBe(1);

      // Draft A: created then discarded (soft-deleted) without ever being
      // activated — its version stayed NULL the whole time, so it never
      // touched the lineage's version sequence at all.
      const draftA = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'ANNUAL',
            name: 'discarded draft A',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent.delete(`/review-templates/${draftA.id}`).expect(204);

      // Draft B: created and activated for real. If A's discard had
      // consumed a version number, B would land on 3; the correct next
      // sequential number for this lineage is 2.
      const draftB = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'ANNUAL',
            name: 'draft B',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${draftB.id}/questions`)
        .send({ questionIds: [questionOne.id] })
        .expect(200);
      const activatedB = await agent
        .post(`/review-templates/${draftB.id}/activate`)
        .expect(201);
      expect((activatedB.body as { version: number }).version).toBe(2);
    });
  });

  describe('Versions increment per lineage, independently (spec: review-template-management)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-independent-lineage-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-independent-lineage-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it("activating two versions on lineage A does not advance lineage B's version counter, and vice versa", async () => {
      const agent = await loginAgent(app, adminEmail);
      const questionMonthly = await createQuestion(app, agent, {
        frequencies: ['MONTHLY'],
      });
      const questionSemiannual = await createQuestion(app, agent, {
        frequencies: ['SEMIANNUAL'],
      });

      async function createAndActivate(
        frequency: string,
        questionId: string,
        name: string,
      ): Promise<number> {
        const draft = (
          await agent
            .post('/review-templates')
            .send({ elementType: 'EXTINGUISHER', frequency, name })
            .expect(201)
        ).body as TemplateListItemBody;
        await agent
          .put(`/review-templates/${draft.id}/questions`)
          .send({ questionIds: [questionId] })
          .expect(200);
        const activated = await agent
          .post(`/review-templates/${draft.id}/activate`)
          .expect(201);
        return (activated.body as { version: number }).version;
      }

      // Lineage A (MONTHLY): two activations, v1 then v2.
      expect(
        await createAndActivate('MONTHLY', questionMonthly.id, 'lineage A v1'),
      ).toBe(1);
      expect(
        await createAndActivate('MONTHLY', questionMonthly.id, 'lineage A v2'),
      ).toBe(2);

      // Lineage B (SEMIANNUAL): its first-ever activation must still be v1,
      // unaffected by lineage A already being at v2 — the version sequence
      // is scoped per (elementType, frequency), not global.
      expect(
        await createAndActivate(
          'SEMIANNUAL',
          questionSemiannual.id,
          'lineage B v1',
        ),
      ).toBe(1);

      // Lineage A continuing to v3 must likewise be unaffected by lineage
      // B's own activation in between.
      expect(
        await createAndActivate('MONTHLY', questionMonthly.id, 'lineage A v3'),
      ).toBe(3);
    });
  });

  describe('Frozen templates are immutable (spec: Frozen Templates Are Immutable)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-frozen-admin@example.com';
    let activeTemplateId: string;

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-frozen-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));

      const agent = await loginAgent(app, adminEmail);
      const question = await createQuestion(app, agent);
      const draft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'QUARTERLY',
            name: 'To be frozen',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${draft.id}/questions`)
        .send({ questionIds: [question.id] })
        .expect(200);
      await agent.post(`/review-templates/${draft.id}/activate`).expect(201);
      activeTemplateId = draft.id;
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects PUT .../questions on a frozen template with 409 NOT_EDITABLE and leaves the selection unchanged', async () => {
      const agent = await loginAgent(app, adminEmail);
      const before = await agent
        .get(`/review-templates/${activeTemplateId}`)
        .expect(200);

      const rejected = await agent
        .put(`/review-templates/${activeTemplateId}/questions`)
        .send({ questionIds: [] })
        .expect(409);
      expect(rejected.body).toMatchObject({
        statusCode: 409,
        code: 'REVIEW_TEMPLATE_NOT_EDITABLE',
      });

      const after = await agent
        .get(`/review-templates/${activeTemplateId}`)
        .expect(200);
      expect((after.body as TemplateBody).questions).toEqual(
        (before.body as TemplateBody).questions,
      );
    });

    it('rejects POST .../activate on an already-active template with 409 NOT_EDITABLE (retired is terminal too, per the same guard)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const rejected = await agent
        .post(`/review-templates/${activeTemplateId}/activate`)
        .expect(409);
      expect(rejected.body).toMatchObject({
        statusCode: 409,
        code: 'REVIEW_TEMPLATE_NOT_EDITABLE',
      });
    });

    it('rejects soft-deleting a frozen template with 409 NOT_EDITABLE', async () => {
      const agent = await loginAgent(app, adminEmail);

      const rejected = await agent
        .delete(`/review-templates/${activeTemplateId}`)
        .expect(409);
      expect(rejected.body).toMatchObject({
        statusCode: 409,
        code: 'REVIEW_TEMPLATE_NOT_EDITABLE',
      });
    });
  });

  describe("Snapshot independence from the live pool (spec: Activation Snapshots Each Question's Wording)", () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-snapshot-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-snapshot-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('editing a question after activation does not change the frozen response — byte-identical snapshot', async () => {
      const agent = await loginAgent(app, adminEmail);
      const question = await createQuestion(app, agent, {
        text: 'Original wording',
      });

      const draft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'MONTHLY',
            name: 'Snapshot lineage',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${draft.id}/questions`)
        .send({ questionIds: [question.id] })
        .expect(200);
      await agent.post(`/review-templates/${draft.id}/activate`).expect(201);

      const frozenBefore = await agent
        .get(`/review-templates/${draft.id}`)
        .expect(200);
      expect((frozenBefore.body as TemplateBody).questions[0].text).toBe(
        'Original wording',
      );

      // Edit the LIVE pool question's text after activation.
      await agent
        .patch(`/checklist-questions/${question.id}`)
        .send({ text: 'Changed wording' })
        .expect(200);

      const frozenAfter = await agent
        .get(`/review-templates/${draft.id}`)
        .expect(200);
      // Byte-identical: the frozen response is untouched by the live edit.
      expect(frozenAfter.body).toEqual(frozenBefore.body);
      expect((frozenAfter.body as TemplateBody).questions[0].text).toBe(
        'Original wording',
      );

      // The pool itself DOES show the new text — the live path is not
      // frozen, only the template's own snapshot is.
      const poolList = await agent.get('/checklist-questions').expect(200);
      expect(
        (poolList.body as QuestionResponseBody[]).find(
          (q) => q.id === question.id,
        )?.text,
      ).toBe('Changed wording');
    });

    it('soft-deleting a referenced question leaves the frozen template unaffected but drops it from a separate draft (design.md Decision 6 cascade, end to end)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const question = await createQuestion(app, agent, {
        text: 'Shared question',
      });

      // Frozen lineage referencing the question.
      const frozenDraft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'ANNUAL',
            name: 'Frozen with shared question',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${frozenDraft.id}/questions`)
        .send({ questionIds: [question.id] })
        .expect(200);
      await agent
        .post(`/review-templates/${frozenDraft.id}/activate`)
        .expect(201);

      // A separate draft also selecting the same question.
      const liveDraft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'SEMIANNUAL',
            name: 'Draft with shared question',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${liveDraft.id}/questions`)
        .send({ questionIds: [question.id] })
        .expect(200);

      // Soft-delete the shared question through the real route.
      await agent.delete(`/checklist-questions/${question.id}`).expect(204);

      // The frozen template still renders it — the snapshot never reads the
      // pool at all, so it cannot observe the soft-delete.
      const frozenRead = await agent
        .get(`/review-templates/${frozenDraft.id}`)
        .expect(200);
      expect((frozenRead.body as TemplateBody).questions).toEqual([
        { questionId: question.id, order: 1, text: 'Shared question' },
      ]);

      // The draft drops it — DraftSelectionCleaner's real cascade, run
      // through the actual DELETE route.
      const liveRead = await agent
        .get(`/review-templates/${liveDraft.id}`)
        .expect(200);
      expect((liveRead.body as TemplateBody).questions).toEqual([]);
    });
  });

  describe('Cross-frequency question selection is accepted (spec: Cross-frequency question may be selected)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-cross-frequency-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-cross-frequency-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('accepts a question tagged only for a different frequency', async () => {
      const agent = await loginAgent(app, adminEmail);
      const quarterlyOnlyQuestion = await createQuestion(app, agent, {
        frequencies: ['QUARTERLY'],
        text: 'Quarterly-only question',
      });

      const annualDraft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'ANNUAL',
            name: 'Annual draft picking a quarterly question',
          })
          .expect(201)
      ).body as TemplateListItemBody;

      const response = await agent
        .put(`/review-templates/${annualDraft.id}/questions`)
        .send({ questionIds: [quarterlyOnlyQuestion.id] })
        .expect(200);
      expect(
        (response.body as TemplateBody).questions.map((q) => q.questionId),
      ).toEqual([quarterlyOnlyQuestion.id]);
    });
  });

  describe('Unknown/soft-deleted id guards (spec: "Unknown template id rejected", "Unknown or soft-deleted question id rejected", "Soft-deleted drafts excluded")', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-guards-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-guards-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET .../:id on an unknown template returns 404 REVIEW_TEMPLATE_NOT_FOUND', async () => {
      const agent = await loginAgent(app, adminEmail);
      const response = await agent
        .get('/review-templates/does-not-exist')
        .expect(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'REVIEW_TEMPLATE_NOT_FOUND',
      });
    });

    it('PUT .../questions on an unknown template returns 404 REVIEW_TEMPLATE_NOT_FOUND', async () => {
      const agent = await loginAgent(app, adminEmail);
      const response = await agent
        .put('/review-templates/does-not-exist/questions')
        .send({ questionIds: [] })
        .expect(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'REVIEW_TEMPLATE_NOT_FOUND',
      });
    });

    it('PUT .../questions with an unknown or soft-deleted question id returns 404 CHECKLIST_QUESTION_NOT_FOUND and leaves the selection unchanged', async () => {
      const agent = await loginAgent(app, adminEmail);
      const keptQuestion = await createQuestion(app, agent, { text: 'Kept' });
      const deletedQuestion = await createQuestion(app, agent, {
        text: 'Will be deleted',
      });
      await agent
        .delete(`/checklist-questions/${deletedQuestion.id}`)
        .expect(204);

      const draft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'MONTHLY',
            name: 'Guarded draft',
          })
          .expect(201)
      ).body as TemplateListItemBody;
      await agent
        .put(`/review-templates/${draft.id}/questions`)
        .send({ questionIds: [keptQuestion.id] })
        .expect(200);

      const unknownIdResponse = await agent
        .put(`/review-templates/${draft.id}/questions`)
        .send({ questionIds: [keptQuestion.id, 'not-a-real-question-id'] })
        .expect(404);
      expect(unknownIdResponse.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });

      const softDeletedIdResponse = await agent
        .put(`/review-templates/${draft.id}/questions`)
        .send({ questionIds: [deletedQuestion.id] })
        .expect(404);
      expect(softDeletedIdResponse.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });

      const unchanged = await agent
        .get(`/review-templates/${draft.id}`)
        .expect(200);
      expect(
        (unchanged.body as TemplateBody).questions.map((q) => q.questionId),
      ).toEqual([keptQuestion.id]);
    });

    it('a soft-deleted draft is excluded from the list and frees its lineage for a new draft', async () => {
      const agent = await loginAgent(app, adminEmail);
      const draft = (
        await agent
          .post('/review-templates')
          .send({
            elementType: 'EXTINGUISHER',
            frequency: 'SEMIANNUAL',
            name: 'Soon discarded',
          })
          .expect(201)
      ).body as TemplateListItemBody;

      await agent.delete(`/review-templates/${draft.id}`).expect(204);

      const list = await agent.get('/review-templates').expect(200);
      expect(
        (list.body as TemplateListItemBody[]).some((t) => t.id === draft.id),
      ).toBe(false);

      // spec: "the lineage MUST accept a new draft"
      await agent
        .post('/review-templates')
        .send({
          elementType: 'EXTINGUISHER',
          frequency: 'SEMIANNUAL',
          name: 'New draft for the freed lineage',
        })
        .expect(201);
    });
  });

  describe('Anonymous and non-admin access control on every review-templates route (tasks.md 11.1, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'rt-guard-admin@example.com';
    const managerEmail = 'rt-guard-manager@example.com';
    const mcManagerEmail = 'rt-guard-mc-manager@example.com';
    const technicianEmail = 'rt-guard-technician@example.com';
    const representativeEmail = 'rt-guard-representative@example.com';
    const templateId = 'rt-guard-template-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'rt-guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const manager = await buildSeedUser({
        id: 'rt-guard-manager-id',
        email: managerEmail,
        role: 'MANAGER',
      });
      const mcManager = await buildSeedUser({
        id: 'rt-guard-mc-manager-id',
        email: mcManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      const technician = await buildSeedUser({
        id: 'rt-guard-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'rt-guard-representative-id',
        email: representativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      ({ app } = await buildApp({
        users: [admin, manager, mcManager, technician, representative],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    const routes = [
      ['POST', '/review-templates'],
      ['GET', '/review-templates'],
      ['GET', `/review-templates/${templateId}`],
      ['PUT', `/review-templates/${templateId}/questions`],
      ['POST', `/review-templates/${templateId}/activate`],
      ['DELETE', `/review-templates/${templateId}`],
    ] as const;

    function sendRoute(
      agent: ReturnType<typeof request>,
      method: (typeof routes)[number][0],
      path: string,
    ) {
      switch (method) {
        case 'POST':
          if (path.endsWith('/activate')) {
            return agent.post(path);
          }
          return agent.post(path).send({
            elementType: 'EXTINGUISHER',
            frequency: 'MONTHLY',
            name: 'x',
          });
        case 'GET':
          return agent.get(path);
        case 'PUT':
          return agent.put(path).send({ questionIds: [] });
        case 'DELETE':
          return agent.delete(path);
      }
    }

    // authorization spec: "Unauthenticated caller is rejected before role
    // check" — 401 on every review-templates route, no session cookie.
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

    it('SYSTEM_ADMIN is permitted through the guard (authorization spec: SYSTEM_ADMIN is permitted, including activate)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent.get('/review-templates').expect(200);
    });
  });

  // tasks.md 11.2 + spec: "No Review Session Surface" — this change is
  // scoped to the question pool + template versioning ONLY. Confirms the
  // scope boundary was never accidentally crossed across all 11 PRs by
  // walking the shipped source trees (never docs, which deliberately
  // discuss ReviewSession/ElementReviewEntry/QuestionAnswer as FR-007's
  // future scope) for the three forbidden identifiers.
  describe('No Review Session Surface (tasks.md 11.2, spec: No Review Session Surface)', () => {
    const forbiddenIdentifiers = [
      'ReviewSession',
      'ElementReviewEntry',
      'QuestionAnswer',
    ];
    const scannedRoots = [
      path.join(__dirname, '..', 'src'),
      path.join(__dirname, '..', 'prisma', 'schema.prisma'),
      path.join(__dirname, '..', '..', 'web', 'src'),
    ];
    const excludedDirs = new Set(['node_modules', 'dist', '.turbo']);
    // This file itself references the forbidden identifiers to describe
    // what must NOT exist — exclude it from its own scan.
    const selfPath = path.join(__dirname, 'review-template.e2e-spec.ts');

    function collectFiles(target: string): string[] {
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

    it('no ReviewSession, ElementReviewEntry or QuestionAnswer table, model, route or page exists anywhere in the shipped source', () => {
      const offenders: string[] = [];
      for (const root of scannedRoots) {
        if (!fs.existsSync(root)) {
          continue;
        }
        for (const file of collectFiles(root)) {
          if (path.resolve(file) === path.resolve(selfPath)) {
            continue;
          }
          const content = fs.readFileSync(file, 'utf-8');
          for (const identifier of forbiddenIdentifiers) {
            if (content.includes(identifier)) {
              offenders.push(`${identifier} found in ${file}`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
