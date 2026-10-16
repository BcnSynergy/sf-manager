import type { Role } from '@sf-manager/validation';
import { lazy } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { ELEMENT_HISTORY_ALLOWED_ROLES } from '../auth/element-history-route.roles';

export type AuthenticatedRoute = {
  readonly path: string;
  readonly element: ReactElement;
  // Resolves the route's page component; `element` renders that same
  // component lazily. Exposed so tests can check the pairing without
  // rendering a lazy element.
  readonly load: () => Promise<ComponentType>;
  readonly allowedRoles: Role[] | undefined;
};

// TD-8: every page is loaded on demand through a dynamic import(), so each
// one becomes its own chunk and the first load only fetches what the login
// page and the layout need. AppLayout wraps its <Outlet /> in <Suspense>.
// Never import a page module statically here: that pulls it back into the
// entry chunk (authenticated-routes.test.ts guards this).
function lazyPage(load: () => Promise<ComponentType>) {
  const Page = lazy(() => load().then((component) => ({ default: component })));
  return { element: <Page />, load };
}

// nav-menu/design.md Decision 1: the 29 authenticated routes are declared
// once, here, and App.tsx's <Routes> tree is generated FROM this table by
// .map() — not hand-copied into a parallel array. Each entry keeps the
// ordering comment that used to sit above its <Route> in App.tsx, verbatim,
// same reasoning, new location.
export const AUTHENTICATED_ROUTES: readonly AuthenticatedRoute[] = [
  {
    path: '/',
    ...lazyPage(() => import('../pages/HealthPage').then((m) => m.HealthPage)),
    allowedRoles: undefined,
  },
  {
    path: '/users',
    ...lazyPage(() => import('../pages/UsersListPage').then((m) => m.UsersListPage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  {
    path: '/users/new',
    ...lazyPage(() => import('../pages/UserCreatePage').then((m) => m.UserCreatePage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  {
    path: '/users/:id/edit',
    ...lazyPage(() => import('../pages/UserEditPage').then((m) => m.UserEditPage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  {
    path: '/communities',
    ...lazyPage(() => import('../pages/CommunitiesListPage').then((m) => m.CommunitiesListPage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md "Route order note": the static /communities/new
  // segment ranks above the dynamic /communities/:id segment
  // (added in Phase 7) — React Router matches static path
  // segments before dynamic ones regardless of declaration
  // order, so this coexists safely once :id is added.
  {
    path: '/communities/new',
    ...lazyPage(() => import('../pages/CommunityCreatePage').then((m) => m.CommunityCreatePage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md "Route order note" (same reasoning as /communities/new
  // above): the static /communities/new segment ranks above this
  // dynamic /communities/:id segment, and this depth-2 route is
  // distinct from the depth-3 /communities/:id/edit below it — no
  // ordering conflict against either.
  {
    path: '/communities/:id',
    ...lazyPage(() => import('../pages/CommunityDetailPage').then((m) => m.CommunityDetailPage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md "Route order note" (same reasoning as /communities/new
  // above): the static /communities/new segment already ranks above
  // /communities/:id/edit's dynamic :id segment, and /communities/:id
  // (Phase 7, above) is a distinct depth-2 route from this depth-3
  // one — no ordering conflict between any of the three.
  {
    path: '/communities/:id/edit',
    ...lazyPage(() => import('../pages/CommunityEditPage').then((m) => m.CommunityEditPage)),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 8: nested under the community, same
  // `inspectable-elements` segment on the API and the web (Open
  // Question 3 — no fork). This depth-3 route (:communityId is
  // dynamic, `inspectable-elements` is a literal) never conflicts
  // with `/communities/:id`/`/communities/:id/edit` above — those
  // match on `:id` alone at depth 2/3 with no third literal
  // segment, so Express/React Router never confuses the two
  // families regardless of declaration order.
  {
    path: '/communities/:communityId/inspectable-elements',
    ...lazyPage(() =>
      import('../pages/CommunityElementsListPage').then((m) => m.CommunityElementsListPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 8 (React Router ordering note): the static
  // `new` segment ranks above a dynamic segment regardless of
  // declaration order, and the `:elementId/edit` route below is
  // depth 5 while this is depth 4 — no URL can match both, so no
  // ordering conflict exists.
  {
    path: '/communities/:communityId/inspectable-elements/new',
    ...lazyPage(() =>
      import('../pages/InspectableElementCreatePage').then((m) => m.InspectableElementCreatePage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 8 (React Router ordering note, same
  // reasoning as the static `new` segment above): this depth-5
  // dynamic route never conflicts with the depth-4 static `new`
  // route above regardless of declaration order (React Router
  // matches static segments first), and it never conflicts with
  // `/communities/:id`/`/communities/:id/edit` for the same reason
  // the list/create routes above do not.
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/edit',
    ...lazyPage(() =>
      import('../pages/InspectableElementEditPage').then((m) => m.InspectableElementEditPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 8 (React Router ordering note, same
  // reasoning as `/edit` above): `label` and `edit` are both
  // literal depth-5 segments under the same dynamic `:elementId`
  // parent — distinct final path segments, so declaration order
  // between the two never matters.
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/label',
    ...lazyPage(() =>
      import('../pages/InspectableElementLabelPage').then((m) => m.InspectableElementLabelPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // review-history-per-element/design.md Decision 7: DELIBERATELY
  // five roles, unlike EVERY other route in this
  // `inspectable-elements` family, which is SYSTEM_ADMIN-only.
  // This is a review-history read that happens to be keyed by an
  // element, gated server-side on `reviewSession:read` (never
  // `inspectableElement:read`, which SYSTEM_ADMIN alone holds) —
  // so this route matches /review-history*'s 5-role array below,
  // not its own URL neighbours (`/edit`, `/label`, the list). Do
  // NOT "harmonize" it downward to SYSTEM_ADMIN, and do NOT copy
  // it upward onto `/edit`, `/label` or the element list.
  // ProtectedRoute.test.tsx pins both facts. Depth-5 dynamic route:
  // never conflicts with `/edit`/`/label` above (distinct final
  // path segments under the same dynamic `:elementId` parent — see
  // the ordering note on `/label` above) regardless of declaration
  // order.
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/history',
    ...lazyPage(() =>
      import('../pages/ElementReviewHistoryPage').then((m) => m.ElementReviewHistoryPage),
    ),
    allowedRoles: ELEMENT_HISTORY_ALLOWED_ROLES,
  },
  {
    path: '/maintenance-companies',
    ...lazyPage(() =>
      import('../pages/MaintenanceCompaniesListPage').then((m) => m.MaintenanceCompaniesListPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md "Routes" + the /communities precedent above: the
  // static /maintenance-companies/new segment ranks above the
  // dynamic /maintenance-companies/:id/edit segment Phase 10 adds
  // — React Router matches static path segments before dynamic
  // ones regardless of declaration order, so this coexists safely
  // once :id/edit is added.
  {
    path: '/maintenance-companies/new',
    ...lazyPage(() =>
      import('../pages/MaintenanceCompanyCreatePage').then((m) => m.MaintenanceCompanyCreatePage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md "Routes" + the /communities precedent above: this
  // depth-3 dynamic route never conflicts with the static
  // /maintenance-companies/new segment above regardless of
  // declaration order (React Router matches static segments
  // first).
  {
    path: '/maintenance-companies/:id/edit',
    ...lazyPage(() =>
      import('../pages/MaintenanceCompanyEditPage').then((m) => m.MaintenanceCompanyEditPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  {
    path: '/checklist-questions',
    ...lazyPage(() =>
      import('../pages/ChecklistQuestionsListPage').then((m) => m.ChecklistQuestionsListPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 9 (React Router ordering note, same
  // reasoning as /communities/new above): the static `new`
  // segment ranks above the dynamic `:questionId/edit` segment
  // below regardless of declaration order — React Router matches
  // static path segments before dynamic ones.
  {
    path: '/checklist-questions/new',
    ...lazyPage(() =>
      import('../pages/ChecklistQuestionCreatePage').then((m) => m.ChecklistQuestionCreatePage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 9 (React Router ordering note, same
  // reasoning as the static `new` segment above): this dynamic
  // route never conflicts with the static `new` route above
  // regardless of declaration order.
  {
    path: '/checklist-questions/:questionId/edit',
    ...lazyPage(() =>
      import('../pages/ChecklistQuestionEditPage').then((m) => m.ChecklistQuestionEditPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  {
    path: '/review-templates',
    ...lazyPage(() =>
      import('../pages/ReviewTemplatesListPage').then((m) => m.ReviewTemplatesListPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 9 (React Router ordering note, same
  // reasoning as /checklist-questions/new above): the static `new`
  // segment ranks above the dynamic `:templateId` segment below
  // regardless of declaration order — React Router matches static
  // path segments before dynamic ones.
  {
    path: '/review-templates/new',
    ...lazyPage(() =>
      import('../pages/ReviewTemplateCreatePage').then((m) => m.ReviewTemplateCreatePage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // design.md Decision 9 (React Router ordering note, same
  // reasoning as the static `new` segment above): this dynamic
  // route never conflicts with the static `new` route above
  // regardless of declaration order.
  {
    path: '/review-templates/:templateId',
    ...lazyPage(() =>
      import('../pages/ReviewTemplateDetailPage').then((m) => m.ReviewTemplateDetailPage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
  // review-session-ui spec "Role-Gated Route Access for the Field
  // Flow" + design.md Decision 10: the first non-SYSTEM_ADMIN
  // routes in the app — MAINTENANCE_TECHNICIAN and
  // COMMUNITY_REPRESENTATIVE share the identical flow, no reduced
  // variant for either (spec "Both Non-Admin Roles ..."). Static
  // /review-sessions/new ranks above the dynamic
  // /review-sessions/:sessionId segment below regardless of
  // declaration order (React Router matches static path segments
  // first) — same reasoning as every other list/new pair in this
  // file (e.g. /communities/new above /communities/:id).
  {
    path: '/review-sessions',
    ...lazyPage(() => import('../pages/ReviewSessionsPage').then((m) => m.ReviewSessionsPage)),
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
  },
  {
    path: '/review-sessions/new',
    ...lazyPage(() => import('../pages/ReviewSessionNewPage').then((m) => m.ReviewSessionNewPage)),
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
  },
  // Depth-2 dynamic route: never conflicts with the static `new`
  // segment above (React Router matches static segments first),
  // and is distinct from the depth-4 `:sessionId/elements/:code`
  // route below regardless of declaration order.
  {
    path: '/review-sessions/:sessionId',
    ...lazyPage(() =>
      import('../pages/ReviewSessionDetailPage').then((m) => m.ReviewSessionDetailPage),
    ),
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
  },
  // Depth-4 route with two dynamic segments: never conflicts with
  // `/review-sessions/:sessionId` above (different depth) or with
  // `/review-sessions/new` (a distinct, shorter static route).
  {
    path: '/review-sessions/:sessionId/elements/:code',
    ...lazyPage(() =>
      import('../pages/ReviewSessionElementPage').then((m) => m.ReviewSessionElementPage),
    ),
    allowedRoles: ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'],
  },
  // review-history-ui spec + design.md: read-only, reachable by the
  // two performing roles plus (review-history-company-scope,
  // design.md Q5/Decision 10) MAINTENANCE_COMPANY_MANAGER, plus
  // (review-history-admin-scope design.md "File Changes") SYSTEM_ADMIN,
  // plus (review-history-manager-capability design.md Decision 7)
  // MANAGER — all five reach the identical surface, no reduced or
  // admin-specific variant; MANAGER's actual visibility is gated
  // server-side by the VIEW_ALL_REVIEWS capability, never here. The
  // write surface below (/review-sessions*) is deliberately NOT
  // widened. Static /review-history ranks above the dynamic
  // /review-history/:sessionId segment below regardless of
  // declaration order (same reasoning as every other list/detail
  // pair in this file).
  {
    path: '/review-history',
    ...lazyPage(() => import('../pages/ReviewHistoryPage').then((m) => m.ReviewHistoryPage)),
    allowedRoles: [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ],
  },
  {
    path: '/review-history/:sessionId',
    ...lazyPage(() =>
      import('../pages/ReviewHistoryDetailPage').then((m) => m.ReviewHistoryDetailPage),
    ),
    allowedRoles: [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ],
  },
  // review-document-ui spec "The Document Page Is Gated on the Five History
  // Roles": identical 5-role gate as the two routes above — the MANAGER
  // gate is the role alone, never VIEW_ALL_REVIEWS, which the client never
  // learns. Reached, until PR 13, only by a hand-typed URL (design.md
  // "Web surface": the one "View document" link on
  // ReviewHistoryDetailPage ships separately).
  {
    path: '/review-history/:sessionId/document',
    ...lazyPage(() => import('../pages/ReviewDocumentPage').then((m) => m.ReviewDocumentPage)),
    allowedRoles: [
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
      'MAINTENANCE_COMPANY_MANAGER',
      'SYSTEM_ADMIN',
      'MANAGER',
    ],
  },
  // review-schedule-ui spec "One Schedule Page Behind One Route": four roles.
  // MAINTENANCE_COMPANY_MANAGER is DELIBERATELY absent (review-schedule
  // design.md E8): the schedule is not part of its scope. The gate is the
  // role alone; what each role sees is decided server-side, and the client
  // never learns the VIEW_ALL_REVIEWS capability.
  {
    path: '/review-schedule',
    ...lazyPage(() => import('../pages/ReviewSchedulePage').then((m) => m.ReviewSchedulePage)),
    allowedRoles: ['SYSTEM_ADMIN', 'MANAGER', 'COMMUNITY_REPRESENTATIVE', 'MAINTENANCE_TECHNICIAN'],
  },
  // organization-profile-admin-ui spec "Role-Gated Route Access": a single
  // static settings route, SYSTEM_ADMIN-only, no sibling dynamic segment to
  // order against (design.md "File Changes" — no ordering note needed).
  {
    path: '/organization-profile',
    ...lazyPage(() =>
      import('../pages/OrganizationProfilePage').then((m) => m.OrganizationProfilePage),
    ),
    allowedRoles: ['SYSTEM_ADMIN'],
  },
];
