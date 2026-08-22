import type { Permission } from '../../application/authorization/permission';
import {
  PERMISSION_KEY,
  RequirePermission,
} from './require-permission.decorator';

// Mirrors the SetMetadata contract PermissionsGuard (PR 3) will read via
// Reflector — same shape as AuthenticatedGuard reading IS_PUBLIC_KEY.
describe('RequirePermission', () => {
  it('sets PERMISSION_KEY metadata on the decorated handler with the given permission', () => {
    class TestController {
      @RequirePermission('user:create')
      handler() {}
    }

    const metadata = Reflect.getMetadata(
      PERMISSION_KEY,
      TestController.prototype.handler,
    ) as Permission;

    expect(metadata).toBe('user:create');
  });
});
