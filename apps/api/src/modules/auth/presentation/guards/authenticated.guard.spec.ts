import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthConfig } from '../../infrastructure/config/auth.config';
import type { TokenDenylist } from '../../application/ports/token-denylist.port';
import type {
  TokenIssuer,
  VerifiedAccessToken,
} from '../../application/ports/token-issuer.port';
import type { UserRepository } from '../../../users/application/ports/user.repository.port';
import { User } from '../../../users/domain/user.entity';
import { AuthenticatedGuard } from './authenticated.guard';

describe('AuthenticatedGuard', () => {
  const authConfig: AuthConfig = {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '2h',
    corsOrigin: 'http://localhost:5173',
    cookie: {
      name: 'sf_access_token',
      httpOnly: true,
      path: '/',
      secure: false,
      sameSite: 'lax',
      maxAge: 2 * 60 * 60 * 1000,
    },
  };

  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let tokenIssuer: jest.Mocked<TokenIssuer>;
  let tokenDenylist: jest.Mocked<TokenDenylist>;
  let userRepository: { findById: jest.Mock };
  let guard: AuthenticatedGuard;

  const PAYLOAD: VerifiedAccessToken = {
    sub: 'user-1',
    email: 'admin@example.com',
    role: 'SYSTEM_ADMIN',
    jti: 'jti-1',
    exp: 9_999_999_999,
  };

  function buildUser(
    overrides: Partial<ConstructorParameters<typeof User>[0]> = {},
  ): User {
    const now = new Date();
    return new User({
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash: 'secret-hash',
      role: 'SYSTEM_ADMIN',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    });
  }

  function buildContext(cookies?: Record<string, string>): {
    context: ExecutionContext;
    request: { cookies?: Record<string, string>; user?: VerifiedAccessToken };
  } {
    const request: {
      cookies?: Record<string, string>;
      user?: VerifiedAccessToken;
    } = { cookies };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    tokenIssuer = { sign: jest.fn(), verify: jest.fn() };
    tokenDenylist = {
      isRevoked: jest.fn(),
      revoke: jest.fn(),
      deleteExpired: jest.fn(),
    };
    userRepository = { findById: jest.fn() };
    guard = new AuthenticatedGuard(
      reflector as unknown as Reflector,
      tokenIssuer,
      tokenDenylist,
      authConfig,
      userRepository as unknown as UserRepository,
    );
  });

  it('lets a @Public() route through without checking any cookie', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokenIssuer.verify).not.toHaveBeenCalled();
  });

  it('rejects when there is no access-token cookie', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired or tampered token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockRejectedValue(new Error('jwt expired'));
    const { context } = buildContext({ sf_access_token: 'bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a valid signature whose jti is denylisted', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 9_999_999_999,
    });
    tokenDenylist.isRevoked.mockResolvedValue(true);
    const { context } = buildContext({ sf_access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects (fail-closed) when TokenDenylist.isRevoked() itself rejects (e.g. transient DB outage), same as an invalid token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 9_999_999_999,
    });
    tokenDenylist.isRevoked.mockRejectedValue(new Error('db unreachable'));
    const { context } = buildContext({ sf_access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('passes through for a valid, non-revoked session whose user still exists', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(buildUser());
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(PAYLOAD);
  });

  it('looks the user up by the token subject', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(buildUser());
    const { context } = buildContext({ sf_access_token: 'good-token' });

    await guard.canActivate(context);

    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
  });

  it('attaches the stored role, not the stale token role, and never leaks the entity or passwordHash', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(buildUser({ role: 'MANAGER' }));
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'MANAGER',
      jti: 'jti-1',
      exp: 9_999_999_999,
    });
    expect(request.user).not.toHaveProperty('passwordHash');
  });

  it('attaches the stored email when it differs from the token email', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(
      buildUser({ email: 'renamed@example.com' }),
    );
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await guard.canActivate(context);

    expect(request.user?.email).toBe('renamed@example.com');
  });

  it('does not carry stray token claims onto request.user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue({
      ...PAYLOAD,
      iat: 1,
    } as VerifiedAccessToken);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(buildUser());
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await guard.canActivate(context);

    expect(request.user).not.toHaveProperty('iat');
  });

  it('rejects when the user no longer exists (null from findById)', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockResolvedValue(null);
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('rejects (fail-closed) when the user lookup itself rejects, with a bare 401', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    userRepository.findById.mockRejectedValue(new Error('db unreachable'));
    const { context } = buildContext({ sf_access_token: 'good-token' });

    const result = guard.canActivate(context);

    await expect(result).rejects.toThrow(UnauthorizedException);
    await expect(result).rejects.toMatchObject({
      message: 'Unauthorized',
    });
  });

  it('does not look the user up for a denylisted token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockResolvedValue(PAYLOAD);
    tokenDenylist.isRevoked.mockResolvedValue(true);
    const { context } = buildContext({ sf_access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('does not look the user up for an invalid token', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenIssuer.verify.mockRejectedValue(new Error('jwt expired'));
    const { context } = buildContext({ sf_access_token: 'bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userRepository.findById).not.toHaveBeenCalled();
  });

  it('does not look the user up for a @Public() route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = buildContext();

    await guard.canActivate(context);

    expect(userRepository.findById).not.toHaveBeenCalled();
  });
});
