import type { Role } from '@sf-manager/validation';

// review-history-per-element/design.md Decision 7 +
// authenticated-routes.tsx's route comment: `/communities/:communityId/
// inspectable-elements/:elementId/history` DELIBERATELY uses this 5-role
// array, unlike every other route in the `inspectable-elements` family
// (list, `/new`, `/edit`, `/label`), which stays SYSTEM_ADMIN-only. Do NOT
// "harmonize" it downward to SYSTEM_ADMIN, and do NOT copy it upward onto
// `/edit`, `/label` or the element list.
//
// Exported from its own module, not from `App.tsx` — `App.tsx` exports only
// components (`App` and `AppRoutes`, nav-menu/design.md Decision 1), so
// `react-refresh/only-export-components` forbids mixing a component export
// with a plain constant export there. This module also stays separate from
// `authenticated-routes.tsx`, which holds the relocated route declarations
// and comments but exports no components — so `ProtectedRoute.test.tsx`
// (verify-report.md W-4) imports this array instead of hand-copying it: an
// accidental narrowing of the route's `allowedRoles` now fails the test via
// an import-level mismatch, instead of silently passing against a stale
// local duplicate.
export const ELEMENT_HISTORY_ALLOWED_ROLES: Role[] = [
  'MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE',
  'MAINTENANCE_COMPANY_MANAGER',
  'SYSTEM_ADMIN',
  'MANAGER',
];
