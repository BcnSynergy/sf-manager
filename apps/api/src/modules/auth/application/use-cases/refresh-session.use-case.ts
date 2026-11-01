import { Inject, Injectable } from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import type { Role } from '../../../users/domain/role';
import { RefreshRejectedError } from '../../domain/refresh-rejected.error';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';
import {
  type IssuedRefreshToken,
  RefreshSessionsService,
} from '../services/refresh-sessions.service';

export interface RefreshSessionResult {
  user: { id: string; email: string; role: Role };
  accessToken: string;
  refreshToken: IssuedRefreshToken;
}

// TD-5 S3, S6: exchanges a refresh token for a new access token and the next
// refresh token. The user is read live (as AuthenticatedGuard does), so a
// deleted user cannot refresh and a changed role is in the new token.
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly refreshSessions: RefreshSessionsService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
  ) {}

  async execute(refreshToken: string): Promise<RefreshSessionResult> {
    const rotated = await this.refreshSessions.rotate(refreshToken);
    const user = await this.userRepository.findById(rotated.userId);
    if (!user) {
      await this.refreshSessions.revoke(rotated.token);
      throw new RefreshRejectedError('revoked');
    }
    const accessToken = await this.tokenIssuer.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken: { token: rotated.token, expiresAt: rotated.expiresAt },
    };
  }
}
