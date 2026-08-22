import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthConfig } from '../../infrastructure/config/auth.config';
import type { TokenDenylist } from '../../application/ports/token-denylist.port';
import type {
  TokenIssuer,
  VerifiedAccessToken,
} from '../../application/ports/token-issuer.port';
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
  let guard: AuthenticatedGuard;

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
    guard = new AuthenticatedGuard(
      reflector as unknown as Reflector,
      tokenIssuer,
      tokenDenylist,
      authConfig,
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
      jti: 'jti-1',
      exp: 9_999_999_999,
    });
    tokenDenylist.isRevoked.mockRejectedValue(new Error('db unreachable'));
    const { context } = buildContext({ sf_access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('passes through and attaches the verified payload for a valid, non-revoked session', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 9_999_999_999,
    };
    tokenIssuer.verify.mockResolvedValue(payload);
    tokenDenylist.isRevoked.mockResolvedValue(false);
    const { context, request } = buildContext({
      sf_access_token: 'good-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
