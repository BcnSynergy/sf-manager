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
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
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
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
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
    // can't confirm the jti isn't revoked, OR we can't confirm the user
    // still exists (e.g. a transient DB outage), treat it identically to an
    // invalid token. This also means a DB outage never leaks an "internal
    // error" signal distinguishable from "invalid token" to a potential
    // attacker.
    //
    // Order matters: a revoked token never costs a user query. The user is
    // re-read on every request so that deletion, role and email changes
    // take effect immediately; the JWT role/email claims are advisory only
    // (ADR-011, 2026-10-06 addendum).
    let user: VerifiedAccessToken;
    try {
      const payload: VerifiedAccessToken = await this.tokenIssuer.verify(token);
      if (await this.tokenDenylist.isRevoked(payload.jti)) {
        throw new UnauthorizedException();
      }
      const storedUser = await this.userRepository.findById(payload.sub);
      if (!storedUser) {
        throw new UnauthorizedException();
      }
      // Built field by field: never the entity (no passwordHash), and no
      // stray token claims (e.g. iat) ride along.
      user = {
        sub: payload.sub,
        email: storedUser.email,
        role: storedUser.role,
        jti: payload.jti,
        exp: payload.exp,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException();
    }

    request.user = user;
    return true;
  }
}
