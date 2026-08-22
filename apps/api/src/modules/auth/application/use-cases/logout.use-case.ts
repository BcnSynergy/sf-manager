import { Inject, Injectable } from '@nestjs/common';
import { InvalidCredentialsError } from '../../domain/invalid-credentials.error';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../ports/token-denylist.port';
import {
  TOKEN_ISSUER,
  type TokenIssuer,
  type VerifiedAccessToken,
} from '../ports/token-issuer.port';

// design.md Data Flow (POST /auth/logout) + Decision 9. Re-verifies the raw
// cookie token itself rather than trusting the guard's already-parsed
// payload — the guard's own verify already gated reaching this use case, so
// this second verify only ever fails if the token expires in the narrow
// window between the guard running and this call.
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(TOKEN_DENYLIST) private readonly tokenDenylist: TokenDenylist,
  ) {}

  async execute(accessToken: string): Promise<void> {
    // A verify() failure in this narrow window must produce the same clean
    // auth failure AuthenticatedGuard itself produces (translated to 401 by
    // AuthController), not an unhandled exception/500.
    let payload: VerifiedAccessToken;
    try {
      payload = await this.tokenIssuer.verify(accessToken);
    } catch {
      throw new InvalidCredentialsError();
    }

    // revoke() failing IS a real problem (revocation is security-relevant)
    // and must propagate normally.
    await this.tokenDenylist.revoke(payload.jti, new Date(payload.exp * 1000));

    // Purely opportunistic housekeeping — a rejection here must never gate
    // an already-successful revocation; the token was revoked either way.
    try {
      await this.tokenDenylist.deleteExpired();
    } catch {
      // swallow: best-effort cleanup, not a security-relevant operation.
    }
  }
}
