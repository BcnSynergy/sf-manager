import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { EMAIL_SENDER } from '../src/shared/application/ports/email-sender.port';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { InMemoryEmailSender } from '../src/shared/testing/in-memory-email-sender';
import { LOGIN_FAILURE_LIMITER } from '../src/modules/auth/application/ports/login-failure-limiter.port';
import { PASSWORD_RESET_TOKEN_STORE } from '../src/modules/auth/application/ports/password-reset-token-store.port';
import { REFRESH_TOKEN_STORE } from '../src/modules/auth/application/ports/refresh-token-store.port';
import { TOKEN_DENYLIST } from '../src/modules/auth/application/ports/token-denylist.port';
import { RequestPasswordResetUseCase } from '../src/modules/auth/application/use-cases/request-password-reset.use-case';
import { InMemoryLoginFailureLimiter } from '../src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter';
import { InMemoryPasswordResetTokenStore } from '../src/modules/auth/application/services/testing/in-memory-password-reset-token-store';
import { InMemoryRefreshTokenStore } from '../src/modules/auth/application/services/testing/in-memory-refresh-token-store';
import { getLoginEmailRateLimitConfig } from '../src/modules/auth/infrastructure/config/login-rate-limit.config';
import { CryptoOpaqueTokenGenerator } from '../src/modules/auth/infrastructure/token/crypto-opaque-token.generator';
import { USER_REPOSITORY } from '../src/modules/users/application/ports/user.repository.port';
import { InMemoryUserRepository } from '../src/modules/users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../src/modules/users/domain/user.entity';

// password-reset S1, S3-S5 end to end on the real HTTP stack: in-memory
// stores and email sender (this suite never sends mail), real argon2 hashing
// and real guards. The background work of the request endpoint is awaited
// through RequestPasswordResetUseCase.whenIdle(), never with sleeps.
const TEST_ORIGIN = 'http://localhost:5173';
const EMAIL = 'resetter@example.com';
const OTHER_EMAIL = 'bystander@example.com';
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';

function codeOf(body: unknown): string | undefined {
  return (body as { code?: string }).code;
}

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUserRepository;
  let sender: InMemoryEmailSender;
  let resetTokens: InMemoryPasswordResetTokenStore;
  let requestUseCase: RequestPasswordResetUseCase;
  let passwordHash: string;

  function seedUser(id: string, email: string, deletedAt: Date | null = null) {
    const now = new Date();
    users.seed(
      new User({
        id,
        email,
        passwordHash,
        role: 'SYSTEM_ADMIN',
        createdAt: now,
        updatedAt: now,
        deletedAt,
      }),
    );
  }

  async function login(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .send({ email, password: OLD_PASSWORD })
      .expect(200);
    return agent;
  }

  async function requestLink(email: string, locale?: string): Promise<string> {
    const before = sender.sent.length;
    await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ email, ...(locale ? { locale } : {}) })
      .expect(202);
    await requestUseCase.whenIdle();
    expect(sender.sent.length).toBe(before + 1);
    const match = /reset-password#token=([\w-]+)/.exec(
      sender.sent[before].text,
    );
    return match![1];
  }

  const confirm = (token: string, password = NEW_PASSWORD) =>
    request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({ token, password });

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-jwt-secret-0123456789abcdef';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = TEST_ORIGIN;
    passwordHash = await argon2.hash(OLD_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    sender = new InMemoryEmailSender();
    resetTokens = new InMemoryPasswordResetTokenStore();
    seedUser('user-1', EMAIL);
    seedUser('user-2', OTHER_EMAIL);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(TOKEN_DENYLIST)
      .useValue({
        isRevoked: () => Promise.resolve(false),
        revoke: () => Promise.resolve(),
        deleteExpired: () => Promise.resolve(),
      })
      .overrideProvider(REFRESH_TOKEN_STORE)
      .useFactory({ factory: () => new InMemoryRefreshTokenStore() })
      .overrideProvider(PASSWORD_RESET_TOKEN_STORE)
      .useValue(resetTokens)
      .overrideProvider(EMAIL_SENDER)
      .useValue(sender)
      .overrideProvider(ThrottlerStorage)
      .useFactory({ factory: () => new ThrottlerStorageService() })
      .overrideProvider(LOGIN_FAILURE_LIMITER)
      .useFactory({
        factory: () =>
          new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()),
      })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.enableCors({ origin: process.env.CORS_ORIGIN, credentials: true });
    await app.init();
    requestUseCase = app.get(RequestPasswordResetUseCase);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/password-reset/request', () => {
    it('answers 202 with an empty body and emails the link to an active user, in the requested language', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: '  Resetter@Example.com ', locale: 'ca' });
      await requestUseCase.whenIdle();

      expect(response.status).toBe(202);
      expect(response.text).toBe('');
      expect(sender.sent).toHaveLength(1);
      expect(sender.sent[0].to).toBe(EMAIL);
      expect(sender.sent[0].subject).toBe(
        'Restableix la teva contrasenya de SF-Manager',
      );
      expect(sender.sent[0].text).toContain(
        `${TEST_ORIGIN}/reset-password#token=`,
      );
      expect(sender.sent[0].text).toContain('30 minuts');
    });

    it('defaults the language to English', async () => {
      await requestLink(EMAIL);

      expect(sender.sent[0].subject).toBe('Reset your SF-Manager password');
    });

    it('answers exactly the same for an unknown email and a soft-deleted user, and sends nothing', async () => {
      seedUser('gone', 'gone@example.com', new Date());
      const known = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: EMAIL });
      const unknown = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'nobody@example.com' });
      const deleted = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: 'gone@example.com' });
      await requestUseCase.whenIdle();

      for (const response of [unknown, deleted]) {
        expect(response.status).toBe(known.status);
        expect(response.text).toBe(known.text);
        expect(response.headers['content-type']).toBe(
          known.headers['content-type'],
        );
      }
      expect(sender.sent.map((m) => m.to)).toEqual([EMAIL]);
      expect(resetTokens.tokens.size).toBe(1);
    });

    it('still answers 202 when the email relay fails', async () => {
      sender.failWith = new Error('relay down');

      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ email: EMAIL })
        .expect(202);
      await requestUseCase.whenIdle();

      expect(sender.sent).toEqual([]);
    });

    it.each([
      ['a missing email', {}],
      ['an invalid email', { email: 'not-an-email' }],
      ['an unsupported locale', { email: EMAIL, locale: 'fr' }],
    ])('answers 400 for %s and sends nothing', async (_label, body) => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send(body)
        .expect(400);
      await requestUseCase.whenIdle();

      expect(sender.sent).toEqual([]);
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('sets the new password, answers 204, and the user logs in with it only', async () => {
      const token = await requestLink(EMAIL);

      const response = await confirm(token);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: NEW_PASSWORD })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: OLD_PASSWORD })
        .expect(401);
    });

    it('ends every session of the user (access and refresh) and leaves other users alone', async () => {
      const first = await login(EMAIL);
      const second = await login(EMAIL);
      const bystander = await login(OTHER_EMAIL);
      await first.get('/auth/me').expect(200);
      const token = await requestLink(EMAIL);

      await confirm(token).expect(204);

      await first.get('/auth/me').expect(401);
      await second.get('/auth/me').expect(401);
      await first.post('/auth/refresh').set('Origin', TEST_ORIGIN).expect(401);
      await second.post('/auth/refresh').set('Origin', TEST_ORIGIN).expect(401);
      await bystander.get('/auth/me').expect(200);
      await bystander
        .post('/auth/refresh')
        .set('Origin', TEST_ORIGIN)
        .expect(200);
      await bystander
        .post('/auth/logout')
        .set('Origin', TEST_ORIGIN)
        .expect(200);
    });

    it('answers the same generic 400 INVALID_RESET_TOKEN for an unknown, used and expired token', async () => {
      const used = await requestLink(EMAIL);
      await confirm(used).expect(204);
      resetTokens.tokens.set('expired-row', {
        id: 'expired-row',
        userId: 'user-1',
        tokenHash: new CryptoOpaqueTokenGenerator().hash('expired-token'),
        createdAt: new Date(Date.now() - 3_600_000),
        expiresAt: new Date(Date.now() - 1_800_000),
        usedAt: null,
      });

      const bodies: unknown[] = [];
      for (const token of ['unknown-token', used, 'expired-token']) {
        const response = await confirm(token, 'another-pass-789');
        expect(response.status).toBe(400);
        expect(codeOf(response.body)).toBe('INVALID_RESET_TOKEN');
        bodies.push(response.body);
      }
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
    });

    it('answers 400 for a weak password and keeps the link usable', async () => {
      const token = await requestLink(EMAIL);

      const weak = await confirm(token, 'short1');
      expect(weak.status).toBe(400);
      expect(codeOf(weak.body)).toBeUndefined();

      await confirm(token).expect(204);
    });

    it('treats the token of a soft-deleted user as invalid', async () => {
      const token = await requestLink(EMAIL);
      await users.softDeleteById('user-1');

      const response = await confirm(token);

      expect(response.status).toBe(400);
      expect(codeOf(response.body)).toBe('INVALID_RESET_TOKEN');
    });

    it('invalidates the earlier link when a newer one is requested', async () => {
      const first = await requestLink(EMAIL);
      const second = await requestLink(EMAIL);

      expect(codeOf((await confirm(first)).body)).toBe('INVALID_RESET_TOKEN');
      await confirm(second).expect(204);
    });

    it.each([
      ['a missing token', { password: NEW_PASSWORD }],
      ['a missing password', { token: 'abc' }],
      ['an empty token', { token: '', password: NEW_PASSWORD }],
    ])('answers 400 for %s', async (_label, body) => {
      await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send(body)
        .expect(400);
    });
  });

  it('keeps login, refresh and logout behaving as before for a user who never reset', async () => {
    const agent = await login(OTHER_EMAIL);

    await agent.get('/auth/me').expect(200);
    await agent.post('/auth/refresh').set('Origin', TEST_ORIGIN).expect(200);
    await agent.post('/auth/logout').set('Origin', TEST_ORIGIN).expect(200);
    await agent.get('/auth/me').expect(401);
  });
});
