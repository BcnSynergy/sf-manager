# Verification Report: review-history-company-scope (FR-008, third slice — Company-Scoped Review History)

**Change**: `review-history-company-scope`
**Verified against**: `main` @ `ee2c00c` (PR 7/7 merged at `809c628`; `ee2c00c` adds only ADR-016, unrelated)
**Mode**: Strict TDD
**Artifact store**: hybrid (canonical: `openspec/changes/review-history-company-scope/`; mirror: Engram `sdd/review-history-company-scope/*`)
**Date**: 2026-09-13

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 4 SUGGESTION. Nothing blocks
`sdd-archive`.

All 71 `tasks.md` checkboxes are genuinely done — each was cross-checked against
source on `main`, not against its checkbox. Every requirement across the four
delta specs is implemented, and every delta was correctly merged into its base
spec in `openspec/specs/` (both RENAMEs applied, both Purpose amendments
applied, no stale requirement names surviving). All 11 design decisions were
followed as designed, with zero unrecorded deviations; `design.md`'s two Open
Questions are both closed with real content from the 6.8 browser verification.

Every suite was executed at runtime during this verification against a real
Postgres (`sf-manager-postgres-1`, started for this run): unit 813/813, e2e
310/310, web 690/690, integration 122/122 (serially — see W-1), lint 0 errors,
fresh non-cached build 4/4. The one integration failure observed is a
pre-existing parallel-worker flake in an unrelated module, reproduced and
diagnosed, not a regression from this change.

The three security guarantees this slice turns on — fail-closed on a null
company on **both** sides, an indistinguishable 404 across all three roles, and
attribution frozen at creation with no update path — are each enforced
**structurally** (an early return before any repository call, a single throw
site, and the physical absence of any second write path) rather than by caller
discipline.

The prior-risk item explicitly called out for re-check (the PR 2b malformed-UUID
integration-test bug) is confirmed fixed and the test passes at runtime.

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total (on disk, `tasks.md`) | 71 (across 6 phases) |
| Tasks complete | 71 |
| Tasks incomplete | 0 |
| PRs merged | 7 (#103 … #109; chain `review-history-company-scope/01…06`, `stacked-to-main`) |
| Net diff across the chain | 4360 insertions / 600 deletions, 62 files (`82965d6~1..809c628`) |

Verified by counting `- [x]` (71) and `- [ ]` (0). Every file named in a task
exists at the stated path on `main`. Every task carrying a `RED/GREEN`
annotation has a corresponding spec file that passed at runtime in this
verification. Every documented deviation in `tasks.md` (2.6's deferred
two-method deletion, 4.6's inverted-in-place test, 4.11's declaration-shaped
symbol match, 4.12's direct seeding, 5.6/5.8's `ProtectedRoute.test.tsx`
placement) was independently confirmed against the code, and each is correct.

Task 2.6's deviation is fully discharged: `findCompletedForPerformerInCommunities`
and `findCompletedByIdForPerformerInCommunities` are **gone** from the port, the
Prisma adapter and the in-memory fake, exactly as 3.6 promised.

---

## Build & Tests Execution

All commands run by this verification against `main` @ `ee2c00c`. Docker Desktop
and the `sf-manager-postgres-1` container were not running at the start of this
session and were started for this run — so the DB-backed suites are real
results, not skipped.

**Build**: PASSED (forced, no cache)

```text
npm run build -- --force   -> Tasks: 4 successful, 4 total | Cached: 0 cached, 4 total (exit 0)
```

**Lint**: PASSED

```text
npm run lint               -> Tasks: 5 successful, 5 total (exit 0)
                              @sf-manager/api: 4 problems (0 errors, 4 warnings)
```

The 4 warnings are pre-existing `@typescript-eslint/no-unsafe-argument` in
`apps/api/src/modules/auth/presentation/auth.controller.spec.ts` — untouched by
this change. `apps/api`'s lint script runs `eslint --fix`; `git status` was
clean before and after, so it rewrote nothing.

**Tests**:

```text
npm run test --workspace=apps/api          -> 108 suites / 813 tests passed (exit 0)   49.9 s
npm run test:e2e --workspace=apps/api      ->  10 suites / 310 tests passed (exit 0)   17.5 s
npm run test --workspace=apps/web          ->  47 files  / 690 tests passed (exit 0)   90.1 s
npm run test:integration --workspace=apps/api
                                           ->  20 passed / 1 FAILED (121/122)           8.6 s
npx jest --testRegex=".*\.integration\.spec\.ts$" --runInBand
                                           ->  21 suites / 122 tests passed (exit 0)   10.5 s
```

Every count matches `tasks.md` 6.7's recorded figures exactly (unit 108/813,
integration 21/122, e2e 10/310, web 47/690).

The single parallel-run failure is **W-1** below: `prisma-user.repository.integration.spec.ts
> countActiveByRole() excludes soft-deleted users`, `expect(after).toBe(before - 1)`,
Expected 2677 / Received 2678. It passes in isolation (`-t "countActiveByRole"`)
and in the full serial run. It is in `modules/users`, is untouched by this
change, and asserts a whole-database count delta against a shared, non-reset dev
Postgres — another jest worker inserting a user between its `before` and `after`
reads is sufficient to break it. Not a regression from this change.

**Coverage** (unit-only run, scoped to this change's areas):

| File | % Stmts | % Branch | Uncovered | Rating |
|---|---|---|---|---|
| `shared/application/authorization/company-scope.checker.port.ts` | 100 | 100 | — | Excellent |
| `users/infrastructure/authorization/user-company-scope.checker.ts` | 100 | 100 | — | Excellent |
| `review-session/application/ports/user-directory.port.ts` | 100 | 100 | — | Excellent |
| `review-session/domain/review-session.entity.ts` | 100 | 100 | — | Excellent |
| `.../use-cases/open-review-session.use-case.ts` | 100 | 100 | — | Excellent |
| `.../use-cases/list-review-history.use-case.ts` | 100 | 90 | L39 (branch) | Excellent |
| `.../use-cases/read-review-history.use-case.ts` | 96.55 | 80 | L84 | Excellent |
| `.../services/review-history-access.service.ts` | 95.12 | 95.45 | L169-170 | Excellent |
| `.../persistence/prisma-review-session.repository.ts` | 12.62 | 5.45 | — | n/a — covered by the integration suite, excluded from this run |
| `.../persistence/prisma-user-directory.ts` | 46.15 | 37.5 | — | n/a — same |
| `.../persistence/review-session.mapper.ts` | 54.54 | 33.33 | — | n/a — same |

The three low numbers are Prisma adapters, whose coverage lives in
`*.integration.spec.ts` (excluded from a unit-only coverage run by design). Every
application-, domain- and authorization-layer file this change touched is at or
near 100%. `review-history-access.service.ts`'s only gap is the `default:`
`satisfies never` backstop in `loadByRole` — see S-1.

**Browser verification**: performed by the orchestrator on 2026-09-10 (task 6.8)
via `claude-in-chrome` against a real dev server with seeded data, not re-run
here. Recorded in `tasks.md` 6.8 and in Engram `#226`. It covered: the manager
entry link on `/`, the company-wide list across two communities with the
Performer column, cross-company isolation (confirmed both by direct `fetch()`
and by rendered UI), attribution-survives-transfer end to end, the empty state
("No completed reviews found"), and `/review-sessions` as a manager rendering an
explicit "Not authorized" page.

---

## Spec Compliance Matrix

Legend: COMPLIANT = a covering test passed at runtime in this verification.

### `authorization`

| Requirement | Scenario | Implementation | Test | Result |
|---|---|---|---|---|
| The Maintenance Company Manager Becomes Operational | The manager holds exactly one permission | `role-permission.checker.ts:51` | `role-permission.checker.spec.ts > grants MAINTENANCE_COMPANY_MANAGER exactly reviewSession:read` | COMPLIANT |
| " | The manager gains no write member of the review-session family | same | `role-permission.checker.spec.ts > denies MAINTENANCE_COMPANY_MANAGER on %s` (table-driven over ALL_PERMISSIONS) | COMPLIANT |
| " | The manager is refused on every review-session write endpoint | PermissionsGuard + @RequirePermission | `review-history.e2e-spec.ts > the manager is refused on every review-session write endpoint, performing no write` | COMPLIANT |
| " | MANAGER and SYSTEM_ADMIN are untouched | `role-permission.checker.ts:12-43` | `role-permission.checker.spec.ts`; e2e MANAGER/SYSTEM_ADMIN 403 tests | COMPLIANT |
| Company-Wide Review History Scope for a Maintenance Company Manager | A manager sees their whole company completed history | `review-history-access.service.ts:79-88` -> findCompletedForCompany | `review-history.e2e-spec.ts > a manager sees every one of their company technicians work across communities` | COMPLIANT |
| " | Another company sessions are never visible | `prisma-review-session.repository.ts:332-354` | e2e + `prisma-review-session.repository.integration.spec.ts` | COMPLIANT |
| " | Attribution survives the performer transfer | performedByCompanyId written once at creation | `review-history.e2e-spec.ts > attribution survives the performer transfer`; browser-verified 6.8 | COMPLIANT |
| " | A manager with no maintenance company sees nothing | `review-history-access.service.ts:84-86,154-156` (return BEFORE any query) | `review-history-access.service.spec.ts > a manager with no resolved company reaches no repository call and yields []`; e2e | COMPLIANT |
| " | A session with no attributed company is invisible to every manager | WHERE performedByCompanyId = :companyId (NULL never equals) | `review-history.e2e-spec.ts > a session with no attributed company is invisible to every manager` | COMPLIANT |
| " | The manager scope requires no community assignment | manager branch makes no CommunityScopeChecker call | `review-history.e2e-spec.ts > the manager scope requires no community assignment of any kind` | COMPLIANT |
| " | Drafts stay out of the company scope | status: completed conjunct | `review-history.e2e-spec.ts > a company draft session is excluded` | COMPLIANT |
| " | Scope is checked in addition to the permission | guards run before the service | e2e: caller with a set company but no reviewSession:read gets 403 (MANAGER + SYSTEM_ADMIN variants) | COMPLIANT |
| Resource Scope for Review History Reads (MODIFIED) | A technician own history survives assignment deactivation | `review-history-access.service.ts:57-58` (no Layer 2 call) | e2e Retroactive revocation block + 2 unit tests | COMPLIANT |
| " | A deactivated technician still sees no one else sessions | WHERE performedById = :self is the only conjunct | same e2e test (community-mate 404 before and after) + unit test | COMPLIANT |
| " | The write surface is unaffected by the own-history relaxation | SessionAccessService byte-unchanged | `review-session.e2e-spec.ts` unchanged and green; `session-access.service.spec.ts` unmodified | COMPLIANT |
| " | Deactivating a representative assignment removes history access on the next request | representative branch moved verbatim | `review-history.e2e-spec.ts > a representative loses community history on deactivation and regains it on reassignment` | COMPLIANT |
| The Deferred Review Visibility Scopes Grant Nothing (MODIFIED) | No manager capability or global-review mechanism is introduced | none exists | `review-history.e2e-spec.ts:1859` declaration-shaped scan; independently re-grepped here (only a prose comment in `permission.ts:17`) | COMPLIANT |
| " | No unscoped history read exists | every findCompleted* takes a scope parameter | integration port-surface enumeration; in-memory fake spec | COMPLIANT |
| " | The company association still confers no history scope on a technician | `user-company-scope.checker.ts:40-45` | `user-company-scope.checker.spec.ts` describe.each over 4 non-manager roles x 3 states | COMPLIANT |
| The Company Association Itself Confers No Permission (RENAMED+MODIFIED) | The manager permission set does not depend on its company | permissions derive from role only | `role-permission.checker.spec.ts`; `users.e2e-spec.ts` additions | COMPLIANT |

### `review-history`

| Requirement | Scenario | Implementation | Test | Result |
|---|---|---|---|---|
| A Maintenance Company Manager Company-Wide Completed Review History | A manager sees every technician work across communities | findCompletedForCompany + COMPLETED_HISTORY_ORDER_BY | e2e; integration ordering-parity test | COMPLIANT |
| " | Another company sessions never appear | as above | e2e + integration, asserted against BOTH adapters | COMPLIANT |
| " | Attribution is frozen, not derived from current employment | no join to User.maintenanceCompanyId anywhere in the read path | integration predicate-inspection test; e2e transfer test | COMPLIANT |
| " | A manager with no company gets an empty list, not everything | early return before the query | unit + e2e | COMPLIANT |
| " | A session with no attributed company appears nowhere | NULL never matches the equality | e2e | COMPLIANT |
| " | Each row identifies its performer | performedByEmail on ReviewHistoryRowDto | `list-review-history.use-case.spec.ts`; `ReviewHistoryPage.test.tsx > shows the performer email for each row` | COMPLIANT |
| " | An empty company history is a successful empty result | 200 with [] | e2e; browser-verified 6.8 | COMPLIANT |
| " | Backfilled pre-existing sessions are visible | migration UPDATE with no status filter | `review-session-migration.integration.spec.ts` (row-level backfill) + (shipped-file has no status filter) | COMPLIANT |
| Scoped Read-Back of One Historical Session (MODIFIED) | A manager reads back a session performed under their company | loadByRole manager branch -> findCompletedByIdForCompany | `review-history-access.service.spec.ts`; e2e | COMPLIANT |
| History Scope Is Carried by the Query, Not by the Caller (MODIFIED) | No unscoped session read exists | port signature | integration port-surface enumeration | COMPLIANT |
| " | An unresolvable company never widens the query | `if (companyId === null) return []` BEFORE the call | unit test asserts ZERO repository calls | COMPLIANT |
| History Access Requires an Active Assignment, Except for One Own Performed Sessions (RENAMED+MODIFIED) | all 6 scenarios | per-branch scope resolution | e2e Retroactive revocation block (inverted in place per the migration note) + 4 unit tests | COMPLIANT |
| The Deferred Review Visibility Scopes Are Not Built (MODIFIED) | No list-control parameters are accepted | `review-history.controller.ts` accepts no @Query | e2e x3, one per scope | COMPLIANT |
| " | The only migration is the attribution column and its backfill | one new dir: 20260909090000_add_review_session_performed_by_company | `review-history.e2e-spec.ts:1892`; re-confirmed by listing prisma/migrations here | COMPLIANT |
| " | No per-element history query or route exists | none | grepped here: no match in API presentation or App.tsx | COMPLIANT |

### `review-history-ui`

| Requirement | Scenario | Implementation | Test | Result |
|---|---|---|---|---|
| A Reachable Entry Point That Bypasses the Write Surface (ADDED) | The manager reaches history from the app entry page | `HealthPage.tsx:23,58-60` (REVIEW_HISTORY_ROLES) | `HealthPage.test.tsx > shows a review-history entry link for a MAINTENANCE_COMPANY_MANAGER` | COMPLIANT |
| " | The manager path never crosses the write surface | /review-sessions* routes not widened | `HealthPage.test.tsx` enumeration test asserts hrefs equals exactly ['/review-history'] | COMPLIANT |
| " | No write control is rendered for the manager | pages carry no role branch | ReviewHistoryPage / ReviewHistoryDetailPage no-mutation-control regressions | COMPLIANT |
| " | The other two roles entry point is unchanged | health.reviewSessionsLink untouched | `HealthPage.test.tsx` negative test for technician/representative | COMPLIANT |
| Role-Gated Route Access for the History Views (MODIFIED) | manager reaches identical views; another role denied; unauthenticated redirected | `App.tsx:343-368`, 3-role array on both history routes only | `ProtectedRoute.test.tsx` new review-history-route-family block (5 cases) | COMPLIANT |
| " | The manager is still denied the review-session write routes | /review-sessions* keep the 2-role array | `ProtectedRoute.test.tsx`; browser-verified 6.8 | COMPLIANT |
| The History List Renders the Server-Scoped Result Unfiltered (MODIFIED) | A multi-performer caller sees who performed each row | `ReviewHistoryPage.tsx:71,83` | `ReviewHistoryPage.test.tsx` | COMPLIANT |
| " | A manager company-wide list is rendered unfiltered | no client-side filter step | `ReviewHistoryPage.test.tsx > renders a manager company-wide, multi-technician result unfiltered` | COMPLIANT |
| No Filtering, Analytics or Adjacent Controls Ship (MODIFIED) | No list-control ships for the manager either | no controls in the page | `ReviewHistoryPage.test.tsx` control enumeration | COMPLIANT |
| Internationalization Coverage | new keys have real en/es/ca | locales en/es/ca lines 444,447,455,469 carry real Spanish and Catalan, no English placeholders | `locales.test.ts` parity guard (+8 lines) | COMPLIANT |

### `review-session-management`

| Requirement | Scenario | Implementation | Test | Result |
|---|---|---|---|---|
| A Session Records the Company on Whose Behalf It Was Performed (ADDED) | A newly opened session carries the performer company | `open-review-session.use-case.ts:112-123` | `open-review-session.use-case.spec.ts` (3 new cases) | COMPLIANT |
| " | A representative-opened session is attributed the same way | role-agnostic findMaintenanceCompanyId | `open-review-session.use-case.spec.ts` | COMPLIANT |
| " | The attribution never changes after the fact | no second write path exists | `review-session-attribution-write-path.integration.spec.ts > complete() leaves the attributed company unchanged on the row` | COMPLIANT |
| " | No caller can supply or override the attribution | no route or DTO accepts a company id | same integration spec; grepped here | COMPLIANT |
| " | A performer with no company yields an absent attribution | `?? null` | unit + integration (create persists an explicit null attribution) | COMPLIANT |
| " | Pre-existing completed sessions are backfilled once | migration.sql UPDATE, no status filter | `review-session-migration.integration.spec.ts` x2 | COMPLIANT |
| " | Immutability of completed sessions is not weakened | complete/discardDraft signatures unchanged | attribution-write-path integration spec (3 cases); review-session e2e unchanged | COMPLIANT |
| Adjacent Review Capabilities Are Not Introduced (MODIFIED) | The company scope lives in review-history, not here | controller and use-case separation preserved | e2e scope-guard block | COMPLIANT |

**Compliance summary**: 52/52 mapped scenarios COMPLIANT. 0 UNTESTED, 0 FAILING, 0 PARTIAL.

---

## Correctness (Static Evidence)

| Area | Status | Notes |
|---|---|---|
| Schema + migration | Implemented | `performedByCompanyId String? @db.Uuid` + `@@index`; `20260909090000_...` hand-writes the column, the Prisma-visible index, the Prisma-invisible FK (ON DELETE RESTRICT ON UPDATE CASCADE, ADR-013) and the all-rows backfill. Exactly one new migration directory. |
| Layer 2 port | Implemented | `shared/application/authorization/company-scope.checker.port.ts` + COMPANY_SCOPE_CHECKER; adapter `users/infrastructure/authorization/user-company-scope.checker.ts` with an exhaustive switch and `role satisfies never`, reusing USER_REPOSITORY.findById so a soft-deleted manager resolves null for free. No cache. |
| Repository port | Implemented | +4 / -2 as designed; NO unscoped findById; both `...ForPerformerInCommunities` methods are gone from port, Prisma adapter and in-memory fake. |
| Company predicate | Implemented | `{ performedByCompanyId: companyId, status: 'completed' }` only. No other conjunct, no join to User.maintenanceCompanyId, shared COMPLETED_HISTORY_ORDER_BY. |
| Access service | Implemented | Scope resolution moved inside each role branch on BOTH listForActor and loadByRole; technician branch makes zero Layer 2 calls; the single ReviewSessionNotFoundError throw site in loadCompletedForActor is preserved. |
| UserDirectory | Implemented | Module-local, non-authorizing; findMaintenanceCompanyId (write path) + findEmailsByIds (read path, one batched query, deliberately soft-delete-INCLUSIVE). |
| DI wiring | Implemented | UsersModule binds AND exports COMPANY_SCOPE_CHECKER; ReviewSessionModule imports UsersModule and binds USER_DIRECTORY without exporting it. Acyclic, no forwardRef. Confirmed by the app booting in 310 e2e tests. |
| ROLE_PERMISSIONS | Implemented | MAINTENANCE_COMPANY_MANAGER maps to exactly ['reviewSession:read']; MANAGER is []; SYSTEM_ADMIN holds no reviewSession:* (its full row was re-read in this verification). |
| Web | Implemented | Both /review-history* routes widened to the 3-role array, /review-sessions* left at 2; Performer column + detail line with a localized placeholder fallback, no role branch; health.reviewHistoryLink gated to the manager alone. |
| Docs | Implemented | ADR-011 addendum at `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:284` covering all 5 required content points in order; FR-008 status reads "three of four visibility scopes shipped ... global scope ... and per-element history remain the last piece". |
| Spec merges | Implemented | All 4 base specs carry their ADDED requirements, MODIFIED replacements, both RENAMEs and both Purpose amendments. No old requirement name survives except inside the intended "(Previously: ...)" provenance note. |
| ADR-013 guard | Implemented | Of the API files this change touched, only `prisma-review-session.repository.ts` and `review-session.mapper.ts` import @prisma/client, both under infrastructure/persistence/**. Lint passes with 0 errors. |

### Scope guards

Re-audited independently in this verification, not merely trusting task 6.9.

| Guard | Result |
|---|---|
| No ManagerCapability / User.managerCapabilities / VIEW_ALL_REVIEWS symbol | Confirmed. Only a prose mention inside a comment at `permission.ts:17` |
| No unscoped "all sessions" query | Confirmed. Every port method carries a scope parameter |
| No pagination, date filter, sort or search on any history read or page | Confirmed. Controller accepts no @Query; pages render no such control |
| No per-element history query, route or view | Confirmed. No match in API presentation or App.tsx |
| Port exposes no unscoped findById | Confirmed |
| No write path touches a completed session beyond the creation-time attribution | Confirmed. complete/discardDraft signatures unchanged; integration-tested |
| modules/users/** and modules/maintenance-company/** gain no manager-facing CRUD | Confirmed. users.module.ts diff is the COMPANY_SCOPE_CHECKER bind + export and nothing else; maintenance-company untouched |

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| 1 - snapshot at CREATION, in the INSERT, no update path | Yes | open-review-session.use-case.ts is the only writer; the entity field is readonly with no setter. |
| 2 - one additive migration: nullable column, index, hand-written FK, backfill of EVERY row | Yes | The shipped SQL matches the design block essentially verbatim, including the deliberate absence of a closing SET NOT NULL. A dedicated test reads the real file and asserts the UPDATE contains no status filter. |
| 3 - company resolved per request from the DB, never a JWT claim | Yes | AccessTokenPayload unchanged; resolveCompanyScope hits User on every request, no cache. |
| 4 - resolution is a shared Layer 2 port, sibling to CommunityScopeChecker | Yes | Port in shared/application/authorization, adapter in users/infrastructure/authorization, exported by UsersModule. Exhaustive switch present. |
| 5 - a second, deliberately separate UserDirectory, module-local and non-authorizing | Yes | Two ports, opposite soft-delete filters, as designed. Neither folded into the other. |
| 6 - repository port +4 / -2, still no unscoped read | Yes | Fully discharged. The -2 landed in PR 3 per task 2.6 documented deferral, not skipped. |
| 7 - the reversal: scope resolution moves INSIDE the role branches | Yes | Both listForActor and loadByRole match the design code block, including the `default: satisfies never` backstop and the untouched single throw site. |
| 8 - the row and the record name the performer, for ALL THREE roles | Yes | One batched findEmailsByIds per request; empty string maps to a localized placeholder; no role-conditional variant on either page. |
| 9 - the manager scope ANDs with NOTHING | Yes | performedByCompanyId + status only. Verified by reading the adapter and asserted by an integration test on the predicate. |
| 10 - entry point is a role-conditional link on / | Yes | HealthPage.tsx, health.reviewHistoryLink, MAINTENANCE_COMPANY_MANAGER only. |
| 11 - what the ADR-011 addendum must say | Yes | All 5 required points present, in order, with the "rejected, with the reason" note flagged as a deliberate divergence from how role is handled. |

### Open Questions

Both closed with `[x]` and real content.

- The company-list volume question is closed with the MEASURED outcome of the
  6.8 browser verification (a company with 2 technicians across 2 communities,
  plus cross-company and unattributed controls: rendered instantly, no
  observable pain), honestly caveated as too small a sample to validate
  unbounded growth, with the app-wide filtering initiative named as the remedy.
  It also records the transfer scenario and the empty state as browser-confirmed.
- The UserDirectory soft-delete-bypass question is closed as a WATCH ITEM under
  an explicit "rule of three, not before" trigger, with the confirmation that no
  second instance exists today. Correct framing: a standing concern, not an open
  decision.

### Deviations

None beyond the five already documented in tasks.md, each of which is justified
and correct. Three phases (2b, 3, 4) and phase 6 exceeded the 400-line review
budget; every overrun is recorded in the Review Workload Forecast table with its
actual line count and its cause, and was accepted as a size:exception by the user
at the time. That is the process working, not silent drift.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Partial | The Engram apply-progress artifact (topic `sdd/review-history-company-scope/apply-progress`, 13 revisions, upsert-overwritten) contains NO "TDD Cycle Evidence" table. Its latest revision is a Phase 6 narrative. tasks.md carries explicit RED/GREEN markers on 22 implementation tasks instead. See W-2. |
| All tasks have tests | Yes | Every task claiming a test names a file that exists on main. |
| RED confirmed (test files exist) | Yes | 23/23 test files named across the six phases exist at their stated paths. |
| GREEN confirmed (tests pass now) | Yes | 1935 tests across the four suites passed at runtime in this verification. |
| Triangulation adequate | Yes | user-company-scope.checker.spec.ts is describe.each over 4 roles x 3 states, plus 4 manager cases and an out-of-union case. review-history-access.service.spec.ts covers 12 new dispatch cases across both entry points. Every fail-closed empty-result assertion has a companion non-empty test with the same setup. |
| Safety net for modified files | Yes | Every modified suite (record-entry.use-case.spec.ts, in-memory-review-session.repository.spec.ts, prisma-review-session.repository.integration.spec.ts, review-history.e2e-spec.ts) still passes. session-access.service.spec.ts is unmodified and green, which is the design own proof that the write-path sibling changed nothing. |

**TDD compliance**: 5/6 checks fully passed; 1 partial (artifact format only).

### Test Layer Distribution (tests added by this change)

| Layer | Tests added | Files | Tools |
|---|---|---|---|
| Unit (api) | 46 | 11 | jest + ts-jest |
| Integration (api, real Postgres) | 16 | 4 | jest + Prisma + Docker Postgres 18 |
| E2E (api, HTTP via supertest) | 17 | 1 (+2 files extended with new fixtures and doubles) | jest + supertest |
| Unit / component (web) | 15 | 4 (+locales.test.ts parity extended) | vitest + testing-library |
| **Total** | **~94** | **20** | |

Layer placement matches the risk: the security predicate lives in the port and is
asserted at the integration layer against real Postgres AND at the e2e layer
through the HTTP guards, while the unit layer proves the branch never reaches a
query on a null scope. See S-4 for the one seam.

### Assertion Quality

Audited all 20 changed or added test files plus the three e2e files.

- Tautologies (expect(true).toBe(true) and friends): NONE.
- Ghost loops (assertions inside a loop over a possibly-empty collection): NONE.
- Assertions that never call production code: NONE.
- Smoke-test-only (render + toBeInTheDocument with no behavioural claim): NONE. The new web tests assert hrefs, text content, row counts and full control enumerations.
- Orphan empty-collection assertions: NONE. Every empty-array assertion in review-history-access.service.spec.ts IS the fail-closed requirement under test, and each has a companion non-empty test in the same describe.
- Implementation-detail coupling (CSS classes, or mock call counts as the ONLY claim): NONE. Call-count assertions are used only where "no query was issued" IS the behaviour under test, and are paired with value assertions.

Two weak spots, both SUGGESTION level: S-2 and S-3 below.

**Assertion quality**: 0 CRITICAL, 0 WARNING.

### Quality Metrics

**Linter**: 0 errors, 4 pre-existing warnings in an unrelated file.
**Type checker**: 0 errors. nest build, tsc and vite build all succeeded on a forced, uncached run.

---

## Issues Found

### CRITICAL

None.

### WARNING

**W-1 - npm run test:integration is not deterministic in its scripted (parallel) form.**
`modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts >
countActiveByRole() excludes soft-deleted users` failed in the parallel run
(expect(after).toBe(before - 1), Expected 2677 / Received 2678) and passed both
in isolation and with --runInBand. The test asserts a delta on a WHOLE-DATABASE
count against a shared, never-reset dev Postgres, so any concurrent worker
inserting a user invalidates it. This is PRE-EXISTING, sits in a module this
change does not touch, and is not a regression - but it means the tasks.md 6.7
claim of "integration 21 suites / 122 tests green" only reproduces serially, and
a future phase could mistake this flake for a real failure or vice-versa.
Recommended follow-up, outside this change: scope the count to a seeded role or
company, or pin that spec to --runInBand.

**W-2 - The apply-progress artifact carries no TDD Cycle Evidence table.**
The Strict TDD verify module expects a per-task RED / GREEN / TRIANGULATE /
SAFETY-NET table in apply-progress. The Engram artifact instead holds a Phase 6
narrative, because the topic key is an upsert and 13 revisions have overwritten
the earlier phases records. The strict-TDD module literal rule would make this
CRITICAL; it is recorded here as WARNING because the evidence it exists to
protect is present by other means and was independently re-verified in this run:
tasks.md carries RED/GREEN markers on 22 implementation tasks, every named test
file exists, every one passes at runtime, and the assertion-quality audit found
nothing trivial. What is genuinely NOT provable retroactively is test-FIRST
ordering. This is an artifact and process gap, not a code defect, and it does not
block archive. Recommended follow-up for future changes: either write the TDD
evidence table into an openspec apply-progress.md file (this change never created
one on disk, unlike its proposal / design / tasks siblings), or use per-phase
Engram topic keys so revisions do not destroy earlier phases evidence.

### SUGGESTION

**S-1 - loadByRole out-of-union fail-closed backstop is untested.**
`review-history-access.service.ts:168-171` (the `default:` branch with
`actor.role satisfies never; return null;`) is the only uncovered code in that
file (95.12% statements). The listForActor twin IS tested
(`review-history-access.service.spec.ts > refuses (yields []) for a role value
outside the Role union`). Add the by-id counterpart so both entry points prove
their RUNTIME fail-closed behaviour, not just the compile-time guard.

**S-2 - The unresolved-performer placeholder assertion is weaker than the behaviour it guards.**
`ReviewHistoryPage.test.tsx:118-125` asserts only that the cell text is not
empty, which would also pass if the cell rendered a raw i18n key. It mirrors the
shipped communityName precedent at L96-103, so this is a pre-existing pattern
rather than new drift - worth tightening in both places to assert the actual
localized placeholder text.

**S-3 - Swagger doc drift on the 404 description.**
`review-history.controller.ts` ApiNotFoundResponse enumerates the causes of an
indistinguishable 404 (another performer session, another community session, a
since-deactivated assignment) but was not extended with "another company
session" or "a manager with no company". Behaviour is correct and tested; only
the generated API docs under-describe the new case.

**S-4 - No single test exercises HTTP through to real Postgres for the company scope.**
`review-history.e2e-spec.ts` overrides every repository with in-memory doubles
(the repo shipped e2e architecture, not something introduced here), so the
company WHERE predicate it exercises is the fake one. The real Prisma predicate
is covered separately by `prisma-review-session.repository.integration.spec.ts`
(tasks 2.9 / 2.11 / 2.12), and the full stack was browser-verified in 6.8. The
union of layers covers the requirement; the seam is worth recording so a future
reader does not assume the e2e matrix proves the SQL.

---

## Prior-Risk Re-Check (explicitly requested)

**The PR 2b malformed-UUID integration bug is fixed and green.**
`prisma-review-session.repository.integration.spec.ts:670-675` now calls
findCompletedByIdForCompany with a syntactically valid but nonexistent UUID
(00000000-0000-7000-8000-000000000000) instead of the literal
"nonexistent-company" string that raised a PrismaClientKnownRequestError against
the @db.Uuid column. The fix carries an inline comment explaining why a
malformed string can never reach this method in production (CompanyScopeChecker
returns a real company UUID or null, and null short-circuits before any
repository call), which is the correct diagnosis: it was a test bug, not a
production bug. The owning test - "communityIds = [] resolves to an empty list /
null for all four methods, the fail-closed empty-scope case" - passed at runtime
in this verification, in BOTH the parallel and the serial integration runs.

---

## Next Step

`sdd-archive`. No CRITICAL issue blocks it. W-1 and W-2 are process and tooling
follow-ups that belong outside this change; the four SUGGESTIONs are small,
optional hardening items that a later slice can pick up or drop.
