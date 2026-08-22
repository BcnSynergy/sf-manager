import { LastSystemAdminError } from './errors/last-system-admin.error';
import { assertSystemAdminRemains } from './last-admin.policy';

// design.md Decision 3: pure domain function — the use case computes the
// hypothetical count of active SYSTEM_ADMIN users AFTER the mutation
// (deactivation or role change) and passes it here; this function only
// enforces the invariant (spec.md "Last-Admin Lockout").
describe('assertSystemAdminRemains', () => {
  it('throws LastSystemAdminError when the operation would leave zero active admins', () => {
    expect(() => assertSystemAdminRemains(0)).toThrow(LastSystemAdminError);
  });

  it('passes when exactly one active admin would remain', () => {
    expect(() => assertSystemAdminRemains(1)).not.toThrow();
  });

  it('passes when more than one active admin would remain', () => {
    expect(() => assertSystemAdminRemains(2)).not.toThrow();
  });
});
