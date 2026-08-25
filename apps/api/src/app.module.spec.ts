import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

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
      JWT_SECRET: 'test-secret',
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
});
