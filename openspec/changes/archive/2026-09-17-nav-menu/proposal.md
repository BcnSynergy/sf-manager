# Proposal: Global Role-Filtered Navigation

## Intent

The app has **no navigation component of any kind**. `apps/web/src` contains
no `Layout`, `Nav`, `Sidebar` or `Header`; `main.tsx` renders `<App />` with no
shell, and each of the 28 routes in `App.tsx` is its own bare `<main>`.

The only navigation mechanism that has ever shipped is two hand-rolled
role-conditional `<Link>`s on `HealthPage` (`/`), added slice by slice as each
new role needed *somewhere* to land — `REVIEW_SESSION_ROLES` for the two field
roles, `REVIEW_HISTORY_ROLES` grown three times (company manager, then admin,
then manager). Each addition was explicitly justified as a stopgap: *"no
navigation component, no layout refactor"* (`review-session`/design.md
Decision 10, quoted verbatim in `HealthPage.tsx`).

The cost of that stopgap is now concrete and one-sided:

- **A `SYSTEM_ADMIN` cannot reach a single one of their five admin sections
  without typing the URL.** `/users`, `/communities`, `/maintenance-companies`,
  `/checklist-questions` and `/review-templates` all ship, all work, and none
  is linked from anywhere. Three shipped specs already admit this in writing —
  `checklist-question-admin-ui`: *"Reached by URL — there is no global nav bar
  and no parent page to hang an entry point from (pre-existing gap, carried
  forward)"*; `review-template-admin-ui`: *"Reached by URL — no global nav bar
  exists (pre-existing gap, carried forward)"*; `community-admin-ui` lists *"a
  global nav bar"* under its own out-of-scope line.
- **Every page is a dead end.** Once a user navigates off `/`, the only way
  back — and the only way to log out — is the browser's back button, because
  the logout control also lives on `HealthPage` alone.

Success looks like: any signed-in user, on any authenticated page, sees exactly
the sections their role can actually open, one click away, plus logout — and
`HealthPage`'s ad hoc links are gone, leaving one navigation mechanism instead
of two.

This is UI infrastructure, not a domain slice: **no new entity, no new
endpoint, no new Value Object, no new permission, no backend change at all.**
`useAuth().user.role` already carries everything the nav needs.

Context: `[[sdd/nav-menu/explore]]`, `[[sdd/nav-menu/proposal-decisions]]`,
ADR-006, ADR-007 (EN/ES/CA), ADR-011.

## Settled product decisions

Closed with the product owner before this proposal, or resolved by reading code
and shipped specs where noted. **Inputs, not open items — do not re-litigate in
`sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **Global layout, not a landing page** | The nav is a layout applied to **all authenticated routes**, not a set of links on `/`. A user on `/users/3/edit` gets the same nav as a user on `/`. This is the whole point: the current design is *"links on the landing page"*, and it is what makes every other page a dead end. |
| **`HealthPage`'s links and logout are REMOVED, not kept alongside** | The two role-conditional `<Link>`s and the logout `<button>` in `HealthPage.tsx` are deleted as part of this change; logout moves into the nav. **No two parallel navigation mechanisms.** `HealthPage` keeps its health-status readout and nothing else. The `health.reviewSessionsLink` / `health.reviewHistoryLink` keys are removed from all three locales. |
| **MANAGER's review-history link is always visible, capability or not** | Gated on the **role** alone, never on `VIEW_ALL_REVIEWS` — which `/auth/me` deliberately never carries. This follows the shipped ADR-011 precedent *"Ungranted MANAGER's web experience: link visible, empty result"* (`review-history-manager-capability`/design.md Decision 7), already implemented in `HealthPage`'s `REVIEW_HISTORY_ROLES`. The server stays the sole authority; an ungranted manager clicks the link and reaches the already-shipped empty state. **Exposing capabilities to the client is out of scope.** |
| **Nav items are top-level list entry points only** | One item per section, pointing at the list route. No `/new`, `/:id/edit` or other CRUD sub-routes appear in the nav; they are reached from their list page as they are today. |
| **The element-history route is NOT promoted to a nav item** | `/communities/:communityId/inspectable-elements/:elementId/history` is a contextual drill-in. `review-history-ui`'s shipped requirement *No Filtering, Analytics or Adjacent Controls Ship* (scenario *Exactly one per-element history view exists, reachable from exactly two links*) states its *"only navigation entry points MUST be the element-list row link and the session-detail entry link"* — **exactly two**. A nav item would be a third and would break a shipped spec. The sibling requirement *Two Entry Links Reach the Element History Page* independently pins the same "exactly two" count. |
| **The in-page link on `/review-sessions` stays** | `ReviewSessionsPage.tsx` renders its own `review-history-entry-link`, required by `review-history-ui`'s *A Reachable Entry Point From the Existing Review-Session Surface*. That is a contextual in-page link, not a competing global mechanism — it stays. Only `HealthPage`'s copy is removed. |
| **Role → items map (verified against `App.tsx`)** | `SYSTEM_ADMIN` → Home, Users, Communities, Maintenance companies, Checklist questions, Review templates, Review history (7). `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` → Home, Review sessions, Review history (3). `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` → Home, Review history (2). **Every item must point at a route the role's `ProtectedRoute` actually admits** — notably `SYSTEM_ADMIN` gets **no** Review sessions item, because `review-history-ui` requires that no navigation control offered to an admin, a `MANAGER` or a `MAINTENANCE_COMPANY_MANAGER` leads to the `/review-sessions` write surface. **Addendum (design-phase, Judgment Day fix pass):** `Home` was added to every role's item set after this table was first settled — see the Success Criteria note below for why this is a scope correction, not scope creep, and is itself now the settled decision going forward. |
| **`/login` gets no nav; an authenticated wrong-role user does** | `/login` is public and has no user to filter by — no nav. But a signed-in user who hits `NotAuthorized` (wrong role) **does** get the nav: they are authenticated, and the nav is their way out. Stranding them on a dead-end denial page is the exact failure this change exists to fix. While `AuthProvider` is still loading (`isLoading`), no nav renders — same precedence `ProtectedRoute` already owns. |

## Scope

### In Scope

**Web only (`apps/web/`)**

- **One new layout/nav component** rendering a `<nav>` landmark with the
  role-filtered link list plus the logout control, driven by a single static
  role → items lookup table (the generalized form of `HealthPage`'s existing
  `REVIEW_SESSION_ROLES` / `REVIEW_HISTORY_ROLES` sets) and
  `useAuth().user.role`. No data fetch, no new context, no new state beyond
  what `AuthProvider` already exposes.
- **Applied to every authenticated route** in `App.tsx`, including the
  `NotAuthorized` denial render. `/login` excluded.
- **Logout moved** into the nav, preserving the shipped behaviour exactly:
  call `logout()`, then redirect to `/login` (`authentication` spec, *Logout
  Flow (Web)*).
- **`HealthPage` cleanup**: both role-conditional links and the logout button
  removed; `HealthPage.test.tsx` updated; the two now-dead i18n keys removed
  from `en`/`es`/`ca`.
- **Minimal accessibility**: a `<nav>` landmark and current-page indication
  (`aria-current`), which `react-router`'s `NavLink` gives essentially for
  free. Nothing beyond that.
- **Print suppression**: the nav MUST NOT appear in printed output, because
  `element-label-printing`'s shipped requirement *Print Output Suppresses
  Application Chrome* says *"navigation, buttons and surrounding page layout
  MUST NOT appear"* — a requirement that has been vacuously true until now and
  becomes load-bearing the moment the label page is wrapped.
- **i18n**: real `en`/`es`/`ca` translations for every nav label, parity
  test-enforced (ADR-007). Key strategy is a design question (below).
- **Component tests** covering the role → items matrix for all five roles, the
  unauthenticated/`/login` case, the loading case, and the wrong-role
  `NotAuthorized` case. Plus **browser verification** against a running dev
  server (CLAUDE.md) for at least a `SYSTEM_ADMIN` and one non-admin role.

**Specs / docs**

- Spec deltas narrowing the three *"no global nav bar"* guards and the entry-
  point requirements whose mechanism changes (see Capabilities).

### Out of Scope (non-goals)

- **Any backend change.** No endpoint, no permission, no `ROLE_PERMISSIONS`
  row, no `/auth/me` field. If the nav appears to need one, the design is wrong.
- **Exposing `managerCapabilities` (or any capability) to the client** — the
  settled decision above depends on *not* doing this.
- **A sidebar, a hamburger/dropdown menu, or any responsive/mobile treatment.**
  Max 7 items for one role; a collapsed menu with focus-trap and click-outside
  state would cost more than the list it hides (explored and rejected).
- **A design system, CSS framework, theming, or app branding/logo in the nav.**
  The app has no UI kit; this slice introduces none.
- **A dashboard, breadcrumbs, a "back" affordance, search, or a user/profile
  menu** beyond the logout control that already exists.
- **Promoting any CRUD sub-route or the element-history route to a nav item.**
- **Language switcher** — ADR-007 already defers per-user language preference.
- **Changing any route's `allowedRoles`, or adding/removing any route.**
  Every route's `path`/`element`/`allowedRoles` MUST survive the restructure
  unchanged (the declarations MAY be relocated into the new
  `authenticated-routes.tsx` module per Decision 1, but none MAY be added,
  removed, or altered).
- **Any change to `ProtectedRoute`'s precedence logic** (loading → null, no
  user → `/login`, wrong role → `NotAuthorized`).
- **`ProtectedRoute.test.tsx`'s "untouched" invariant is narrow**: no
  behavioral/assertion changes — the test's logic and pass/fail conditions
  MUST stay exactly as shipped. This narrowly permits comment-text and
  test-name updates to keep the file's own documentation accurate about (a)
  which module now imports `ELEMENT_HISTORY_ALLOWED_ROLES` (moves from
  `App.tsx` to `authenticated-routes.tsx` per Decision 1), and (b) which
  module now holds the relocated route declarations/comments, and whether a
  dedicated route test file exists (it does, once `App.test.tsx` and
  `authenticated-routes.test.ts` are created per Decision 1). The same
  narrow, comment-text-only exception also applies to
  `element-history-route.roles.ts` and `ElementReviewHistoryPage.tsx`,
  which carry the same kind of stale `App.tsx` cross-references. No
  `expect()`, import, assertion, or other logic changes in any of these
  files.

### Why this scope and not more (ADR-006)

The expensive part is not the nav — it is *wrapping 28 routes*, and that is
paid once regardless of what the nav looks like. Everything else on the table
(sidebar, dropdown, breadcrumbs, dashboard, theming) is presentation polish on
a list that is at most seven items long for exactly one role. A plain link bar
answers the actual question — *"how does an admin reach `/users`?"* — with the
smallest permanent surface, and every rejected option can be layered on later
without redoing the wrapping.

## Capabilities

### New Capabilities

- `app-navigation`: the global authenticated shell — the role → nav-items
  contract for all five roles, where the nav does and does not render
  (`/login`, loading, `NotAuthorized`), the logout control's new home, the
  no-third-entry-point and no-write-surface-link invariants, and print
  suppression.

### Modified Capabilities

- `checklist-question-admin-ui` — narrow *"Reached by URL — there is no global
  nav bar and no parent page to hang an entry point from (pre-existing gap,
  carried forward)"*; the section is now nav-reachable.
- `review-template-admin-ui` — narrow the identical *"Reached by URL — no
  global nav bar exists (pre-existing gap, carried forward)"* clause.
- `community-admin-ui` — narrow *"or a global nav bar (proposal Out of Scope)"*
  in its Purpose.
- `review-session-ui` — *Both Non-Admin Roles Have a Reachable Entry Point*
  stays **true**, but its mechanism moves from `HealthPage`'s conditional link
  to the global nav. Amend so the requirement does not describe a control that
  no longer exists.
- `review-history-ui` — the three entry-point requirements phrased as *"from
  the app's entry page"* (company manager, admin, `MANAGER`) become *from the
  global nav, on any page*. The *never crosses the write surface* scenarios
  get stronger, not weaker: the nav must be included when *"every navigation
  control rendered for them is enumerated"*. *Two Entry Links Reach the Element
  History Page* is unchanged and must stay exactly two.
- `element-label-printing` — its *Print Output Suppresses Application Chrome*
  requirement needs no rewording, but `sdd-spec` should add a scenario pinning
  that the **global nav specifically** is absent from printed label output,
  since it is the first real chrome the guard has ever had to suppress.
- `authentication` — *Logout Flow (Web)* is location-agnostic and stays
  literally true. `sdd-spec` decides whether a scenario pinning *logout is
  reachable from every authenticated page* is worth adding; no rewording is
  required.

## Approach

1. **One static role → items table, colocated with the nav.** The same shape
   as the shipped `REVIEW_SESSION_ROLES` / `REVIEW_HISTORY_ROLES` sets, so a
   reviewer recognises the pattern. It must be exhaustive over `Role` (a
   `satisfies`/`Record<Role, …>` construction, per the codebase's existing
   exhaustiveness habit) so adding a sixth role fails the build rather than
   silently rendering an empty nav.
2. **The nav never invents reachability.** Every item's target route must be
   one the role's own `ProtectedRoute allowedRoles` already admits. This is an
   invariant `sdd-verify` can assert mechanically by cross-reading `App.tsx` —
   and it is what keeps the `review-history-ui` "no write-surface link for
   admin/manager/company-manager" guarantees true by construction.
3. **Wrapping is a routing decision, not a component decision.** The nav
   component itself is the same either way; how it gets onto 28 routes is the
   real choice (Open Question 1). Whichever wins, route *gating* must come out
   byte-identical.
4. **Remove before adding is not possible here — so remove in the same PR.**
   `HealthPage`'s links and the new nav must not coexist on `main`, since two
   parallel mechanisms is exactly what the settled decision forbids. The
   removal ships in the same PR that wraps `/`.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches `nav-menu/<NN>-<slug>`,
titles `feat(nav-menu): PR N/M — …`. `sdd-tasks` owns the binding split and
the 400-line forecast.

| PR | Content | Rough size |
|---|---|---|
| ~1 | Nav/layout component + exhaustive role→items table + i18n keys (3 locales) + component tests for all five roles | ~250–350 |
| ~2 | Wire into `App.tsx` across all authenticated routes + `NotAuthorized` + print suppression + `HealthPage` cleanup + dead-key removal + browser verification | ~300–450 (pre-design estimate; **superseded** — see `design.md`'s Migration / Rollout section: Decision 1's route-table redesign grows this to a realistic 900+ lines, over the 400-line PR budget, and `sdd-tasks` must re-forecast the chain, likely splitting the route-table extraction into its own PR) |
| ~3 | Spec deltas (6 capabilities) | ~150–250 |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/layout/` (new component + test) | New | The nav/shell component and its role→items table |
| `apps/web/src/routes/authenticated-routes.tsx` | New | `AuthenticatedRoute` type + the `AUTHENTICATED_ROUTES` table of all 28 authenticated routes, relocated from `App.tsx` (`design.md` Decision 1) |
| `apps/web/src/routes/authenticated-routes.test.ts` | New | Imports the real `AUTHENTICATED_ROUTES` table and real page components (no `vi.mock`) and asserts it structurally against a literal expected 28-route list, including each route's `elementType` (element/component pairing) alongside `path`/`allowedRoles` — the table-contents half of the route-gating regression guard (`design.md` Decision 1) |
| `apps/web/src/App.test.tsx` | New | Renders the real, exported `AppRoutes` with all 28 page components module-mocked and iterates the same `AUTHENTICATED_ROUTES` table to prove `AppRoutes` actually consumes it via `.map()` — the wiring half of the route-gating regression guard, deliberately a separate file from `authenticated-routes.test.ts` above so `vi.mock`'s hoisting cannot make that file's element-pairing assertion vacuous (`design.md` Decision 1) |
| `apps/web/src/App.tsx` | Modified | Route declarations replaced by a `.map()` over `AUTHENTICATED_ROUTES` inside the `AppLayout` wrapper; the route tree is extracted into its own exported `AppRoutes` component, with `App` reduced to composing `AuthProvider`/`BrowserRouter` around it (`design.md` Decision 1); **route gating unchanged** |
| `apps/web/src/auth/NotAuthorized.tsx` | **Unchanged** | Resolved by `design.md` Decision 1: gets the nav via `<Outlet />` with no edit needed |
| `apps/web/src/pages/HealthPage.tsx` (+ test) | Modified | Both entry links and the logout button removed |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Nav labels added; two `health.*` keys removed |
| `apps/web/src/index.css` (or component-level) | Modified | Print suppression for the nav |
| `apps/web/src/pages/ReviewSessionsPage.tsx` | **Unchanged** | Its in-page history link stays (shipped spec) |
| `apps/web/src/auth/ProtectedRoute.tsx`, `AuthProvider.tsx` | **Unchanged** | Consumed as-is |
| `apps/web/src/auth/ProtectedRoute.test.tsx` | Modified (comment + test name only) | Narrow exception to the "untouched" invariant above: updates its comment and test name to name `authenticated-routes.tsx` (the new import site for `ELEMENT_HISTORY_ALLOWED_ROLES`) instead of `App.tsx`; also updates two further stale comments — "App.tsx itself has no dedicated route test file" (now false) and "the in-file App.tsx comment calls out" (that comment moves to `authenticated-routes.tsx`) — no assertion or behavior change |
| `apps/web/src/auth/element-history-route.roles.ts` | Modified (comment-text only) | Narrow exception to the "untouched" invariant above: updates comments referencing "App.tsx's route comment" and "not from App.tsx, which only exports the `App` component" to name `authenticated-routes.tsx`, which now holds the relocated route declarations/comments; no logic or export change |
| `apps/web/src/pages/ElementReviewHistoryPage.tsx` | Modified (comment-text only) | Narrow exception to the "untouched" invariant above: updates a comment referencing "App.tsx's route comment" to name `authenticated-routes.tsx`; no logic change |
| `openspec/changes/nav-menu/specs/{app-navigation,checklist-question-admin-ui,review-template-admin-ui,community-admin-ui,review-session-ui,review-history-ui,element-label-printing}/spec.md` | New/Modified | One new spec, six deltas |
| `apps/api/**`, `prisma/**`, `packages/validation/**` | **Untouched** | No backend or contract change |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The nav offers a role a link it cannot open**, turning the fix into a `NotAuthorized` generator | High | Approach 2: every item cross-checked against `App.tsx`'s `allowedRoles`; a five-role component test asserts the exact item set per role; `sdd-verify` re-derives the map from `App.tsx` |
| **A write-surface link leaks to `SYSTEM_ADMIN`, `MANAGER` or `MAINTENANCE_COMPANY_MANAGER`**, breaking three shipped `review-history-ui` guarantees | High | Explicit in the settled role→items map; the *"every navigation control enumerated"* scenarios now include the nav and are asserted per role |
| **Duplicate `data-testid="review-history-entry-link"`** — `ReviewSessionsPage.tsx` already uses that exact testid, so a nav rendering the same one makes `getByTestId` ambiguous on `/review-sessions` and breaks shipped tests | High | Verified today; the nav must use its own distinct testids. `sdd-design` picks the naming convention; `ReviewSessionsPage.test.tsx` must still pass unmodified |
| **The nav prints on the label page**, silently breaking `element-label-printing`'s shipped chrome-suppression requirement | Med | In scope above; a scenario is added to that spec and browser-verified via print preview, not only unit-tested |
| **Wrapping 28 routes drifts into a route-gating refactor** and a role's `allowedRoles` changes by accident | Med | Explicit non-goal; since the route declarations now live in a separate module (`authenticated-routes.tsx`) from `App.tsx`, `sdd-verify` compares each route's `allowedRoles` array **across the two files** (the new table against the prior `App.tsx` `<Route>` blocks) for equality, backed by `authenticated-routes.test.ts`'s structural assertion and `App.test.tsx`'s structural-wiring assertion; `ProtectedRoute.test.tsx` stays passing with only its comment/test-name updated (no assertion change) |
| **The two parallel mechanisms ship anyway** because the `HealthPage` cleanup slips to a later PR | Med | Approach 4: removal ships in the same PR as the wrapping of `/` |
| **The nav renders during `AuthProvider` loading**, flashing an empty bar or crashing on `user.role` | Med | Settled decision: no user → no nav; the loading case is an explicit test |
| **Scope creep into a sidebar, dashboard or design system** once a shell exists | Med | Explicit non-goals; `sdd-verify` asserts no CSS framework, no new dependency, no collapse/toggle state |
| ES/CA nav labels stubbed with English placeholders | Low | Real translations in scope; `locales.test.ts` parity guard covers new keys and the two removals |

## Rollback Plan

`git revert` the branch. The slice is **web-only and additive plus one
deletion** — no migration, no schema object, no API contract, no data reshaped,
so there is no state to unwind.

- Reverting removes the nav component, its i18n keys, the print rule, the
  route wrapping, and the `authenticated-routes.tsx` module, and **restores
  `App.tsx`'s 28 inline route declarations and `HealthPage`'s two links and
  logout button verbatim** — the route declarations are now the largest
  single revert item, since Decision 1 moved them out of `App.tsx` entirely,
  and restoring `HealthPage`'s links/logout is what must come back so
  reverting the wrapping doesn't leave the app with *no* navigation at all.
- Route gating is untouched by construction, so a revert cannot regress
  authorization in either direction.
- Spec deltas must be reverted **with** the code, or three specs will claim
  nav-reachability the app no longer has.
- Each PR in the sketched chain reverts independently, **except** that PR ~2's
  `HealthPage` removal and route wrapping are deliberately coupled and revert
  together.

## Dependencies

- `AuthProvider` / `useAuth()` exposing `user.role` — already true, unchanged.
- `ProtectedRoute` with `allowedRoles` and its 401-before-403 precedence —
  consumed as-is.
- `react-router` (already a dependency); `NavLink`/`Outlet` are existing
  library surface, not a new package.
- `react-i18next` with `en`/`es`/`ca` — already wired.
- **No new runtime dependency and no new API endpoint.**
- For browser verification: a running dev server (`npm run dev`) plus accounts
  for at least `SYSTEM_ADMIN` and one non-admin role — `prisma/seed.ts` creates
  **only** a `SYSTEM_ADMIN`, so a second account must be created through the
  now-reachable `/users` surface.

## Success Criteria

**Reaching things**

- [ ] A `SYSTEM_ADMIN` reaches all seven of their sections from the nav, on
      any page, without typing a URL — Home plus the five admin sections and
      Review history.
- [ ] A `MAINTENANCE_TECHNICIAN` and a `COMMUNITY_REPRESENTATIVE` each see
      exactly Home, Review sessions and Review history.
- [ ] A `MANAGER` and a `MAINTENANCE_COMPANY_MANAGER` each see exactly Home
      and Review history — and an **ungranted** `MANAGER` sees the identical
      link and reaches the shipped empty state, not a hidden link and not an
      error.

> **Addendum (design-phase, Judgment Day fix pass, 2026-09-16):** `Home` was
> added to every role's item set during `sdd-design`'s adversarial review to
> fix a real defect the settled map above didn't anticipate — without it, `/`
> (the app's own landing page) becomes unreachable via nav the moment a user
> clicks any other item, since `HealthPage`'s own links and logout are removed
> in this same change. This is a scope **correction** to close a "landing page
> becomes a dead end" gap, not scope creep, and the seven/three/three/two/two
> counts above (with Home included for every role) are now themselves the
> settled decision going forward — do not re-litigate.
- [ ] The nav renders on every authenticated page, including `NotAuthorized`.
- [ ] The nav does **not** render on `/login`, nor while `AuthProvider` is
      loading.
- [ ] Logout is reachable from every authenticated page and still calls the
      logout endpoint then redirects to `/login`.

**Guards (the regressions that matter)**

- [ ] No nav item rendered for `SYSTEM_ADMIN`, `MANAGER` or
      `MAINTENANCE_COMPANY_MANAGER` leads to `/review-sessions` or any
      session-performing view.
- [ ] Every nav item points at a route the viewing role's `ProtectedRoute`
      admits; no role can reach `NotAuthorized` by clicking the nav.
- [ ] The element-history page still has **exactly two** entry links; the nav
      is not a third.
- [ ] `HealthPage` renders **no** navigation link and **no** logout button;
      `health.reviewSessionsLink` and `health.reviewHistoryLink` exist in no
      locale file.
- [ ] `ReviewSessionsPage`'s own history link still works and its shipped test
      passes **unmodified** (no testid collision).
- [ ] Every route's `allowedRoles` array is unchanged; `ProtectedRoute.tsx`
      is untouched, and `ProtectedRoute.test.tsx` passes with no
      assertion/behavior change (comment-text and test-name update only, per
      the narrow exception above).
- [ ] The nav is absent from printed label output.
- [ ] `apps/api/**`, `prisma/**` and `packages/validation/**` are untouched;
      no new npm dependency ships.

**Quality**

- [ ] Zero hardcoded UI strings; every nav label has real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] Web suite, lint and build pass.
- [ ] **Browser-verified** against a running dev server for at least a
      `SYSTEM_ADMIN` and one non-admin role — not only test-verified
      (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Each has a working assumption; none blocks the next phases.

1. **Routing mechanics — `sdd-design` owns this.** A parent layout route with
   `<Outlet>` (one wrapper, but restructures all 28 route declarations in a
   409-line `App.tsx` dense with ordering comments that must survive) vs.
   wrapping each route's element individually (a mechanical, low-risk diff,
   but repeats the wrapper ~27 times). *Working assumption*: the nested layout
   route, because it is the only option where "the nav is on every
   authenticated page" is true **by construction** rather than by 27 correct
   copies — but the cost to `App.tsx`'s comment-dense ordering notes is real
   and must be weighed, not assumed. Whichever wins, `allowedRoles` must come
   out byte-identical. `NotAuthorized` coverage also falls out of this choice.
   **Design-phase update (fix round 3):** `App.tsx`'s exact line count and
   shape will shift further once the design's Decision 1 moves the route
   declarations into their own module — treat the figures above as the
   pre-design baseline, not the post-design result.
2. **i18n key strategy — `sdd-design` owns this.** Reuse the existing
   `*.list.title` keys (zero new keys, but couples nav labels to page titles
   forever) vs. a new `nav.*` namespace, separated cleanly from page-title
   keys. *Working assumption*: a `nav.*` namespace — a nav label and a
   page `<h1>` are different strings that only happen to match today, and a
   small number of short entries is a cheap price for being able to change
   one without the other. Decide explicitly; do not default silently. (The
   design phase resolved this to 9 keys × 3 locales = 27 entries — see
   `design.md` Decision 5 for the authoritative count.)
3. **Nav testid / selector convention — `sdd-design`.** Forced by the verified
   `review-history-entry-link` collision. *Working assumption*: a distinct
   `nav-*` prefix per item.
4. **Print suppression mechanism — `sdd-design`.** A global `@media print`
   rule in `index.css` vs. something scoped to the label page. *Working
   assumption*: a global rule on the nav element, since the requirement is
   about the nav, not about one page.

## Deferred by this slice (ADR-006 record)

Not designed here, deliberately: sidebar or collapsed-menu treatments,
responsive/mobile navigation, breadcrumbs, a dashboard, a user/profile menu, a
language switcher (ADR-007), app branding in the nav, and any design system or
CSS framework adoption.

### Open question / possible future slice — recorded, not proposed

The product owner asked to flag, **as a deferred idea and explicitly not a
requirement of this slice**, that a future change might revisit ADR-011's
*"link visible, empty result"* pattern **more broadly across the app** — not
just for the nav's `MANAGER` item. The question is whether the client should
ever learn about capabilities so that a user is never offered a surface that
will be empty for them, and it has real consequences (a `/auth/me` contract
change, a capability-aware client, and a decision about whether capability
membership is itself sensitive). This slice deliberately follows the shipped
precedent unchanged. If that pattern is ever revisited, this nav is one of its
call sites and would need to be revisited with it.

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding. `sdd-design` owns OQ1 above all: it is the only decision
whose wrong answer is expensive to undo, since it determines the shape of every
route declaration in `App.tsx`.
