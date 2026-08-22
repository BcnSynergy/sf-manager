import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionChecker } from '../../application/ports/permission-checker.port';
import { PermissionsGuard } from './permissions.guard';

// design.md Decision 1: second APP_GUARD, registered immediately after
// AuthenticatedGuard — no-op when the handler carries no @RequirePermission,
// fail-closed (401) if AuthenticatedGuard somehow didn't run/attach a user,
// and 403 when the authenticated user's role lacks the required permission.
describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let permissionChecker: jest.Mocked<PermissionChecker>;
  let guard: PermissionsGuard;

  function buildContext(user?: { role: string }): ExecutionContext {
    const request = { user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    permissionChecker = { can: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      permissionChecker,
    );
  });

  it('passes through when the handler carries no @RequirePermission metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = buildContext({ role: 'SYSTEM_ADMIN' });

    expect(guard.canActivate(context)).toBe(true);
    expect(permissionChecker.can).not.toHaveBeenCalled();
  });

  it('rejects with 401 when request.user is missing (fail-closed)', () => {
    reflector.getAllAndOverride.mockReturnValue('user:create');
    const context = buildContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(permissionChecker.can).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the authenticated user has no role yet (pre-PR-7 token)', () => {
    reflector.getAllAndOverride.mockReturnValue('user:create');
    const context = buildContext({ role: undefined as unknown as string });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(permissionChecker.can).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the caller role lacks the required permission', () => {
    reflector.getAllAndOverride.mockReturnValue('user:create');
    permissionChecker.can.mockReturnValue(false);
    const context = buildContext({ role: 'MANAGER' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(permissionChecker.can).toHaveBeenCalledWith(
      'MANAGER',
      'user:create',
    );
  });

  it('passes through when the caller role has the required permission', () => {
    reflector.getAllAndOverride.mockReturnValue('user:create');
    permissionChecker.can.mockReturnValue(true);
    const context = buildContext({ role: 'SYSTEM_ADMIN' });

    expect(guard.canActivate(context)).toBe(true);
    expect(permissionChecker.can).toHaveBeenCalledWith(
      'SYSTEM_ADMIN',
      'user:create',
    );
  });
});
