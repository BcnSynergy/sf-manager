import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/shared/infrastructure/persistence/prisma.service';

// hermetic-integration-tests design.md Decision 8: this is the only
// real-DB spec outside `src/**/*.integration.spec.ts`, so it runs under
// `test:integration` (via jest-integration.json's `roots`) instead of
// `test:e2e` — `jest-e2e.json`'s `testRegex` (`.e2e-spec.ts$`) no longer
// matches this file's name, with no edit to `jest-e2e.json` needed, so the
// other 10 e2e specs (all of which stub PrismaService) keep needing no
// Docker. Run via `npm run test:integration` (see README.md).
const RUN_DATABASE_NAME_PATTERN =
  /^sf_manager_test_([0-9a-z]{8})_([0-9a-f]{6})$/;

describe('Health (integration)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;

  beforeEach(async () => {
    // AppModule now wires AuthModule (PR 4), whose getAuthConfig() throws at
    // boot if these are missing — required here even though this suite only
    // exercises /health, since compiling AppModule instantiates every module.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', db: 'ok' });
  });

  it("connects to this run's own database", async () => {
    const prisma = moduleFixture.get(PrismaService);
    const rows = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
      'SELECT current_database()',
    );
    const currentDatabase = rows[0]?.current_database;

    expect(currentDatabase).toMatch(RUN_DATABASE_NAME_PATTERN);
    expect(currentDatabase).toBe(process.env.SF_TEST_RUN_DATABASE);
  });

  afterEach(async () => {
    await app.close();
  });
});
