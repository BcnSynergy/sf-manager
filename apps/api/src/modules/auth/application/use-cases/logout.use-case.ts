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
import { RefreshSessionsService } from '../services/refresh-sessions.service';

// design.md Data Flow (POST /auth/logout) + Decision 9. Re-verifies the raw
// cookie token itself rather than trusting the guard's already-parsed
// payload — the guard's own verify already gated reaching this use case, so
// this second verify only ever fails if the token expires in the narrow
// window between the guard running and this call.
export interface LogoutInput {
  accessToken?: string;
  refreshToken?: string;
}

// TD-5 S6: logout ends whatever the browser still holds. A valid access
// token has its jti revoked (as before); a refresh cookie has its whole
// family revoked, so the session cannot be renewed. Only the refresh cookie
// may be left once the short-lived access cookie has expired, so either one
// is enough; with neither, there is no session to end (401).
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(TOKEN_DENYLIST) private readonly tokenDenylist: TokenDenylist,
    private readonly refreshSessions: RefreshSessionsService,
  ) {}

  async execute({ accessToken, refreshToken }: LogoutInput): Promise<void> {
    const payload = accessToken ? await this.verified(accessToken) : null;
    if (!payload && !refreshToken) {
      throw new InvalidCredentialsError();
    }

    if (payload) {
      await this.tokenDenylist.revoke(
        payload.jti,
        new Date(payload.exp * 1000),
      );
      try {
        await this.tokenDenylist.deleteExpired();
      } catch {
        // swallow: best-effort cleanup, not a security-relevant operation.
      }
    }

    if (refreshToken) {
      await this.refreshSessions.revoke(refreshToken);
      try {
        await this.refreshSessions.deleteExpired();
      } catch {
        // swallow: best-effort cleanup, not a security-relevant operation.
      }
    }
  }

  private async verified(token: string): Promise<VerifiedAccessToken | null> {
    try {
      return await this.tokenIssuer.verify(token);
    } catch {
      return null;
    }
  }
}
