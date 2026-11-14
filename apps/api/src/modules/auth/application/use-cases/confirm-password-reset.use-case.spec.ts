import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { WeakPasswordError } from '../../../users/domain/errors/weak-password.error';
import { User } from '../../../users/domain/user.entity';
import type { PasswordHasher } from '../../../../shared/application/ports/password-hasher.port';
import { FixedClock } from '../../../../shared/testing/fixed-clock';
import { InvalidResetTokenError } from '../../domain/invalid-reset-token.error';
import { CryptoOpaqueTokenGenerator } from '../../infrastructure/token/crypto-opaque-token.generator';
import { InMemoryPasswordResetTokenStore } from '../services/testing/in-memory-password-reset-token-store';
import { InMemoryRefreshTokenStore } from '../services/testing/in-memory-refresh-token-store';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const NEW_PASSWORD = 'brand-new-pass-1';

const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`hashed:${plain}`),
  verify: (hash, plain) => Promise.resolve(hash === `hashed:${plain}`),
  verifyAgainstDummy: () => Promise.resolve(false),
};

function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]>) {
  return new User({
    id: 'user-1',
    email: 'someone@example.com',
    passwordHash: 'old-hash',
    role: 'MANAGER',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  });
}

describe('ConfirmPasswordResetUseCase', () => {
  let users: InMemoryUserRepository;
  let resetTokens: InMemoryPasswordResetTokenStore;
  let sessions: InMemoryRefreshTokenStore;
  const generator = new CryptoOpaqueTokenGenerator();
  let useCase: ConfirmPasswordResetUseCase;

  function issue(token: string, overrides: { expiresAt?: Date } = {}) {
    return resetTokens.createReplacingUnused({
      id: `row-${token}`,
      userId: 'user-1',
      tokenHash: generator.hash(token),
      createdAt: NOW,
      expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 30 * 60_000),
    });
  }

  function session(id: string, userId: string) {
    return sessions.create({
      id,
      tokenHash: `hash-${id}`,
      familyId: `family-${id}`,
      userId,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      familyExpiresAt: new Date(NOW.getTime() + 86_400_000),
    });
  }

  beforeEach(() => {
    users = new InMemoryUserRepository();
    resetTokens = new InMemoryPasswordResetTokenStore();
    sessions = new InMemoryRefreshTokenStore();
    users.seed(buildUser({}));
    useCase = new ConfirmPasswordResetUseCase(
      users,
      resetTokens,
      sessions,
      generator,
      hasher,
      new FixedClock(NOW),
    );
  });

  it('sets the new password hash and ends every session of the user, only theirs', async () => {
    await issue('good-token');
    await session('a', 'user-1');
    await session('b', 'user-1');
    await session('c', 'user-2');

    await useCase.execute({ token: 'good-token', password: NEW_PASSWORD });

    expect((await users.findById('user-1'))?.passwordHash).toBe(
      `hashed:${NEW_PASSWORD}`,
    );
    await expect(sessions.isFamilyEnded('family-a')).resolves.toBe(true);
    await expect(sessions.isFamilyEnded('family-b')).resolves.toBe(true);
    await expect(sessions.isFamilyEnded('family-c')).resolves.toBe(false);
  });

  it('accepts a token once: the second use is the generic invalid-token error and changes nothing', async () => {
    await issue('good-token');
    await useCase.execute({ token: 'good-token', password: NEW_PASSWORD });

    await expect(
      useCase.execute({ token: 'good-token', password: 'another-pass-22' }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);

    expect((await users.findById('user-1'))?.passwordHash).toBe(
      `hashed:${NEW_PASSWORD}`,
    );
  });

  it.each([
    ['unknown', 'nope'],
    ['expired', 'old-token'],
  ])(
    'rejects an %s token with the generic error, changing nothing',
    async (_label, presented) => {
      await issue('old-token', { expiresAt: new Date(NOW.getTime() - 1) });
      await session('a', 'user-1');

      await expect(
        useCase.execute({ token: presented, password: NEW_PASSWORD }),
      ).rejects.toBeInstanceOf(InvalidResetTokenError);

      expect((await users.findById('user-1'))?.passwordHash).toBe('old-hash');
      await expect(sessions.isFamilyEnded('family-a')).resolves.toBe(false);
    },
  );

  it('rejects the token of a soft-deleted user', async () => {
    users.seed(buildUser({ deletedAt: NOW }));
    await issue('good-token');

    await expect(
      useCase.execute({ token: 'good-token', password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it('rejects a weak password before touching the token, so the link still works afterwards', async () => {
    await issue('good-token');

    await expect(
      useCase.execute({ token: 'good-token', password: 'short1' }),
    ).rejects.toBeInstanceOf(WeakPasswordError);

    await expect(
      useCase.execute({ token: 'good-token', password: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it('invalidates a link when a newer one was requested', async () => {
    await issue('first');
    await issue('second');

    await expect(
      useCase.execute({ token: 'first', password: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
    await expect(
      useCase.execute({ token: 'second', password: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it('cleans expired tokens opportunistically and ignores a failing cleanup', async () => {
    await issue('good-token');
    jest.spyOn(resetTokens, 'deleteExpired').mockRejectedValue(new Error('x'));

    await expect(
      useCase.execute({ token: 'good-token', password: NEW_PASSWORD }),
    ).resolves.toBeUndefined();
  });
});
