import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../../shared/presentation/decorators/public.decorator';
import {
  TOKEN_DENYLIST,
  type TokenDenylist,
} from '../../application/ports/token-denylist.port';
import {
  TOKEN_ISSUER,
  type TokenIssuer,
  type VerifiedAccessToken,
} from '../../application/ports/token-issuer.port';
import {
  AUTH_CONFIG,
  type AuthConfig,
} from '../../infrastructure/config/auth.config';
import type { AuthenticatedRequest } from '../types';

// design.md Decision 4: registered as APP_GUARD (auth.module.ts) — secure by
// default, opt out per-handler via @Public() instead of per-controller
// @UseGuards, which fails open if a future module forgets it.
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(TOKEN_DENYLIST) private readonly tokenDenylist: TokenDenylist,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[this.authConfig.cookie.name];

    if (!token) {
      throw new UnauthorizedException();
    }

    // Fail-closed: if we can't confirm the signature/expiry is valid, OR we
    // can't confirm the jti isn't revoked (e.g. a transient DB outage),
    // treat it identically to an invalid token. This also means a DB
    // outage never leaks an "internal error" signal distinguishable from
    // "invalid token" to a potential attacker.
    let payload: VerifiedAccessToken;
    try {
      payload = await this.tokenIssuer.verify(token);
      if (await this.tokenDenylist.isRevoked(payload.jti)) {
        throw new UnauthorizedException();
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }

    request.user = payload;
    return true;
  }
}
