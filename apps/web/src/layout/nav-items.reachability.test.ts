import { describe, expect, it } from 'vitest';
import type { Role } from '@sf-manager/validation';
import { AUTHENTICATED_ROUTES } from '../routes/authenticated-routes';
import { NAV_ITEMS_BY_ROLE } from './nav-items';

// nav-menu verify-report WARNING-2: design.md's Testing Strategy
// "Reachability invariant" row required "a table test pairing each
// NavItem.to with the route's allowedRoles, so a future item pointing at a
// route its role cannot open fails here". This mechanises Decision 3's
// by-hand cross-check table so future drift between nav-items.ts and
// authenticated-routes.tsx fails a test instead of silently breaking.
describe('NAV_ITEMS_BY_ROLE reachability invariant', () => {
  const pairs = (Object.entries(NAV_ITEMS_BY_ROLE) as [Role, readonly { to: string }[]][]).flatMap(
    ([role, items]) => items.map((item) => ({ role, to: item.to })),
  );

  // Sanity check on the fixture itself, not the invariant: if this table
  // construction produced zero pairs, every it.each case below would pass
  // vacuously (a "ghost loop"). 17 = 7 (SYSTEM_ADMIN) + 2 (MANAGER) + 2
  // (MAINTENANCE_COMPANY_MANAGER) + 3 (MAINTENANCE_TECHNICIAN) + 3
  // (COMMUNITY_REPRESENTATIVE), per design.md Decision 3's settled counts.
  it('produces a non-empty (role, target) fixture to actually exercise', () => {
    expect(pairs.length).toBe(17);
  });

  it.each(pairs)('$role can open the route its nav item ($to) points at', ({ role, to }) => {
    const route = AUTHENTICATED_ROUTES.find((candidate) => candidate.path === to);

    expect(route).toBeDefined();
    // `allowedRoles: undefined` means the route has no role gate at all
    // (bare <ProtectedRoute>, e.g. "/") — every authenticated role admits
    // it trivially. Otherwise the role MUST appear in the route's own
    // allowedRoles array — this is the actual reachability assertion.
    if (route?.allowedRoles !== undefined) {
      expect(route?.allowedRoles).toContain(role);
    }
  });
});
