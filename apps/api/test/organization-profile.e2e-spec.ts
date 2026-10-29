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
import { ORGANIZATION_PROFILE_REPOSITORY } from '../src/modules/organization-profile/application/ports/organization-profile.repository.port';
import { InMemoryOrganizationProfileRepository } from '../src/modules/organization-profile/application/use-cases/testing/in-memory-organization-profile.repository';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { FILE_STORAGE } from '../src/shared/application/ports/file-storage.port';
import { InMemoryFileStorage } from '../src/shared/testing/in-memory-file-storage';
import {
  jpegHeader,
  pngHeader,
  webpLossyHeader,
} from '../src/modules/organization-profile/domain/testing/logo-fixtures';
import { User } from '../src/modules/users/domain/user.entity';
import type { Role } from '../src/modules/users/domain/role';

// design.md Testing Strategy (E2E row) + tasks.md 4.x: hermetic, no real DB —
// mirrors test/maintenance-company.e2e-spec.ts's / test/community.e2e-spec.ts's
// in-memory-fake pattern (USER_REPOSITORY, TOKEN_DENYLIST and
// ORGANIZATION_PROFILE_REPOSITORY overridden; PrismaService stubbed only so
// nothing tries to open a real DB connection via the @Global() PrismaModule).
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
    maintenanceCompanyId: null,
  });
}

// Builds a fully isolated Nest app + in-memory repositories per test group —
// mirrors test/maintenance-company.e2e-spec.ts's buildApp isolation rationale.
async function buildApp(seed: { users?: User[] } = {}): Promise<{
  app: INestApplication<App>;
  organizationProfileRepository: InMemoryOrganizationProfileRepository;
  fileStorage: InMemoryFileStorage;
}> {
  const userRepository = new InMemoryUserRepository();
  for (const user of seed.users ?? []) {
    userRepository.seed(user);
  }

  const tokenDenylist = new InMemoryTokenDenylist();
  const organizationProfileRepository =
    new InMemoryOrganizationProfileRepository();
  const fileStorage = new InMemoryFileStorage();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(USER_REPOSITORY)
    .useValue(userRepository)
    .overrideProvider(TOKEN_DENYLIST)
    .useValue(tokenDenylist)
    .overrideProvider(ORGANIZATION_PROFILE_REPOSITORY)
    .useValue(organizationProfileRepository)
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
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.init();

  return { app, organizationProfileRepository, fileStorage };
}

const PNG_BYTES = pngHeader();
const JPEG_BYTES = jpegHeader();
const WEBP_BYTES = webpLossyHeader();

async function loginAgent(app: INestApplication<App>, email: string) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .expect(200);
  return agent;
}

describe('Organization Profile (e2e)', () => {
  beforeAll(() => {
    // getAuthConfig() (auth.config.ts) runs at module-compile time once
    // AuthModule is part of the graph — must be set before the first
    // Test.createTestingModule(...).compile() call below.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.JWT_EXPIRES_IN = '2h';
  });

  describe('GET /organization-profile (tasks.md 4.1, spec: Read the Organization Profile)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'op-get-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'op-get-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with all six fields blank on the freshly seeded profile, and never 404s (spec: The blank seeded profile reads successfully / The read never reports the profile as missing)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/organization-profile').expect(200);

      expect(response.body).toMatchObject({
        name: '',
        legalName: '',
        taxId: '',
        address: '',
        phone: '',
        email: '',
      });
      expect(response.body).toHaveProperty('id');
    });

    it('carries no complete/incomplete flag (spec: The response carries no completeness flag)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/organization-profile').expect(200);

      expect(response.body).not.toHaveProperty('complete');
      expect(response.body).not.toHaveProperty('incomplete');
    });

    it('never returns a logoAssetId key, in any form (spec: The field is absent from the read response)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/organization-profile').expect(200);

      expect(response.body).not.toHaveProperty('logoAssetId');
    });

    it('reads back stored values after an update, still never 404ing (spec: A filled profile reads back its stored values)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/organization-profile')
        .send({ name: 'Acme Property Management' })
        .expect(200);

      const response = await agent.get('/organization-profile').expect(200);

      expect(response.body).toMatchObject({ name: 'Acme Property Management' });
    });
  });

  describe('PATCH /organization-profile subset semantics (tasks.md 4.2, spec: Partial Update / An Update That Changes Nothing Succeeds)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'op-patch-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'op-patch-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('updates only the supplied fields, leaving the rest unchanged (spec: A subset is updated and the rest is untouched)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/organization-profile')
        .send({
          name: 'Distinct Name',
          legalName: 'Distinct Legal Name',
          taxId: 'B12345678',
          address: 'Distinct Address',
          phone: '+34600000000',
          email: 'contact@distinct.example',
        })
        .expect(200);

      const response = await agent
        .patch('/organization-profile')
        .send({ name: 'New Name', email: 'new@distinct.example' })
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'New Name',
        email: 'new@distinct.example',
        legalName: 'Distinct Legal Name',
        taxId: 'B12345678',
        address: 'Distinct Address',
        phone: '+34600000000',
      });
    });

    it('stores supplied values trimmed (spec: Values are stored trimmed)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch('/organization-profile')
        .send({ name: '  Padded Name  ' })
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Padded Name' });
    });

    it('accepts any non-blank taxId with no format rule (spec: taxId takes any non-blank text)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch('/organization-profile')
        .send({ taxId: 'not-a-valid-nif-or-cif' })
        .expect(200);

      expect(response.body).toMatchObject({ taxId: 'not-a-valid-nif-or-cif' });
    });

    it('accepts an empty body and returns the unchanged profile with 200 (spec: An empty body succeeds and changes nothing)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await agent.get('/organization-profile').expect(200);
      const after = await agent
        .patch('/organization-profile')
        .send({})
        .expect(200);

      expect(after.body).toEqual(before.body);
    });

    it('accepts identical values and returns 200 unchanged (spec: Re-sending the same values succeeds)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await agent.get('/organization-profile').expect(200);
      const bodyBefore = before.body as { name: string };
      const after = await agent
        .patch('/organization-profile')
        .send({ name: bodyBefore.name })
        .expect(200);

      expect(after.body).toEqual(before.body);
    });

    it('accepts a body with only unrecognized properties and persists nothing from them (spec: Unrecognized properties are ignored, not persisted)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const before = await agent.get('/organization-profile').expect(200);
      const after = await agent
        .patch('/organization-profile')
        .send({ favoriteColor: 'blue', extra: 42 })
        .expect(200);

      expect(after.body).toEqual(before.body);
      expect(after.body).not.toHaveProperty('favoriteColor');
      expect(after.body).not.toHaveProperty('extra');
    });
  });

  describe('PATCH /organization-profile validation edge cases (tasks.md 4.3, spec: A Supplied Field Must Be Non-Blank)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'op-validate-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'op-validate-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejects an empty string field with 400 and changes nothing (spec: An empty string is rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const before = await agent.get('/organization-profile').expect(200);

      await agent.patch('/organization-profile').send({ name: '' }).expect(400);

      const after = await agent.get('/organization-profile').expect(200);
      expect(after.body).toEqual(before.body);
    });

    it('rejects a whitespace-only field with 400 and changes nothing (spec: A whitespace-only value is rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const before = await agent.get('/organization-profile').expect(200);

      await agent
        .patch('/organization-profile')
        .send({ legalName: '   ' })
        .expect(400);

      const after = await agent.get('/organization-profile').expect(200);
      expect(after.body).toEqual(before.body);
    });

    it('rejects an explicit null, not treated as a clear, leaving the previous value intact (spec: An explicit null is rejected, not treated as a clear)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .patch('/organization-profile')
        .send({ phone: '+34600000001' })
        .expect(200);

      await agent
        .patch('/organization-profile')
        .send({ phone: null })
        .expect(400);

      const after = await agent.get('/organization-profile').expect(200);
      expect(after.body).toMatchObject({ phone: '+34600000001' });
    });

    it('rejects a partially invalid body, leaving even the valid sibling field unchanged (spec: A partially invalid update writes nothing)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const before = await agent.get('/organization-profile').expect(200);

      await agent
        .patch('/organization-profile')
        .send({ name: 'Should Not Persist', email: '' })
        .expect(400);

      const after = await agent.get('/organization-profile').expect(200);
      expect(after.body).toEqual(before.body);
    });
  });

  describe('No create/delete/:id surface (tasks.md 4.4, spec: The Profile Has No Create and No Delete Surface / logoAssetId Is Reserved)', () => {
    let app: INestApplication<App>;
    const adminEmail = 'op-surface-admin@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'op-surface-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app } = await buildApp({ users: [admin] }));
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not resolve POST /organization-profile to a profile operation (spec: A create or delete attempt does not reach a profile operation)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .post('/organization-profile')
        .send({ name: 'Should Not Create' });

      expect([404, 405]).toContain(response.status);
    });

    it('does not resolve DELETE /organization-profile to a profile operation (spec: A create or delete attempt does not reach a profile operation)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.delete('/organization-profile');

      expect([404, 405]).toContain(response.status);
    });

    it('does not resolve an /organization-profile/:id-shaped path (spec: Only five operations are declared)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent.get('/organization-profile/some-id');

      expect([404, 405]).toContain(response.status);
    });

    it('silently accepts a logoAssetId in the PATCH body and writes nothing (spec: Supplying the field writes nothing)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .patch('/organization-profile')
        .send({ logoAssetId: 'some-asset-id' })
        .expect(200);

      expect(response.body).not.toHaveProperty('logoAssetId');
    });
  });

  describe('Anonymous and non-admin access control on every /organization-profile route (tasks.md 4.5, authorization spec)', () => {
    let app: INestApplication<App>;
    let fileStorage: InMemoryFileStorage;
    let organizationProfileRepository: InMemoryOrganizationProfileRepository;
    const adminEmail = 'op-guard-admin@example.com';
    const managerEmail = 'op-guard-manager@example.com';
    const maintenanceCompanyManagerEmail = 'op-guard-mc-manager@example.com';
    const maintenanceTechnicianEmail = 'op-guard-technician@example.com';
    const communityRepresentativeEmail = 'op-guard-representative@example.com';

    beforeAll(async () => {
      const admin = await buildSeedUser({
        id: 'op-guard-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      const manager = await buildSeedUser({
        id: 'op-guard-manager-id',
        email: managerEmail,
        role: 'MANAGER',
      });
      const maintenanceCompanyManager = await buildSeedUser({
        id: 'op-guard-mc-manager-id',
        email: maintenanceCompanyManagerEmail,
        role: 'MAINTENANCE_COMPANY_MANAGER',
      });
      const maintenanceTechnician = await buildSeedUser({
        id: 'op-guard-technician-id',
        email: maintenanceTechnicianEmail,
        role: 'MAINTENANCE_TECHNICIAN',
      });
      const communityRepresentative = await buildSeedUser({
        id: 'op-guard-representative-id',
        email: communityRepresentativeEmail,
        role: 'COMMUNITY_REPRESENTATIVE',
      });
      ({ app, fileStorage, organizationProfileRepository } = await buildApp({
        users: [
          admin,
          manager,
          maintenanceCompanyManager,
          maintenanceTechnician,
          communityRepresentative,
        ],
      }));
    });

    afterAll(async () => {
      await app.close();
    });

    const routes = [
      ['GET', '/organization-profile'],
      ['PATCH', '/organization-profile'],
      ['GET', '/organization-profile/logo'],
      ['PUT', '/organization-profile/logo'],
      ['DELETE', '/organization-profile/logo'],
    ] as const;

    function sendRoute(
      agent: ReturnType<typeof request>,
      method: (typeof routes)[number][0],
      path: string,
    ) {
      if (method === 'GET') return agent.get(path);
      if (method === 'DELETE') return agent.delete(path);
      if (method === 'PUT') {
        return agent.put(path).attach('file', PNG_BYTES, 'logo.png');
      }
      return agent.patch(path).send({});
    }

    // authorization spec: "Unauthenticated caller is rejected before role
    // check" — 401 on every route, no session cookie at all.
    it.each(routes)('anonymous %s %s -> 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const response = await sendRoute(req, method, path);
      expect(response.status).toBe(401);
    });

    // authorization spec: "Every non-admin role is rejected on every
    // endpoint" — 403 for each of the 4 non-admin roles.
    it.each([
      ['MANAGER', managerEmail],
      ['MAINTENANCE_COMPANY_MANAGER', maintenanceCompanyManagerEmail],
      ['MAINTENANCE_TECHNICIAN', maintenanceTechnicianEmail],
      ['COMMUNITY_REPRESENTATIVE', communityRepresentativeEmail],
    ] as const)(
      '%s is rejected with 403 on every route',
      async (_role, email) => {
        const agent = await loginAgent(app, email);
        for (const [method, path] of routes) {
          const response = await sendRoute(agent, method, path);
          expect(response.status).toBe(403);
        }
        expect(fileStorage.keys()).toEqual([]);
      },
    );

    // authorization spec: an upload is rejected before its file is read.
    // A body over the size limit would get 413 if multer read it first.
    it('rejects a non-admin upload with 403 before reading an oversized file', async () => {
      const agent = await loginAgent(app, managerEmail);

      await agent
        .put('/organization-profile/logo')
        .attach('file', Buffer.alloc(3 * 1024 * 1024), 'logo.png')
        .expect(403);
    });

    // EN-110, authorization spec: a non-admin removal changes nothing.
    it('a non-admin removal is rejected with 403 and keeps the logo', async () => {
      await fileStorage.put('logos/kept.png', PNG_BYTES);
      await organizationProfileRepository.setLogoAssetId('logos/kept.png');

      try {
        for (const email of [
          managerEmail,
          maintenanceCompanyManagerEmail,
          maintenanceTechnicianEmail,
          communityRepresentativeEmail,
        ]) {
          const agent = await loginAgent(app, email);
          await agent.delete('/organization-profile/logo').expect(403);
        }
        expect((await organizationProfileRepository.get()).logoAssetId).toBe(
          'logos/kept.png',
        );
        expect(fileStorage.keys()).toEqual(['logos/kept.png']);
      } finally {
        await organizationProfileRepository.setLogoAssetId(null);
        await fileStorage.delete('logos/kept.png');
      }
    });

    it('SYSTEM_ADMIN is permitted through the guard on every route (authorization spec: SYSTEM_ADMIN is permitted)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent.get('/organization-profile').expect(200);
      await agent.patch('/organization-profile').send({}).expect(200);
      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, 'logo.png')
        .expect(200);
      await agent.get('/organization-profile/logo').expect(200);
      await agent.delete('/organization-profile/logo').expect(200);
    });
  });

  describe('Organization logo (organization-logo S1-S3, spec: Upload the Organization Logo / Read the Organization Logo)', () => {
    let app: INestApplication<App>;
    let fileStorage: InMemoryFileStorage;
    let organizationProfileRepository: InMemoryOrganizationProfileRepository;
    const adminEmail = 'op-logo-admin@example.com';

    beforeEach(async () => {
      const admin = await buildSeedUser({
        id: 'op-logo-admin-id',
        email: adminEmail,
        role: 'SYSTEM_ADMIN',
      });
      ({ app, fileStorage, organizationProfileRepository } = await buildApp({
        users: [admin],
      }));
    });

    afterEach(async () => {
      await app.close();
    });

    it('starts with no logo: hasLogo is false and the logo read is 404 (spec: A profile without a logo)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const profile = await agent.get('/organization-profile').expect(200);
      expect(profile.body).toMatchObject({ hasLogo: false });

      await agent.get('/organization-profile/logo').expect(404);
    });

    it.each([
      ['PNG', PNG_BYTES, 'logo.png', 'image/png'],
      ['JPEG', JPEG_BYTES, 'logo.jpg', 'image/jpeg'],
      ['WebP', WEBP_BYTES, 'logo.webp', 'image/webp'],
    ])(
      'uploads a %s logo and reads it back with its content type (spec: A PNG, JPEG or WebP logo is stored)',
      async (_name, bytes, filename, contentType) => {
        const agent = await loginAgent(app, adminEmail);

        const upload = await agent
          .put('/organization-profile/logo')
          .attach('file', bytes, filename)
          .expect(200);
        expect(upload.body).toMatchObject({ hasLogo: true });
        expect(upload.body).not.toHaveProperty('logoAssetId');

        const logo = await agent.get('/organization-profile/logo').expect(200);
        expect(logo.headers['content-type']).toBe(contentType);
        expect(logo.headers['cache-control']).toBe('no-store');
        expect(Buffer.from(logo.body as Buffer)).toEqual(bytes);

        const profile = await agent.get('/organization-profile').expect(200);
        expect(profile.body).toMatchObject({ hasLogo: true });
      },
    );

    it('removes the logo: hasLogo becomes false, the file is deleted and the logo read is 404 (spec: The logo is removed)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, 'logo.png')
        .expect(200);

      const removed = await agent
        .delete('/organization-profile/logo')
        .expect(200);

      expect(removed.body).toMatchObject({ hasLogo: false });
      expect(removed.body).not.toHaveProperty('logoAssetId');
      expect(fileStorage.keys()).toEqual([]);
      expect(
        (await organizationProfileRepository.get()).logoAssetId,
      ).toBeNull();
      await agent.get('/organization-profile/logo').expect(404);
      const profile = await agent.get('/organization-profile').expect(200);
      expect(profile.body).toMatchObject({ hasLogo: false });
    });

    it('removing when there is no logo succeeds and changes nothing (spec: Removing without a logo)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .delete('/organization-profile/logo')
        .expect(200);

      expect(response.body).toMatchObject({ hasLogo: false });
      expect(fileStorage.keys()).toEqual([]);
    });

    it('decides the format by content, not by file name or declared type (spec: The format is decided by the content)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, {
          filename: 'logo.jpg',
          contentType: 'image/jpeg',
        })
        .expect(200);

      const logo = await agent.get('/organization-profile/logo').expect(200);
      expect(logo.headers['content-type']).toBe('image/png');
    });

    it('replaces the previous logo and keeps one stored file (spec: A new upload replaces the logo)', async () => {
      const agent = await loginAgent(app, adminEmail);

      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, 'logo.png')
        .expect(200);
      await agent
        .put('/organization-profile/logo')
        .attach('file', JPEG_BYTES, 'logo.jpg')
        .expect(200);

      const logo = await agent.get('/organization-profile/logo').expect(200);
      expect(logo.headers['content-type']).toBe('image/jpeg');
      expect(fileStorage.keys()).toHaveLength(1);
      expect(fileStorage.keys()[0]).toMatch(/^logos\/[0-9a-f-]{36}\.jpg$/);
    });

    it.each([
      [
        'an SVG',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'logo.svg',
        'image/svg+xml',
      ],
      ['a GIF', Buffer.from('GIF89a\x01\x00'), 'logo.gif', 'image/gif'],
      [
        'a text file named .png',
        Buffer.from('not an image'),
        'logo.png',
        'image/png',
      ],
      // EN-111: a signature without an image header is not an image.
      [
        'the 3-byte JPEG signature alone',
        Buffer.from([0xff, 0xd8, 0xff]),
        'logo.jpg',
        'image/jpeg',
      ],
      ['a PNG of width 0', pngHeader(0, 1), 'logo.png', 'image/png'],
    ])(
      'rejects %s with 400 LOGO_UNSUPPORTED_FORMAT and changes nothing (spec: Other formats are rejected)',
      async (_name, bytes, filename, contentType) => {
        const agent = await loginAgent(app, adminEmail);

        const response = await agent
          .put('/organization-profile/logo')
          .attach('file', bytes, { filename, contentType })
          .expect(400);

        expect(response.body).toMatchObject({
          code: 'LOGO_UNSUPPORTED_FORMAT',
        });
        expect(fileStorage.keys()).toEqual([]);
        expect(
          (await organizationProfileRepository.get()).logoAssetId,
        ).toBeNull();
      },
    );

    it('accepts a file of exactly 2 MiB (spec: A PNG, JPEG or WebP logo is stored)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const atLimit = Buffer.concat([
        PNG_BYTES,
        Buffer.alloc(2 * 1024 * 1024 - PNG_BYTES.length),
      ]);

      await agent
        .put('/organization-profile/logo')
        .attach('file', atLimit, 'logo.png')
        .expect(200);
    });

    it('rejects a file one byte over 2 MiB with 413 and changes nothing (spec: A logo over the size limit is rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);
      const tooLarge = Buffer.concat([
        PNG_BYTES,
        Buffer.alloc(2 * 1024 * 1024 + 1 - PNG_BYTES.length),
      ]);

      await agent
        .put('/organization-profile/logo')
        .attach('file', tooLarge, 'logo.png')
        .expect(413);

      expect(fileStorage.keys()).toEqual([]);
      expect(
        (await organizationProfileRepository.get()).logoAssetId,
      ).toBeNull();
    });

    it('answers 404 when the recorded logo file is missing from storage (spec: Read the Organization Logo)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, 'logo.png')
        .expect(200);
      await fileStorage.delete(fileStorage.keys()[0]);

      await agent.get('/organization-profile/logo').expect(404);
    });

    it('rejects a request without a file with 400 LOGO_FILE_MISSING (spec: An upload without a file is rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .put('/organization-profile/logo')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({ code: 'LOGO_FILE_MISSING' });
      expect(fileStorage.keys()).toEqual([]);
    });

    // TD-44: multer does not take a malformed content type as multipart, so
    // the request carries no file.
    it('rejects a malformed multipart content type with 400 LOGO_FILE_MISSING (spec: An upload without a file is rejected)', async () => {
      const agent = await loginAgent(app, adminEmail);

      const response = await agent
        .put('/organization-profile/logo')
        .set('Content-Type', 'multipart/form-data; boundary')
        .send('not a form')
        .expect(400);

      expect(response.body).toMatchObject({ code: 'LOGO_FILE_MISSING' });
      expect(fileStorage.keys()).toEqual([]);
    });

    // EN-111, spec: A malformed upload form is rejected.
    it.each([
      [
        'the file in another field',
        (req: request.Test) => req.attach('logo', PNG_BYTES, 'logo.png'),
      ],
      [
        'a second file',
        (req: request.Test) =>
          req
            .attach('file', PNG_BYTES, 'logo.png')
            .attach('file', JPEG_BYTES, 'logo.jpg'),
      ],
      [
        'a text field next to the file',
        (req: request.Test) =>
          req.field('name', 'x').attach('file', PNG_BYTES, 'logo.png'),
      ],
      [
        'a text field alone',
        (req: request.Test) => req.field('name', 'not a file'),
      ],
      [
        'a multipart body without a boundary',
        (req: request.Test) =>
          req.set('Content-Type', 'multipart/form-data').send('not a form'),
      ],
      // TD-44: busboy rejects this content type with a plain Error.
      [
        'a multipart type other than form-data',
        (req: request.Test) =>
          req
            .set('Content-Type', 'multipart/mixed; boundary=x')
            .send('--x--\r\n'),
      ],
    ])(
      'rejects %s with 400 LOGO_UPLOAD_INVALID and changes nothing',
      async (_name, build) => {
        const agent = await loginAgent(app, adminEmail);
        await agent
          .put('/organization-profile/logo')
          .attach('file', JPEG_BYTES, 'current.jpg')
          .expect(200);
        const current = (await organizationProfileRepository.get()).logoAssetId;

        const response = await build(
          agent.put('/organization-profile/logo'),
        ).expect(400);

        expect(response.body).toMatchObject({
          statusCode: 400,
          code: 'LOGO_UPLOAD_INVALID',
        });
        expect((await organizationProfileRepository.get()).logoAssetId).toBe(
          current,
        );
        expect(fileStorage.keys()).toEqual([current]);
      },
    );

    it('does not change the logo through PATCH (spec: Supplying the field writes nothing)', async () => {
      const agent = await loginAgent(app, adminEmail);
      await agent
        .put('/organization-profile/logo')
        .attach('file', PNG_BYTES, 'logo.png')
        .expect(200);
      const before = (await organizationProfileRepository.get()).logoAssetId;

      await agent
        .patch('/organization-profile')
        .send({ logoAssetId: 'logos/other.png', hasLogo: false })
        .expect(200);

      expect((await organizationProfileRepository.get()).logoAssetId).toBe(
        before,
      );
    });
  });
});
