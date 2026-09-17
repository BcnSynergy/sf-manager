# Verification Report: nav-menu

**Change**: `nav-menu` — global role-filtered navigation
**Mode**: Strict TDD
**Verified against**: `main` @ `5ff08e9` (all 4 PRs merged: #127, #128, #129, #130)
**Date**: 2026-09-17

**Verdict: PASS WITH ISSUES** — 1 CRITICAL, 5 WARNING, 3 SUGGESTION.

The implementation itself is correct and matches the specs closely. The single
CRITICAL is a **verification** gap, not a code defect: print suppression — the
one requirement whose delta spec explicitly warns against vacuous conformance —
shipped with no automated test and no browser print-preview check, and both
`tasks.md` and the apply-progress artifact claim an automated test that does not
exist anywhere in the repo.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 |
| Tasks complete | 23 |
| Tasks incomplete | 0 |

All 23 checkboxes in `tasks.md` are `[x]` and each maps to code present on
`main`. One task's completion note is factually wrong — see CRITICAL-1.

## Build & Tests Execution

**Web tests**: PASS — `npm run test --workspace=apps/web`

    Test Files  51 passed (51)
    Tests       806 passed (806)
    Duration    33.44s

**API tests**: PASS — `npm run test --workspace=apps/api`

    Test Suites: 111 passed, 111 total
    Tests:       909 passed, 909 total

No Prisma migration or reseed was needed; the suite ran green against the
already-running `sf-manager-postgres-1` container.

**Lint**: PASS — `npm run lint` exit 0, 0 errors, 4 warnings. All 4 are
pre-existing `@typescript-eslint/no-unsafe-argument` hits in
`apps/api/src/modules/auth/presentation/auth.controller.spec.ts`, untouched here.

**Typecheck / build**: PASS — `npm run build --workspace=apps/web` exit 0
(`tsc -b` clean, Vite build succeeded). This also confirms the
`satisfies Record<Role, readonly NavItem[]>` exhaustiveness guard compiles.

**Coverage**: not run — `test:cov` is defined for the API only, and no coverage
threshold is configured for `apps/web`, where every changed file lives.

---

## Spec Compliance Matrix — `app-navigation`

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Global nav on every authenticated page | Deep authenticated page | `App.test.tsx` structural wiring, 28 entries, asserts `nav-root` | COMPLIANT |
| | Wrong-role denial view | `AppLayout.test.tsx` NotAuthorized case; `App.test.tsx` denial branch | COMPLIANT |
| | No nav on `/login` | `App.test.tsx` renders /login with no nav | COMPLIANT |
| | No nav while session resolving | `AppLayout.test.tsx` render-gating case | COMPLIANT |
| | Current page indicated, exactly one | `AppLayout.test.tsx` marks exactly one item as current on a deep route | COMPLIANT |
| Role to items map exhaustive and fixed | Each of 5 roles sees exactly its set | `AppLayout.test.tsx` role matrix, `it.each`, exact `toEqual` on testid list | COMPLIANT |
| | Admin reaches all 7 without a URL | Same matrix row (7 testids) + prior-session browser verification | COMPLIANT |
| | New role fails the build | `nav-items.ts:76` `as const satisfies Record<Role, readonly NavItem[]>`; `tsc -b` clean | COMPLIANT (typecheck) |
| | No CRUD sub-route offered | `nav-items.ts` — all 8 `to` values are top-level list routes | COMPLIANT (static) |
| Every item targets a route its viewer may open | No item leads its viewer to denial | No covering test — WARNING-2 | UNTESTED (statically correct) |
| | Item set agrees with route gates | No covering test — WARNING-2 | UNTESTED (statically correct) |
| No path to the review-session write surface | Absent from 3 roles' nav | `AppLayout.test.tsx` write-surface guard over the 3 roles, no `href` starts with `/review-sessions` | COMPLIANT |
| | Only the two field roles offered it | Role matrix exact-set assertion | COMPLIANT |
| Manager history item gated on role alone | Granted/ungranted see identical nav | `nav-items.ts` branches on role only; no capability anywhere in web src | COMPLIANT (static) |
| | Ungranted manager reaches empty state | Shipped behaviour from `review-history-manager-capability`, not re-tested here | INHERITED |
| | Nav never learns the capability | No `managerCapabilities`/`VIEW_ALL_REVIEWS` in `AppLayout.tsx`/`nav-items.ts`; no API change | COMPLIANT (static) |
| Logout in nav; health page keeps readout | Logout reachable from every page | `AppLayout.tsx` renders the button inside the nav on all 28 routes | COMPLIANT |
| | Logout survives unrecognized role | `AppLayout.test.tsx` — `BOGUS_ROLE` and `constructor` cases, working logout, zero links | COMPLIANT |
| | Logout clears session, returns to /login | `AppLayout.test.tsx` logout success + network-failure, real AuthProvider + rejecting fetch stub | COMPLIANT |
| | Health page renders no link/logout | `HealthPage.tsx` reduced to the readout; `HealthPage.test.tsx` now holds exactly 1 test | COMPLIANT |
| | Removed keys exist in no locale | `locales.test.ts` guards dropped; verified absent from en/es/ca | COMPLIANT |
| | Two mechanisms never coexist | PR3 commits `d5961a1`/`e89e6e5` remove HealthPage links in the same PR that wires the nav | COMPLIANT (history) |
| No third entry point to element history | Exactly two entry links remain | Element-history route absent from `nav-items.ts` by construction | COMPLIANT (static) |
| | /review-sessions keeps its own history link | `ReviewSessionsPage.tsx` + its test untouched across the whole chain | COMPLIANT |
| Test identifiers do not collide | No ambiguity on a page showing both | Design-mandated collision test missing — WARNING-1 | UNTESTED (statically safe) |
| | Shipped review-session test passes unmodified | Not in the change diff; suite green | COMPLIANT |
| | Identifiers follow one convention | All nav testids `nav-` prefixed; exact-token grep `"logout-button"` 0 hits, `"nav-logout-button"` 1 hit | COMPLIANT |
| **Navigation absent from printed output** | **The navigation does not print** | **No test, no browser check — CRITICAL-1** | **UNTESTED** |
| | **Print suppression verified in a browser** | **Deliberately skipped (task 3.13)** | **UNTESTED** |
| Route gating unchanged by the wrapping | Every route allowed roles unchanged | `authenticated-routes.test.ts` exact `toEqual` against a literal 28-entry list | COMPLIANT |
| | Path stays paired with original component | Same test asserts `elementType: element.type` per entry, no `vi.mock` in that file | COMPLIANT |
| | Route-protection component and test untouched | `ProtectedRoute.tsx` absent from the diff; its test diff is comment text + 1 test name, zero expect/import/logic change | COMPLIANT |
| i18n coverage | Every label translated in 3 locales | `locales.test.ts` REQUIRED_NAV_KEY_PATHS — 9 keys, non-empty, non-placeholder, all 3 locales | COMPLIANT |
| | Parity test covers added and removed keys | Same file; both `health.*` entries deleted from the guards | COMPLIANT |
| Stays a link bar and nothing more | No collapse/menu/dashboard chrome | `AppLayout.tsx` holds no state; `<nav>` + NavLinks + one button | COMPLIANT (static) |
| | No dependency, no backend change | No package.json/package-lock.json diff; schema.prisma, apps/api/src, packages/validation untouched | COMPLIANT (see WARNING-4) |

**Compliance summary**: 28/33 scenarios covered by a passing test; 3 verified
statically only (WARNING-1, WARNING-2); **2 entirely unverified (CRITICAL-1)**.

## Spec Compliance — the 6 delta specs

All six were read against shipped reality. Amendment language is accurate.

| Delta | Claim | Verdict |
|---|---|---|
| `review-history-ui` | 3 roles' entry point becomes the global nav item; write-surface guarantee re-read against the nav; element history stays at exactly 2 entry links | Matches shipped code |
| `review-session-ui` | Entry point becomes the nav Review sessions item, offered to the 2 field roles only; entry page no longer carries the link | Matches shipped code |
| `review-template-admin-ui` | Purpose clause "no global nav bar exists" replaced by the nav Review templates item | Accurate; no ADDED block, correctly deferring to `app-navigation` |
| `community-admin-ui` | Drops "or a global nav bar"; adds the Communities item | Accurate |
| `checklist-question-admin-ui` | Purpose clause replaced by the Checklist questions item | Accurate |
| `element-label-printing` | "Navigation" now includes the global nav; conformance MUST be established by inspecting actual print output, not only a unit test | **Accurate language, but this is the requirement that shipped unverified — CRITICAL-1** |

## Correctness (Static Evidence)

| Item | Status | Notes |
|---|---|---|
| `AppRoutes()` genuinely maps over `AUTHENTICATED_ROUTES` | Confirmed by eye | `App.tsx:24` maps the array imported at `App.tsx:6` from `./routes/authenticated-routes`. Not a hand-written duplicate. Task 3.14 asked for this specifically because `App.test.tsx` proves only behavioural equivalence. |
| Role to item counts | Correct | SYSTEM_ADMIN 7, MAINTENANCE_TECHNICIAN 3, COMMUNITY_REPRESENTATIVE 3, MANAGER 2, MAINTENANCE_COMPANY_MANAGER 2 — matches the spec table exactly, Home included |
| Item to route reachability | Correct, all 8 pairs | `/` no gate, all roles; the 5 admin sections SYSTEM_ADMIN-only and offered only to admin; `/review-sessions` 2 roles offered only to those 2; `/review-history` 5 roles offered to all 5 |
| Route table size | Correct | 28 entries, counted by hand and pinned by `authenticated-routes.test.ts` |
| Print CSS rule | Correct by inspection | `index.css:134` screen rule declared BEFORE `@media print` (L148), which contains `.app-nav { display: none }` (L158), unscoped from `.label-print`. Source order is right — but nothing guards it. |
| i18n keys | Correct | 9 `nav.*` keys with real values in en/es/ca; `auth.logoutLabel` reused, not duplicated; both `health.*` link keys gone from all 3 locales |
| PR3 five comment-only fixes | All landed correctly | (1) `ProtectedRoute.test.tsx` ~159 "no dedicated route test file" claim replaced, naming `App.test.tsx`/`authenticated-routes.test.ts`; (2) ~322/~327 now point at `authenticated-routes.tsx`; (3) ~332 now reads "the same module `authenticated-routes.tsx` imports it from"; (4) test name now "the exported roles are exactly the 5 the anomaly comment promises"; (5) `element-history-route.roles.ts` ~3/~10 and `ElementReviewHistoryPage.tsx` ~16 both retargeted. Zero assertion/import/logic change in any of them. |

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D1 pathless layout route, Routes generated from an exported table, /login outside | Yes | Verified by direct code inspection, not just by test |
| D2 one AppLayout, no separate AppNav | Yes | Ships `Boolean(user)` rather than `!isLoading && user` — a small improvement over the snippet |
| D3 role table in its own module, exhaustive over Role | Yes | `satisfies Record<Role, ...>` present and compiling |
| D4 `nav-` testid prefix, `nav-logout-button` rename | Yes | Exact-token grep confirms the old `logout-button` is gone |
| D5 new `nav.*` namespace, logout reuses `auth.logoutLabel` | Yes | 9 keys x 3 locales |
| D6 global print rule + minimal screen rule, source order | Rule yes, **verification no** | CRITICAL-1 |
| D7 HealthPage cleanup ships with the wrapping | Yes | Same PR (#129); `HealthPage.test.tsx` down to its single readout test |
| Testing Strategy "Reachability invariant" row | **No** | WARNING-2 |
| Testing Strategy "No collision" row | **Partly** | Grep half done; the render-inside-AppLayout half missing — WARNING-1 |
| Testing Strategy "Print rule" row | **No** | CRITICAL-1 |
| File Changes `apps/api/**` / `prisma/**` "Untouched" | **No** | `seed.ts` modified — sanctioned by design's own Open Questions item, but the table row is stale — WARNING-4 |

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | Partial | apply-progress records RED/GREEN/REFACTOR per task in narrative form, not in the prescribed "TDD Cycle Evidence" table |
| All tasks have tests | Yes | AppLayout, authenticated-routes, App, locales test files all exist — except the print rule, which has none |
| RED confirmed (test files exist) | Yes | All reported test files present on `main` |
| GREEN confirmed (tests pass now) | Yes | 806/806 web, 909/909 API |
| RED to GREEN traceable in history | **No** | WARNING-5 — tests and implementation landed in a single commit per PR (`8c4ecba`, `64d8af8`, `4351d59`), so no commit shows a failing-test state |
| Triangulation adequate | Yes | Role matrix `it.each` over 5 roles; write-surface guard over 3; unrecognized-role fallback has 2 distinct cases (unknown role + prototype-colliding `constructor`) |
| Safety net for modified files | Yes | `ProtectedRoute.test.tsx` and `ReviewSessionsPage.test.tsx` both pass unmodified |

## Test Layer Distribution (files changed by this change)

| Layer | Scope | Files | Tool |
|---|---|---|---|
| Unit | 2 cases | `authenticated-routes.test.ts` | Vitest, no DOM, no mocks |
| Integration (component) | ~40 cases | `AppLayout.test.tsx`, `App.test.tsx`, `HealthPage.test.tsx`, `locales.test.ts` | Vitest + @testing-library/react + jsdom |
| E2E | 0 | — | No Playwright/Cypress in the project (per sdd-init) |

Browser verification was performed manually via `claude-in-chrome` in a prior
session and is accepted as covered — except the print preview, which was
deliberately skipped (CRITICAL-1).

## Assertion Quality

No trivial assertions found. Specifically checked and cleared:

- No tautologies, no assertion-without-production-code, no smoke-test-only cases.
- The role matrix uses exact `toEqual` on the full testid list, not `toContain` —
  a missing or extra item fails.
- The write-surface guard runs `.some(...)` over `getAllByRole('link')`, which
  throws on an empty collection, so it cannot pass vacuously.
- The `aria-current` check asserts `toHaveLength(1)` explicitly rather than
  looping over a possibly-empty filter result — no ghost loop.
- The two empty-collection assertions in the unrecognized-role cases have
  companion non-empty tests in the role matrix, so they are not orphan checks.
- `authenticated-routes.test.ts` asserts real component identities with no
  `vi.mock` anywhere in the file — the design's file-split rationale was
  honoured, so `element.type` cannot collapse to a shared stub.
- `App.test.tsx` derives each expected marker from the table entry's own rendered
  element rather than a hand-typed list, and iterates the real imported array.

**Assertion quality**: all assertions verify real behaviour.

---

## Issues Found

### CRITICAL

**CRITICAL-1 — Print suppression shipped with zero verification of any kind, and
two artifacts claim a test that does not exist.**

- No file in the repository reads `index.css` or asserts anything about
  `@media print` / `.app-nav`. Confirmed by four independent searches: no
  `readFileSync` or `.css` reference in any test file under `apps/web/src`; no
  "media print" outside `InspectableElementLabelPage.tsx` itself; the only
  print-mentioning tests are unrelated (a `window.print` spy and i18n key lists).
- `tasks.md` task 3.13 states print checks were "deferred to the
  already-passing automated CSS-source-order test". That test does not exist.
  The `sdd/nav-menu/apply-progress` artifact repeats the same claim.
- `design.md` Testing Strategy "Print rule" row mandates exactly that test and
  justifies it: without it "a shipped spec requirement has zero automated
  protection".
- The `element-label-printing` delta spec adds the scenario "Suppression is
  verified against a real print preview", stating conformance MUST NOT rest on a
  unit test asserting only that a print rule exists. The browser print preview
  was deliberately skipped to avoid a blocking OS dialog.
- Net effect: the requirement the spec singles out as "the first real application
  chrome this requirement has ever had to suppress, so suppression MUST be an
  actual, verified rule rather than a vacuous one" is the one requirement in this
  change with neither automated nor manual evidence. Two `app-navigation`
  scenarios and one `element-label-printing` scenario are UNTESTED.
- Mitigating: the CSS itself is correct by inspection — the screen rule at L134
  precedes the `@media print` block at L148, and `.app-nav { display: none }` at
  L158 is correctly unscoped from `.label-print`. The defect is the absence of
  proof and the absence of a regression guard: nothing stops a later edit from
  appending a screen `.app-nav` rule after the print block, which is precisely
  the silent failure Decision 6 says the source-order test exists to prevent.

**Remediation**: add the `index.css` source-order test the design specifies, and
run the browser print preview on the label route plus one ordinary route. Both
are small; neither requires touching shipped code.

### WARNING

**WARNING-1 — The design's actual collision guard was never written.**
Testing Strategy's "No collision" row requires rendering `ReviewSessionsPage` as
a child of `AppLayout` and asserting `getByTestId('review-history-entry-link')`
resolves to exactly one node, and explicitly says the isolated
`ReviewSessionsPage.test.tsx` "never renders the nav, so it cannot detect this
either way". No such test exists. The grep half of that row was honoured.
Statically safe today — `review-history-entry-link` appears only in
`ReviewSessionsPage.tsx` and its test, and every nav testid is `nav-` prefixed —
so this is a missing regression guard, not a live defect.

**WARNING-2 — The reachability-invariant test was never written.**
Testing Strategy requires "a table test pairing each `NavItem.to` with the
route's `allowedRoles`, so a future item pointing at a route its role cannot open
fails here". Nothing imports `NAV_ITEMS_BY_ROLE` except `AppLayout.tsx` itself.
All 8 item-to-route pairs were cross-checked by hand and every one is correct
today, but two `app-navigation` scenarios have no automated guard — exactly the
future-drift case the design wanted mechanised.

**WARNING-3 — Hardcoded, unguarded credentials added to the seed path.**
`apps/api/prisma/seed.ts` now creates `technician@sf-manager.example` with the
hardcoded password `nav-menu-verify-12345` and no `NODE_ENV` guard, while the
admin account in the same file is deliberately env-driven (`SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`). The comment calls it a local/dev-seed-only convenience
account, but nothing enforces that. Added for browser verification (task 3.12),
which is now complete.

**WARNING-4 — Two stale artifact statements.**
(a) `sdd/nav-menu/apply-progress` still describes PR4 as "LOCAL COMMIT ONLY, NOT
pushed, NOT merged"; PR #130 is merged and `main` is at `5ff08e9`.
(b) `design.md`'s File Changes table marks `apps/api/**` / `prisma/**` as
Untouched, contradicted by the `seed.ts` change. Not a spec breach — the
`app-navigation` "no backend change" scenario names the API, the schema and the
validation package, all genuinely untouched, and design's own Open Questions item
explicitly offered "or a seed addition" — but the table row is now inaccurate.

**WARNING-5 — TDD cycle evidence is self-reported, not traceable.**
All three implementation PRs committed tests and implementation together
(`8c4ecba` = AppLayout test + component + nav-items; `64d8af8` = route table test
+ table; `4351d59` = App test + App). No commit on `main` shows a failing-test
state, so RED to GREEN cannot be independently confirmed from history — only from
the apply-progress narrative, which also lacks the prescribed evidence table.

### SUGGESTION

**SUGGESTION-1** — `AppLayout.tsx` ships `const showNav = !isLoading && Boolean(user)`
and a flattened `Object.hasOwn` guard, where design.md Decision 2's snippet shows
`!isLoading && user` and a nested ternary. The shipped version is strictly better
(avoids rendering a falsy value). Worth folding back into design.md at archive
time so the snippet matches reality.

**SUGGESTION-2** — Design's Browser row also asks for a print preview of one
ordinary non-label route, because the pre-existing `@page { margin: 10mm }` rule
inside the print block is global and now applies whenever any authenticated page
is printed. Not done. Fold into CRITICAL-1's remediation.

**SUGGESTION-3** — 4 pre-existing lint warnings remain in
`apps/api/src/modules/auth/presentation/auth.controller.spec.ts`, unrelated to
this change. Worth a separate cleanup.

---

## Verdict

**PASS WITH ISSUES.** The navigation is correctly implemented, fully typed,
lint-clean, and covered by 806 passing web tests and 909 passing API tests, with
route gating pinned across two independent test layers and confirmed by direct
code inspection. Archive should not proceed until CRITICAL-1 is resolved: the
print-suppression requirement — the one its delta spec specifically guards
against vacuous conformance — currently has no evidence at all, and two artifacts
assert a test that was never written.
