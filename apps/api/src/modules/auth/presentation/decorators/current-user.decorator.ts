import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { VerifiedAccessToken } from '../../application/ports/token-issuer.port';

// Extracts the verified token payload AuthenticatedGuard attaches to
// `request.user` after a successful check (signature/expiry + not
// denylisted). Only reachable on routes the guard has already let through.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): VerifiedAccessToken => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: VerifiedAccessToken }>();
    return request.user;
  },
);
