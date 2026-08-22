import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Requires a live database (DATABASE_URL) — not part of the `test` task run
// by `turbo test`, only `npm run test:e2e` directly. See README.md setup.
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // AppModule now wires AuthModule (PR 4), whose getAuthConfig() throws at
    // boot if these are missing — required here even though this suite only
    // exercises /health, since compiling AppModule instantiates every module.
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const moduleFixture: TestingModule = await Test.createTestingModule({
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

  afterEach(async () => {
    await app.close();
  });
});
