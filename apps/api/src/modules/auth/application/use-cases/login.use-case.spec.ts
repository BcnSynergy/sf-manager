import { User } from '../../../users/domain/user.entity';
import type { UserRepository } from '../../../users/application/ports/user.repository.port';
import { InvalidCredentialsError } from '../../domain/invalid-credentials.error';
import type { PasswordHasher } from '../../../../shared/application/ports/password-hasher.port';
import type { TokenDenylist } from '../ports/token-denylist.port';
import type { TokenIssuer } from '../ports/token-issuer.port';
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
  let useCase: LoginUseCase;

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
    useCase = new LoginUseCase(
      userRepository,
      passwordHasher,
      tokenIssuer,
      tokenDenylist,
    );
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
    expect(result).toEqual({
      user: { id: 'user-1', email: 'admin@example.com', role: 'SYSTEM_ADMIN' },
      accessToken: 'signed.jwt.token',
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
});
