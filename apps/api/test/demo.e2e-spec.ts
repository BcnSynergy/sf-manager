import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';

// demo-instance S6 (spec `deployment`, "Demo identification"): GET /demo is
// public, so the login page can read it before anyone signs in, and DEMO_MODE
// is read when the app boots.
describe('GET /demo (e2e)', () => {
  let app: INestApplication<App> | undefined;
  const originalDemoMode = process.env.DEMO_MODE;

  async function boot(demoMode: string | undefined) {
    // Compiling AppModule boots every module, auth's settings included.
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-0123456789abcdef';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    if (demoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = demoMode;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    return app;
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it('answers without a session that the demo is off when DEMO_MODE is unset', async () => {
    const server = (await boot(undefined)).getHttpServer();

    await request(server).get('/demo').expect(200).expect({ enabled: false });
  });

  it('answers without a session the demo accounts when DEMO_MODE=true', async () => {
    const server = (await boot('true')).getHttpServer();

    const response = await request(server).get('/demo').expect(200);
    const body = response.body as { accounts: unknown[] };

    expect(body).toMatchObject({
      enabled: true,
      password: 'sf-manager-demo-1',
    });
    expect(body.accounts).toHaveLength(4);
  });

  it('refuses to boot on an unknown DEMO_MODE value', async () => {
    await expect(boot('yes')).rejects.toThrow(
      'DEMO_MODE must be "true" or "false", got "yes"',
    );
  });
});
