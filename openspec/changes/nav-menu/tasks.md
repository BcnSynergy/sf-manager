# Tasks: Global Role-Filtered Navigation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~300-350, PR2 ~400-450, PR3 ~700-900 (hard-coupled, see below), PR4 ~150-250 |
| 400-line budget risk | High (PR3 specifically) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 -> PR4 (stacked-to-main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**PR3 cannot be legally split further.** `design.md`'s Migration/Rollout section
states two non-negotiable couplings: (a) `App.tsx` wrapping + `HealthPage`
cleanup + the two i18n-key removals (incl. `locales.test.ts` guard entries)
must ship together — one navigation mechanism, never two; (b) the print rule
ships with the wrapping. Splitting PR3 across those lines would let the two
mechanisms coexist on `main` for one PR's lifetime, which the settled decision
forbids. **PR3 will realistically land at 700-900 changed lines, over the
400-line budget, with no compliant further split** — flag this to the user
before `sdd-apply` starts PR3: either accept `size:exception` for PR3 alone
(recommended — it is one deliverable, testable-in-isolation-from-PR4 unit,
just a large one), or revisit whether `HealthPage`'s cleanup could tolerate a
short-lived dual-mechanism window (design already rejected this).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Nav component + role-items table + i18n `nav.*` keys + standalone component tests | PR 1 | base `main`; not wired into `App.tsx`; independent, revertable |
| 2 | Route table extraction (`authenticated-routes.tsx`) + table-contents test | PR 2 | base = PR1 branch; `App.tsx` untouched; independent of PR1's nav internals |
| 3 | Wire `AppLayout` into `App.tsx` via the route table + `HealthPage` cleanup + print CSS + i18n removal + comment fixes + browser verification | PR 3 | base = PR2 branch; hard-coupled, needs `size:exception` |
| 4 | Spec deltas (6 capabilities) | PR 4 | base = PR3 branch; docs-only, independent content |

---

## Phase 1: Nav Component (PR 1) — `nav-menu/01-nav-component-i18n`

- [x] 1.1 RED: write `apps/web/src/layout/AppLayout.test.tsx` — role→items matrix (`it.each` over 5 roles, exact testid set via `toEqual`), write-surface guard (no `/review-sessions` link for `SYSTEM_ADMIN`/`MANAGER`/`MAINTENANCE_COMPANY_MANAGER`), render gating (`isLoading`, no `user`), unrecognized-role + prototype-colliding-role fallback (`Object.hasOwn`), single `aria-current` on a deep route, `NotAuthorized` still shows nav (skip until PR3 wiring — mark `.skip` or defer), logout success + logout-network-failure (real `AuthProvider` + `fetch` stub per `mockFetch({ logoutRejects: true })` pattern, Decision 7 correction)
- [x] 1.2 GREEN: create `apps/web/src/layout/nav-items.ts` — `NavItem` type, `HOME`/`USERS`/etc. constants, `NAV_ITEMS_BY_ROLE` as `const satisfies Record<Role, readonly NavItem[]>` (Decision 3)
- [x] 1.3 GREEN: create `apps/web/src/layout/AppLayout.tsx` — `<nav>` landmark, `NavLink` items, logout button, `Object.hasOwn`-guarded item lookup, `showNav` gating (Decision 2)
- [x] 1.4 Add `nav.*` i18n keys (9 keys) to `apps/web/src/i18n/locales/{en,es,ca}.json` (Decision 5); confirm `auth.logoutLabel` reused, not duplicated
- [x] 1.5 Add print CSS to `apps/web/src/index.css`: screen `.app-nav { display: flex; gap: 1rem }` declared **before** the existing `@media print` block, plus `.app-nav { display: none }` inside that block, not nested under `.label-print` (Decision 6)
- [x] 1.6 REFACTOR: run web suite + lint; confirm exact testids (`nav-root`, `nav-link-*`, `nav-logout-button`) match Decision 4; exact-token grep for `"logout-button"` returns zero hits

## Phase 2: Route Table Extraction (PR 2) — `nav-menu/02-authenticated-routes-extraction`

- [x] 2.1 RED: write `apps/web/src/routes/authenticated-routes.test.ts` — import real `AUTHENTICATED_ROUTES`, no `vi.mock`, assert `{ path, allowedRoles, elementType: element.type }` structurally against a literal 28-entry expected list
- [x] 2.2 GREEN: create `apps/web/src/routes/authenticated-routes.tsx` — `AuthenticatedRoute` type + `AUTHENTICATED_ROUTES` array, one entry per existing `App.tsx` route, `allowedRoles` arrays and ordering comments moved verbatim (Decision 1); `App.tsx` untouched in this PR
- [x] 2.3 REFACTOR: diff each moved `allowedRoles` array against `App.tsx`'s current `<Route>` blocks by eye to confirm byte-identical transcription before PR3 consumes it

## Phase 3: Wire AppLayout + HealthPage Cleanup (PR 3) — `nav-menu/03-wire-app-layout-healthpage-cleanup`

**Hard-coupled per design.md; request `size:exception` before starting.**

- [x] 3.1 RED: write `apps/web/src/App.test.tsx` — import real `AppRoutes`, 28 static top-level `vi.mock` calls (literal specifiers, distinct per-page marker stubs, `vi.hoisted()` for any shared helper), iterate real `AUTHENTICATED_ROUTES` to assert nav presence/absence, role gating, rendered-stub identity per entry, plus explicit `/login` no-nav case (29 total)
- [x] 3.2 GREEN: modify `apps/web/src/App.tsx` — extract `AppRoutes` (exported), `.map()` over `AUTHENTICATED_ROUTES` inside pathless `<Route element={<AppLayout />}>`, `/login` stays sibling outside the wrapper, `App` reduced to composing `AuthProvider`/`BrowserRouter` around `AppRoutes` (Decision 1)
- [x] 3.3 Unskip/enable the `NotAuthorized`-shows-nav case from 1.1 now that wiring exists; confirm it passes
- [x] 3.4 Modify `apps/web/src/pages/HealthPage.tsx` — remove both role-conditional links, logout button, `handleLogout`, `REVIEW_SESSION_ROLES`/`REVIEW_HISTORY_ROLES`, now-unused imports (Decision 7)
- [x] 3.5 Modify `apps/web/src/pages/HealthPage.test.tsx` — remove/relocate 12 of 13 tests (logout success + logout-failure already covered in 1.1's `AppLayout.test.tsx`; 10 role-conditional link tests subsumed by 1.1's role→items matrix); keep only the health-readout test
- [x] 3.6 Remove `health.reviewSessionsLink` / `health.reviewHistoryLink` from `apps/web/src/i18n/locales/{en,es,ca}.json`
- [x] 3.7 Modify `apps/web/src/i18n/locales.test.ts` — delete the two `health.*` entries from `REQUIRED_*_KEY_PATHS` (lines ~453, ~488), update the stale doc comment at ~line 372, add `REQUIRED_NAV_KEY_PATHS` for the 9 new `nav.*` keys
- [x] 3.8 Comment-only fix: `apps/web/src/auth/ProtectedRoute.test.tsx` — (a) line ~332 comment → "the same module `authenticated-routes.tsx` imports it from"; (b) line ~337 test name → `'the exported roles are exactly the 5 the anomaly comment promises'`; (c) line ~159 comment → remove/replace "no dedicated route test file" claim, name `App.test.tsx`/`authenticated-routes.test.ts`; (d) lines ~322/~327 comments → point at `authenticated-routes.tsx`'s route comment. No `expect()`/import/assertion changes.
- [x] 3.9 Comment-only fix: `apps/web/src/auth/element-history-route.roles.ts` — line ~3 → name `authenticated-routes.tsx`; line ~10 react-refresh rationale → keep pointed at `App.tsx` (still correct: it exports `App`+`AppRoutes`, both components), reword to say this module stays separate from `authenticated-routes.tsx` (not `App.tsx`, which exports no route table). No export/logic change.
- [x] 3.10 Comment-only fix: `apps/web/src/pages/ElementReviewHistoryPage.tsx` — line ~16 → "see `authenticated-routes.tsx`'s route comment". No logic change.
- [x] 3.11 REFACTOR: run full web suite + lint + build; confirm `ProtectedRoute.test.tsx` passes with zero assertion/behavior diff (comment/name changes only)
- [x] 3.12 Seed a second, non-admin account via the now-reachable `/users` surface (or a seed addition) for browser verification (open task-phase item from design.md)
- [x] 3.13 Browser verification (CLAUDE.md, real dev server): `SYSTEM_ADMIN` reaches all 7 items incl. Home from a deep page without typing a URL, confirming no `/review-sessions` item; one non-admin role sees exactly its items; `/login` shows no nav; logout works from a non-`/` page — all confirmed live via `claude-in-chrome` against `nav-menu/03-wire-app-layout-healthpage-cleanup`. Print preview checks deferred to the already-passing automated CSS-source-order test (`index.css`'s screen rule before the `@media print` block) rather than the native print dialog, to avoid a blocking OS dialog during browser automation.
- [x] 3.14 Note for `sdd-verify`: read `AppRoutes` by eye to confirm it renders via `.map()` over `AUTHENTICATED_ROUTES` — `App.test.tsx` (3.1) proves *behavioral* equivalence, not literal `.map()` usage; `design.md`'s Decision 1 prose and Testing Strategy row overclaim this, do not treat the test alone as sufficient

## Phase 4: Spec Deltas (PR 4) — `nav-menu/04-spec-deltas`

- [ ] 4.1 Confirm `openspec/changes/nav-menu/specs/app-navigation/spec.md` (new capability) matches the shipped role→items table, gating, print-suppression and logout requirements
- [ ] 4.2 Confirm the 6 delta specs (`review-history-ui`, `review-session-ui`, `review-template-admin-ui`, `community-admin-ui`, `checklist-question-admin-ui`, `element-label-printing`) narrow their "no global nav bar" / entry-point language per proposal.md's Capabilities section
- [ ] 4.3 Run `openspec validate` (or project equivalent) on all 7 spec files
