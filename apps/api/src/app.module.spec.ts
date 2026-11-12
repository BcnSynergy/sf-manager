import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { AppModule } from './app.module';
import { LOGIN_FAILURE_LIMITER } from './modules/auth/application/ports/login-failure-limiter.port';
import { THROTTLE_KEY_HASHER } from './modules/auth/infrastructure/config/throttle-key.config';
import { COMMUNITY_SCOPE_CHECKER } from './shared/application/authorization/community-scope.checker.port';
import { MANAGER_CAPABILITY_CHECKER } from './shared/application/authorization/manager-capability.checker.port';
import { CLOCK } from './shared/application/ports/clock.port';
import { SystemClock } from './shared/infrastructure/clock/system-clock';
import { REVIEW_SCHEDULE_READER } from './modules/review-schedule/application/ports/review-schedule.reader.port';
import { PrismaReviewScheduleReader } from './modules/review-schedule/infrastructure/persistence/prisma-review-schedule.reader';

// Regression test for a DI-bootstrap defect found by fresh-context review on
// PR 7 (community/07-soft-delete-cascade): SoftDeleteCommunityUseCase's
// constructor requires COMMUNITY_REPRESENTATIVE_REPOSITORY (added in PR 7),
// but community.module.ts never bound that token to an implementation — no
// Prisma adapter existed yet (originally planned for PR 8). That broke
// Nest's whole AppModule DI graph: `Test.createTestingModule({ imports:
// [AppModule] }).compile()` threw "Nest can't resolve dependencies of the
// SoftDeleteCommunityUseCase ... COMMUNITY_REPRESENTATIVE_REPOSITORY at
// index [1] is not available". Fixed by pulling PrismaCommunityRepresentativeRepository
// forward from PR 8 into PR 7 and registering it in community.module.ts.
//
// This test only calls .compile() (provider instantiation/DI resolution),
// never .init() — so it never calls PrismaService.onModuleInit()'s
// $connect() and needs no real database connection. It DOES need
// JWT_SECRET/CORS_ORIGIN (AuthModule's getAuthConfig(), read via
// JwtModule.registerAsync's useFactory at provider-instantiation time) and a
// syntactically valid DATABASE_URL (read once, at import time, by
// PrismaService's module-level `new PrismaPg(...)` adapter construction,
// which does not eagerly connect) — set directly on process.env rather than
// relying on a real .env file, mirroring auth.config.spec.ts's approach, so
// this test is hermetic and CI-safe.
describe('AppModule (DI bootstrap)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-jwt-secret-0123456789abcdefghij',
      THROTTLE_KEY_SECRET: 'test-throttle-key-secret-0123456789ab',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolves every provider in the DI graph, including SoftDeleteCommunityUseCase -> COMMUNITY_REPRESENTATIVE_REPOSITORY', async () => {
    await expect(
      Test.createTestingModule({ imports: [AppModule] }).compile(),
    ).resolves.toBeDefined();
  });

  // EN-181: one hasher instance keys both counter families, so both always
  // use the same secret and cannot drift apart.
  it('gives the throttler storage and the email limiter the same THROTTLE_KEY_HASHER', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // hashKey is a private field; reading it is the only way to prove the
    // two adapters hold the very same instance.
    type WithHasher = { hashKey: unknown };
    const hasher = moduleRef.get<unknown>(THROTTLE_KEY_HASHER, {
      strict: false,
    });
    const storage = moduleRef.get<WithHasher>(getStorageToken(), {
      strict: false,
    });
    const limiter = moduleRef.get<WithHasher>(LOGIN_FAILURE_LIMITER, {
      strict: false,
    });

    expect(typeof hasher).toBe('function');
    expect(storage.hashKey).toBe(hasher);
    expect(limiter.hashKey).toBe(hasher);
  });

  // EN-6: the throttle counter keys need their HMAC secret, so the API must
  // not boot without it.
  it('refuses to boot without THROTTLE_KEY_SECRET', async () => {
    delete process.env.THROTTLE_KEY_SECRET;

    await expect(
      Test.createTestingModule({ imports: [AppModule] }).compile(),
    ).rejects.toThrow('THROTTLE_KEY_SECRET environment variable is required');
  });
});

// review-schedule design.md Bootstrap row, E10: the real Prisma reader, the
// real SystemClock and both scope-checker tokens must resolve in the full
// graph. `.compile()` only, so no database is needed. REVIEW_SCHEDULE_READER is
// module-local (not exported), hence `strict: false`.
describe('AppModule (review-schedule DI bootstrap)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-jwt-secret-0123456789abcdefghij',
      THROTTLE_KEY_SECRET: 'test-throttle-key-secret-0123456789ab',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolves the real Prisma reader, the system clock and both checker tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(
      moduleRef.get(REVIEW_SCHEDULE_READER, { strict: false }),
    ).toBeInstanceOf(PrismaReviewScheduleReader);
    expect(moduleRef.get(CLOCK, { strict: false })).toBeInstanceOf(SystemClock);
    expect(
      moduleRef.get(COMMUNITY_SCOPE_CHECKER, { strict: false }),
    ).toBeDefined();
    expect(
      moduleRef.get(MANAGER_CAPABILITY_CHECKER, { strict: false }),
    ).toBeDefined();
  });
});
