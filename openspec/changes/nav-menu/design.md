# Design: Global Role-Filtered Navigation

## Technical Approach

One pathless layout route, one layout component, one static role → items
table, one CSS print rule. No new dependency, no new context, no new state, no
backend change — `useAuth()` already carries everything the nav reads.

The whole design is shaped by one constraint the proposal states twice and the
success criteria pin: **route *gating* must come out byte-identical.** Every
shape below is chosen so that "the `allowedRoles` arrays did not change" is a
*mechanically checkable* fact rather than a reviewer's careful reading.

The slice's rules, each in exactly one place:

| Rule | Where it is enforced | How it is auditable |
|---|---|---|
| The nav is on every authenticated page | A pathless parent `<Route element={<AppLayout />}>` wrapping all 28 authenticated routes (Decision 1) | There is **one** wrapper; no route can opt out by being forgotten |
| `/login` gets no nav | It is the one route declared **outside** the layout route | Structural — `/login` has no layout ancestor |
| No nav while loading, none without a user | `AppLayout` reads `isLoading`/`user` and renders no `<nav>` (Decision 2) | Mirrors `ProtectedRoute`'s shipped precedence; `<Outlet />` still renders, so redirects are untouched |
| `NotAuthorized` gets the nav | It is `ProtectedRoute`'s return value, i.e. `<Outlet />` content — *inside* the layout (Decision 1) | Structural; nothing renders it outside the layout |
| Every nav item points at a route the role can open | One `Record<Role, readonly NavItem[]>` table, cross-checked against `App.tsx` below (Decision 3) | Per-role component test asserts the **exact** item set, and a new `Role` member fails the build |
| No write-surface link for admin / manager / company manager | `SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_COMPANY_MANAGER` rows contain no `/review-sessions` item | The table is 5 literal rows; the guard is readable in one screen |
| No testid collision with `ReviewSessionsPage` | Every nav testid carries the `nav-` prefix (Decision 4) | A new test renders `ReviewSessionsPage` inside `AppLayout` (i.e. with the real nav in the tree) for a field role and asserts `getByTestId('review-history-entry-link')` resolves to exactly one node; `ReviewSessionsPage.test.tsx` passing **unmodified** confirms that isolated test needs no change but does not, on its own, prove no collision (it never renders the nav) |
| The nav never prints | One global `@media print` rule on `.app-nav` (Decision 5) | Applies on every route, so no un-layouted print route is needed |
| Route gating unchanged | The 28 authenticated routes are declared once, in an exported table, and `<Routes>` is generated **from** that table by `.map()` — not hand-copied into a parallel array (Decision 1) | Two layers, not one: `authenticated-routes.test.ts` proves the exported `AUTHENTICATED_ROUTES` table's own `{ path, allowedRoles, elementType }` contents are correct against a literal 28-route list; `App.test.tsx` separately proves `AppRoutes` actually renders **from** that same table via `.map()` (module-mocked pages, iterating the real array) — neither file alone proves both facts |

**Verified on `main` before designing, not assumed**:

- `App.tsx` declares **29** `<Route>` elements: `/login` plus **28**
  authenticated ones. **27** carry an `allowedRoles` array; `/` carries a bare
  `<ProtectedRoute>` with none.
- `react-router` is **7.1**, declarative `<Routes>` mode. A **pathless** layout
  route contributes no path segment, so its children keep their absolute
  `path="/..."` values verbatim — React Router only rejects an absolute child
  path when the parent itself has a non-prefix `path`.
- `AuthProvider` wraps `BrowserRouter` in `App.tsx`, so a layout element
  rendered by the router can call `useAuth()`.
- `ProtectedRoute`'s precedence is `isLoading → null`, `!user → <Navigate
  to="/login">`, wrong role → `<NotAuthorized />`, else `children`.
- The collision is real and **does not resolve itself**:
  `HealthPage.tsx:68` and `ReviewSessionsPage.tsx:68` both use
  `data-testid="review-history-entry-link"` today. Removing HealthPage's copy
  clears *that* pair — but the nav renders **on** `/review-sessions`, so a nav
  link reusing the name would recreate the ambiguity on a single page, which is
  strictly worse.
- `index.css`'s only `@media print` block is scoped to `.label-print`
  (`[data-print-hide]`, colour forcing, `#root:has(.label-print)`). Nothing in
  it hides anything globally, so nav suppression needs its **own** rule. **One
  exception inside that same block is already global, not `.label-print`-
  scoped**: a bare `@page { margin: 10mm }` rule (lines ~134–136). It applies
  to print output for **any** page, not just the label page. Today that is
  vacuous — nothing else prints. Once the nav wraps all 28 routes, this
  pre-existing global margin now silently applies whenever *any* authenticated
  page is printed, not only the label page — worth eyes-on in browser
  verification (Testing Strategy, Browser row), not just the label page's
  print preview.
- **`locales.test.ts` will go red unless it is edited in the same PR**:
  `health.reviewSessionsLink` (line 453) and `health.reviewHistoryLink`
  (line 488) are listed in two `REQUIRED_*_KEY_PATHS` existence guards.
  Deleting the keys without deleting those two list entries fails the suite.
  Called out here so `sdd-tasks` budgets for it instead of discovering a red test.
- `auth.logoutLabel` already exists in all three locales.
- Prettier: `printWidth: 100`, `tabWidth: 2`. **Superseded by this fix
  round's Decision 1 redesign**: since the 28 route declarations move into
  their own module (`authenticated-routes.tsx`) rather than being reindented
  in place inside `App.tsx`, the original "+2 indent, still under 100
  columns" measurement no longer applies — the new file's line widths are a
  task-phase formatting detail, not a design constraint.

## Architecture Decisions

### Decision 1 — a **pathless layout route**, `<Routes>` generated from an exported route table, `/login` structurally outside it (OQ1)

**Choice, revised in this fix round**: the 28 authenticated routes move out
of `App.tsx` entirely into a typed, exported table in their own module,
`apps/web/src/routes/authenticated-routes.tsx`. `App.tsx`'s
`<Route element={<AppLayout />}>` wrapper's children are **generated from
that table** by `.map()` — not a hand-copied parallel array — and `/login`
stays a separate, sibling `<Route>` **outside** that table and outside the
wrapper entirely.

**Why this replaces the original "cut-and-paste unchanged, `App.tsx` also
exports a parallel array" choice**: that shape was self-contradictory. Either
`<Routes>` is built from the exported array — in which case the JSX is not
"unchanged" and the small-diff framing was false — or the array is hand-typed
separately from the JSX, in which case `App.test.tsx` asserts one hardcoded
array against another and proves nothing about the real `<Routes>` tree.
Exporting an array literal alongside the `App` component from `App.tsx` also
violates `react-refresh/only-export-components` (`apps/web/eslint.config.mjs:11`,
`allowConstantExport: true` permits only primitive constants) — the exact
rule this design already cites twice as the reason `nav-items.ts` and
`element-history-route.roles.ts` are separate modules. This redesign follows
that same precedent for the route table itself.

**`apps/web/src/routes/authenticated-routes.tsx`** (new):

```tsx
import type { Role } from '@sf-manager/validation';
import type { ReactElement } from 'react';
import { ChecklistQuestionCreatePage } from '../pages/ChecklistQuestionCreatePage';
// …one import per page component, unchanged from App.tsx's existing imports…

export type AuthenticatedRoute = {
  readonly path: string;
  readonly element: ReactElement;
  readonly allowedRoles: Role[] | undefined;
};

// Each entry keeps the ordering comment that used to sit above its <Route>
// in App.tsx, now as a comment above its table entry — same content, same
// reason (React Router path-matching order — static segments before
// dynamic ones — and same-role-family notes), new location.
export const AUTHENTICATED_ROUTES: readonly AuthenticatedRoute[] = [
  { path: '/', element: <HealthPage />, allowedRoles: undefined },
  { path: '/users', element: <UsersListPage />, allowedRoles: ['SYSTEM_ADMIN'] },
  // …the remaining 26 entries, one per authenticated route, each carrying
  // its `allowedRoles` array verbatim from the route it replaces and its
  // ordering comment immediately above it…
  {
    path: '/communities/:communityId/inspectable-elements/:elementId/history',
    element: <ElementReviewHistoryPage />,
    allowedRoles: ELEMENT_HISTORY_ALLOWED_ROLES,
  },
];
```

**`App.tsx`'s route declarations** (new shape — the `<Routes>` tree is extracted into
its own exported `AppRoutes` component, with `App` reduced to composing providers
around it):

```tsx
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* nav-menu/design.md Decision 1: /login is declared OUTSIDE the
          AppLayout wrapper and OUTSIDE AUTHENTICATED_ROUTES entirely — "no nav
          on /login" is structural, not a condition to remember. */}
      <Route element={<AppLayout />}>
        {AUTHENTICATED_ROUTES.map(({ path, element, allowedRoles }) => (
          <Route
            key={path}
            path={path}
            element={<ProtectedRoute allowedRoles={allowedRoles}>{element}</ProtectedRoute>}
          />
        ))}
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

`App` still renders exactly the same tree at runtime — no behavior change — but
`AppRoutes` is now independently importable, so tests can wrap it in their own
`<MemoryRouter initialEntries={[path]}>` to exercise different paths: the real
`BrowserRouter` only ever wraps it once, in production, so no test ever nests a
`<MemoryRouter>` inside the shipped `<BrowserRouter>` (React Router rejects a
`<Router>` nested inside another `<Router>`). Both `App` and `AppRoutes` are
components, so this named-plus-default export does not trip
`react-refresh/only-export-components` — that rule fires on a non-component
export coexisting with a component export, not on two component exports.

Nothing in `AUTHENTICATED_ROUTES` can ever end up outside the `AppLayout`
wrapper, and `/login` can never accidentally end up inside it — "is this
route inside the nav layout" is now true **by construction**, which also
resolves two findings from the earlier design: layout membership is no
longer something a reviewer has to verify by reading, and `/login`'s
nav-absence is covered by the same structural argument instead of having
zero automated coverage.

**Ordering comments**: the 18 existing ordering-comment blocks move to sit
directly above the table entry they describe, inside the
`AUTHENTICATED_ROUTES` array literal — same text, same reasoning (React
Router's static-before-dynamic path matching, and the deliberate
5-role-vs-`SYSTEM_ADMIN`-only note on the element-history entry), new
location. They are not dropped.

**Alternatives considered**:

| Option | Cost | Verdict |
|---|---|---|
| Route table in its own module, `<Routes>` generated by `.map()` (**chosen**) | A real restructure: every `<Route>` block's path/element/allowedRoles moves into a table entry; `App.tsx` shrinks to the `.map()` call | The only shape where the test import is genuinely live (not a parallel hand-copied array) and where `react-refresh/only-export-components` is respected |
| Keep the 28 `<Route>` blocks in `App.tsx` verbatim, also export a hand-copied `{path, allowedRoles}` array for the test | +2 indent only; near-zero `App.tsx` diff | **Rejected, this round**: the array and the JSX are two independent sources of truth: `App.test.tsx` would compare one hardcoded list against another, catching nothing a typo in either couldn't slip past; also violates `react-refresh/only-export-components` |
| Wrap each route element in `<AppLayout>…</AppLayout>` | 28 hand-written copies; each a place to forget the wrapper, and each an *edit inside* the `element={…}` expression that also holds `allowedRoles` | Rejected: it puts the churn in exactly the JSX the hard constraint protects |
| Render the nav **inside `ProtectedRoute`** | ~3 lines, zero `App.tsx` churn | Rejected: the proposal's non-goals pin `ProtectedRoute.tsx` and `ProtectedRoute.test.tsx` as **untouched**; it also conflates the authorization gate with the shell, and would make every existing `ProtectedRoute` test render a nav |

**How route gating is verified end to end** — not asserted, checked, across
three layers:

1. **`authenticated-routes.test.ts` imports the real `AUTHENTICATED_ROUTES`
   table** — the same table `AppRoutes`'s `<Routes>` is generated from via
   `.map()` — and asserts its `{ path, allowedRoles, elementType:
   element.type }` contents, structurally, against a literal expected
   28-entry list naming the expected component per path (Testing Strategy
   table, "Route gating" row). This file imports the real table and real
   page components and uses **no `vi.mock` of any kind** — deliberately, so
   its `element.type` assertions can never be satisfied by a shared mock
   stub standing in for every page (see the two-file split rationale
   below). Because the JSX is generated **from** this table rather than
   independently retyped, a dropped route, an altered `allowedRoles` array,
   a mismatched element, or an entry accidentally left out of
   `AUTHENTICATED_ROUTES` fails this test directly. This layer proves the
   **table's own contents** are correct; it does not, by itself, prove
   `AppRoutes` actually consumes that table rather than a hand-written
   duplicate of the same shape — that is step 2's job.
2. **`App.tsx`'s own `App.test.tsx` binds `AppRoutes`'s actual rendering to
   that same imported table, in a separate file from step 1.** It renders
   the real, exported `AppRoutes` (Decision 1's extraction makes this
   possible: `App` is reduced to composing providers around it, so tests
   can mount `AppRoutes` directly inside their own `MemoryRouter`) with
   every one of the 28 page components module-mocked out (`vi.mock`, **each
   stub rendering a distinct marker derived from its own module/component
   name, not a shared trivial placeholder** — see Testing Strategy, "`App.tsx`
   structural wiring (exhaustive)" row), and **iterates the real, imported
   `AUTHENTICATED_ROUTES` array** — not a hand-typed sample — asserting nav
   presence/absence, role-gated behaviour, and **rendered-stub identity
   against each entry's expected component**, for all 28 entries plus
   `/login` (29 total). Because the case list is generated from the same
   table `AppRoutes` consumes, an implementer who hardcoded routes directly
   in `AppRoutes` instead of importing `AUTHENTICATED_ROUTES` would change
   the iteration itself, and the test could not silently keep passing the
   way a small fixed sample could — this is what makes the `.map()` link a
   tested fact rather than an assumption, closing the gap step 1 alone
   leaves open, and (with the distinct stub identities) also closes the
   rendered path-to-component identity gap neither layer closed before this
   fix round.

   **Why this MUST be a separate file from step 1, not two `describe`
   blocks in one file**: `vi.mock` is hoisted by Vitest above all other
   top-level code in the file it appears in, and it applies to that file's
   **entire module graph**, not to the `describe` block it is written
   near. If step 1's table-structural assertions and step 2's `vi.mock`
   calls lived in the same file, step 1's import of `AUTHENTICATED_ROUTES`
   (and the page components its `elementType` check inspects) would also
   resolve through step 2's mocked page modules. Even with step 2's stubs
   each carrying a distinct, per-page marker (deliberately, so step 2 can
   check rendered-component identity, not just nav presence/absence and
   gating), `element.type` would then resolve to the **mock** component for
   every path, not the real page component `AUTHENTICATED_ROUTES` actually
   references — so step 1's pairing assertion would prove the table names
   are internally consistent with each other, but nothing about the table
   pairing real, importable page components, which is exactly the
   `app-navigation/spec.md` requirement ("every route's path stays paired
   with its original page component") step 1 exists to guard. The two
   suites are therefore split into two files: `authenticated-routes.test.ts`
   (step 1, no `vi.mock`) and `App.test.tsx` (step 2, `vi.mock`-based).
   The 28 `vi.mock(...)` calls in `App.test.tsx` MUST be written as static
   top-level calls with literal string module specifiers — never generated
   in a loop or from a shared runtime path list — because Vitest's
   hoisting only rewrites statically-recognizable `vi.mock` calls; a
   loop-generated or dynamically-referenced set would not be hoisted
   correctly. If the shared stub factory needs to reference any
   outer-scope helper, that helper MUST be declared via `vi.hoisted()`.
3. `ProtectedRoute.test.tsx` runs unmodified and stays green, as a third,
   corroborating layer. **This is not by itself a route-gating regression
   guard for `App.tsx`**: it builds its own synthetic `<MemoryRouter>` and
   never renders `AppRoutes`, so on its own it only re-verifies
   `ProtectedRoute`'s own precedence logic. Its `ELEMENT_HISTORY_ALLOWED_ROLES`
   import-level guard binds the exported roles array, not any specific
   route path — the test renders it against a synthetic `path="/"` inside
   its own `MemoryRouter`, not the real
   `/communities/:communityId/inspectable-elements/:elementId/history` route.
   Combined with steps 1–2, it confirms `ProtectedRoute`'s precedence logic
   itself needed no change, while steps 1–2 confirm it is wired correctly
   into the real route tree.
4. `ELEMENT_HISTORY_ALLOWED_ROLES` keeps its import and its single call
   site, now inside `authenticated-routes.tsx` instead of `App.tsx`.
5. **Honest diff cost, restated**: this is no longer a small `App.tsx` diff.
   Most of the 27 `<Route allowedRoles={…}>` blocks disappear from `App.tsx`
   entirely, replaced by the `.map()` call over `AUTHENTICATED_ROUTES` inside
   the extracted, exported `AppRoutes` component; the per-route detail
   (path, element, allowedRoles, ordering comment) moves to the new
   `authenticated-routes.tsx` file. The acceptance check for this
   restructure is **not** `git diff --ignore-all-space` showing only an
   import and a wrapper tag — that framing no longer applies. Instead: step
   1 (`authenticated-routes.test.ts`) passing is the mechanical proof that
   every route, every `allowedRoles` array, and every route's paired
   element/component made it into the new table unchanged, and step 2 (the
   exhaustive structural-wiring test, `App.test.tsx`) is the mechanical
   proof that `AppRoutes` actually renders from that table rather than a
   parallel hand-written tree — so element pairing and wiring are both
   automated-test-verified, not left to a one-time by-eye reviewer diff.

`NotAuthorized` needs **no change at all** (the proposal's "possibly
modified"): `ProtectedRoute` returns it as the route element, which is the
layout's `<Outlet />` content, so it inherits the nav for free.

### Decision 2 — one `AppLayout` component; no separate `<AppNav>`

**Choice**: `apps/web/src/layout/AppLayout.tsx` renders the `<nav>` landmark and
`<Outlet />`. It owns no state, fetches nothing, and reads exactly two values
from `useAuth()`.

**Why a new `layout/` directory and not `apps/web/src/components/`**: the
codebase's existing `components/` directory (e.g. `ConfirmDialog.tsx`) holds
generic, reusable UI primitives with no routing awareness — they take props
and render, with no knowledge of `<Route>`/`<Outlet>`. `AppLayout` is a
different kind of thing: it is wired directly into `App.tsx`'s route tree as
a `<Route element={<AppLayout />}>`, calls `useNavigate()`, and has exactly
one call site by construction (there is only ever one authenticated shell).
Mixing a routing-integrated, single-instance shell into a directory of
reusable, routing-agnostic primitives would blur that distinction for every
future addition to either. `layout/` also directly hosts `nav-items.ts`,
which is not a component at all — a second reason it doesn't belong in
`components/`.

```tsx
export function AppLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // spec "Logout Flow (Web)": unchanged behaviour, new home — the exact
  // two statements deleted from HealthPage.tsx.
  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // Same precedence ProtectedRoute already owns: loading -> nothing, no user
  // -> nothing. `<Outlet />` ALWAYS renders, so ProtectedRoute's redirect and
  // its `null` loading render are untouched by this wrapper.
  //
  // The nav (INCLUDING logout) is gated on `!isLoading && user` alone, NOT on
  // `items` being non-empty: AuthProvider.tsx casts `/auth/me`'s response
  // with no runtime validation of `role` and documents "role staleness" as an
  // accepted risk. If `user.role` is ever outside the five known `Role`
  // values, `NAV_ITEMS_BY_ROLE[user.role]` is `undefined` — falling back to
  // `?? []` keeps the nav (and logout) rendering with an empty item list
  // instead of silently disappearing. Losing the nav's item list to an
  // unrecognized role is tolerable; losing the user's only way to log out is
  // not — app-navigation/spec.md requires logout reachable from every
  // authenticated page, unconditionally.
  const showNav = !isLoading && user;
  // `Object.hasOwn`, not `?? []` alone: if `user.role` is ever a string that
  // collides with an inherited Object.prototype key (`'constructor'`,
  // `'toString'`, etc — only reachable via a hostile/corrupt `/auth/me`
  // payload), a plain `NAV_ITEMS_BY_ROLE[user.role]` lookup returns an
  // inherited function rather than `undefined`, so `?? []` would not fire
  // and `.map()` would throw, white-screening the whole app.
  const items = showNav
    ? Object.hasOwn(NAV_ITEMS_BY_ROLE, user.role)
      ? NAV_ITEMS_BY_ROLE[user.role]
      : []
    : [];

  return (
    <>
      {showNav && (
        <nav className="app-nav" data-testid="nav-root" aria-label={t('nav.label')}>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={item.testId}>
              {t(item.labelKey)}
            </NavLink>
          ))}
          <button type="button" data-testid="nav-logout-button" onClick={() => void handleLogout()}>
            {t('auth.logoutLabel')}
          </button>
        </nav>
      )}
      <Outlet />
    </>
  );
}
```

**Alternatives considered**: `AppLayout` + a separate `AppNav` child. Rejected
under ADR-006 — the nav has no state, no independent reuse and no second call
site; a second file would be speculative structure. `NavLink` (not `Link`) is
used solely because it supplies `aria-current="page"` for free, which is the
entire accessibility scope of this slice.

### Decision 3 — the role → items table lives in its own module, exhaustive over `Role`

**Choice**: `apps/web/src/layout/nav-items.ts` — the generalized form of
`HealthPage`'s `REVIEW_SESSION_ROLES` / `REVIEW_HISTORY_ROLES`, extracted to its
own module for the **same reason** `element-history-route.roles.ts` was
(`react-refresh/only-export-components` forbids a component file exporting a
plain constant) and with the same second benefit: the test imports the real
table instead of a hand-copied duplicate.

```ts
export type NavItem = { readonly to: string; readonly labelKey: string; readonly testId: string; readonly end?: boolean };

// Each item is declared ONCE and shared by reference across the role rows
// below, so REVIEW_HISTORY's five appearances can never drift apart.
// HOME is shared by all five roles: without it, `/` (HealthPage) becomes
// unreachable via nav the moment a user clicks any other item — the "every
// page is a dead end" failure mode the proposal opens by describing.
// `end: true` is required on HOME alone: `NavLink` matches against the
// CURRENT URL PATHNAME (not against other nav items' `to` values), and `/`
// is the only path that is a prefix of every other route — so without `end`
// Home would show aria-current on every authenticated route simultaneously
// with whichever item actually matches, violating app-navigation/spec.md's
// "exactly one item is current" requirement. No other item needs `end`:
// most nav items ARE prefixes of their own nested sub-routes (e.g. `/users`
// is a prefix of `/users/:id/edit`) — that's deliberate, not an oversight,
// since it keeps a section highlighted while a user is on one of its
// sub-routes. Only `/`, as a prefix of literally every route, is wrong to
// leave un-`end`ed.
const HOME: NavItem = { to: '/', labelKey: 'nav.home', testId: 'nav-link-home', end: true };
const USERS: NavItem = { to: '/users', labelKey: 'nav.users', testId: 'nav-link-users' };
// …COMMUNITIES, MAINTENANCE_COMPANIES, CHECKLIST_QUESTIONS, REVIEW_TEMPLATES,
//   REVIEW_SESSIONS, REVIEW_HISTORY, same shape…

// `satisfies Record<Role, …>` is the exhaustiveness guard the proposal asks
// for: a sixth Role member fails the BUILD instead of silently rendering an
// empty nav. Every `to` below is cross-checked against App.tsx's allowedRoles
// (design.md Decision 3 table) — the nav never invents reachability. HOME is
// first in every row: `/` carries a bare <ProtectedRoute> with no
// `allowedRoles`, so every authenticated role admits it trivially.
export const NAV_ITEMS_BY_ROLE = {
  SYSTEM_ADMIN: [HOME, USERS, COMMUNITIES, MAINTENANCE_COMPANIES, CHECKLIST_QUESTIONS,
                 REVIEW_TEMPLATES, REVIEW_HISTORY],
  // DELIBERATELY no REVIEW_SESSIONS for these three: review-history-ui
  // requires that no navigation control offered to an admin, a MANAGER or a
  // MAINTENANCE_COMPANY_MANAGER leads to the write surface.
  MANAGER: [HOME, REVIEW_HISTORY],
  MAINTENANCE_COMPANY_MANAGER: [HOME, REVIEW_HISTORY],
  MAINTENANCE_TECHNICIAN: [HOME, REVIEW_SESSIONS, REVIEW_HISTORY],
  COMMUNITY_REPRESENTATIVE: [HOME, REVIEW_SESSIONS, REVIEW_HISTORY],
} as const satisfies Record<Role, readonly NavItem[]>;
```

**Reachability cross-check against `App.tsx` (every cell verified, not assumed)**:

| Item → route | Route's `allowedRoles` | Roles offered it | Admits? |
|---|---|---|---|
| `/` | none (bare `<ProtectedRoute>`) | all five roles | ✅ |
| `/users` | `['SYSTEM_ADMIN']` | SYSTEM_ADMIN | ✅ |
| `/communities` | `['SYSTEM_ADMIN']` | SYSTEM_ADMIN | ✅ |
| `/maintenance-companies` | `['SYSTEM_ADMIN']` | SYSTEM_ADMIN | ✅ |
| `/checklist-questions` | `['SYSTEM_ADMIN']` | SYSTEM_ADMIN | ✅ |
| `/review-templates` | `['SYSTEM_ADMIN']` | SYSTEM_ADMIN | ✅ |
| `/review-sessions` | `['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE']` | exactly those two | ✅ |
| `/review-history` | all five roles | all five | ✅ |

Counts (each +1 over the earlier map for the shared `HOME` item):
`SYSTEM_ADMIN` 7, `MAINTENANCE_TECHNICIAN` 3, `COMMUNITY_REPRESENTATIVE` 3,
`MANAGER` 2, `MAINTENANCE_COMPANY_MANAGER` 2. `MANAGER`'s write-surface
exclusion is gated on the **role alone**, never on `VIEW_ALL_REVIEWS`
(ADR-011 precedent). The element-history route is absent by construction: it
is not in the table, so it cannot become a third entry link. `HOME` is the one
item every role shares, so it is the sole reason no role's count is lower than
2.

### Decision 4 — every nav testid carries a `nav-` prefix (OQ3)

**Choice**, confirming the proposal's assumption but for a sharper reason than
it states — *the collision does not resolve itself*:

| Element | testid |
|---|---|
| the `<nav>` landmark | `nav-root` |
| link items | `nav-link-home`, `nav-link-users`, `nav-link-communities`, `nav-link-maintenance-companies`, `nav-link-checklist-questions`, `nav-link-review-templates`, `nav-link-review-sessions`, `nav-link-review-history` |
| logout | `nav-logout-button` |

Removing `HealthPage`'s `review-history-entry-link` clears the *existing* pair,
but the nav renders **on** `/review-sessions`, where
`ReviewSessionsPage.tsx:68`'s copy stays by shipped spec. A nav link named
`review-history-entry-link` would therefore put two nodes with that testid on
one page — a worse collision than today's. The prefix rule makes nav controls
unambiguously addressable on every page, forever.

`nav-logout-button`, **not** the now-free `logout-button`: a prefix rule with
one exception is not a rule, and the rename makes any stale
`getByTestId('logout-button')` fail loudly instead of silently re-binding to the
nav's button. After this change, an **exact-token** search for the old testid
(e.g. `grep -rw '"logout-button"'`, not a plain substring `grep`) MUST return
zero hits — `logout-button` is a substring of `nav-logout-button`, so a naive
substring grep cannot distinguish "the old testid is gone" from "the new one
merely contains that substring".

### Decision 5 — a new `nav.*` namespace; logout reuses `auth.logoutLabel` (OQ2)

**Choice**: confirm the proposal's working assumption. A nav label and a page
`<h1>` are different strings that merely coincide today — `*.list.title`
("Maintenance companies") is a page heading, and coupling the two means a page
title can never be reworded without silently rewording the nav. 9 keys × 3
locales = 27 entries is a cheap, permanent decoupling.

| Key | en | es | ca |
|---|---|---|---|
| `nav.label` (landmark name) | Main navigation | Navegación principal | Navegació principal |
| `nav.home` | Home | Inicio | Inici |
| `nav.users` | Users | Usuarios | Usuaris |
| `nav.communities` | Communities | Comunidades | Comunitats |
| `nav.maintenanceCompanies` | Maintenance companies | Empresas de mantenimiento | Empreses de manteniment |
| `nav.checklistQuestions` | Checklist questions | Preguntas de revisión | Preguntes de revisió |
| `nav.reviewTemplates` | Review templates | Plantillas de revisión | Plantilles de revisió |
| `nav.reviewSessions` | Review sessions | Sesiones de revisión | Sessions de revisió |
| `nav.reviewHistory` | Review history | Historial de revisiones | Historial de revisions |

**Note on `nav.home`**: `/` currently renders `HealthPage`, which today shows
only "System status" — the label "Home"/"Inicio"/"Inici" is forward-looking
for a page that is currently just a health readout, not a description of
today's content. Kept as `nav.home` (not reused from `health.title`)
deliberately: `/` is conceptually the app's landing page regardless of what
it happens to render today, and a future change to `HealthPage`'s content
should not force a nav-label rename.

**One deliberate exception**: the logout control reuses the shipped
`auth.logoutLabel`. It is not a nav label — it is the logout action's label,
already translated in all three locales, moving location without changing
meaning. Minting `nav.logout` would duplicate a string and force a second
translation to keep in sync.

**Removed**: `health.reviewSessionsLink`, `health.reviewHistoryLink` from
`en`/`es`/`ca` **and** from the two `REQUIRED_*_KEY_PATHS` lists in
`locales.test.ts` (lines 453, 488) — the suite is red otherwise. A new
`REQUIRED_NAV_KEY_PATHS` list is added beside them, following the established
existence-guard pattern. **The edit list also includes the doc comment at
`locales.test.ts:372`**, which names `health.reviewSessionsLink` as an example
in prose above `REQUIRED_REVIEW_SESSION_KEY_PATHS` — left un-updated it would
go stale the moment the key it names is deleted, describing a key that no
longer exists.

### Decision 6 — print suppression: one global `@media print` rule on `.app-nav`, plus a minimal screen rule (OQ4)

**Choice**: confirm the proposal's working assumption for print suppression,
but also add the minimum screen-only rule the nav needs to be usable at all —
`.app-nav` otherwise has no layout CSS anywhere, and React renders the mapped
`<NavLink>`s and the logout `<button>` back-to-back with no separating
whitespace:

```css
/* nav-menu/design.md Decision 2/6: with no screen rule at all, React inserts
   no whitespace between the mapped <NavLink> children and the logout
   <button>, so every label runs together as one unreadable string. This is
   the minimum separation needed for the nav to be usable — a functional
   requirement, not design-system styling, and it stays outside ADR-006's
   "no design system" non-goal for that reason. */
.app-nav {
  display: flex;
  gap: 1rem;
}
```

**Source order matters — this screen rule MUST be declared BEFORE the
existing `@media print` block in `index.css`.** The screen rule and the print
rule below both target `.app-nav` with identical specificity (one class
selector each); CSS resolves a specificity tie by **source order**, so
whichever of the two is declared *later in the file* wins, print media query
or not. Appending the screen rule after the print block would silently make
the nav print — the exact defect this decision exists to prevent. Placing the
screen rule first, ahead of the file's existing `@media print` block, is not
optional styling — it is part of the correctness of print suppression.

...and, added to `index.css`'s existing `@media print` block (which stays
after the screen rule above) but **not** nested under `.label-print`:

```css
/* nav-menu/design.md Decision 6: element-label-printing's shipped
   requirement "Print Output Suppresses Application Chrome" becomes
   load-bearing here — the global nav is the first real chrome it has ever
   had to suppress. GLOBAL, not scoped to .label-print: the requirement is
   about the nav, and a nav in ANY printed output is a defect, not just on
   the label page. `display: none` removes it from #root's flex flow
   entirely. */
.app-nav {
  display: none;
}
```

**Alternatives considered**: a route-level "no layout" flag, or a second
un-layouted route for `/label`. Both rejected, and the rejection is worth
stating plainly: **no un-layouted route is needed.** The label page keeps its
one shipped URL (reload-safe and shareable, per `label-printing` Decision 6), a
CSS rule cannot drift out of sync with a route table, and a "no layout" flag
would reintroduce exactly the per-route opt-out Decision 1 exists to remove. The
label page's own rules (`[data-print-hide]`, colour forcing,
`#root:has(.label-print)`) are untouched.

### Decision 7 — `HealthPage` cleanup ships in the same PR as the wrapping of `/`

Not a new decision — the proposal settles it — but it has a file-level
consequence worth pinning: `HealthPage.tsx` loses `REVIEW_SESSION_ROLES`,
`REVIEW_HISTORY_ROLES`, both `<Link>`s, the logout `<button>`, `handleLogout`,
and the `useNavigate`/`useAuth`/`Link` imports. What remains is the health
readout and its `<h1>`.

**`HealthPage.test.tsx` has 13 tests today; 12 of them are removed or
relocated, and only the health-readout test (`'renders the health check
result once the API responds'`) survives untouched.** What moves to
`AppLayout.test.tsx`, and how each maps onto that file's role → items matrix
and gating tests:

- **(a) The logout success case** (`'renders a logout control that clears the
  session on click'`) — becomes `AppLayout.test.tsx`'s "Logout" test.
- **(b) The logout-request-failure case** (`'still clears the session and
  navigates to /login when the logout request fails'`) — this is currently
  the **only** regression guard for `AuthProvider.logout()`'s swallow-error
  resilience; it moves to `AppLayout.test.tsx` as its own case, not dropped.
  **Correction, this fix round**: `AuthProvider.logout()` never rejects — its
  try/catch/finally swallows the error internally, so `AppLayout.handleLogout`
  (which has no try/catch of its own) cannot be exercised by mocking
  `useAuth()`'s `logout()` to reject; it would simply never see a rejection.
  The real, shipped `HealthPage.test.tsx:213-224` case works by rendering a
  **real** `<AuthProvider>` and stubbing global `fetch` to reject for the
  logout call (`mockFetch({ logoutRejects: true })`). `AppLayout.test.tsx`'s
  relocated case MUST follow that same pattern — a real `<AuthProvider>` with
  `fetch` stubbed to reject — not a mocked `logout()` that rejects.
- **(c) The remaining 10 role-conditional link/enumeration tests** — these
  are subsumed by (not duplicated alongside) `AppLayout.test.tsx`'s existing
  "Role → items matrix" and "Write-surface guard" rows (Testing Strategy,
  below), which already assert the exact per-role item set and the
  no-write-surface-link invariant that these 10 tests were separately
  verifying against `HealthPage`'s ad hoc links.

  **Not fully "subsumed" for one pair of roles — a real, deliberate
  behavior change worth stating explicitly**: `HealthPage.test.tsx:124`
  asserts that `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` do
  **not** see a review-history entry link on `HealthPage`. The new nav gives
  **every** role a global "Review history" `NavItem` (Decision 3's settled
  7/3/3/2/2 counts include `REVIEW_HISTORY` for all five roles), so these
  two roles gain a nav-level entry point to review history they never had
  from the app's entry page before. This is a deliberate, spec-compatible
  consequence of the already-settled nav-item decision — it is not a new
  decision being made here — and it is compatible with shipped behavior:
  `openspec/specs/review-history-ui/spec.md`'s reachability requirement pins
  no exclusivity on entry points, so adding a second one for these two
  roles does not violate it. It is called out on its own, separately from
  the "subsumed" framing above, because it is a real user-visible change —
  two roles gaining a capability they did not have before — and that should
  not be left implicit in a test-relocation table row.

## Data Flow

    BrowserRouter
      └── Routes
           ├── /login ─────────────────────── LoginPage          (no layout, no nav)
           └── <Route element={AppLayout}>    ← the ONE wrapper
                  │
                  ├── useAuth() → { user, isLoading, logout }
                  │     isLoading | !user  ──→ no <nav> rendered
                  │     user.role ──→ NAV_ITEMS_BY_ROLE[role] ──→ NavLink × n + logout
                  │                                                (aria-current from NavLink)
                  │
                  └── <Outlet />
                         └── <ProtectedRoute allowedRoles={…}>   ← UNCHANGED, byte for byte
                                isLoading        → null
                                !user            → <Navigate to="/login">
                                role not allowed → <NotAuthorized />   ← nav renders around it
                                otherwise        → the page

    logout click → logout() → navigate('/login') → outside the layout → nav gone

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/web/src/layout/AppLayout.tsx` | Create | The layout route element: `<nav>` landmark + role-filtered `NavLink`s + logout + `<Outlet />` (Decision 2) |
| `apps/web/src/layout/nav-items.ts` | Create | `NavItem` + `NAV_ITEMS_BY_ROLE`, exhaustive over `Role` (Decision 3) |
| `apps/web/src/layout/AppLayout.test.tsx` | Create | Five-role matrix + loading / no-user / `NotAuthorized` / logout cases |
| `apps/web/src/routes/authenticated-routes.tsx` | Create | `AuthenticatedRoute` type + the `AUTHENTICATED_ROUTES` table of all 28 authenticated routes (`path`, `element`, `allowedRoles`), each carrying its `allowedRoles` array and ordering comment moved verbatim from `App.tsx` (Decision 1) |
| `apps/web/src/App.tsx` | Modify | Real restructure, not a small diff: the 28 `<Route>` blocks are replaced by the `AppLayout` import, the pathless `<Route element={<AppLayout />}>` wrapper, and a `.map()` over `AUTHENTICATED_ROUTES` inside it. `/login` stays a sibling `<Route>` outside the wrapper. The `<Routes>` tree is also extracted into its own exported `AppRoutes` component, with `App` reduced to composing `AuthProvider`/`BrowserRouter` around it, so tests can render `AppRoutes` inside their own `MemoryRouter` (Decision 1) |
| `apps/web/src/index.css` | Modify | A minimal screen `.app-nav { display: flex; gap: 1rem }` rule (functional separation, not styling — Decision 6) plus a `.app-nav { display: none }` rule inside the existing `@media print` block (Decision 6) |
| `apps/web/src/pages/HealthPage.tsx` | Modify | Both role-conditional links, the logout button, both role sets and the now-unused imports removed (Decision 7) |
| `apps/web/src/pages/HealthPage.test.tsx` | Modify | 12 of its 13 existing tests removed/relocated to `AppLayout.test.tsx` (logout success, logout network-failure, and 10 role-conditional link/enumeration cases); only the health-readout test survives (Decision 7) |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | `nav.*` added (9 keys); `health.reviewSessionsLink` / `health.reviewHistoryLink` removed |
| `apps/web/src/i18n/locales.test.ts` | Modify | Add `REQUIRED_NAV_KEY_PATHS`; **delete the two `health.*` entries at lines 453/488** or the suite goes red |
| `apps/web/src/auth/NotAuthorized.tsx` | **Untouched** | Gets the nav via `<Outlet />` — the proposal's "possibly modified" resolves to *not* modified |
| `apps/web/src/auth/{ProtectedRoute,AuthProvider}.tsx` | **Untouched** | Consumed as-is |
| `apps/web/src/auth/ProtectedRoute.test.tsx` | Modify (comment + test name + comment-text-only updates — no assertion/behavior change; **not yet applied — this is a task for `sdd-apply`, done as part of the PR that creates `authenticated-routes.tsx`, not pre-applied during design**) | Exercises `ProtectedRoute`'s own precedence against a synthetic router and is **not** the `App.tsx` gating regression guard — `authenticated-routes.test.ts` and `App.test.tsx` (below) are. The narrow, explicitly-permitted exception to this file's "untouched" invariant (Decision 1 / OQ1, Judgment Day fix round W-3): this file currently has **four separate stale references**, not one. (1) The comment at line ~332 says `ELEMENT_HISTORY_ALLOWED_ROLES` is imported "from the same module `App.tsx` imports it from" — true before this change, factually wrong after, since the import site moves to `authenticated-routes.tsx`. (2) The test name at line ~337 is currently `'App.tsx exports exactly the 5 roles the anomaly comment promises'` — also stale once the export site is no longer `App.tsx`. (3) The comment at line ~159 says "App.tsx itself has no dedicated route test file, per this repo's existing precedent" — false once `App.test.tsx` and `authenticated-routes.test.ts` exist. (4) The comments at lines ~322/~327 say "App.tsx's route comment" / "the in-file App.tsx comment calls out" — the referenced comment moves to `authenticated-routes.tsx`. `sdd-apply` MUST change: (1) comment → "the same module `authenticated-routes.tsx` imports it from"; (2) test name → `'the exported roles are exactly the 5 the anomaly comment promises'`; (3) comment → remove/replace the "no dedicated route test file" claim, naming `App.test.tsx`/`authenticated-routes.test.ts` as the now-existing route test files; (4) comments → point at `authenticated-routes.tsx`'s route comment instead of `App.tsx`'s. No `expect()`, import, or assertion logic changes anywhere in this file |
| `apps/web/src/auth/element-history-route.roles.ts` | Modify (comment-text only — no logic change; **task for `sdd-apply`, same PR as above**) | Judgment Day fix round W-3: line ~3 says "App.tsx's route comment" — the referenced comment moves to `authenticated-routes.tsx`. Line ~10 says "not from App.tsx, which only exports the `App` component" — after Decision 1, `App.tsx` exports both `App` and `AppRoutes`, so the `react-refresh/only-export-components` rationale must instead say this module is kept separate from `authenticated-routes.tsx` (which now holds the relocated route declarations/comments), not from `App.tsx`. `sdd-apply` MUST update both comments to reference `authenticated-routes.tsx` accurately; no export or logic changes |
| `apps/web/src/pages/ElementReviewHistoryPage.tsx` | Modify (comment-text only — no logic change; **task for `sdd-apply`, same PR as above**) | Judgment Day fix round W-3: line ~16 says "see App.tsx's route comment" — the referenced comment moves to `authenticated-routes.tsx`. `sdd-apply` MUST update the comment to reference `authenticated-routes.tsx`; no logic changes |
| `apps/web/src/routes/authenticated-routes.test.ts` | Create | **The table-structural test** (Decision 1, "How route gating is verified end to end", step 1) — imports the real `AUTHENTICATED_ROUTES` table and the real page components, with **no `vi.mock` of any kind**, and asserts its `{ path, allowedRoles, elementType: element.type }` contents structurally against a literal expected 28-route list, a new pattern for this repo, not 140 full-component renders. Kept in a separate file from the exhaustive structural-wiring test below specifically so `vi.mock`'s file-wide hoisting can never make its `elementType` assertions vacuous |
| `apps/web/src/App.test.tsx` | Create | **The exhaustive structural-wiring test** (Decision 1, step 2) — imports the real, exported `AppRoutes`, module-mocks all 28 page components (**each mock factory renders a component with a distinct marker derived from its own module/component name** — e.g. `<div data-testid={"page-stub-" + moduleName}>{moduleName}</div>` — not one shared trivial placeholder, static top-level `vi.mock` calls with literal specifiers), and iterates the real `AUTHENTICATED_ROUTES` array (not a sample) to assert nav presence/absence, role-gated behaviour, **and that the rendered stub's testid/text matches that entry's expected component name**, for all 28 entries plus `/login`, proving `AppRoutes` actually consumes the table via `.map()` (also the Testing Strategy "`App.tsx` structural wiring (exhaustive)" row). Combined with `authenticated-routes.test.ts`'s table-contents check (step 1), this now also proves the rendered tree honors each path→component pairing, not just the table's own contents |
| `apps/web/src/pages/ReviewSessionsPage.tsx` (+ test) | **Untouched** | Its own `review-history-entry-link` stays; its test must pass unmodified |
| `apps/api/**`, `prisma/**`, `packages/validation/**` | Untouched except `prisma/seed.ts` | No API contract or schema change; `prisma/seed.ts` was modified twice, both sanctioned by this file's own Open Questions item: task 3.12 added a second, non-admin seeded account for browser verification, and the sdd-verify remediation slice (WARNING-3) added `shouldSeedDevAccount` (`apps/api/src/shared/seeding/should-seed-dev-account.ts`) to guard that hardcoded account against production |
| `openspec/changes/nav-menu/specs/{app-navigation,checklist-question-admin-ui,review-template-admin-ui,community-admin-ui,review-session-ui,review-history-ui,element-label-printing}/spec.md` | New/Modify | One new spec, six deltas (owned by `sdd-spec`) — these paths are the change's delta specs; they move to `openspec/specs/` only when this change is archived |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (web) | Role → items matrix | `it.each` over all five roles against `NAV_ITEMS_BY_ROLE`, asserting the **exact** rendered testid set (`toEqual`, not `toContain`) — 7 / 3 / 3 / 2 / 2 |
| Unit (web) | Write-surface guard | `SYSTEM_ADMIN`, `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` render **no** anchor whose `href` starts with `/review-sessions` — asserted over every rendered link, the "every navigation control enumerated" shape `review-history-ui` requires |
| Unit (web) | Reachability invariant | A table test pairing each `NavItem.to` with the route's `allowedRoles`, so a future item pointing at a route its role cannot open fails here — the mechanical form of Decision 3's cross-check |
| Unit (web) | Render gating | `isLoading: true` → no `nav-root`; `user: null` → no `nav-root`; both cases still render the `<Outlet />` child |
| Unit (web) | Logout survives an unrecognized role | `user.role` set to a value outside `Role` (simulating `AuthProvider`'s undefined-at-runtime cast) still renders `nav-root` with a working `nav-logout-button` and an empty item list, never a fully absent nav (Decision 2's `Object.hasOwn`-guarded fallback; app-navigation/spec.md's unconditional logout-reachability requirement). Also assert a prototype-colliding role string (e.g. `'constructor'`) hits the same empty-list fallback rather than throwing |
| Unit (web) | Exactly one current item on a deep route | Render `AppLayout` for a role with 3+ items on a non-`/` route (e.g. `/review-history`) and assert exactly one nav item has `aria-current="page"` — regression guard for `end` on the shared `HOME` item, since `/` is the only nav target that is a path-prefix of every other route |
| Unit (web) | `NotAuthorized` | A wrong-role user rendered through a real `ProtectedRoute` inside the layout shows **both** `not-authorized` and `nav-root` |
| Unit (web) | Logout | Clicking `nav-logout-button` calls `logout()` then lands on `/login` (success case) — the assertion moved from `HealthPage.test.tsx`. Also covers the logout-request-failure case moved from the same file, using a **real** `<AuthProvider>` with `fetch` stubbed to reject for the logout call (mirroring `HealthPage.test.tsx`'s `mockFetch({ logoutRejects: true })` pattern, not a mocked `logout()` that rejects — `AuthProvider.logout()` never rejects): the session still clears and the user still lands on `/login`, the only regression guard for `AuthProvider.logout()`'s swallow-error resilience (Decision 7) |
| Unit (web) | `HealthPage` | Renders **no** link and **no** button; the health readout tests pass otherwise unchanged |
| Unit (web) | No collision | **The actual collision guard**: render `ReviewSessionsPage` as a child of `AppLayout` (i.e. inside the real layout route, with the nav in the tree) for a field role, and assert `getByTestId('review-history-entry-link')` resolves to **exactly one** node — the isolated `ReviewSessionsPage.test.tsx` never renders the nav, so it cannot detect this either way. `ReviewSessionsPage.test.tsx` running **unmodified** is kept as a separate, corroborating fact (the old test needs no change), not the collision proof. Also: an exact-token repo-wide grep (not a substring match — `logout-button` is a substring of `nav-logout-button`) for `"logout-button"` returns **zero** hits, and one for `"nav-logout-button"` returns **exactly one** |
| Unit (web) | i18n | Parity for the 9 new keys; `REQUIRED_NAV_KEY_PATHS` existence guard; both removed `health.*` keys absent from all three locales |
| Unit (web) | Print rule | Reads `index.css` from disk and asserts (a) `.app-nav { display: none }` sits inside an `@media print` block, and (b) the screen `.app-nav { display: flex }` rule's text appears **before** that `@media print` block in the file — source order, not just presence of both, since CSS resolves the tie in favour of whichever is declared last. New shape for this repo, justified: `jsdom` cannot evaluate print media, so without it a shipped spec requirement has **zero** automated protection |
| Regression | Route gating (table contents) | **`authenticated-routes.test.ts` (new)** imports the real `AUTHENTICATED_ROUTES` table exported by `apps/web/src/routes/authenticated-routes.tsx` (`{ path, allowedRoles, elementType: element.type }` per authenticated route, extracted the same way `element-history-route.roles.ts` already extracts one route's roles) and asserts it structurally against a literal expected 28-entry list — including each entry's expected component — a new, feasible test pattern for this repo (not 140 full-`<App />` renders with `AuthProvider`/`fetch` mocked per page). Deliberately in its own file, with **no `vi.mock`**, separate from the exhaustive structural-wiring test below: `vi.mock` is file-scoped and hoisted across the whole module graph, so sharing a file with step 2's mocked page components would make every `element.type` this test inspects collapse to the same shared stub, making the pairing assertion vacuous. This proves the table's own contents are correct (Decision 1, step 1); it does not by itself prove `AppRoutes` consumes this table rather than a hand-written duplicate — the "`App.tsx` structural wiring (exhaustive)" row below (step 2) closes that gap, and `ProtectedRoute.test.tsx` staying green (step 3) is a further corroborating check, not a substitute for either |
| Regression | `App.tsx` structural wiring (exhaustive) | **New, closes a previously unverified gap, lives in `App.test.tsx` — a separate file from `authenticated-routes.test.ts` above — and is the ONLY test in this design that actually binds `AppRoutes`'s rendering to `AUTHENTICATED_ROUTES`**: the `.map()` generation step itself — that `AppRoutes` actually consumes `AUTHENTICATED_ROUTES` via `.map()`, wraps each mapped route in `<ProtectedRoute allowedRoles={…}>` with the right roles, and nests them under `<AppLayout>` — was not exercised by any test before this row. Imports `{ AppRoutes }` from `App.tsx` (Decision 1's extraction) and renders `<AuthProvider><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></AuthProvider>`, stubbing `fetch` per the same `mockFetch` pattern already used elsewhere in this design (so `AuthProvider` can resolve a signed-in user of the role each case needs). **Every one of the 28 page components imported by `authenticated-routes.tsx` is replaced with a trivial `vi.mock('./pages/XPage', …)` stub, written as 28 static top-level calls with literal string specifiers** (**each stub renders a distinct marker derived from its own module/component name — e.g. `<div data-testid={"page-stub-" + moduleName}>{moduleName}</div>` — not a shared trivial placeholder**, so this suite can additionally check component identity per path: for each iterated `AUTHENTICATED_ROUTES` entry, the test asserts the rendered stub's testid/text matches that entry's expected component name, on top of nav presence/absence and gating) — this removes the per-page `fetch`-on-mount problem entirely, since no real page logic runs, making it cheap to iterate **all 28 `AUTHENTICATED_ROUTES` entries plus `/login` (29 total)**, not a sample. The test drives its cases by **iterating the real, imported `AUTHENTICATED_ROUTES` array** — not a hand-typed list — asserting nav presence/absence, role-gated behaviour (denied vs. allowed), and rendered-component identity per entry from the entry's actual `allowedRoles` and expected component. This is what makes the `.map()` claim a tested fact: because the case list is generated from the same imported table `AppRoutes` consumes, a route hardcoded directly in `AppRoutes` instead of coming from the table changes the iteration itself, and the test's structure would need to change to still pass. Black-box rendering tests prove behavioral equivalence — that the right component renders at the right path, under the right gating — not the literal implementation choice of `.map()` versus an equivalent hand-written enumeration that happens to produce the same iteration; an implementer who hand-wrote 28 `<Route>` blocks that imported and rendered from `AUTHENTICATED_ROUTES` per-entry, matching the table's iteration and pairing exactly, would also pass, and that is an acceptable, behaviorally-identical implementation. This same test explicitly includes the `/login` case, asserting no nav is rendered there — matching the existing scenario in `app-navigation/spec.md` (~line 72-75) |
| Browser | CLAUDE.md | Real dev server: a `SYSTEM_ADMIN` reaches all seven of their items (five admin sections + Review history, read-only) plus Home from a deep page (e.g. `/users/:id/edit`) without typing a URL — confirming Review sessions (the write surface) is never offered; one non-admin role sees exactly its items, including Home; `/login` shows no nav; logout works from a non-`/` page; **print preview** of `/communities/:c/inspectable-elements/:e/label` shows no nav, and print preview of one ordinary non-label route (e.g. `/users` or `/review-history`) is also checked, since the `@page { margin: 10mm }` rule in the existing print block is global, not scoped to the label page, and now applies whenever any page is printed |

## Migration / Rollout

No migration — web-only, no schema object, no API contract, no data reshaped.
Delivery follows the proposal's `stacked-to-main` chain, branches
`nav-menu/<NN>-<slug>`, titles `feat(nav-menu): PR N/M — …`. **Decision 1's
route-table redesign materially grows PR ~2's scope beyond the proposal's
original ~300–450-line estimate**: the route-table extraction alone is
roughly 250–300+ lines, plus ~370 lines removed from `App.tsx`, plus the
`HealthPage.tsx`/`HealthPage.test.tsx` changes — realistically 900+ lines,
over this project's 400-line PR budget. `sdd-tasks` MUST re-forecast the PR
chain against this real size, not the proposal's pre-redesign sketch, and
will likely need to split the pure route-table extraction into its own PR.
Two couplings are non-negotiable for whatever split `sdd-tasks` lands on:
**(a)** the `App.tsx` wrapping, the `HealthPage` cleanup and the two i18n-key
removals (including the `locales.test.ts` guard entries) ship **together** — one
navigation mechanism, never two; **(b)** the print rule ships with the wrapping,
since that is the commit that first puts a nav on the label page.

## Rollback

`git revert` the branch. Reverting removes `AppLayout`, `nav-items.ts`, the 9
i18n keys, the print rule and the pathless wrapper, and **restores
`HealthPage`'s two links and its logout button verbatim** — which is the part
that must come back, since reverting the wrapping alone would leave the app with
no navigation at all. Route gating is untouched by construction, so a revert
cannot regress authorization in either direction. Spec deltas must revert
**with** the code or three specs will claim nav-reachability the app no longer
has. Each PR reverts independently **except** the deliberate wrapping +
`HealthPage`-cleanup coupling above.

## Open Questions

- [x] **OQ1 — routing mechanics**: resolved, Decision 1, **redesigned in this
      fix round**. The layout route is still **pathless**, but the 28
      authenticated routes now move into an exported table,
      `apps/web/src/routes/authenticated-routes.tsx`, and `App.tsx`'s
      `<Routes>` is generated from that table by `.map()` — this is a real
      restructure of `App.tsx`, not a +2 reindent. Route gating is verified
      across two separate test files, not one: `authenticated-routes.test.ts`
      imports the real, live `AUTHENTICATED_ROUTES` table and asserts its
      `{ path, allowedRoles, elementType }` contents against a literal
      expected 28-entry list — a genuine regression guard precisely because
      the JSX is generated from the same table the test imports, not a
      parallel hand-copied array — but on its own only proves the table's
      contents, not that `AppRoutes` actually renders from it. `App.test.tsx`
      closes that gap: it renders the real, exported `AppRoutes` with every
      page module-mocked and iterates the same imported table, proving the
      `.map()` wiring is a tested fact. The two are deliberately separate
      files (not two suites in one) so `vi.mock`'s file-wide hoisting in the
      second test can never leak into the first and make its element-pairing
      assertion vacuous. `ProtectedRoute.test.tsx` passing (with its comment
      and test name updated to name the new import site, per the "untouched"
      exception below) remains a third, corroborating check. `NotAuthorized`
      falls out for free and needs no edit. Rendering the nav inside
      `ProtectedRoute` is cheaper still but is excluded by the proposal's own
      non-goals (that file must stay untouched) and conflates the gate with
      the shell.
- [x] **OQ2 — i18n key strategy**: resolved, Decision 5. **Confirms** a new
      `nav.*` namespace (9 keys × 3 locales, enumerated with real translations),
      with one deliberate exception: logout reuses the shipped
      `auth.logoutLabel` rather than minting a duplicate string. Also surfaces a
      trap the proposal did not: `locales.test.ts` lists both removed
      `health.*` keys in existence guards and must be edited in the same PR.
- [x] **OQ3 — nav testid convention**: resolved, Decision 4. **Confirms** the
      `nav-` prefix, and **corrects the premise**: the collision does *not*
      resolve itself. `HealthPage`'s removal clears today's pair, but the nav
      renders on `/review-sessions`, so reusing `review-history-entry-link`
      would create a **same-page** duplicate — worse than today's. Exact names
      fixed for all ten controls (landmark, 8 link items, logout);
      `logout-button` is renamed to
      `nav-logout-button` so no stale test can silently re-bind.
- [x] **OQ4 — print suppression**: resolved, Decision 6. **Confirms** the global
      `@media print { .app-nav { display: none } }` rule in `index.css`, placed
      in the existing print block but **not** scoped to `.label-print`. **No
      separate un-layouted print route is needed** — the label page keeps its
      one shipped, reload-safe URL, and a route-level "no layout" flag would
      reintroduce the per-route opt-out Decision 1 removes.
- [ ] **Task-phase concern, not a design problem — the second seed account.**
      `prisma/seed.ts` creates only a `SYSTEM_ADMIN`, so browser-verifying a
      non-admin role needs a second account created through the now-reachable
      `/users` surface (or a seed addition). Named here because the proposal's
      success criteria require browser verification for **two** roles;
      `sdd-tasks` owns how the account is produced.
- [ ] **Watch item, not a blocker — `AppLayout` is now the single choke point
      for every authenticated page.** Anything later added to it (breadcrumbs,
      a user menu, responsive treatment, branding) lands on all 28 routes at
      once, including the label-printing page. Every such addition must pass the
      same print-suppression and role-filtering questions this slice answered;
      the deferred list in the proposal is the queue.
