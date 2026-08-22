import { LastSystemAdminError } from './errors/last-system-admin.error';

// design.md Decision 3: pure domain function, no ports. The use case owns
// the transaction and supplies the count of active SYSTEM_ADMIN users that
// would remain AFTER the mutation (deactivation or role change away from
// SYSTEM_ADMIN); this function only enforces the invariant (spec.md
// "Last-Admin Lockout") — it does no I/O and holds no repository reference.
export function assertSystemAdminRemains(activeAdminCount: number): void {
  if (activeAdminCount < 1) {
    throw new LastSystemAdminError();
  }
}
