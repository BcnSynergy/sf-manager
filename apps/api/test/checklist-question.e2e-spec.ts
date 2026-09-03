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
import { InMemoryChecklistQuestionRepository } from '../src/modules/checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';
// design.md Testing Strategy (E2E row) + tasks.md 5.8: reuse the SAME
// in-memory fake the use-case unit specs already exercise (Phase 3), rather
// than hand-rolling a new one — mirrors test/inspectable-element.e2e-spec.ts's
// reuse of InMemoryInspectableElementRepository. Hermetic: no real Postgres
// connection, PrismaService is stubbed just so nothing tries to open one via
// the @Global() PrismaModule.
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
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const questionRepository = new InMemoryChecklistQuestionRepository();
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
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, questionRepository };
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

describe('Checklist Questions (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('CRUD full lifecycle (tasks.md 5.8, checklist-question-management + checklist-question-admin-ui specs)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'cq-crud-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'cq-crud-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('the pool ships empty (spec: The Pool Ships Empty)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/checklist-questions').expect(200);

      expect(response.body).toEqual([]);
    });

    it('creates a question with elementType, frequencies and text (spec: Create Checklist Question)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['QUARTERLY', 'ANNUAL'],
          text: 'Check the pressure gauge',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        elementType: 'EXTINGUISHER',
        frequencies: ['QUARTERLY', 'ANNUAL'],
        text: 'Check the pressure gauge',
      });
      expect(response.body).toHaveProperty('id');
    });

    it('rejects a request with an empty frequencies array (spec: Empty frequencies set rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: [],
          text: 'No frequency question',
        })
        .expect(400);
    });

    it('rejects a request missing a required field', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .post('/checklist-questions')
        .send({
          frequencies: ['MONTHLY'],
          text: 'Missing elementType',
        })
        .expect(400);
    });

    it('lists active questions, excluding soft-deleted ones (spec: List Checklist Questions)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'Listed question',
        })
        .expect(201);
      const questionId = (created.body as QuestionResponseBody).id;

      const listBefore = await agent.get('/checklist-questions').expect(200);
      expect(
        (listBefore.body as QuestionResponseBody[]).some(
          (q) => q.id === questionId,
        ),
      ).toBe(true);

      await agent.delete(`/checklist-questions/${questionId}`).expect(204);

      const listAfter = await agent.get('/checklist-questions').expect(200);
      expect(
        (listAfter.body as QuestionResponseBody[]).some(
          (q) => q.id === questionId,
        ),
      ).toBe(false);
    });

    it("updates a question's text and frequencies, never elementType (spec: Update Checklist Question)", async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'Original text',
        })
        .expect(201);
      const questionId = (created.body as QuestionResponseBody).id;

      const response = await agent
        .patch(`/checklist-questions/${questionId}`)
        .send({ text: 'Updated text', frequencies: ['SEMIANNUAL'] })
        .expect(200);

      expect(response.body).toMatchObject({
        id: questionId,
        elementType: 'EXTINGUISHER',
        text: 'Updated text',
        frequencies: ['SEMIANNUAL'],
      });
    });

    it('returns 404 CHECKLIST_QUESTION_NOT_FOUND updating a non-existent question id', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch('/checklist-questions/does-not-exist')
        .send({ text: 'Ghost' })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });
    });

    it('returns 404 CHECKLIST_QUESTION_NOT_FOUND updating a soft-deleted question', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'Soon deleted question',
        })
        .expect(201);
      const questionId = (created.body as QuestionResponseBody).id;

      await agent.delete(`/checklist-questions/${questionId}`).expect(204);

      const response = await agent
        .patch(`/checklist-questions/${questionId}`)
        .send({ text: 'Should not apply' })
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });
    });

    it('soft-deletes a question, excluded from the list afterwards, and is NEVER blocked (spec: Soft-Delete Checklist Question Is Never Blocked)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const created = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'To delete question',
        })
        .expect(201);
      const questionId = (created.body as QuestionResponseBody).id;

      // No dependency-guard branch exists on this route at all — a fresh
      // question with zero references still deletes with a plain 204,
      // proving there is no blocking check to bypass.
      await agent.delete(`/checklist-questions/${questionId}`).expect(204);

      const list = await agent.get('/checklist-questions').expect(200);
      expect(
        (list.body as QuestionResponseBody[]).some((q) => q.id === questionId),
      ).toBe(false);
    });

    it('returns 404 CHECKLIST_QUESTION_NOT_FOUND deleting a missing or already soft-deleted question', async () => {
      const agent = await loginAgent(app, adminEmail);

      const missingResponse = await agent
        .delete('/checklist-questions/does-not-exist')
        .expect(404);
      expect(missingResponse.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });

      const created = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'Already deleted question',
        })
        .expect(201);
      const questionId = (created.body as QuestionResponseBody).id;
      await agent.delete(`/checklist-questions/${questionId}`).expect(204);

      const repeatResponse = await agent
        .delete(`/checklist-questions/${questionId}`)
        .expect(404);
      expect(repeatResponse.body).toMatchObject({
        statusCode: 404,
        code: 'CHECKLIST_QUESTION_NOT_FOUND',
      });
    });
  });

  describe('Duplicate text is allowed (tasks.md 5.8, spec: no uniqueness constraint on text)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'cq-dup-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'cq-dup-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('accepts two questions with identical text', async () => {
      const agent = await loginAgent(app, adminEmail);

      const first = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['MONTHLY'],
          text: 'Check the pressure gauge',
        })
        .expect(201);

      const second = await agent
        .post('/checklist-questions')
        .send({
          elementType: 'EXTINGUISHER',
          frequencies: ['ANNUAL'],
          text: 'Check the pressure gauge',
        })
        .expect(201);

      expect((first.body as QuestionResponseBody).id).not.toBe(
        (second.body as QuestionResponseBody).id,
      );

      const list = await agent.get('/checklist-questions').expect(200);
      const ids = (list.body as QuestionResponseBody[]).map((q) => q.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          (first.body as QuestionResponseBody).id,
          (second.body as QuestionResponseBody).id,
        ]),
      );
    });
  });

  describe('Anonymous and non-admin access control on every checklist-questions route (tasks.md 5.8, authorization spec)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'cq-guard-admin@example.com';
    const managerEmail = 'cq-guard-manager@example.com';
    const mcManagerEmail = 'cq-guard-mc-manager@example.com';
    const technicianEmail = 'cq-guard-technician@example.com';
    const representativeEmail = 'cq-guard-representative@example.com';
    const questionId = 'cq-guard-question-id';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'cq-guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const manager = await buildSeedUser({
        id: 'cq-guard-manager-id',
        email: managerEmail,
        role: 'MANAGER',
      });
      const mcManager = await buildSeedUser({
        id: 'cq-guard-mc-manager-id',
        email: mcManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      const technician = await buildSeedUser({
        id: 'cq-guard-technician-id',
        email: technicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const representative = await buildSeedUser({
        id: 'cq-guard-representative-id',
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
      ['POST', '/checklist-questions'],
      ['GET', '/checklist-questions'],
      ['PATCH', `/checklist-questions/${questionId}`],
      ['DELETE', `/checklist-questions/${questionId}`],
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
            frequencies: ['MONTHLY'],
            text: 'x',
          });
        case 'GET':
          return agent.get(path);
        case 'PATCH':
          return agent.patch(path).send({ text: 'x' });
        case 'DELETE':
          return agent.delete(path);
      }
    }

    // authorization spec: "Unauthenticated caller is rejected before role
    // check" — 401 on every checklist-questions route, no session cookie.
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
      await agent.get('/checklist-questions').expect(200);
    });
  });
});
