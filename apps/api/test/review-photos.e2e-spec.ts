import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { LOGIN_FAILURE_LIMITER } from '../src/modules/auth/application/ports/login-failure-limiter.port';
import { InMemoryLoginFailureLimiter } from '../src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter';
import { getLoginEmailRateLimitConfig } from '../src/modules/auth/infrastructure/config/login-rate-limit.config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../src/modules/auth/application/ports/token-denylist.port';
import { REFRESH_TOKEN_STORE } from '../src/modules/auth/application/ports/refresh-token-store.port';
import { InMemoryRefreshTokenStore } from '../src/modules/auth/application/services/testing/in-memory-refresh-token-store';
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
import { REVIEW_PHOTO_REPOSITORY } from '../src/modules/review-session/application/ports/review-photo.repository.port';
import { InMemoryReviewPhotoRepository } from '../src/modules/review-session/application/use-cases/testing/in-memory-review-photo.repository';
import { FILE_STORAGE } from '../src/shared/application/ports/file-storage.port';
import { InMemoryFileStorage } from '../src/shared/testing/in-memory-file-storage';
import {
  jpegHeader,
  pngHeader,
} from '../src/modules/organization-profile/domain/testing/logo-fixtures';
import { REVIEW_PHOTO_MAX_BYTES } from '../src/modules/review-session/domain/review-photo';
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
  sessionRepository: InMemoryReviewSessionRepository;
  photoRepository: InMemoryReviewPhotoRepository;
  fileStorage: InMemoryFileStorage;
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
  const sessionRepository = new InMemoryReviewSessionRepository();
  const photoRepository = new InMemoryReviewPhotoRepository(sessionRepository);
  const fileStorage = new InMemoryFileStorage();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(new InMemoryTokenDenylist())
    .overrideProvider(REFRESH_TOKEN_STORE)
    .useFactory({ factory: () => new InMemoryRefreshTokenStore() })
    .overrideProvider(CHECKLIST_QUESTION_REPOSITORY)
    .useValue(questionRepository)
    .overrideProvider(REVIEW_TEMPLATE_REPOSITORY)
    .useValue(templateRepository)
    .overrideProvider(DRAFT_SELECTION_CLEANER)
    .useValue(new InMemoryDraftSelectionCleaner())
    .overrideProvider(COMMUNITY_REPOSITORY)
    .useValue(new InMemoryCommunityRepository())
    .overrideProvider(COMMUNITY_TECHNICIAN_REPOSITORY)
    .useValue(new InMemoryCommunityTechnicianRepository())
    .overrideProvider(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    .useValue(new InMemoryCommunityRepresentativeRepository())
    .overrideProvider(INSPECTABLE_ELEMENT_COUNTER)
    .useValue(new FakeInspectableElementCounter())
    .overrideProvider(INSPECTABLE_ELEMENT_REPOSITORY)
    .useValue(new InMemoryInspectableElementRepository())
    .overrideProvider(REVIEW_SESSION_REPOSITORY)
    .useValue(sessionRepository)
    .overrideProvider(REVIEW_PHOTO_REPOSITORY)
    .useValue(photoRepository)
    .overrideProvider(FILE_STORAGE)
    .useValue(fileStorage)
    .overrideProvider(USER_DIRECTORY)
    .useValue(new InMemoryUserRepositoryBackedUserDirectory(userRepository))
    .overrideProvider(ThrottlerStorage)
    .useFactory({ factory: () => new ThrottlerStorageService() })
    .overrideProvider(LOGIN_FAILURE_LIMITER)
    .useFactory({
      factory: () =>
        new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()),
    })
    .overrideProvider(PrismaService)
    .useValue({
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    })
    .compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, sessionRepository, photoRepository, fileStorage };
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

function jpegOfSize(bytes: number): Buffer {
  const header = jpegHeader();
  return Buffer.concat([header, Buffer.alloc(bytes - header.length)]);
}

const JPEG_UPLOAD = { filename: 'photo.jpg', contentType: 'image/jpeg' };

// EN-164 S1-S4 (review-session-management: "Photos of a Draft Review
// Session"): upload / list / read / delete for the performer of a draft,
// the limits, the draft-only rule and the cleanup on discard.
describe('Review photos (e2e)', () => {
  let built: BuiltApp;
  const adminEmail = 'rp-admin@example.com';
  const techEmail = 'rp-tech@example.com';
  const tech2Email = 'rp-tech2@example.com';
  const tech3Email = 'rp-tech3@example.com';
  let tech: Agent;
  let tech2: Agent;
  let tech3: Agent;
  let admin: Agent;
  let communityId: string;
  let elementA: ElementBody;
  let elementB: ElementBody;
  let foreignElement: ElementBody;
  let completionElement: ElementBody;
  let completionCommunityId: string;
  let questionId: string;
  let templateId: string;
  let session: SessionBody;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-0123456789abcdef';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';

    built = await buildApp({
      users: [
        await buildSeedUser({
          id: 'rp-admin-id',
          email: adminEmail,
          role: 'SYSTEM_ADMIN',
        }),
        await buildSeedUser({
          id: 'rp-tech-id',
          email: techEmail,
          role: 'MAINTENANCE_TECHNICIAN',
        }),
        await buildSeedUser({
          id: 'rp-tech2-id',
          email: tech2Email,
          role: 'MAINTENANCE_TECHNICIAN',
        }),
        await buildSeedUser({
          id: 'rp-tech3-id',
          email: tech3Email,
          role: 'MAINTENANCE_TECHNICIAN',
        }),
      ],
    });
    admin = await loginAgent(built.app, adminEmail);
    const community = await createCommunity(admin, 'Photos community');
    communityId = community.id;
    await assignTechnician(admin, communityId, 'rp-tech-id');
    await assignTechnician(admin, communityId, 'rp-tech2-id');
    elementA = await createElement(admin, communityId, 'Extinguisher A');
    elementB = await createElement(admin, communityId, 'Extinguisher B');

    const foreignCommunity = await createCommunity(admin, 'Foreign community');
    foreignElement = await createElement(
      admin,
      foreignCommunity.id,
      'Foreign extinguisher',
    );

    // tech3 completes a one-element community.
    const completionCommunity = await createCommunity(
      admin,
      'Completion community',
    );
    completionCommunityId = completionCommunity.id;
    await assignTechnician(admin, completionCommunityId, 'rp-tech3-id');
    completionElement = await createElement(
      admin,
      completionCommunityId,
      'Completion extinguisher',
    );

    questionId = (await createQuestion(admin, 'Is the seal intact?')).id;
    templateId = (
      await createActiveTemplate(admin, 'Photos template', [questionId])
    ).id;

    tech = await loginAgent(built.app, techEmail);
    tech2 = await loginAgent(built.app, tech2Email);
    tech3 = await loginAgent(built.app, tech3Email);
    session = await openSession(tech, communityId, templateId);
  });

  afterAll(async () => {
    await built.app.close();
  });

  const photosUrl = (sessionId: string, elementId: string) =>
    `/review-sessions/${sessionId}/elements/${elementId}/photos`;
  const photoUrl = (sessionId: string, photoId: string) =>
    `/review-sessions/${sessionId}/photos/${photoId}`;

  function upload(
    agent: Agent,
    sessionId: string,
    elementId: string,
    content: Buffer = jpegHeader(),
  ) {
    return agent
      .post(photosUrl(sessionId, elementId))
      .attach('file', content, JPEG_UPLOAD);
  }

  describe('upload, list, read (S1, S2)', () => {
    it('stores a JPEG for the element: 201 { id, createdAt } without a storage key, one file, one row', async () => {
      const content = jpegHeader();
      const response = await upload(
        tech,
        session.id,
        elementA.id,
        content,
      ).expect(201);

      const body = response.body as { id: string; createdAt: string };
      expect(Object.keys(body).sort()).toEqual(['createdAt', 'id']);
      expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
      expect(built.fileStorage.keys()).toEqual([
        `review-photos/${body.id}.jpg`,
      ]);
      expect(built.photoRepository.all()).toHaveLength(1);
      expect(built.photoRepository.all()[0]).toMatchObject({
        id: body.id,
        reviewSessionId: session.id,
        inspectableElementId: elementA.id,
        sizeBytes: content.length,
      });
    });

    it('lists the element photos as [{ id, createdAt }] and nothing for another element', async () => {
      const listed = await tech
        .get(photosUrl(session.id, elementA.id))
        .expect(200);
      const rows = listed.body as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]).sort()).toEqual(['createdAt', 'id']);

      const other = await tech
        .get(photosUrl(session.id, elementB.id))
        .expect(200);
      expect(other.body).toEqual([]);
    });

    it('serves the bytes as image/jpeg with the no-store, sandbox and nosniff headers', async () => {
      const listed = await tech
        .get(photosUrl(session.id, elementA.id))
        .expect(200);
      const [{ id }] = listed.body as Array<{ id: string }>;

      const response = await tech
        .get(photoUrl(session.id, id))
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox",
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect((response.body as Buffer).equals(jpegHeader())).toBe(true);
    });

    it('answers 404 REVIEW_PHOTO_NOT_FOUND for an unknown photo id', async () => {
      const response = await tech
        .get(photoUrl(session.id, '0192f0c0-0000-7000-8000-000000000000'))
        .expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
    });
  });

  describe('rules (S2)', () => {
    it('rejects the 4th photo of an element with 409 REVIEW_PHOTO_LIMIT_REACHED and leaves no file behind', async () => {
      const element = await createElement(admin, communityId, 'Limit element');
      const before = built.fileStorage.keys().length;
      for (let i = 0; i < 3; i++) {
        await upload(tech, session.id, element.id).expect(201);
      }

      const response = await upload(tech, session.id, element.id).expect(409);

      expect(response.body).toMatchObject({
        code: 'REVIEW_PHOTO_LIMIT_REACHED',
      });
      expect(built.fileStorage.keys()).toHaveLength(before + 3);
      expect(
        built.photoRepository
          .all()
          .filter((photo) => photo.inspectableElementId === element.id),
      ).toHaveLength(3);
    });

    // Not concurrency coverage: the in-memory repository is synchronous, so
    // this only checks the HTTP outcomes of five requests in a row. The real
    // race is prisma-review-photo.repository.integration.spec.ts.
    it('answers 201 three times and 409 twice for five uploads of one element sent together (in-memory repository)', async () => {
      const element = await createElement(admin, communityId, 'Race element');
      const before = built.fileStorage.keys().length;

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => upload(tech, session.id, element.id)),
      );

      expect(
        responses.filter((response) => response.status === 201),
      ).toHaveLength(3);
      expect(
        responses.filter((response) => response.status === 409),
      ).toHaveLength(2);
      expect(built.fileStorage.keys()).toHaveLength(before + 3);
    });

    it('rejects a PNG declared as image/jpeg with 400 REVIEW_PHOTO_UNSUPPORTED_FORMAT and stores nothing', async () => {
      const before = built.fileStorage.keys().length;
      const response = await upload(
        tech,
        session.id,
        elementB.id,
        pngHeader(),
      ).expect(400);

      expect(response.body).toMatchObject({
        code: 'REVIEW_PHOTO_UNSUPPORTED_FORMAT',
      });
      expect(built.fileStorage.keys()).toHaveLength(before);
    });

    it('rejects a file over 2 MiB with 413 REVIEW_PHOTO_TOO_LARGE and stores nothing', async () => {
      const before = built.fileStorage.keys().length;
      const response = await upload(
        tech,
        session.id,
        elementB.id,
        jpegOfSize(REVIEW_PHOTO_MAX_BYTES + 1),
      ).expect(413);

      expect(response.body).toMatchObject({ code: 'REVIEW_PHOTO_TOO_LARGE' });
      expect(built.fileStorage.keys()).toHaveLength(before);
    });

    it('accepts a file of exactly 2 MiB', async () => {
      const element = await createElement(admin, communityId, 'Exact element');
      await upload(
        tech,
        session.id,
        element.id,
        jpegOfSize(REVIEW_PHOTO_MAX_BYTES),
      ).expect(201);
    });

    it('answers 400 REVIEW_PHOTO_FILE_MISSING without a multipart file', async () => {
      const response = await tech
        .post(photosUrl(session.id, elementB.id))
        .type('form')
        .send({})
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'REVIEW_PHOTO_FILE_MISSING',
      });
    });

    it('answers 400 REVIEW_PHOTO_UPLOAD_INVALID for a text field next to the file', async () => {
      const response = await tech
        .post(photosUrl(session.id, elementB.id))
        .field('note', 'hello')
        .attach('file', jpegHeader(), JPEG_UPLOAD)
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'REVIEW_PHOTO_UPLOAD_INVALID',
      });
    });

    it('lists no photos for an element of another community or an unknown element', async () => {
      for (const id of [
        foreignElement.id,
        '0192f0c0-0000-7000-8000-000000000000',
      ]) {
        const response = await tech.get(photosUrl(session.id, id)).expect(200);
        expect(response.body).toEqual([]);
      }
    });

    it('answers 404 ELEMENT_NOT_FOUND for an element of another community and for an unknown element', async () => {
      const before = built.fileStorage.keys().length;
      for (const id of [
        foreignElement.id,
        '0192f0c0-0000-7000-8000-000000000000',
      ]) {
        const response = await upload(tech, session.id, id).expect(404);
        expect(response.body).toMatchObject({ code: 'ELEMENT_NOT_FOUND' });
      }
      expect(built.fileStorage.keys()).toHaveLength(before);
    });

    it('answers 400 for malformed ids', async () => {
      const bad = await upload(tech, 'nope', elementA.id).expect(400);
      expect(bad.body).toMatchObject({ code: 'INVALID_SESSION_ID' });
      const badElement = await upload(tech, session.id, 'nope').expect(400);
      expect(badElement.body).toMatchObject({ code: 'INVALID_ELEMENT_ID' });
      const badPhoto = await tech.get(photoUrl(session.id, 'nope')).expect(400);
      expect(badPhoto.body).toMatchObject({ code: 'INVALID_PHOTO_ID' });
      const badDelete = await tech
        .delete(photoUrl(session.id, 'nope'))
        .expect(400);
      expect(badDelete.body).toMatchObject({ code: 'INVALID_PHOTO_ID' });
    });
  });

  describe('permissions (S3)', () => {
    let photoId: string;

    beforeAll(async () => {
      const element = await createElement(admin, communityId, 'Perm element');
      const response = await upload(tech, session.id, element.id).expect(201);
      photoId = (response.body as { id: string }).id;
    });

    it("answers 404 REVIEW_SESSION_NOT_FOUND on every route to another performer's session and changes nothing", async () => {
      const before = built.fileStorage.keys();
      const rows = built.photoRepository.all().length;
      const checks = [
        await upload(tech2, session.id, elementA.id),
        await tech2.get(photosUrl(session.id, elementA.id)),
        await tech2.get(photoUrl(session.id, photoId)),
        await tech2.delete(photoUrl(session.id, photoId)),
      ];
      for (const response of checks) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          code: 'REVIEW_SESSION_NOT_FOUND',
        });
      }
      expect(built.fileStorage.keys()).toEqual(before);
      expect(built.photoRepository.all()).toHaveLength(rows);
    });

    it('answers 401 without a session and 403 to a role without reviewSession:perform', async () => {
      const anon = request(built.app.getHttpServer());
      await anon.get(photosUrl(session.id, elementA.id)).expect(401);
      await anon.get(photoUrl(session.id, photoId)).expect(401);
      await anon.delete(photoUrl(session.id, photoId)).expect(401);
      await anon
        .post(photosUrl(session.id, elementA.id))
        .attach('file', jpegHeader(), JPEG_UPLOAD)
        .expect(401);

      await admin.get(photosUrl(session.id, elementA.id)).expect(403);
      await admin.get(photoUrl(session.id, photoId)).expect(403);
      await admin.delete(photoUrl(session.id, photoId)).expect(403);
      await admin
        .post(photosUrl(session.id, elementA.id))
        .attach('file', jpegHeader(), JPEG_UPLOAD)
        .expect(403);
    });

    it('does not serve a photo through another session of the same performer', async () => {
      // tech2 has their own draft in the same community.
      const own = await openSession(tech2, communityId, templateId);
      const response = await tech2.get(photoUrl(own.id, photoId)).expect(404);
      expect(response.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
      await tech2.delete(`/review-sessions/${own.id}`).expect(204);
    });

    it('does not serve or delete a photo of S1 through S2 of the SAME performer', async () => {
      // tech holds S1 (community 1) and opens S2 in a community of its own,
      // which no other test uses, so the assignment cannot leak into them
      // (EN-225). The finally discards S2 even when an assertion fails.
      const secondCommunity = await createCommunity(
        admin,
        'Second session community',
      );
      await assignTechnician(admin, secondCommunity.id, 'rp-tech-id');
      const second = await openSession(tech, secondCommunity.id, templateId);
      try {
        const keys = built.fileStorage.keys();

        const read = await tech.get(photoUrl(second.id, photoId)).expect(404);
        expect(read.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
        const removed = await tech
          .delete(photoUrl(second.id, photoId))
          .expect(404);
        expect(removed.body).toMatchObject({
          code: 'REVIEW_PHOTO_NOT_FOUND',
        });

        expect(built.fileStorage.keys()).toEqual(keys);
        await tech.get(photoUrl(session.id, photoId)).expect(200);
      } finally {
        await tech.delete(`/review-sessions/${second.id}`).expect(204);
      }
    });
  });

  describe('delete (S3) and draft-only (S3)', () => {
    it('removes the row and the file with 204, then 404 REVIEW_PHOTO_NOT_FOUND', async () => {
      const element = await createElement(admin, communityId, 'Delete element');
      const created = await upload(tech, session.id, element.id).expect(201);
      const id = (created.body as { id: string }).id;
      expect(built.fileStorage.keys()).toContain(`review-photos/${id}.jpg`);

      await tech.delete(photoUrl(session.id, id)).expect(204);

      expect(built.fileStorage.keys()).not.toContain(`review-photos/${id}.jpg`);
      expect(
        built.photoRepository.all().map((photo) => photo.id),
      ).not.toContain(id);
      const again = await tech.delete(photoUrl(session.id, id)).expect(404);
      expect(again.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
      const listed = await tech.get(photosUrl(session.id, element.id));
      expect(listed.body).toEqual([]);
    });

    it('answers 409 REVIEW_SESSION_NOT_EDITABLE to upload and delete on a completed session and keeps its photo', async () => {
      const completionSession = await openSession(
        tech3,
        completionCommunityId,
        templateId,
      );
      const created = await upload(
        tech3,
        completionSession.id,
        completionElement.id,
      ).expect(201);
      const id = (created.body as { id: string }).id;
      await tech3
        .put(
          `/review-sessions/${completionSession.id}/entries/${completionElement.id}`,
        )
        .send({ answers: [{ questionId, value: 'YES' }] })
        .expect(200);
      await tech3
        .post(`/review-sessions/${completionSession.id}/complete`)
        .expect(200);
      const keys = built.fileStorage.keys();

      const uploaded = await upload(
        tech3,
        completionSession.id,
        completionElement.id,
      ).expect(409);
      expect(uploaded.body).toMatchObject({
        code: 'REVIEW_SESSION_NOT_EDITABLE',
      });
      const deleted = await tech3
        .delete(photoUrl(completionSession.id, id))
        .expect(409);
      expect(deleted.body).toMatchObject({
        code: 'REVIEW_SESSION_NOT_EDITABLE',
      });

      expect(built.fileStorage.keys()).toEqual(keys);
      expect(
        built.photoRepository
          .all()
          .filter((photo) => photo.reviewSessionId === completionSession.id),
      ).toHaveLength(1);

      // The performer still lists and reads it (S3: any status).
      const listed = await tech3
        .get(photosUrl(completionSession.id, completionElement.id))
        .expect(200);
      expect(
        (listed.body as Array<{ id: string }>).map((row) => row.id),
      ).toEqual([id]);
      await tech3.get(photoUrl(completionSession.id, id)).expect(200);
    });
  });

  describe('discard (S4)', () => {
    it('deletes the files of a discarded draft, keeps other sessions files, and the session is gone (204)', async () => {
      const own = await openSession(tech2, communityId, templateId);
      const first = await upload(tech2, own.id, elementA.id).expect(201);
      const second = await upload(tech2, own.id, elementB.id).expect(201);
      const ids = [first, second].map(
        (response) => (response.body as { id: string }).id,
      );
      const othersKeys = built.fileStorage
        .keys()
        .filter((key) => !ids.some((id) => key.includes(id)));
      expect(built.fileStorage.keys()).toHaveLength(othersKeys.length + 2);

      await tech2.delete(`/review-sessions/${own.id}`).expect(204);

      expect(built.fileStorage.keys()).toEqual(othersKeys);
      expect(
        built.photoRepository
          .all()
          .filter((photo) => photo.reviewSessionId === own.id),
      ).toHaveLength(0);
      await tech2.get(`/review-sessions/${own.id}`).expect(404);
    });

    it('still discards a draft without photos with 204 and removes it', async () => {
      const own = await openSession(tech2, communityId, templateId);
      const keys = built.fileStorage.keys();

      await tech2.delete(`/review-sessions/${own.id}`).expect(204);

      await tech2.get(`/review-sessions/${own.id}`).expect(404);
      expect(built.fileStorage.keys()).toEqual(keys);
      expect(built.sessionRepository.statusOf(own.id)).toBeUndefined();
    });
  });

  // EN-164 S3/S5 (T3): the photos of a completed review, read through the
  // review history with the history's own gate.
  describe('review history (S3, S5)', () => {
    const historyPhotosUrl = (sessionId: string) =>
      `/review-history/${sessionId}/photos`;
    const historyPhotoUrl = (sessionId: string, photoId: string) =>
      `/review-history/${sessionId}/photos/${photoId}`;
    let completed: SessionBody;
    let photoId: string;
    let draft: SessionBody;
    let draftPhotoId: string;

    beforeAll(async () => {
      completed = await openSession(tech3, completionCommunityId, templateId);
      const created = await upload(
        tech3,
        completed.id,
        completionElement.id,
      ).expect(201);
      photoId = (created.body as { id: string }).id;
      await tech3
        .put(`/review-sessions/${completed.id}/entries/${completionElement.id}`)
        .send({ answers: [{ questionId, value: 'YES' }] })
        .expect(200);
      await tech3.post(`/review-sessions/${completed.id}/complete`).expect(200);

      draft = await openSession(tech3, completionCommunityId, templateId);
      const draftCreated = await upload(
        tech3,
        draft.id,
        completionElement.id,
      ).expect(201);
      draftPhotoId = (draftCreated.body as { id: string }).id;
    });

    afterAll(async () => {
      await tech3.delete(`/review-sessions/${draft.id}`).expect(204);
    });

    it('lists the photos of a completed review as [{ id, inspectableElementId, createdAt }] to its performer and to an admin', async () => {
      for (const agent of [tech3, admin]) {
        const response = await agent
          .get(historyPhotosUrl(completed.id))
          .expect(200);
        const rows = response.body as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(1);
        expect(Object.keys(rows[0]).sort()).toEqual([
          'createdAt',
          'id',
          'inspectableElementId',
        ]);
        expect(rows[0]).toMatchObject({
          id: photoId,
          inspectableElementId: completionElement.id,
        });
        expect(Number.isNaN(Date.parse(String(rows[0].createdAt)))).toBe(false);
      }
    });

    it('serves the bytes as image/jpeg with the no-store, sandbox and nosniff headers', async () => {
      const response = await admin
        .get(historyPhotoUrl(completed.id, photoId))
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox",
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.body).toEqual(jpegHeader());
    });

    it('answers 404 REVIEW_SESSION_NOT_FOUND to a caller outside the history scope, as the detail read does', async () => {
      const checks = [
        await tech.get(`/review-history/${completed.id}`),
        await tech.get(historyPhotosUrl(completed.id)),
        await tech.get(historyPhotoUrl(completed.id, photoId)),
      ];
      for (const response of checks) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          code: 'REVIEW_SESSION_NOT_FOUND',
        });
      }
    });

    it('answers 404 REVIEW_SESSION_NOT_FOUND for a draft, even to its performer', async () => {
      const checks = [
        await tech3.get(historyPhotosUrl(draft.id)),
        await tech3.get(historyPhotoUrl(draft.id, draftPhotoId)),
      ];
      for (const response of checks) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({
          code: 'REVIEW_SESSION_NOT_FOUND',
        });
      }
    });

    it('answers 404 REVIEW_PHOTO_NOT_FOUND for a photo of another session and an unknown photo', async () => {
      const foreign = await tech3
        .get(historyPhotoUrl(completed.id, draftPhotoId))
        .expect(404);
      expect(foreign.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
      const unknown = await tech3
        .get(
          historyPhotoUrl(completed.id, '01900000-0000-7000-8000-000000000000'),
        )
        .expect(404);
      expect(unknown.body).toMatchObject({ code: 'REVIEW_PHOTO_NOT_FOUND' });
    });

    it('answers 400 for malformed ids and 401 without a session', async () => {
      const badSession = await admin
        .get(historyPhotosUrl('not-a-uuid'))
        .expect(400);
      expect(badSession.body).toMatchObject({ code: 'INVALID_SESSION_ID' });
      const badPhoto = await admin
        .get(historyPhotoUrl(completed.id, 'not-a-uuid'))
        .expect(400);
      expect(badPhoto.body).toMatchObject({ code: 'INVALID_PHOTO_ID' });

      const anon = request(built.app.getHttpServer());
      await anon.get(historyPhotosUrl(completed.id)).expect(401);
      await anon.get(historyPhotoUrl(completed.id, photoId)).expect(401);
    });
  });
});
