import { InvalidCredentialsError } from '../../domain/invalid-credentials.error';
import type { TokenDenylist } from '../ports/token-denylist.port';
import type {
  TokenIssuer,
  VerifiedAccessToken,
} from '../ports/token-issuer.port';
import type { RefreshSessionsService } from '../services/refresh-sessions.service';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  let tokenIssuer: jest.Mocked<TokenIssuer>;
  let tokenDenylist: jest.Mocked<TokenDenylist>;
  let refreshSessions: jest.Mocked<
    Pick<RefreshSessionsService, 'revoke' | 'deleteExpired'>
  >;
  let useCase: LogoutUseCase;

  beforeEach(() => {
    tokenIssuer = { sign: jest.fn(), verify: jest.fn() };
    tokenDenylist = {
      isRevoked: jest.fn(),
      revoke: jest.fn(),
      deleteExpired: jest.fn(),
    };
    refreshSessions = {
      revoke: jest.fn().mockResolvedValue(true),
      deleteExpired: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new LogoutUseCase(
      tokenIssuer,
      tokenDenylist,
      refreshSessions as unknown as RefreshSessionsService,
    );
  });

  it("revokes the token's jti with its own exp, then cleans up expired rows", async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);

    await useCase.execute({ accessToken: 'raw-cookie-value' });

    expect(tokenIssuer.verify).toHaveBeenCalledWith('raw-cookie-value');
    expect(tokenDenylist.revoke).toHaveBeenCalledWith(
      'jti-1',
      new Date(1_700_000_000 * 1000),
    );
    expect(tokenDenylist.deleteExpired).toHaveBeenCalledTimes(1);
  });

  it('translates a verify() failure into a clean auth failure (InvalidCredentialsError), never revoking or cleaning up', async () => {
    // A verify() failure here only happens in the narrow window where the
    // token expires between AuthenticatedGuard's own verify and this one —
    // it must surface as the same clean auth failure the guard itself
    // produces (401-equivalent), not an unhandled exception/500.
    tokenIssuer.verify.mockRejectedValue(new Error('jwt expired'));

    await expect(useCase.execute({ accessToken: 'bad-token' })).rejects.toThrow(
      InvalidCredentialsError,
    );

    expect(tokenDenylist.revoke).not.toHaveBeenCalled();
    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
  });

  it('still resolves successfully when TokenDenylist.deleteExpired() rejects after a successful revoke (opportunistic cleanup must never gate logout)', async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);
    tokenDenylist.revoke.mockResolvedValue(undefined);
    tokenDenylist.deleteExpired.mockRejectedValue(
      new Error('transient db error'),
    );

    await expect(
      useCase.execute({ accessToken: 'raw-cookie-value' }),
    ).resolves.toBeUndefined();

    expect(tokenDenylist.revoke).toHaveBeenCalledWith(
      'jti-1',
      new Date(1_700_000_000 * 1000),
    );
  });

  it('propagates a revoke() failure (revocation failing is a real problem, unlike cleanup)', async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);
    tokenDenylist.revoke.mockRejectedValue(new Error('db unreachable'));

    await expect(
      useCase.execute({ accessToken: 'raw-cookie-value' }),
    ).rejects.toThrow('db unreachable');

    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
  });

  // TD-5 S6: logout also ends the refresh family, and works when only the
  // refresh cookie is left (the 15-minute access cookie has expired).
  describe('refresh family', () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };

    it('revokes the family of the refresh cookie when it is the only cookie left', async () => {
      await expect(
        useCase.execute({ refreshToken: 'refresh-cookie' }),
      ).resolves.toBeUndefined();

      expect(refreshSessions.revoke).toHaveBeenCalledWith('refresh-cookie');
      expect(tokenIssuer.verify).not.toHaveBeenCalled();
      expect(tokenDenylist.revoke).not.toHaveBeenCalled();
      expect(refreshSessions.deleteExpired).toHaveBeenCalledTimes(1);
    });

    it('revokes both the access token and the refresh family when both cookies are sent', async () => {
      tokenIssuer.verify.mockResolvedValue(payload);

      await useCase.execute({
        accessToken: 'access-cookie',
        refreshToken: 'refresh-cookie',
      });

      expect(tokenDenylist.revoke).toHaveBeenCalledWith(
        'jti-1',
        new Date(1_700_000_000 * 1000),
      );
      expect(refreshSessions.revoke).toHaveBeenCalledWith('refresh-cookie');
    });

    it('still revokes the refresh family when the access cookie no longer verifies', async () => {
      tokenIssuer.verify.mockRejectedValue(new Error('jwt expired'));

      await expect(
        useCase.execute({
          accessToken: 'expired-access',
          refreshToken: 'refresh-cookie',
        }),
      ).resolves.toBeUndefined();

      expect(tokenDenylist.revoke).not.toHaveBeenCalled();
      expect(refreshSessions.revoke).toHaveBeenCalledWith('refresh-cookie');
    });

    it('fails with InvalidCredentialsError when there is neither a valid access token nor a refresh cookie', async () => {
      tokenIssuer.verify.mockRejectedValue(new Error('jwt expired'));

      await expect(
        useCase.execute({ accessToken: 'expired-access' }),
      ).rejects.toThrow(InvalidCredentialsError);
      await expect(useCase.execute({})).rejects.toThrow(
        InvalidCredentialsError,
      );

      expect(refreshSessions.revoke).not.toHaveBeenCalled();
      expect(refreshSessions.deleteExpired).not.toHaveBeenCalled();
    });

    it('propagates a failure to revoke the family', async () => {
      refreshSessions.revoke.mockRejectedValue(new Error('db unreachable'));

      await expect(
        useCase.execute({ refreshToken: 'refresh-cookie' }),
      ).rejects.toThrow('db unreachable');
    });

    // The endpoint is public: an anonymous client sending any cookie value
    // must not make the API run a cleanup DELETE per request.
    it('skips the cleanup when the refresh cookie is not a token we issued', async () => {
      refreshSessions.revoke.mockResolvedValue(false);

      await expect(
        useCase.execute({ refreshToken: 'garbage' }),
      ).resolves.toBeUndefined();

      expect(refreshSessions.deleteExpired).not.toHaveBeenCalled();
    });

    it('ignores a failure of the refresh-token cleanup', async () => {
      refreshSessions.deleteExpired.mockRejectedValue(new Error('transient'));

      await expect(
        useCase.execute({ refreshToken: 'refresh-cookie' }),
      ).resolves.toBeUndefined();
    });
  });
});
