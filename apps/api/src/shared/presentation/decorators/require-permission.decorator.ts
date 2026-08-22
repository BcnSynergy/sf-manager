import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../application/authorization/permission';

// design.md Decision 1: lives in shared/presentation — mirrors @Public() —
// so `users` (PR 6's controller) never needs to import `auth`. The global
// PermissionsGuard (wired in PR 3's auth.module.ts) reads this metadata via
// Reflector to enforce the required Permission for the marked handler.
export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
