import { Logger } from '@nestjs/common';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import { InMemoryEmailSender } from '../../../../shared/testing/in-memory-email-sender';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { User } from '../../../users/domain/user.entity';
import { CryptoOpaqueTokenGenerator } from '../../infrastructure/token/crypto-opaque-token.generator';
import type { PasswordResetPolicy } from '../services/password-reset-policy';
import { InMemoryPasswordResetTokenStore } from '../services/testing/in-memory-password-reset-token-store';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const POLICY: PasswordResetPolicy = {
  tokenTtlMs: 30 * 60_000,
  webOrigin: 'https://app.example.com',
};
const EMAIL = 'someone@example.com';

function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]>) {
  return new User({
    id: 'user-1',
    email: EMAIL,
    passwordHash: 'old-hash',
    role: 'MANAGER',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  });
}

function tokenIn(text: string): string {
  const match = /token=([\w-]+)/.exec(text);
  if (!match) {
    throw new Error('no token in the message');
  }
  return match[1];
}

describe('RequestPasswordResetUseCase', () => {
  let users: InMemoryUserRepository;
  let store: InMemoryPasswordResetTokenStore;
  let sender: InMemoryEmailSender;
  let tokens: CryptoOpaqueTokenGenerator;
  let nextId: number;
  let useCase: RequestPasswordResetUseCase;
  let logged: string[];

  beforeEach(() => {
    users = new InMemoryUserRepository();
    store = new InMemoryPasswordResetTokenStore();
    sender = new InMemoryEmailSender();
    tokens = new CryptoOpaqueTokenGenerator();
    nextId = 0;
    logged = [];
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    useCase = new RequestPasswordResetUseCase(
      users,
      store,
      tokens,
      { generate: () => `token-row-${(nextId += 1)}` },
      new FixedClock(NOW),
      sender,
      POLICY,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('emails an active user a link carrying a fresh token, in the requested language, and stores only its hash', async () => {
    users.seed(buildUser({}));

    useCase.execute({ email: EMAIL, locale: 'es' });
    await useCase.whenIdle();

    expect(sender.sent).toHaveLength(1);
    const [message] = sender.sent;
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toBe('Restablece tu contraseña de SF-Manager');
    const token = tokenIn(message.text);
    expect(message.text).toContain(
      `https://app.example.com/reset-password#token=${token}`,
    );
    expect(message.html).toContain(
      `href="https://app.example.com/reset-password#token=${token}"`,
    );
    expect(message.text).toContain('30 minutos');
    const stored = [...store.tokens.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      userId: 'user-1',
      tokenHash: tokens.hash(token),
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      usedAt: null,
    });
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('sends nothing and stores nothing for an unknown email', async () => {
    useCase.execute({ email: 'nobody@example.com', locale: 'en' });
    await useCase.whenIdle();

    expect(sender.sent).toEqual([]);
    expect(store.tokens.size).toBe(0);
  });

  it('sends nothing and stores nothing for a soft-deleted user', async () => {
    users.seed(buildUser({ deletedAt: NOW }));

    useCase.execute({ email: EMAIL, locale: 'en' });
    await useCase.whenIdle();

    expect(sender.sent).toEqual([]);
    expect(store.tokens.size).toBe(0);
  });

  it('returns before the lookup and the send finish', async () => {
    let releaseLookup: () => void = () => undefined;
    jest.spyOn(users, 'findByEmail').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseLookup = () => resolve(buildUser({}));
        }),
    );

    const result = useCase.execute({ email: EMAIL, locale: 'en' });

    expect(result).toBeUndefined();
    expect(sender.sent).toEqual([]);
    releaseLookup();
    await useCase.whenIdle();
    expect(sender.sent).toHaveLength(1);
  });

  it('invalidates the earlier link of the same user when a new one is requested', async () => {
    users.seed(buildUser({}));
    useCase.execute({ email: EMAIL, locale: 'en' });
    await useCase.whenIdle();
    const firstToken = tokenIn(sender.sent[0].text);

    useCase.execute({ email: EMAIL, locale: 'en' });
    await useCase.whenIdle();
    const secondToken = tokenIn(sender.sent[1].text);

    expect(secondToken).not.toBe(firstToken);
    await expect(
      store.consume(tokens.hash(firstToken), NOW),
    ).resolves.toBeNull();
    await expect(store.consume(tokens.hash(secondToken), NOW)).resolves.toEqual(
      { userId: 'user-1' },
    );
  });

  it('logs a failed send with its code only, never the address or the message, and does not reject', async () => {
    users.seed(buildUser({}));
    sender.failWith = Object.assign(new Error(`550 rejected ${EMAIL}`), {
      code: 'EENVELOPE',
    });

    useCase.execute({ email: EMAIL, locale: 'en' });
    await expect(useCase.whenIdle()).resolves.toBeUndefined();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('EENVELOPE');
    expect(logged[0]).not.toContain(EMAIL);
    expect(logged[0]).not.toContain('rejected');
  });

  it('logs a failed lookup the same safe way and sends nothing', async () => {
    jest
      .spyOn(users, 'findByEmail')
      .mockRejectedValue(
        Object.assign(new Error(`db down for ${EMAIL}`), { code: 'P1001' }),
      );

    useCase.execute({ email: EMAIL, locale: 'en' });
    await expect(useCase.whenIdle()).resolves.toBeUndefined();

    expect(sender.sent).toEqual([]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('P1001');
    expect(logged[0]).not.toContain(EMAIL);
    expect(logged[0]).not.toContain('db down');
  });

  it('cleans expired tokens opportunistically and ignores a failing cleanup', async () => {
    users.seed(buildUser({}));
    store.tokens.set('old', {
      id: 'old',
      userId: 'user-9',
      tokenHash: 'old-hash',
      createdAt: new Date('2026-11-14T00:00:00.000Z'),
      expiresAt: new Date('2026-11-14T00:30:00.000Z'),
      usedAt: null,
    });

    useCase.execute({ email: EMAIL, locale: 'en' });
    await useCase.whenIdle();
    expect(store.tokens.has('old')).toBe(false);

    jest.spyOn(store, 'deleteExpired').mockRejectedValue(new Error('boom'));
    useCase.execute({ email: EMAIL, locale: 'en' });
    await useCase.whenIdle();
    expect(sender.sent).toHaveLength(2);
  });
});
