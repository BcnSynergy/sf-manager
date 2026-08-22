import { InvalidCredentialsError } from '../../domain/invalid-credentials.error';
import type { TokenDenylist } from '../ports/token-denylist.port';
import type {
  TokenIssuer,
  VerifiedAccessToken,
} from '../ports/token-issuer.port';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  let tokenIssuer: jest.Mocked<TokenIssuer>;
  let tokenDenylist: jest.Mocked<TokenDenylist>;
  let useCase: LogoutUseCase;

  beforeEach(() => {
    tokenIssuer = { sign: jest.fn(), verify: jest.fn() };
    tokenDenylist = {
      isRevoked: jest.fn(),
      revoke: jest.fn(),
      deleteExpired: jest.fn(),
    };
    useCase = new LogoutUseCase(tokenIssuer, tokenDenylist);
  });

  it("revokes the token's jti with its own exp, then cleans up expired rows", async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);

    await useCase.execute('raw-cookie-value');

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

    await expect(useCase.execute('bad-token')).rejects.toThrow(
      InvalidCredentialsError,
    );

    expect(tokenDenylist.revoke).not.toHaveBeenCalled();
    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
  });

  it('still resolves successfully when TokenDenylist.deleteExpired() rejects after a successful revoke (opportunistic cleanup must never gate logout)', async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);
    tokenDenylist.revoke.mockResolvedValue(undefined);
    tokenDenylist.deleteExpired.mockRejectedValue(
      new Error('transient db error'),
    );

    await expect(useCase.execute('raw-cookie-value')).resolves.toBeUndefined();

    expect(tokenDenylist.revoke).toHaveBeenCalledWith(
      'jti-1',
      new Date(1_700_000_000 * 1000),
    );
  });

  it('propagates a revoke() failure (revocation failing is a real problem, unlike cleanup)', async () => {
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };
    tokenIssuer.verify.mockResolvedValue(payload);
    tokenDenylist.revoke.mockRejectedValue(new Error('db unreachable'));

    await expect(useCase.execute('raw-cookie-value')).rejects.toThrow(
      'db unreachable',
    );

    expect(tokenDenylist.deleteExpired).not.toHaveBeenCalled();
  });
});
