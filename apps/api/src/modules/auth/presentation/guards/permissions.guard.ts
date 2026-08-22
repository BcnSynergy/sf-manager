import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../../../../shared/application/authorization/permission';
import { PERMISSION_KEY } from '../../../../shared/presentation/decorators/require-permission.decorator';
import type { Role } from '../../../users/domain/role';
import {
  PERMISSION_CHECKER,
  type PermissionChecker,
} from '../../application/ports/permission-checker.port';

// Minimal request shape this guard reads. `role` is NOT yet part of
// AuthenticatedRequest/VerifiedAccessToken (../types.ts) — that lands in PR 7
// (design.md Phase 7, "role in JWT"). This guard is written against the
// intended end-state shape now; until PR 7 lands, no controller uses
// @RequirePermission (PR 6) so this path never executes against real traffic.
type RequestWithAuthenticatedUser = {
  user?: { role: Role };
};

// design.md Decision 1: second APP_GUARD (auth.module.ts), registered
// immediately after AuthenticatedGuard — order matters, since this guard
// assumes AuthenticatedGuard already ran and attached `request.user` for any
// non-public route. No-op when the handler carries no @RequirePermission
// metadata (nothing in this PR sets it yet). Fail-closed: if `request.user`
// is somehow absent, reject with 401 rather than silently allow.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_CHECKER)
    private readonly permissionChecker: PermissionChecker,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<
      Permission | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermission) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    // Fail-closed: an authenticated request whose token predates `role`
    // being signed into the JWT (pre-PR-7) must not reach the permission
    // checker with `role: undefined` — that would throw, not reject cleanly.
    if (
      !request.user.role ||
      !this.permissionChecker.can(request.user.role, requiredPermission)
    ) {
      throw new ForbiddenException();
    }

    return true;
  }
}
