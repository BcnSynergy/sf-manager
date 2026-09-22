# Verification Report: Organization Profile (FR-013 / ADR-012)

**Change**: `organization-profile`
**Verified at**: 2026-09-22, on `main` @ `96cbdab` (merge of PR #139 — full 6-PR chain #134–#139 landed)
**Artifact store**: hybrid (`openspec/changes/organization-profile/` + Engram)
**Mode**: **Strict TDD**
**Scope**: first full `sdd-verify` pass for this change. Prior coverage was per-PR `/code-review high` fresh-context reviews only.

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total | 28 (Phases 1–6) |
| Tasks complete (`[x]`) | 27 |
| Tasks incomplete (`[ ]`) | 1 — **6.5 browser verification** (work was done; checkbox is stale — see WARNING-1) |

All six phases' implementation tasks are complete in code. The single unchecked
item is a documentation-state defect, not missing work.

---

## Build & Tests Execution

**Build**: PASS — `npm run build` (turbo, 4/4 tasks) — `tsc -b` + `nest build` + `vite build`, zero type errors.

**Lint**: PASS — `npm run lint` (turbo, 5/5 tasks), zero errors. This covers the
`no-restricted-imports` ADR-013 rule (no `@prisma/client` outside
`infrastructure/persistence/**`).

**Test suites executed** (four separate runners — `npm run test` alone does *not*
cover e2e or integration, since `rootDir: src` and `.integration.spec.ts` is in
`testPathIgnorePatterns`):

| Command | Result |
|---|---|
| `npm run test --workspace=apps/api` (Jest, unit) | **PASS** — 118 suites, **939/939** |
| `npm run test --workspace=apps/web` (Vitest) | **PASS** — 56 files, **873/873** |
| `npm run test:e2e --workspace=apps/api` (Jest + supertest) | **PASS** — 11 suites, **374/374** |
| `jest --testRegex=".*-migration\.integration\.spec\.ts$"` (real Postgres) | **FAIL** — 6 suites, 45/47; **2 failed** |

Change-scoped test counts (measured, not estimated):

| Scope | Tests |
|---|---|
| API unit (`src/modules/organization-profile/**`, 5 suites) | 11 |
| API e2e (`test/organization-profile.e2e-spec.ts`) | 25 |
| Shared validation (`packages/validation/.../update-organization-profile.schema.spec.ts`) | 26 |
| Web (`OrganizationProfilePage.test.tsx` 13 + `api/organization-profile.test.ts` 4) | 17 |
| Migration integration (real Postgres) | 6 (**5 pass / 1 fail**) |
| **Total change-scoped** | **85 (84 pass / 1 fail)** |

Plus extended shared guards: `role-permission.checker.spec.ts`,
`locales.test.ts`, `nav-items.reachability.test.ts`, `AppLayout.test.tsx`,
`authenticated-routes.test.ts`, `App.test.tsx`.

**Coverage**: not run — no coverage threshold is configured for this project
(`test:cov` exists but no gate). Informational only, not a failure.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ⚠️ Partial | No "TDD Cycle Evidence" table survives in the Engram `apply-progress` artifact — the `topic_key` upsert collapsed 14 revisions to the PR6 entry, which self-references a "prior revision" that is no longer retrievable. Reconstructed instead from `tasks.md`'s per-task RED/GREEN annotations + source inspection. See WARNING-4. |
| All logic-bearing files have tests | ✅ | entity, fixture, both use cases, mapper, Prisma adapter, shared Zod schema, page component, API client, migration — all have specs. Mechanical files (DTOs, module wiring, route registration, i18n JSON, docs) correctly exempted per `tasks.md` "Rules Applied". |
| RED confirmed (test files exist) | ✅ | Every test file named in `tasks.md` exists on disk and was read. Zero phantom test *files*. |
| GREEN confirmed (tests pass now) | ⚠️ | 84/85 change-scoped tests pass on execution. 1 fails — see CRITICAL-1. |
| Triangulation adequate | ✅ | Strong. The schema spec triangulates per-field with `it.each` over all six fields for empty-string, whitespace-only and explicit-`null` rejection (17 of its 26 cases). The adapter spec triangulates three distinct outcomes (P2025→mapped, unrelated error→rethrown unchanged, success→mapped entity). The authz spec is an exhaustive `NON_ADMIN_ROLES × ALL_PERMISSIONS` denial table. |
| Safety net for modified files | ✅ | Pre-existing shared specs (`role-permission.checker.spec.ts`, `locales.test.ts`, `AppLayout.test.tsx`, `nav-items.reachability.test.ts`) were **extended, not relaxed** — verified by reading each. |

**TDD Compliance**: 4 clean / 2 partial. No protocol violation found in the code;
both partials are artifact/environment issues.

---

## Test Layer Distribution

| Layer | Tests | Files | Tooling |
|---|---|---|---|
| Unit | 37 | 6 | Jest (`ts-jest`), plain fakes + one mocked `PrismaService` |
| Component / integration | 17 | 2 | Vitest + Testing Library + jsdom |
| HTTP contract ("e2e") | 25 | 1 | Jest + supertest, `AppModule` with in-memory repository overrides |
| DB integration | 6 | 1 | Jest + real Postgres via `PrismaService` |
| **Total** | **85** | **10** | |

Layer note (SUGGESTION-6): the file named `organization-profile.e2e-spec.ts` is
an HTTP-contract test against a fully in-memory repository with `PrismaService`
stubbed — not a full-stack e2e. That is the established repo precedent
(`maintenance-company.e2e-spec.ts`, `community.e2e-spec.ts`) and it is honestly
documented in the file's own header comment, so this is a naming observation,
not a defect. The real-database half of the contract lives in the migration
integration spec.

---

## Assertion Quality Audit

Every test file created or modified by this change was read in full.

| Pattern scanned | Found |
|---|---|
| Tautologies (`expect(true).toBe(true)`) | **0** |
| Assertions with no production-code call | **0** |
| Ghost loops over possibly-empty collections | **0** — and `nav-items.reachability.test.ts` explicitly guards against exactly this with an `expect(pairs.length).toBeGreaterThan(0)` fixture sanity check, documented in-file as a ghost-loop defence |
| Orphan empty-collection assertions | **0** — every `.toEqual([])` in the authz/locale specs has a companion non-empty case |
| Type-only assertions used alone | **0** |
| Smoke-test-only (`render` + `toBeInTheDocument`, no behavior) | **0** — every page test drives an interaction or asserts a state transition |
| Implementation-detail coupling (CSS classes, internal state) | **0** — assertions use `data-testid`, form values, and mock call arguments |
| Mock-heavy files (mocks > 2× assertions) | **0** |

**Assertion quality**: ✅ **All assertions verify real behavior.** This is a
genuinely well-tested slice; the anti-patterns this project has been bitten by
before (`nav-menu`'s phantom CSS source-order test, vacuous concurrency tests)
do not appear here. Three specific positives worth recording:

- `prisma-organization-profile.repository.spec.ts` asserts the *negative* case
  (`rejects.toBe(original)` — an unrelated error is rethrown **unchanged**),
  which is what makes the P2025 mapping test non-vacuous.
- `update-organization-profile.use-case.spec.ts` asserts `getSpy` was **not**
  called, mechanising design Decision 3 rather than merely describing it.
- `OrganizationProfilePage.test.tsx` holds the update promise open with a manual
  `resolveUpdate` to assert the disabled-input race window, then resolves and
  asserts re-enablement — a real concurrency assertion, not a snapshot.

---

## Spec Compliance Matrix

### `organization-profile-management` (8 requirements / 25 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| The Profile Row Exists Before Any Request | Row exists after migration, blank, no request made | `organization-profile-migration.integration.spec.ts > exactly one row exists after migrate deploy...` | FAILING (CRITICAL-1) |
| " | Seed does not duplicate the row | `...a second INSERT fails with singleton = true / = false` (2 cases, pass) - structural impossibility proven; the literal `ON CONFLICT DO NOTHING` re-run path is not separately exercised | PARTIAL |
| " | No application path creates the row | Port declares only `get()`/`update()`; no `create` anywhere in the module; e2e `POST -> 404` | COMPLIANT |
| Read the Organization Profile | Blank seeded profile reads successfully | e2e `returns 200 with all six fields blank...` | COMPLIANT |
| " | Filled profile reads back stored values | e2e `reads back stored values after an update...` | COMPLIANT |
| " | Read never reports the profile as missing | e2e (same test, asserts 200 across lifecycle); controller declares no 404 mapping; `get()` returns non-nullable | COMPLIANT |
| " | Response carries no completeness flag | e2e `carries no complete/incomplete flag` | COMPLIANT |
| Partial Update | Subset updated, rest untouched | e2e `updates only the supplied fields...` + `update-organization-profile.use-case.spec.ts` | COMPLIANT |
| " | Values stored trimmed | e2e `stores supplied values trimmed` + schema spec `trims a supplied field...` | COMPLIANT |
| " | Update responds with the full profile | e2e (all PATCH cases assert the full body) | COMPLIANT |
| " | `taxId` takes any non-blank text | e2e `accepts any non-blank taxId with no format rule` + schema spec `does NOT upper-case taxId` | COMPLIANT |
| A Supplied Field Must Be Non-Blank | Empty string rejected | e2e + schema spec `it.each` x6 fields | COMPLIANT |
| " | Whitespace-only rejected | e2e + schema spec `it.each` x5 fields | COMPLIANT |
| " | Explicit `null` rejected, not a clear | e2e `rejects an explicit null...` (asserts prior value survives) + schema spec `it.each` x6 | COMPLIANT |
| " | Partially invalid update writes nothing | e2e `rejects a partially invalid body, leaving even the valid sibling field unchanged` | COMPLIANT |
| An Update That Changes Nothing Succeeds | Re-sending same values succeeds | e2e `accepts identical values...` | COMPLIANT |
| " | Empty body succeeds, changes nothing | e2e `accepts an empty body...` + schema spec `accepts an empty body` | COMPLIANT |
| " | Unrecognized properties ignored, not persisted | e2e `accepts a body with only unrecognized properties...` + schema spec | COMPLIANT |
| logoAssetId Reserved/Unwritable/Absent | Absent from read response | e2e `never returns a logoAssetId key, in any form` | COMPLIANT |
| " | Supplying the field writes nothing | e2e `silently accepts a logoAssetId...and writes nothing` + schema spec `strips a logoAssetId...` | COMPLIANT |
| " | No upload surface ships | Grep: zero hits for `minio`/`aws-sdk`/`s3client`/`object-storage` across `apps/`, `packages/`, `docker-compose.yml`, root `package.json` | COMPLIANT (static) |
| No Create and No Delete Surface | Only two operations declared | Controller declares `@Get()` + `@Patch()` only; e2e `POST`/`DELETE`/`:id` -> 404 | COMPLIANT |
| " | Create/delete attempt reaches nothing | e2e x2 | COMPLIANT |
| " | Entity is not soft-deletable | `schema.prisma` has no `deletedAt`; adapter does NOT `extends SoftDeletableRepository` (verified by reading the class declaration) | COMPLIANT (static) |
| An Incomplete Profile Blocks Nothing | No other surface consults the profile | Grep: the only `apps/api/src` files referencing the module outside it are `app.module.ts` (registration), `permission.ts` and `role-permission.checker.ts` (+ its spec) - no domain/use-case coupling anywhere | COMPLIANT (static) |

### `organization-profile-admin-ui` (7 requirements / 16 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Role-Gated Route Access | Admin reaches the page | `OrganizationProfilePage.test.tsx > renders the page for a SYSTEM_ADMIN` | COMPLIANT |
| " | Non-admin denied explicitly, not redirected | `...renders the explicit NotAuthorized surface, not a redirect...` (also asserts the profile fetch was never issued) | COMPLIANT |
| " | Unauthenticated redirected to `/login` | `ProtectedRoute.test.tsx > redirects to /login when unauthenticated, even with allowedRoles set (401 before 403)` - shared component, route uses it | COMPLIANT |
| One Combined View and Edit Page | Shows and edits in one place | Page tests render all six inputs prefilled and edit in place; single route in `authenticated-routes.tsx` | COMPLIANT |
| " | No create/delete/list affordance | Static: the page renders six inputs + one submit button, nothing else; no sibling route exists | PARTIAL (no enumerating test - SUGGESTION-5) |
| Not-Completed-Yet Distinct From Loading/Error | Blank seeded profile shows not-completed | `shows the incomplete banner for the blank seeded profile` | COMPLIANT |
| " | Partially filled still shows not-completed | (no covering test - only blank and fully-filled cases exist) | UNTESTED (SUGGESTION-1) |
| " | Fully filled shows no not-completed | `shows no incomplete banner once all six fields are filled` | COMPLIANT |
| " | Loading and error states distinct | `shows a loading state...` + `shows a distinct error state, not the loading or incomplete state...` - each asserts the other two testids are absent | COMPLIANT |
| Saving the Profile | Valid save persists, visible without reload | `clears the incomplete banner after a successful save updates the saved snapshot` + `sends only the non-empty, trimmed fields...` | COMPLIANT |
| " | Blank field rejected before any network call | `rejects the submit locally, with no network call, when a previously-saved field is cleared` (asserts `not.toHaveBeenCalled()`) | PARTIAL - rejection and no-network-call proven; the spec "for that field" (field-scoped error) is not met (SUGGESTION-2) |
| " | Save failure surfaced without losing entered values | `keeps the entered values and shows an error when the save request fails` | COMPLIANT |
| No Logo Control | No logo affordance rendered | Static: no file input, no image, no logo key in any locale; `logoAssetId` absent from the web type | PARTIAL (static only - SUGGESTION-5) |
| No Server-Message String Coupling | No branching on English message text | The page error paths are `t()` key lookups only; no `.message` comparison anywhere in `OrganizationProfilePage.tsx` or `api/organization-profile.ts` | COMPLIANT (static) |
| Internationalization Coverage | All visible text translated in every locale | `locales.test.ts` `REQUIRED_ORGANIZATION_PROFILE_KEY_PATHS` - all 15 keys asserted present, non-empty and non-placeholder in en/es/ca; real translations verified in all three | PARTIAL - key existence enforced; no test asserts the RENDERED text is the translation (SUGGESTION-3) |
| " | Parity test covers the new namespace | Read and confirmed: `REQUIRED_ORGANIZATION_PROFILE_KEY_PATHS` (15 entries) + `nav.organizationProfile` added to `REQUIRED_NAV_KEY_PATHS`, both driven through `it.each` with real-value + non-placeholder assertions. NOT a phantom test. | COMPLIANT |

### `authorization` (2 requirements / 9 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Permission Check on Organization Profile Endpoints | `SYSTEM_ADMIN` permitted | e2e `SYSTEM_ADMIN is permitted through the guard on both routes` | COMPLIANT |
| " | Every non-admin role rejected 403 on both endpoints | e2e `it.each` x4 roles x 2 routes | COMPLIANT |
| " | Unauthenticated rejected 401 before role check | e2e `it.each` `anonymous %s %s -> 401` x2 routes | COMPLIANT |
| " | Each endpoint declares its own permission | Controller: `@RequirePermission('organizationProfile:read')` on `@Get()`, `organizationProfile:update` on `@Patch()` | COMPLIANT (static + e2e) |
| " | Exactly two members declared, only admin holds them | `permission.ts` declares exactly `organizationProfile:read` and `organizationProfile:update`; `role-permission.checker.spec.ts` grants both to `SYSTEM_ADMIN` and its exhaustive NON_ADMIN_ROLES x ALL_PERMISSIONS table denies all four other roles | COMPLIANT |
| The Organization Profile Grants Nothing Beyond Itself | Four non-admin rows unchanged | `role-permission.checker.spec.ts` exhaustive denial table + MANAGER/MAINTENANCE_COMPANY_MANAGER still exactly `['reviewSession:read']` | COMPLIANT - but NOT where `tasks.md` 4.5 claims it is (WARNING-2) |
| " | Capability still undeclared | Grep: zero `MANAGE_ORGANIZATION_PROFILE` in `apps/**`/`packages/**`; `manager-capability.ts` is `export type ManagerCapability = 'VIEW_ALL_REVIEWS';` - single member, compile-time enforced | PARTIAL - structurally sound, but no runtime test asserts it, contrary to `tasks.md` 4.5 (WARNING-2) |
| " | Admin other permissions untouched | `ALL_PERMISSIONS` table in the checker spec is exhaustive and additive | COMPLIANT |
| " | No profile edit is audited | No audit table in `schema.prisma`, no event, no audit write in the module | COMPLIANT (static) |

### `app-navigation` (2 requirements / 8 scenarios)

| Requirement | Scenario | Evidence | Result |
|---|---|---|---|
| Role -> Items Map Exhaustive and Fixed | Each of five roles sees exactly its own set | `AppLayout.test.tsx` pins the exact ordered testid list per role; the SYSTEM_ADMIN row now has 8 items ending in `nav-link-organization-profile` | COMPLIANT |
| " | Admin reaches all eight sections in one click | Same table + reachability test | COMPLIANT |
| " | Only the admin is offered the profile item | `AppLayout.test.tsx` exact-set assertions for all five roles | COMPLIANT |
| " | Item does not depend on the profile contents | Static: `ORGANIZATION_PROFILE` is a module-level `const NavItem`; nav issues no fetch | PARTIAL (no covering test - SUGGESTION-4) |
| " | New role cannot ship with unmapped navigation | Pre-existing `Record<Role, ...>` exhaustiveness (type-level) | COMPLIANT (pre-existing) |
| " | No CRUD sub-route offered | `nav-items.reachability.test.ts` resolves every `to` against `AUTHENTICATED_ROUTES` top-level paths | COMPLIANT |
| Added Item Preserves Reachability | New item does not lead to a denial | `nav-items.reachability.test.ts` `$role can open the route its nav item ($to) points at` - the `/organization-profile` pair is included automatically | COMPLIANT |
| " | Reachability test covers new item unrelaxed | Read the test: it derives pairs from `NAV_ITEMS_BY_ROLE` generically, has NO exception or skip for the new item, and carries an explicit anti-ghost-loop fixture check | COMPLIANT |

**Compliance summary**: **51 / 58 scenarios fully COMPLIANT**, 6 PARTIAL,
**1 FAILING**, 1 UNTESTED. No scenario is unimplemented - every PARTIAL is a
testing-depth gap over correct code, not missing behaviour.

---

## Correctness (Static Evidence) - targeted regression checks

These were the specific items flagged for re-verification because they were real
bugs caught in per-PR reviews. **All four still hold post-merge - no regression.**

| Check | Status | Evidence |
|---|---|---|
| `update()` maps P2025/missing-row the same way `get()` does (PR3 review fix) | INTACT | `prisma-organization-profile.repository.ts` L60-75: `try/catch` on `PrismaClientKnownRequestError` + `code === 'P2025'` -> `OrganizationProfileMissingError`, else rethrow. Backed by 3 passing unit tests including the negative rethrow case. |
| Save-race fix on `OrganizationProfilePage` (PR5 review fix) | INTACT | L191 `disabled={submitting}` on every input, L197 on the submit button; no `navigate()` anywhere in the file. Guarded by the `disables every field input while a save is in flight...` test, which holds the promise open and asserts disabled-then-enabled. |
| Schema reconciliation implemented exactly as apply-progress documents | EXACT MATCH | `handleSubmit` L116-133: blank AND never filled (`saved[field] === ''`) -> omitted from payload; blank BUT previously filled -> `clearedAnExistingValue` -> local error and `return` before any network call; all-blank -> `emptySubmitError`, no call. Proven by two tests (`sends only the non-empty, trimmed fields...`, `rejects the submit locally, with no network call...`). |
| `logoAssetId` fully unwritable and unexposed | INTACT, four layers deep | Present only as a reserved nullable on `schema.prisma` and the domain entity. ABSENT from: the Zod schema (no key -> stripped), `OrganizationProfileChanges`, `UpdateOrganizationProfileRequestDto`, `OrganizationProfileResponseDto` (the controller `toResponse()` builds the body field-by-field so it cannot leak even accidentally), and the web `OrganizationProfile` type. |

### Scope / anti-creep guards (all pass)

| Guard | Result |
|---|---|
| `grep -rn PropertyManagementCompany apps/ packages/` | **0 hits** |
| `grep -rn MANAGE_ORGANIZATION_PROFILE apps/ packages/` | **0 hits** |
| Object storage (`minio`/`aws-sdk`/`s3client`/`object-storage`) in `apps/`, `packages/`, `docker-compose.yml`, root `package.json` | **0 hits** |
| `ManagerCapability` still single-member | PASS - `export type ManagerCapability = 'VIEW_ALL_REVIEWS';` |
| No `POST`/`DELETE`/`:id` route | PASS - controller declares `@Get()` + `@Patch()` only |
| ADR-012 naming addendum present | PASS - `docs/adr/ADR-012-...md` L72, "Addendum (2026-09-22): Implementation name is OrganizationProfile, not PropertyManagementCompany", with the proposal three-point rationale |
| FR-013 status -> `partial` | PASS - `docs/requirements/functional-requirements.md` L25, **partial** (`organization-profile`), deferrals named explicitly |
| i18n en/es/ca parity | PASS - all 15 `organizationProfile.*` keys + `nav.organizationProfile` in all three, real translations |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| **1** - DB-level singleton guard via sentinel `singleton` column | YES | `migration.sql` ships `UNIQUE INDEX OrganizationProfile_singleton_key` + hand-written `CHECK ("singleton")`; the adapter addresses `{ singleton: true }` with NO literal id in application code; the port `get()` is `Promise<OrganizationProfile>`, not nullable; `OrganizationProfileMissingError` is deliberately unmapped in the controller (-> 500, loud). All four structural integration assertions pass against real Postgres. |
| **2** - Plain trimmed strings, no Value Objects | YES | All six fields are `string`. `taxId` is a LOCAL `z.string().trim().min(1)` - `taxIdSchema` from `maintenance-company` is NOT imported, and the "does NOT upper-case taxId" test proves it. `email` is trimmed + `.pipe(z.email())` but NOT lower-cased, with its own proving test. |
| **3** - `update()` does not read before it writes | YES | The use case is a single `repo.update(changes)`; `update-organization-profile.use-case.spec.ts` asserts `getSpy` was never called. The adapter issues one Prisma `update()` and returns its post-state row. |
| **4** - No error-code union, no `buildCodedError`, no web `error-messages.ts` | YES | No `organization-profile-error-code.ts` exists; the controller has no `try/catch`; the web client declares no mirrored code union. The design "Findings reported to the proposal" #1 correctly overrode the proposal scope line. |
| **5** - Incompleteness derived from the SAVED snapshot | YES, one gap | `const incomplete = REQUIRED_FIELDS.some((f) => saved[f] === '')` - computed from `saved`, never `values`; proven by `keeps the incomplete banner visible while typing`. Omit-empty payload: yes. No `navigate()` after save: yes. GAP: Decision 5 also says the page "stays put and shows a success indication" - no success indication is rendered (WARNING-3). |
| Design "Findings" #2 - `singleton` never mapped onto entity/DTO | YES | `organization-profile.mapper.spec.ts` asserts `singleton` does not reach the entity; the entity has no such field. |
| Design "Findings" #3 - non-empty-on-write makes the blank seed one-way | YES, and surfaced in UI | The page converts this into an explicit client-side rejection (`clearedFieldError`) rather than letting the admin discover it as a server 400. |
| Design Open Question - `prisma migrate dev` does not drop the hand-written CHECK | VERIFIED at apply time (`tasks.md` 1.6, twice on isolated DBs) and re-confirmed now: the `pg_constraint` and `pg_indexes` assertions both pass against the live container. |

**Design coherence**: 8/8 decisions followed, with one sub-point of Decision 5
unimplemented (success indication).

---

## Issues Found

### CRITICAL

**CRITICAL-1 - `organization-profile-migration.integration.spec.ts` is currently RED on `main` (1 of 6 tests failing).**

```
OrganizationProfile schema (migration integration guard)
  > exactly one row exists after migrate deploy, with every text field blank and logoAssetId null

  expect(received).toBe(expected)
  Expected: ""
  Received: "Sunny Fields PM"
  at organization-profile-migration.integration.spec.ts:37:26
```

- **This is NOT a production-code bug.** The migration SQL, the schema, the
  adapter and the guard constraints are all correct - the other 5 assertions in
  this same file (CHECK present, unique index present, second INSERT refused
  with `singleton = true`, refused with `singleton = false`, pre-existing
  hand-written objects not dropped) ALL pass against the live Postgres.
- **Root cause**: the assertion is **non-hermetic**. It reads
  `prisma.organizationProfile.findMany()` from whatever database `DATABASE_URL`
  points at - the shared, mutable dev database - and asserts the DATA is still
  in seed state. The in-file comment ("this suite issues none before this
  assertion") guards against THIS SUITE writing, but not against anything else
  ever having written. The PR6 browser verification legitimately filled the
  profile with `Sunny Fields PM`, permanently reddening the test.
- **It blocks the archive gate**: this is the ONLY runtime guard for success
  criterion #1 and for the spec scenario "The row exists after migration, with
  no request made". That scenario therefore verifies as FAILING, not COMPLIANT.
- **Pre-existing twin, for fairness**: `inspectable-element-migration.integration.spec.ts`
  fails identically and for the same reason (`expect(rows.length).toBeGreaterThan(0)`
  - it asserts the dev DB HAS data). So this is a repo-wide anti-pattern this
  slice inherited rather than invented - but this slice made it newly red.
- **Recommended fix (not applied - verify does not fix)**: run the seed-state
  assertion against a disposable database provisioned by `prisma migrate deploy`
  (the apply phase already proved this works - `tasks.md` Finding 5 used
  `sfmanager_pr1verify`), or split the file so the structural guards (which are
  the actual drift protection and are correctly state-independent) run against
  the shared DB while the seed-state assertion runs only against a fresh one.
- **Related standing environment item** (from `tasks.md` Findings 1 and 5, and
  NOT counted as a finding here): the shared `sf-manager-postgres-1` volume also
  carries a stale migration checksum for
  `20260922100000_add_organization_profile` and has lost every hand-written FK.
  A `docker compose down -v && docker compose up -d postgres` followed by
  `prisma migrate deploy` would clear the checksum, the FK drift AND this test
  data state in one action.

### WARNING

**WARNING-1 - `tasks.md` task 6.5 is unchecked, but the work was done.**
`openspec/changes/organization-profile/tasks.md` L84 still reads
`- [ ] 6.5 Browser verification ... NOT DONE by this apply pass`, while the
Engram `apply-progress` artifact records "browser verification (5/5 checks
passed - blank state, fill/save/reload persistence, non-admin NotAuthorized,
es/ca spot-check)". Independent physical corroboration: the dev database profile
row holds `Sunny Fields PM` - a value that can only have arrived through a real
authenticated PATCH, which is exactly the browser round-trip 6.5 describes (it
is also what causes CRITICAL-1). The checkbox and its NOT DONE note are stale.
`sdd-archive` copies task state into the archived change, so this should be
corrected to `[x]` with the orchestrator verification note BEFORE archiving.

**WARNING-2 - `tasks.md` task 4.5 claims two assertions that the e2e spec does not contain.**
Task 4.5 reads: "... ROLE_PERMISSIONS non-admin rows still []; ManagerCapability
still declares only VIEW_ALL_REVIEWS." `apps/api/test/organization-profile.e2e-spec.ts`
was read in full - it contains NEITHER assertion. Actual state:

- `ROLE_PERMISSIONS` non-admin rows ARE genuinely guarded, but in
  `role-permission.checker.spec.ts` (exhaustive NON_ADMIN_ROLES x ALL_PERMISSIONS
  denial table) - right guard, wrong location in the task.
- `ManagerCapability` single-member has NO runtime test at all. It rests on the
  TypeScript union `export type ManagerCapability = 'VIEW_ALL_REVIEWS';`
  (compile-time) plus a grep. That is a legitimate and arguably sufficient
  guarantee, but it is not what the task claims.

This is the same failure class as the `nav-menu` phantom-CSS-source-order-test
incident: a task checkbox asserting a test exists where it does not. The risk
here is low (the behaviour is covered or structurally enforced), but the task
text should be corrected before archive so the archived record is accurate.

**WARNING-3 - Design Decision 5 success indication was never implemented.**
`design.md` Decision 5 states: "The page stays put and shows a success
indication." `OrganizationProfilePage.tsx` renders no success message, toast or
confirmation on a successful PATCH. Consequence: when the profile is already
complete, an admin who edits a field and saves gets ZERO visible feedback - the
incomplete banner is already absent, inputs briefly disable and re-enable, and
nothing else changes on screen. On a blank profile the clearing banner masks
this; on an established profile it does not. No spec SCENARIO mandates a success
indication (the admin-ui spec only requires values be "visible without a manual
page reload", which is satisfied), so this is a design deviation rather than a
spec violation - but it is a real UX gap, in a page that deliberately has no
navigate-away to serve as implicit confirmation. Precedent exists in this repo:
`reviewSession.element.saveConfirmation`.

**WARNING-4 - The Engram `apply-progress` artifact has lost its TDD Cycle Evidence.**
`sdd/organization-profile/apply-progress` (id 295) reports `Revisions: 14`, but
`topic_key` upsert keeps only the newest. The surviving entry covers PR6 only and
twice defers to "prior revision for file-level detail" - content that is no
longer retrievable. For a Strict TDD verification the primary artifact (the
per-task RED/GREEN/TRIANGULATE/SAFETY-NET table) was therefore unavailable, and
compliance had to be reconstructed from `tasks.md` plus source inspection. No
harm done to THIS change - the `tasks.md` file on disk is detailed enough to
carry the load, which is a point in favour of the `hybrid` store - but a future
`engram`-only change would lose this evidence outright. Worth recording as a
store-mode consideration.

### SUGGESTION

**SUGGESTION-1** - No test covers the admin-ui scenario "A partially filled
profile still shows the not-completed state". Only the blank and fully-filled
endpoints are tested. The `.some()` implementation makes the middle case
near-certainly correct, but it is the scenario a real admin hits most (fill three
fields, save, come back). One extra `mockResolvedValue` case with a partially
populated profile would close it.

**SUGGESTION-2** - The admin-ui spec says a blank field MUST surface a form
error FOR THAT FIELD. The page renders one form-level
`p[data-testid="organization-profile-error"]` with a generic message
(`clearedFieldError`), not a field-scoped one; with six inputs the admin is not
told which field is at fault. Field-scoped errors would match the spec wording
literally.

**SUGGESTION-3** - Every page-test assertion is `data-testid`-based; none asserts
that the rendered TEXT is the translated string. The PR6 fresh-context review
already caught the sharp edge here (the test file was silently running with
`NO_I18NEXT_INSTANCE`, masked by exactly this testid-only style, fixed by adding
`import '../i18n'`). `locales.test.ts` proves the keys exist with real values and
the page uses `t()` for everything, so the gap is narrow - but one
`getByText(t(...))`-style assertion would make the binding non-regressible.

**SUGGESTION-4** - The app-navigation scenario "the navigation MUST have issued
no request for the profile" has no covering test. `ORGANIZATION_PROFILE` is a
static module-level const so it is structurally true; `AppLayout.test.tsx`
already stubs `fetch`, so asserting no `/organization-profile` call is a one-line
addition if it is ever considered worth pinning.

**SUGGESTION-5** - "No logo affordance is rendered" and "No create, delete or
list affordance exists" rest on static inspection only. A single negative
component assertion (query for a file input, expect null, plus a button-count
check) would mechanise two explicit anti-creep scenarios that the proposal itself
rated High likelihood for scope creep.

**SUGGESTION-6** - Naming: `organization-profile.e2e-spec.ts` is an HTTP-contract
test with the repository faked in memory and `PrismaService` stubbed, not a
full-stack e2e. This matches repo precedent and is honestly documented in the
file header, so no change is required - but the distinction matters when reading
"374 e2e tests pass" as evidence of database-backed behaviour. The database half
is covered solely by the (currently red) migration integration spec.

---

## Verdict

### PASS WITH WARNINGS - but do NOT archive until CRITICAL-1 and WARNING-1 are closed.

The implementation is **correct, complete and coherent**. All 28 implementation
tasks are done in code; all four spec deltas are satisfied; all eight design
decisions are followed; all four previously-fixed review bugs are intact with no
regression; every scope guard (naming, capability, object storage, verb surface,
i18n parity) passes; lint and build are clean; and 1,286 tests pass across the
API unit, web and e2e suites with an assertion-quality audit that found ZERO
trivial, tautological, ghost-loop or smoke-only tests. On quality of test
construction this is the strongest slice reviewed in this project so far.

It is held back from a clean PASS by two things, neither of which is a defect in
shipped behaviour:

1. **CRITICAL-1** - the change own migration integration spec is red because it
   asserts mutable data state on a shared dev database that the slice own
   browser verification legitimately modified. The spec scenario "The row exists
   after migration, with no request made" therefore has no passing covering test
   right now, which is a hard blocker under this project Strict TDD gate. The
   fix is to the test hermeticity (or a dev-DB rebuild), not to the product.
2. **WARNING-1** - `tasks.md` 6.5 still says browser verification was not done,
   which contradicts `apply-progress` and the physical DB evidence. Archiving now
   would freeze an inaccurate record into the archive.

**Recommended path**: return to `sdd-apply` for a small remediation slice -
(a) make the seed-state assertion hermetic, (b) check off 6.5 with the
orchestrator verification note, (c) correct the task 4.5 test-location claim,
and optionally (d) add the success indication from Decision 5. Then re-run
`sdd-verify` and proceed to `sdd-archive`.

If the orchestrator and user judge CRITICAL-1 to be purely local environment
state (a defensible reading - the production code is provably correct and a
`docker compose down -v` plus `prisma migrate deploy` turns the test green), then
closing WARNING-1 alone is sufficient to archive, and CRITICAL-1 should be
carried forward as an explicit, recorded follow-up covering BOTH this spec and
its pre-existing `inspectable-element` twin. That call belongs to the user, not
to this report.
