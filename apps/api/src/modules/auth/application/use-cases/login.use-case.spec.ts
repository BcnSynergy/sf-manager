import { Logger } from '@nestjs/common';
import { User } from '../../../users/domain/user.entity';
import type { UserRepository } from '../../../users/application/ports/user.repository.port';
import { InvalidCredentialsError } from '../../domain/invalid-credentials.error';
import { LoginBlockedError } from '../../domain/login-blocked.error';
import type { PasswordHasher } from '../../../../shared/application/ports/password-hasher.port';
import type { LoginFailureLimiter } from '../ports/login-failure-limiter.port';
import type { TokenDenylist } from '../ports/token-denylist.port';
import type { TokenIssuer } from '../ports/token-issuer.port';
import type { RefreshSessionsService } from '../services/refresh-sessions.service';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const activeUser = new User({
    id: 'user-1',
    email: 'admin@example.com',
    passwordHash: 'real-argon2id-hash',
    role: 'SYSTEM_ADMIN',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  let userRepository: jest.Mocked<UserRepository>;
  let passwordHasher: jest.Mocked<PasswordHasher>;
  let tokenIssuer: jest.Mocked<TokenIssuer>;
  let tokenDenylist: jest.Mocked<TokenDenylist>;
  let loginFailureLimiter: jest.Mocked<LoginFailureLimiter>;
  let refreshSessions: jest.Mocked<
    Pick<RefreshSessionsService, 'start' | 'deleteExpired'>
  >;
  let useCase: LoginUseCase;
  const refreshExpiresAt = new Date('2026-11-01T16:00:00.000Z');

  beforeEach(() => {
    userRepository = {
      findByEmail: jest.fn(),
      save: jest.fn(),
      // user-management-roles PR 5 extended UserRepository with these
      // members (design.md Interfaces/Contracts) — LoginUseCase only ever
      // calls findByEmail/save, but the jest.Mocked<UserRepository> type
      // requires a mock for every member.
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      updateById: jest.fn(),
      softDeleteById: jest.fn(),
      countActiveByRole: jest.fn(),
      countActiveByMaintenanceCompany: jest.fn(),
      transactional: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
      verifyAgainstDummy: jest.fn(),
    };
    tokenIssuer = { sign: jest.fn(), verify: jest.fn() };
    tokenDenylist = {
      isRevoked: jest.fn(),
      revoke: jest.fn(),
      deleteExpired: jest.fn(),
    };
    loginFailureLimiter = {
      getBlock: jest.fn().mockResolvedValue({ blocked: false }),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    // TD-5: a login starts a refresh-token family.
    refreshSessions = {
      start: jest.fn().mockResolvedValue({
        token: 'refresh-token',
        expiresAt: refreshExpiresAt,
      }),
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      tokenIssuer,
      tokenDenylist,
      loginFailureLimiter,
      refreshSessions as unknown as RefreshSessionsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('issues an access token for valid credentials', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    passwordHasher.verify.mockResolvedValue(true);
    tokenIssuer.sign.mockResolvedValue('signed.jwt.token');

    const result = await useCase.execute(
      'admin@example.com',
      'correct-password',
    );

    expect(passwordHasher.verify).toHaveBeenCalledWith(
      'real-argon2id-hash',
      'correct-password',
    );
    expect(passwordHasher.verifyAgainstDummy).not.toHaveBeenCalled();
    expect(tokenDenylist.deleteExpired).toHaveBeenCalledTimes(1);
    // jti is generated internally by the TokenIssuer adapter (Decision 9) —
    // this use case only supplies {sub, email, role}, never a jti.
    expect(tokenIssuer.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
    });
    expect(refreshSessions.start).toHaveBeenCalledWith('user-1');
    expect(refreshSessions.deleteExpired).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      user: { id: 'user-1', email: 'admin@example.com', role: 'SYSTEM_ADMIN' },
      accessToken: 'signed.jwt.token',
      refreshToken: { token: 'refresh-token', expiresAt: refreshExpiresAt },
    });
  });

  it('still logs in when the refresh-token cleanup rejects (opportunistic, like the denylist one)', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    passwordHasher.verify.mockResolvedValue(true);
    refreshSessions.deleteExpired.mockRejectedValue(
      new Error('transient db error'),
    );
    tokenIssuer.sign.mockResolvedValue('signed.jwt.token');

    const result = await useCase.execute(
      'admin@example.com',
      'correct-password',
    );

    expect(result.refreshToken).toEqual({
      token: 'refresh-token',
      expiresAt: refreshExpiresAt,
    });
  });

  it('still issues a token when TokenDenylist.deleteExpired() rejects (opportunistic cleanup must never gate login)', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    passwordHasher.verify.mockResolvedValue(true);
    tokenDenylist.deleteExpired.mockRejectedValue(
      new Error('transient db error'),
    );
    tokenIssuer.sign.mockResolvedValue('signed.jwt.token');

    const result = await useCase.execute(
      'admin@example.com',
      'correct-password',
    );

    expect(result).toEqual({
      user: { id: 'user-1', email: 'admin@example.com', role: 'SYSTEM_ADMIN' },
      accessToken: 'signed.jwt.token',
      refreshToken: { token: 'refresh-token', expiresAt: refreshExpiresAt },
    });
  });

  it('rejects a wrong password with a generic error, without touching the denylist or issuing a token', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    passwordHasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute('admin@example.com', 'wrong-password'),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(passwordHasher.verifyAgainstDummy).not.toHaveBeenCalled();
    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
    expect(refreshSessions.start).not.toHaveBeenCalled();
  });

  it('runs the dummy-hash verify for an unknown email (comparable timing) and rejects generically', async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    passwordHasher.verifyAgainstDummy.mockResolvedValue(false);

    await expect(
      useCase.execute('nobody@example.com', 'any-password'),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(passwordHasher.verifyAgainstDummy).toHaveBeenCalledWith(
      'any-password',
    );
    expect(passwordHasher.verify).not.toHaveBeenCalled();
    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
  });

  it('treats a PasswordHasher.verify() rejection (e.g. corrupt hash) as a failed login, not an unhandled exception', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    passwordHasher.verify.mockRejectedValue(new Error('malformed hash string'));

    await expect(
      useCase.execute('admin@example.com', 'any-password'),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
  });

  it('rejects a soft-deleted user identically to an unknown email (repository already applies the deletedAt filter)', async () => {
    // PrismaUserRepository's default deletedAt: null filter (ADR-010,
    // verified by its own unit/integration tests) makes a soft-deleted
    // user's email resolve to null here — from LoginUseCase's perspective
    // this is the exact same code path as "unknown email" (design.md
    // Decision 7).
    userRepository.findByEmail.mockResolvedValue(null);
    passwordHasher.verifyAgainstDummy.mockResolvedValue(false);

    await expect(
      useCase.execute('soft-deleted@example.com', 'any-password'),
    ).rejects.toThrow(InvalidCredentialsError);

    expect(passwordHasher.verifyAgainstDummy).toHaveBeenCalledWith(
      'any-password',
    );
  });

  describe('per-email failure limit (login-account-lockout)', () => {
    it.each(['correct-password', 'wrong-password'])(
      'rejects a blocked email before any credential evaluation (password %s)',
      async (password) => {
        loginFailureLimiter.getBlock.mockResolvedValue({
          blocked: true,
          retryAfterSeconds: 42,
        });
        userRepository.findByEmail.mockResolvedValue(activeUser);
        passwordHasher.verify.mockResolvedValue(true);

        const error = await useCase
          .execute('admin@example.com', password)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(LoginBlockedError);
        expect((error as LoginBlockedError).retryAfterSeconds).toBe(42);
        expect(loginFailureLimiter.getBlock).toHaveBeenCalledWith(
          'admin@example.com',
        );
        expect(userRepository.findByEmail).not.toHaveBeenCalled();
        expect(passwordHasher.verify).not.toHaveBeenCalled();
        expect(passwordHasher.verifyAgainstDummy).not.toHaveBeenCalled();
        expect(loginFailureLimiter.recordFailure).not.toHaveBeenCalled();
        expect(tokenIssuer.sign).not.toHaveBeenCalled();
      },
    );

    it('records exactly one failure for a wrong password', async () => {
      userRepository.findByEmail.mockResolvedValue(activeUser);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        useCase.execute('admin@example.com', 'wrong-password'),
      ).rejects.toThrow(InvalidCredentialsError);

      expect(loginFailureLimiter.recordFailure).toHaveBeenCalledTimes(1);
      expect(loginFailureLimiter.recordFailure).toHaveBeenCalledWith(
        'admin@example.com',
      );
      expect(loginFailureLimiter.reset).not.toHaveBeenCalled();
    });

    it('records the failure for an unknown or soft-deleted email through the same call sequence as an existing user', async () => {
      const sequenceFor = async (found: User | null): Promise<string[]> => {
        const calls: string[] = [];
        loginFailureLimiter.getBlock.mockImplementation(() => {
          calls.push('getBlock');
          return Promise.resolve({ blocked: false });
        });
        userRepository.findByEmail.mockImplementation(() => {
          calls.push('findByEmail');
          return Promise.resolve(found);
        });
        passwordHasher.verify.mockImplementation(() => {
          calls.push('verify');
          return Promise.resolve(false);
        });
        passwordHasher.verifyAgainstDummy.mockImplementation(() => {
          calls.push('verify');
          return Promise.resolve(false);
        });
        loginFailureLimiter.recordFailure.mockImplementation(() => {
          calls.push('recordFailure');
          return Promise.resolve();
        });

        await expect(
          useCase.execute('someone@example.com', 'wrong-password'),
        ).rejects.toThrow(InvalidCredentialsError);
        return calls;
      };

      const existing = await sequenceFor(activeUser);
      const unknownOrSoftDeleted = await sequenceFor(null);

      expect(existing).toEqual([
        'getBlock',
        'findByEmail',
        'verify',
        'recordFailure',
      ]);
      expect(unknownOrSoftDeleted).toEqual(existing);
    });

    it('resets the counter on success and does not record a failure', async () => {
      userRepository.findByEmail.mockResolvedValue(activeUser);
      passwordHasher.verify.mockResolvedValue(true);
      tokenIssuer.sign.mockResolvedValue('signed.jwt.token');

      await useCase.execute('admin@example.com', 'correct-password');

      expect(loginFailureLimiter.reset).toHaveBeenCalledTimes(1);
      expect(loginFailureLimiter.reset).toHaveBeenCalledWith(
        'admin@example.com',
      );
      expect(loginFailureLimiter.recordFailure).not.toHaveBeenCalled();
    });

    it('fails closed when the block check rejects: no credential evaluation', async () => {
      const storageError = new Error('storage down');
      loginFailureLimiter.getBlock.mockRejectedValue(storageError);

      await expect(
        useCase.execute('admin@example.com', 'correct-password'),
      ).rejects.toBe(storageError);

      expect(userRepository.findByEmail).not.toHaveBeenCalled();
      expect(passwordHasher.verify).not.toHaveBeenCalled();
      expect(passwordHasher.verifyAgainstDummy).not.toHaveBeenCalled();
    });

    it('fails closed when recording a failure rejects: the storage error surfaces, not InvalidCredentialsError', async () => {
      const storageError = new Error('storage down');
      userRepository.findByEmail.mockResolvedValue(activeUser);
      passwordHasher.verify.mockResolvedValue(false);
      loginFailureLimiter.recordFailure.mockRejectedValue(storageError);

      await expect(
        useCase.execute('admin@example.com', 'wrong-password'),
      ).rejects.toBe(storageError);
    });

    it('still logs in when the reset rejects, warning without the email', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      userRepository.findByEmail.mockResolvedValue(activeUser);
      passwordHasher.verify.mockResolvedValue(true);
      tokenIssuer.sign.mockResolvedValue('signed.jwt.token');
      loginFailureLimiter.reset.mockRejectedValue(new Error('storage down'));

      const result = await useCase.execute(
        'admin@example.com',
        'correct-password',
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).not.toContain('admin@example.com');
    });
  });
});
