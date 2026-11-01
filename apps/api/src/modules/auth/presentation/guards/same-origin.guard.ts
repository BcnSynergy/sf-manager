import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUTH_CONFIG,
  type AuthConfig,
} from '../../infrastructure/config/auth.config';

// TD-5 S7: CSRF guard for endpoints that act on a cookie alone. Browsers send
// Origin on every POST; one that is present and is not the web app's origin
// is refused. A missing Origin is not a cross-site browser call, so it
// passes (curl, server-to-server). SameSite on the cookie is the first line;
// this one also covers development, where SameSite is lax.
@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.authConfig.corsOrigin) {
      throw new ForbiddenException();
    }
    return true;
  }
}
