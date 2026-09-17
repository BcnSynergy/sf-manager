import type { Role } from '@sf-manager/validation';

// nav-menu/design.md Decision 3: extracted to its own module for the same
// reason apps/web/src/auth/element-history-route.roles.ts is — a component
// file (AppLayout.tsx) may not also export a plain constant
// (react-refresh/only-export-components) — and so the test can import the
// real table instead of a hand-copied duplicate.
export type NavItem = {
  readonly to: string;
  readonly labelKey: string;
  readonly testId: string;
  readonly end?: boolean;
};

// Each item is declared ONCE and shared by reference across the role rows
// below, so REVIEW_HISTORY's five appearances can never drift apart.
// HOME is shared by all five roles: without it, "/" (HealthPage) becomes
// unreachable via nav the moment a user clicks any other item.
// `end: true` is required on HOME alone: NavLink matches against the
// current URL pathname, and "/" is the only path that is a prefix of every
// other route — without `end` it would show aria-current on every
// authenticated route simultaneously with whichever item actually matches.
const HOME: NavItem = { to: '/', labelKey: 'nav.home', testId: 'nav-link-home', end: true };
const USERS: NavItem = { to: '/users', labelKey: 'nav.users', testId: 'nav-link-users' };
const COMMUNITIES: NavItem = {
  to: '/communities',
  labelKey: 'nav.communities',
  testId: 'nav-link-communities',
};
const MAINTENANCE_COMPANIES: NavItem = {
  to: '/maintenance-companies',
  labelKey: 'nav.maintenanceCompanies',
  testId: 'nav-link-maintenance-companies',
};
const CHECKLIST_QUESTIONS: NavItem = {
  to: '/checklist-questions',
  labelKey: 'nav.checklistQuestions',
  testId: 'nav-link-checklist-questions',
};
const REVIEW_TEMPLATES: NavItem = {
  to: '/review-templates',
  labelKey: 'nav.reviewTemplates',
  testId: 'nav-link-review-templates',
};
const REVIEW_SESSIONS: NavItem = {
  to: '/review-sessions',
  labelKey: 'nav.reviewSessions',
  testId: 'nav-link-review-sessions',
};
const REVIEW_HISTORY: NavItem = {
  to: '/review-history',
  labelKey: 'nav.reviewHistory',
  testId: 'nav-link-review-history',
};

// `satisfies Record<Role, …>` is the exhaustiveness guard: a sixth Role
// member fails the BUILD instead of silently rendering an empty nav. Every
// `to` below is cross-checked against the routes' `allowedRoles`
// (nav-menu/design.md Decision 3) — the nav never invents reachability.
// DELIBERATELY no REVIEW_SESSIONS for SYSTEM_ADMIN / MANAGER /
// MAINTENANCE_COMPANY_MANAGER: no navigation control offered to these three
// roles may lead to the /review-sessions write surface.
export const NAV_ITEMS_BY_ROLE = {
  SYSTEM_ADMIN: [
    HOME,
    USERS,
    COMMUNITIES,
    MAINTENANCE_COMPANIES,
    CHECKLIST_QUESTIONS,
    REVIEW_TEMPLATES,
    REVIEW_HISTORY,
  ],
  MANAGER: [HOME, REVIEW_HISTORY],
  MAINTENANCE_COMPANY_MANAGER: [HOME, REVIEW_HISTORY],
  MAINTENANCE_TECHNICIAN: [HOME, REVIEW_SESSIONS, REVIEW_HISTORY],
  COMMUNITY_REPRESENTATIVE: [HOME, REVIEW_SESSIONS, REVIEW_HISTORY],
} as const satisfies Record<Role, readonly NavItem[]>;
