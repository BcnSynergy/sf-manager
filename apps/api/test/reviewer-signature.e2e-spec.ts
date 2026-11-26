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
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { FILE_STORAGE } from '../src/shared/application/ports/file-storage.port';
import { InMemoryFileStorage } from '../src/shared/testing/in-memory-file-storage';
import {
  jpegHeader,
  pngHeader,
  webpLossyHeader,
} from '../src/modules/organization-profile/domain/testing/logo-fixtures';
import { REVIEWER_SIGNATURE_REPOSITORY } from '../src/modules/reviewer-signature/application/ports/reviewer-signature.repository.port';
import { InMemoryReviewerSignatureRepository } from '../src/modules/reviewer-signature/application/use-cases/testing/in-memory-reviewer-signature.repository';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';

// reviewer-signature: hermetic, no real DB, like organization-profile's e2e
// (in-memory users, token stores, file storage and signature repository;
// PrismaService stubbed so nothing opens a connection).
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

const TECHNICIAN = {
  id: '019a0000-0000-7000-8000-000000000001',
  email: 'tech@example.com',
  role: 'MAINTENANCE_TECHNICIAN' as Role,
};
const TECHNICIAN_2 = {
  id: '019a0000-0000-7000-8000-000000000002',
  email: 'tech2@example.com',
  role: 'MAINTENANCE_TECHNICIAN' as Role,
};
const REPRESENTATIVE = {
  id: '019a0000-0000-7000-8000-000000000003',
  email: 'rep@example.com',
  role: 'COMMUNITY_REPRESENTATIVE' as Role,
};
const NON_SIGNERS = [
  {
    id: '019a0000-0000-7000-8000-000000000004',
    email: 'admin@example.com',
    role: 'SYSTEM_ADMIN' as Role,
  },
  {
    id: '019a0000-0000-7000-8000-000000000005',
    email: 'manager@example.com',
    role: 'MANAGER' as Role,
  },
  {
    id: '019a0000-0000-7000-8000-000000000006',
    email: 'companymgr@example.com',
    role: 'MAINTENANCE_COMPANY_MANAGER' as Role,
  },
];

async function buildUser(input: {
  id: string;
  email: string;
  role: Role;
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
  });
}

async function buildApp(): Promise<{
  app: INestApplication<App>;
  fileStorage: InMemoryFileStorage;
  signatures: InMemoryReviewerSignatureRepository;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const input of [
    TECHNICIAN,
    TECHNICIAN_2,
    REPRESENTATIVE,
    ...NON_SIGNERS,
  ]) {
    userRepository.seed(await buildUser(input));
  }
  const fileStorage = new InMemoryFileStorage();
  const signatures = new InMemoryReviewerSignatureRepository();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(new InMemoryTokenDenylist())
    .overrideProvider(REFRESH_TOKEN_STORE)
    .useFactory({ factory: () => new InMemoryRefreshTokenStore() })
    .overrideProvider(REVIEWER_SIGNATURE_REPOSITORY)
    .useValue(signatures)
    .overrideProvider(FILE_STORAGE)
    .useValue(fileStorage)
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
  await app.init();
  return { app, fileStorage, signatures };
}

async function loginAgent(app: INestApplication<App>, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .expect(200);
  return agent;
}

const PNG = pngHeader();
const JPEG = jpegHeader();
const WEBP = webpLossyHeader();
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
);
const TWO_MIB = 2 * 1024 * 1024;

describe('Reviewer signature (e2e, reviewer-signature)', () => {
  let app: INestApplication<App>;
  let fileStorage: InMemoryFileStorage;
  let signatures: InMemoryReviewerSignatureRepository;

  beforeAll(() => {
    // getAuthConfig() reads these when AuthModule compiles.
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-0123456789abcdef';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  beforeEach(async () => {
    ({ app, fileStorage, signatures } = await buildApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it('starts with no signature: status false and the image read is 404 SIGNATURE_NOT_FOUND', async () => {
    const agent = await loginAgent(app, TECHNICIAN.email);

    await agent
      .get('/me/signature')
      .expect(200)
      .expect({ hasSignature: false, updatedAt: null });
    const image = await agent.get('/me/signature/image').expect(404);
    expect(image.body).toMatchObject({ code: 'SIGNATURE_NOT_FOUND' });
  });

  it.each([
    ['PNG', PNG, 'image/png'],
    ['JPEG', JPEG, 'image/jpeg'],
    ['WebP', WEBP, 'image/webp'],
  ])(
    'stores a %s and serves it back sandboxed with its content type',
    async (_name, bytes, contentType) => {
      const agent = await loginAgent(app, TECHNICIAN.email);

      const upload = await agent
        .put('/me/signature')
        .attach('file', bytes, 'signature.bin')
        .expect(200);
      expect(upload.body).toMatchObject({
        hasSignature: true,
        updatedAt: expect.any(String) as unknown,
      });
      expect(JSON.stringify(upload.body)).not.toContain('signatures/');

      const status = await agent.get('/me/signature').expect(200);
      expect(status.body).toEqual(upload.body);

      const image = await agent
        .get('/me/signature/image')
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(image.headers['content-type']).toBe(contentType);
      expect(image.headers['cache-control']).toBe('no-store');
      expect(image.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox",
      );
      expect(image.headers['x-content-type-options']).toBe('nosniff');
      expect(image.body).toEqual(bytes);
    },
  );

  it('replaces the previous signature and keeps one stored file', async () => {
    const agent = await loginAgent(app, REPRESENTATIVE.email);
    await agent.put('/me/signature').attach('file', PNG, 'a.png').expect(200);

    await agent.put('/me/signature').attach('file', JPEG, 'b.jpg').expect(200);

    const image = await agent.get('/me/signature/image').expect(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(fileStorage.keys()).toHaveLength(1);
  });

  it("one technician's upload does not touch another's signature", async () => {
    const one = await loginAgent(app, TECHNICIAN.email);
    const two = await loginAgent(app, TECHNICIAN_2.email);
    await one.put('/me/signature').attach('file', PNG, 'a.png').expect(200);
    await two.put('/me/signature').attach('file', WEBP, 'b.webp').expect(200);

    await two.put('/me/signature').attach('file', JPEG, 'c.jpg').expect(200);

    const image = await one.get('/me/signature/image').expect(200);
    expect(image.headers['content-type']).toBe('image/png');
  });

  it.each([
    ['an SVG image', SVG],
    ['a GIF', Buffer.from('GIF89a\x01\x00')],
  ])(
    'rejects %s with 400 SIGNATURE_UNSUPPORTED_FORMAT and keeps the signature',
    async (_name, bytes) => {
      const agent = await loginAgent(app, TECHNICIAN.email);
      await agent.put('/me/signature').attach('file', PNG, 'a.png').expect(200);

      const response = await agent
        .put('/me/signature')
        .attach('file', bytes, 'b.png')
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'SIGNATURE_UNSUPPORTED_FORMAT',
      });
      const image = await agent.get('/me/signature/image').expect(200);
      expect(image.headers['content-type']).toBe('image/png');
      expect(fileStorage.keys()).toHaveLength(1);
    },
  );

  it('accepts exactly 2 MiB and rejects one byte more with 413 SIGNATURE_TOO_LARGE', async () => {
    const agent = await loginAgent(app, TECHNICIAN.email);
    const exact = Buffer.concat([PNG, Buffer.alloc(TWO_MIB - PNG.length)]);
    await agent.put('/me/signature').attach('file', exact, 'a.png').expect(200);

    const response = await agent
      .put('/me/signature')
      .attach('file', Buffer.concat([exact, Buffer.alloc(1)]), 'b.png')
      .expect(413);

    expect(response.body).toMatchObject({ code: 'SIGNATURE_TOO_LARGE' });
    expect(fileStorage.keys()).toHaveLength(1);
  });

  it('rejects a request without a file with 400 SIGNATURE_FILE_MISSING', async () => {
    const agent = await loginAgent(app, TECHNICIAN.email);

    const response = await agent.put('/me/signature').expect(400);

    expect(response.body).toMatchObject({ code: 'SIGNATURE_FILE_MISSING' });
    expect(fileStorage.keys()).toEqual([]);
  });

  // TD-44: multer does not take a malformed content type as multipart, so
  // the request carries no file.
  it('rejects a malformed multipart content type with 400 SIGNATURE_FILE_MISSING and keeps the signature', async () => {
    const agent = await loginAgent(app, TECHNICIAN.email);
    await agent.put('/me/signature').attach('file', JPEG, 'a.jpg').expect(200);
    const current = (await signatures.findByUserId(TECHNICIAN.id))?.storageKey;

    const response = await agent
      .put('/me/signature')
      .set('Content-Type', 'multipart/form-data; boundary')
      .send('not a form')
      .expect(400);

    expect(response.body).toMatchObject({ code: 'SIGNATURE_FILE_MISSING' });
    expect((await signatures.findByUserId(TECHNICIAN.id))?.storageKey).toBe(
      current,
    );
    expect(fileStorage.keys()).toEqual([current]);
  });

  // Same case list as the organization logo (EN-111, TD-44).
  it.each([
    [
      'the file in another field',
      (req: request.Test) => req.attach('other', PNG, 'a.png'),
    ],
    [
      'a second file',
      (req: request.Test) =>
        req.attach('file', PNG, 'a.png').attach('file', JPEG, 'b.jpg'),
    ],
    [
      'a text field next to the file',
      (req: request.Test) =>
        req.field('note', 'x').attach('file', PNG, 'a.png'),
    ],
    ['a text field alone', (req: request.Test) => req.field('note', 'x')],
    [
      'a multipart body without a boundary',
      (req: request.Test) =>
        req.set('Content-Type', 'multipart/form-data').send('not a form'),
    ],
    // TD-44: platform-express 12 answers this content type with a 415.
    [
      'a multipart type other than form-data',
      (req: request.Test) =>
        req
          .set('Content-Type', 'multipart/mixed; boundary=x')
          .send('--x--\r\n'),
    ],
  ])(
    'rejects %s with 400 SIGNATURE_UPLOAD_INVALID and keeps the signature',
    async (_name, build) => {
      const agent = await loginAgent(app, TECHNICIAN.email);
      await agent
        .put('/me/signature')
        .attach('file', JPEG, 'current.jpg')
        .expect(200);
      const current = (await signatures.findByUserId(TECHNICIAN.id))
        ?.storageKey;

      const response = await build(agent.put('/me/signature')).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'SIGNATURE_UPLOAD_INVALID',
      });
      expect((await signatures.findByUserId(TECHNICIAN.id))?.storageKey).toBe(
        current,
      );
      expect(fileStorage.keys()).toEqual([current]);
    },
  );

  it.each(NON_SIGNERS)(
    'answers 403 to a $role on every route and stores nothing',
    async ({ id, email }) => {
      const agent = await loginAgent(app, email);

      await agent.get('/me/signature').expect(403);
      await agent.get('/me/signature/image').expect(403);
      await agent.put('/me/signature').attach('file', PNG, 'a.png').expect(403);

      expect(fileStorage.keys()).toEqual([]);
      expect(await signatures.findByUserId(id)).toBeNull();
    },
  );

  it('answers 401 without a session', async () => {
    const server = app.getHttpServer();

    await request(server).get('/me/signature').expect(401);
    await request(server).get('/me/signature/image').expect(401);
    await request(server)
      .put('/me/signature')
      .attach('file', PNG, 'a.png')
      .expect(401);
  });
});
