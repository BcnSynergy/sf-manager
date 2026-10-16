import type { Role } from '@sf-manager/validation';

// nav-menu/design.md Decision 3: extracted to its own module for the same
// reason apps/web/src/auth/element-history-route.roles.ts is — a component
// file (AppLayout.tsx) may not also export a plain constant
// (react-refresh/only-export-components).
// ui-redesign-foundation design Decision 5: the sidebar groups items by
// purpose. Home has no group and always comes first.
export type NavGroup = 'operations' | 'setup' | 'administration';
export const NAV_GROUP_ORDER: readonly NavGroup[] = ['operations', 'setup', 'administration'];

export type NavItem = {
  readonly to: string;
  readonly labelKey: string;
  readonly testId: string;
  readonly end?: boolean;
  readonly group?: NavGroup;
};

export type NavSection = {
  readonly group: NavGroup | null;
  readonly items: readonly NavItem[];
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
const USERS: NavItem = {
  to: '/users',
  labelKey: 'nav.users',
  testId: 'nav-link-users',
  group: 'administration',
};
const COMMUNITIES: NavItem = {
  to: '/communities',
  labelKey: 'nav.communities',
  testId: 'nav-link-communities',
  group: 'setup',
};
const MAINTENANCE_COMPANIES: NavItem = {
  to: '/maintenance-companies',
  labelKey: 'nav.maintenanceCompanies',
  testId: 'nav-link-maintenance-companies',
  group: 'setup',
};
const CHECKLIST_QUESTIONS: NavItem = {
  to: '/checklist-questions',
  labelKey: 'nav.checklistQuestions',
  testId: 'nav-link-checklist-questions',
  group: 'setup',
};
const REVIEW_TEMPLATES: NavItem = {
  to: '/review-templates',
  labelKey: 'nav.reviewTemplates',
  testId: 'nav-link-review-templates',
  group: 'setup',
};
const REVIEW_SESSIONS: NavItem = {
  to: '/review-sessions',
  labelKey: 'nav.reviewSessions',
  testId: 'nav-link-review-sessions',
  group: 'operations',
};
const REVIEW_HISTORY: NavItem = {
  to: '/review-history',
  labelKey: 'nav.reviewHistory',
  testId: 'nav-link-review-history',
  group: 'operations',
};
const REVIEW_SCHEDULE: NavItem = {
  to: '/review-schedule',
  labelKey: 'nav.reviewSchedule',
  testId: 'nav-link-review-schedule',
  group: 'operations',
};
const ORGANIZATION_PROFILE: NavItem = {
  to: '/organization-profile',
  labelKey: 'nav.organizationProfile',
  testId: 'nav-link-organization-profile',
  group: 'administration',
};

// Rows follow the sidebar order of the app-navigation spec table: Home, then
// Operations, Setup, Administration (groupNavItems relies on it only for the
// order inside each group).
// `satisfies Record<Role, …>` is the exhaustiveness guard: a sixth Role
// member fails the BUILD instead of silently rendering an empty nav. Every
// `to` below is cross-checked against the routes' `allowedRoles`
// (nav-menu/design.md Decision 3) — the nav never invents reachability.
// DELIBERATELY no REVIEW_SESSIONS for SYSTEM_ADMIN / MANAGER /
// MAINTENANCE_COMPANY_MANAGER: no navigation control offered to these three
// roles may lead to the /review-sessions write surface.
// REVIEW_SCHEDULE is offered to four roles. DELIBERATELY not to
// MAINTENANCE_COMPANY_MANAGER (review-schedule design.md E8): the schedule is
// outside that role's scope, and /review-schedule denies it, so the nav never
// offers a link the role cannot open.
export const NAV_ITEMS_BY_ROLE = {
  SYSTEM_ADMIN: [
    HOME,
    REVIEW_SCHEDULE,
    REVIEW_HISTORY,
    COMMUNITIES,
    MAINTENANCE_COMPANIES,
    REVIEW_TEMPLATES,
    CHECKLIST_QUESTIONS,
    USERS,
    ORGANIZATION_PROFILE,
  ],
  MANAGER: [HOME, REVIEW_SCHEDULE, REVIEW_HISTORY],
  MAINTENANCE_COMPANY_MANAGER: [HOME, REVIEW_HISTORY],
  MAINTENANCE_TECHNICIAN: [HOME, REVIEW_SCHEDULE, REVIEW_SESSIONS, REVIEW_HISTORY],
  COMMUNITY_REPRESENTATIVE: [HOME, REVIEW_SCHEDULE, REVIEW_SESSIONS, REVIEW_HISTORY],
} as const satisfies Record<Role, readonly NavItem[]>;

// Splits a role's items into the sidebar's sections: the ungrouped items
// (Home) first, then one section per group in NAV_GROUP_ORDER, skipping a
// group the role has no item in. Items keep their row order.
export function groupNavItems(items: readonly NavItem[]): NavSection[] {
  const sections: NavSection[] = [];
  const ungrouped = items.filter((item) => item.group === undefined);
  if (ungrouped.length > 0) sections.push({ group: null, items: ungrouped });
  for (const group of NAV_GROUP_ORDER) {
    const grouped = items.filter((item) => item.group === group);
    if (grouped.length > 0) sections.push({ group, items: grouped });
  }
  return sections;
}
