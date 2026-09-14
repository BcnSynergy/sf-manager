# Tasks: System-Admin Review History Scope

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~950-1250 total (port +2 methods w/ intent comment, 2 adapters, access-service switch split, 1 role-permission entry, 2 web role-list widenings, port-surface allowlist 8→10, new call-site source-scan guard test, service/unit tests, 4-role E2E matrix incl. deactivated/soft-deleted cases, 4 delta-spec merges incl. `review-session-management`, FR-008 status) |
| 400-line budget risk | Medium — no single PR is expected to clear 400 on its own, but PR 2's E2E matrix and PR 3's spec merges both carry real overrun risk (precedent: all three sibling-slice PRs that included a rewritten E2E file or bulk spec merge went over budget) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 3, matching the proposal's own sketch (see below) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Unscoped port method pair + both adapters + access-service `SYSTEM_ADMIN` branch + guard tests | PR 1 | ~350-400 | No dependency on later units; independently revertible. Carries the slice's single biggest risk (Decision 2's invariant), so its two guard tests ship here, not deferred |
| 2 | `ROLE_PERMISSIONS` entry + permission unit test + 4-role E2E visibility matrix | PR 2 | ~300-400 | Depends on PR 1's repository/service surface. Watch: sibling slices' E2E-matrix PRs were the most likely to overrun — if this nears 400 on its own, split the matrix into its own follow-up commit within the same PR rather than trimming coverage |
| 3 | Web role-widening + entry link + spec merges (4 deltas) + FR-008 status + browser verification | PR 3 | ~300-450 | Depends on PR 2 (full API surface + 2xx admin responses). Spec-merge volume is the swing factor — if merging all 4 deltas pushes this over 400, split spec-merge-only into a trailing docs commit inside the same PR, not a 4th PR, since it carries no app code |

If any unit lands over 400 once actual diffs are known, report the overage to the orchestrator per this project's established pattern (finish the unit, don't mid-split) — do not silently trim scope or tests to fit the budget.

## Phase 1: Unscoped Repository Pair + Adapters + Access-Service Branch (PR 1)

Traces: design Decisions 1-3; spec `review-history` — *A System Admin's
Installation-Wide Completed Review History*, *A System Admin Can Read Any
Completed Session by Identifier*, *History Scope Is Carried by the Query, Not
by the Caller* (MODIFIED); spec `authorization` — *Installation-Wide Review
History Scope for a System Admin*.

- [x] 1.1 RED/GREEN `.../review-session/application/ports/review-session.repository.port.ts` — add `findCompletedAcrossInstallation(): Promise<ReviewSession[]>` and `findCompletedByIdAcrossInstallation(id: string): Promise<ReviewSession | null>`, with the design's exact intent comment on the bare `WHERE` (design Decision 1's comment block, verbatim reasoning); restate the "no identifier-only read" invariant per design Decision 2's precise wording; `findById` still absent.
- [x] 1.2 RED/GREEN `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` — implement both methods, `WHERE status = 'completed'` and nothing else, sharing `COMPLETED_HISTORY_ORDER_BY`; by-id hydrates identically to the other detail reads.
- [x] 1.3 RED/GREEN `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` — same pair, same ordering, same completed-only filter, no scope narrowing of any kind.
- [x] 1.4 RED/GREEN `.../review-session/application/services/review-history-access.service.ts` — split the shared `SYSTEM_ADMIN`/`MANAGER` fallthrough in `listForActor`: `SYSTEM_ADMIN` calls `findCompletedAcrossInstallation()` directly, no checker call, no early return; `MANAGER` keeps its own `case` returning `[]` with its own comment (design Decision 3).
- [x] 1.5 RED/GREEN same file — `loadByRole`: identical split to `findCompletedByIdAcrossInstallation(sessionId)`; `MANAGER` keeps `case 'MANAGER': return null`; exhaustive `switch` + `satisfies never` backstop unchanged.
- [x] 1.6 Unit: admin dispatch — `SYSTEM_ADMIN` reaches `findCompletedAcrossInstallation`/`…ByIdAcrossInstallation` with no arguments beyond the id; `communityScopeChecker` and `companyScopeChecker` mocks assert `not.toHaveBeenCalled()`; `MANAGER` still reaches no repository call (Testing Strategy row 1).
- [x] 1.7 Unit: the other three branches (technician, representative, manager) — byte-identical behaviour assertions re-run after the switch split (Testing Strategy row 2).
- [x] 1.8 Unit: in-memory fake parity — installation-wide pair returns every completed session regardless of community/company/performer; a draft never surfaces; ordering identical to the other list methods (Testing Strategy row 3).
- [x] 1.9 RED/GREEN extend `prisma-review-session.repository.integration.spec.ts:742`'s port-surface guard — exact allowlist grows from 8 to 10 named reads (both new methods added); `not.toContain('findById')` assertion stays (design "Verified on main" baseline; Testing Strategy row 4).
- [x] 1.10 RED/GREEN new call-site source-scan guard test in the same integration spec file (or a sibling file, per design Decision 2 mechanism 2) — scan `apps/api/src/**/*.ts` excluding `*.spec.ts` and `**/testing/**` for both new method names; assert matching files are exactly the port, both adapters, and `review-history-access.service.ts`; precedent `review-session-migration.integration.spec.ts` (Testing Strategy row 5). **DEVIATION**: excluding `**/testing/**` and expecting the in-memory adapter (which lives at `application/use-cases/testing/in-memory-review-session.repository.ts`) to still appear in the match set are mutually exclusive — see the NOTE comment at the test for the resolution taken (literal glob followed; match set is 3 files, not 4; the in-memory adapter's implementation is proven separately by task 1.8's unit tests).
- [x] 1.11 Integration: installation-wide queries against real Postgres — rows across ≥2 companies and ≥2 communities, including one whose community is deactivated/soft-deleted and one whose maintenance company is soft-deleted; never a draft; `completedAt DESC, id DESC` (Testing Strategy row 6).
- [x] 1.12 Integration: an empty installation returns a successful empty list, not an error (spec `review-history` scenario *An empty installation renders a successful empty list*). **NOTE (PR1 fix-up)**: this suite's shared, non-isolated dev-DB cannot prove strict emptiness; the test now asserts only "resolves without throwing" and points to `in-memory-review-session.repository.spec.ts`'s "a draft never surfaces…" test for the honest empty-list contract — see PR1 fix-up commit below.

### PR1 fix-up (post-`b8fb5a9`, pre-push 4R fresh-context review)

A fresh-context 4R review (risk/resilience/readability/reliability) of PR1
before push found 2 CRITICAL and 3 actionable WARNING findings, all fixed in
a follow-up commit on the same branch (no scope change to Phase 1/2/3):

- [x] 1.13 CRITICAL (resilience): `findCompletedAcrossInstallation`/`findCompletedByIdAcrossInstallation` filtered on `status` only — no FK, unlike the three sibling scope methods — full seq scan + filesort. Added Prisma migration `20260913210000_add_review_session_status_completed_at_index` — composite `@@index([status, completedAt, id])` on `ReviewSession`, covering both the filter and the `completedAt DESC, id DESC` sort.
- [x] 1.14 CRITICAL (resilience): `list-review-history.use-case.ts`'s community-name resolution loop was a sequential `for`-`await` over `CommunityRepository.findById` — previously bounded by scope, now unbounded for `SYSTEM_ADMIN`. Fixed with `Promise.all` (parallel, same query count) rather than a new `CommunityRepository.findByIds` port method — adding batch-read surface to a different bounded context for one caller was judged disproportionate scope for a fix-up (ADR-006). RED/GREEN: new concurrency-proving unit test in `list-review-history.use-case.spec.ts` (deferred-promise mock proves both `findById` calls fire before either resolves; fails under the old sequential loop, passes under `Promise.all`).
- [x] 1.15 WARNING (readability): guard test at `prisma-review-session.repository.integration.spec.ts` (task 1.10) had an internal comment that quoted design.md's "4 files" wording without leading with the actual 3-file assertion — reworded so the test's own comment states upfront, unambiguously, what it verifies (3 production call sites) before explaining the design.md/`**/testing/**` exclusion conflict.
- [x] 1.16 WARNING (reliability): the empty-installation integration test (task 1.12) used `expect.any(Array)` against the shared dev DB — tautological, can't fail for the behaviour it claims. Reworded name/assertion to state only "resolves without throwing", with a comment pointing at the in-memory unit test that covers the real empty-list contract.
- [x] 1.17 WARNING (resilience/consistency): `GET /review-history` controller's `list()` had no try/catch, unlike `read()`'s `mapError` pattern. Added the same try/catch + `mapError` wrapping to `list()`.

Left as-is (SUGGESTION-level, out of scope for this fix-up): redundant
"deliberately unscoped" comments across 6+ sites, missing integration-layer
coverage for the null-company-attribution case (unit-covered only), and the
call-site guard's `.spec.ts`-only exclusion (currently inert, no
`.e2e-spec.ts` files in this module).

Full suite re-verified after the fix-up: 820/820 unit, 125/125 integration
(`--runInBand`), lint clean (pre-existing unrelated warnings only), build
green.

## Phase 2: Authorization Entry + E2E Visibility Matrix (PR 2)

Traces: spec `authorization` — *The System Admin Becomes Operational on Review
History Reads*, *The Deferred Review Visibility Scopes Grant Nothing*
(MODIFIED); spec `review-session-management` — *Adjacent Review Capabilities
Are Not Introduced* (MODIFIED, the wording-only guard).

- [x] 2.1 RED/GREEN `.../auth/infrastructure/authorization/role-permission.checker.ts` — `SYSTEM_ADMIN` gains `reviewSession:read` as its 28th entry, with a comment mirroring the manager's shipped one (design Decision 4); `MANAGER` untouched; no `/review-sessions*` write route widened.
- [x] 2.2 Unit: `ROLE_PERMISSIONS` — `SYSTEM_ADMIN`'s only diff is `+reviewSession:read`; contains none of `create/perform/complete/discard`; `MANAGER` still `[]`; exhaustive `Record<Role, Permission[]>` (a new `Role` without an entry fails the build); `PermissionChecker.can`'s signature unchanged.
- [x] 2.3 E2E `apps/api/test/review-history.e2e-spec.ts` — extend the existing three-role matrix to four, no sampling: admin sees every seeded completed session, incl. the deactivated-community and soft-deleted-performer/unattributed cases; technician/representative/manager results are byte-identical to before this change (spec `review-history` scenario *The admin sees every completed session in the installation*, spec `authorization` scenario *The four scopes are proven side by side*). **NOTE**: "soft-deleted-company" is represented at e2e level by a session with no company attribution (`sessionNoCompany`) plus a genuinely soft-deleted performer (`sessionSoftDeletedPerformer`) — this harness stubs `PrismaService`, so it cannot exercise a real `MaintenanceCompany` soft-delete through HTTP; the actual soft-deleted-company persistence guarantee is proven at the integration layer (tasks.md 1.11, real Postgres).
- [x] 2.4 E2E: admin's scope resolves from the role alone — a `SYSTEM_ADMIN` with no community assignment and no maintenance company still gets everything, with neither checker consulted (spec `authorization` scenario *The admin's scope resolves from the role alone*).
- [x] 2.5 E2E: admin gets `404 REVIEW_SESSION_NOT_FOUND` on a draft and on a nonexistent id, identical status/code/message (spec `review-history` scenario *Drafts and unknown ids still 404 for the admin*).
- [x] 2.6 E2E: scope guards — `SYSTEM_ADMIN` holds `reviewSession:read` and no other `reviewSession:*` (proven behaviorally: 403 on every `/review-sessions*` write route); `MANAGER` still `[]`; no `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` symbol exists anywhere; no page/date/sort/search parameter accepted on any of the four scopes (Testing Strategy row "Scope guards"; spec `review-session-management` scenario *The one installation-wide read lives in review-history, not here*).
- [x] 2.7 E2E: scope is checked in addition to the permission, not instead of it, for the admin path too (spec `authorization` scenario *Scope is checked in addition to the permission, not instead of it*, admin variant) — unauthenticated caller still gets 401 before any role/permission check, on the exact same guard chain as every other scope.

### PR2 fix-up (pre-existing PR1 defect discovered while running the full e2e suite)

- [x] 2.8 Discovered while running `npm run test:e2e` for the first time on this branch (PR1's fix-up session ran only unit + integration, not e2e): the "no `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` symbol is DECLARED anywhere" guard test (shipped in PR1) already failed on `main` before this PR's changes — its `VIEW_ALL_REVIEWS` regex has no prose exemption (unlike the `managerCapabilities` pattern), and PR1's own shipped comment in `review-history-access.service.ts`'s `MANAGER` branch used that literal token in prose. Fixed by rewording the comment (no behavior change) to avoid the bare token while preserving the same intent; not a Phase 2 design decision, a pre-existing PR1 wording defect blocking e2e green.

## Phase 3: Web Role-Widening + Spec Merges + Verification (PR 3)

Traces: spec `review-history-ui` — *The System Admin Reaches the Shipped
History Surface Unchanged*, *Role-Gated Route Access for the History Views*
(MODIFIED); proposal Success Criteria (Documentation & quality).

- [x] 3.1 `apps/web/src/App.tsx` — add `SYSTEM_ADMIN` to both `/review-history*` `ProtectedRoute allowedRoles` (3 → 4); `/review-sessions*` routes untouched.
- [x] 3.2 `apps/web/src/pages/HealthPage.tsx` — add `SYSTEM_ADMIN` to `REVIEW_HISTORY_ROLES`.
- [x] 3.3 RED/GREEN `apps/web/src/pages/HealthPage.test.tsx` — leave the manager's link-enumeration test (`:137-153`) **passing and unmodified**; add a new, separate admin sibling test: for `SYSTEM_ADMIN`, `hrefs` equals exactly `['/review-history']` and one button (logout) (Testing Strategy row `HealthPage`, explicit note).
- [x] 3.4 RED/GREEN `apps/web/src/auth/ProtectedRoute.test.tsx` — the review-history route family becomes 4 roles; assert `SYSTEM_ADMIN` still blocked from `/review-sessions*` with an explicit "not authorized" message, not a redirect.
- [x] 3.5 Merge `openspec/changes/review-history-admin-scope/specs/authorization/spec.md` deltas into `openspec/specs/authorization/spec.md` — ADDED requirements inserted, MODIFIED requirements replaced wholesale, scenarios carried over verbatim.
- [x] 3.6 Merge `.../specs/review-history/spec.md` deltas into `openspec/specs/review-history/spec.md`.
- [x] 3.7 Merge `.../specs/review-history-ui/spec.md` deltas into `openspec/specs/review-history-ui/spec.md`.
- [x] 3.8 Merge `.../specs/review-session-management/spec.md` (4th delta, wording-only guard change) into `openspec/specs/review-session-management/spec.md` — confirm no behavioural scenario changes, only the deferral-guard wording.
- [x] 3.9 `docs/requirements/functional-requirements.md` — FR-008 status: `SYSTEM_ADMIN` scope shipped; `MANAGER` + `VIEW_ALL_REVIEWS` and per-element history named as what remains; FR-008 does not close.
- [x] 3.10 Run full suites: `npm run test --workspace=apps/api`, `npm run test:integration --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`, `npm run test --workspace=apps/web`, `npm run lint`, `npm run build`. All green.
- [x] 3.11 Confirm scope guards from proposal Success Criteria against shipped code, not just tests: no `ManagerCapability`/`User.managerCapabilities`/`VIEW_ALL_REVIEWS` symbol; no schema/migration change **in Phase 3 itself** (Phase 3 added no new column, table, backfill or migration; the one migration in this change — the composite index — is Phase 1's fix-up, already accounted for in 1.13); no demo-mode-specific branch; unscoped pair called only from the `SYSTEM_ADMIN` branch (source-scan confirms, not just the test).
- [x] 3.12 Browser verification (CLAUDE.md) against a running dev server (Postgres via `docker compose up -d`, `npm run dev`, seeded admin via `apps/api` `npx ts-node prisma/seed.ts`). **Done live in-browser**: logged in as `SYSTEM_ADMIN` (`admin@sfmanager.local`); entry link "Go to review history" present on `/` with exactly one link + logout (matches `HealthPage.test.tsx`'s new admin test); `/review-history` renders the full installation-wide list at realistic volume (~300+ rows spanning dev-DB history back to 2026-09-08, many distinct communities/companies, including "Unknown community"/unattributed rows proving the unscoped read); drilled into a session detail (`/review-history/:id`), renders correctly; `/review-sessions` (write route) renders "Not authorized" in place, not a redirect — matches `ProtectedRoute.test.tsx`'s new assertion. **Not independently live-verified** (relying on the already-green automated suites instead, same precedent as PR1 task 1.12's note on the shared, non-isolated dev DB): the empty-installation edge case (no isolated empty tenant available in this shared dev DB; covered by `in-memory-review-session.repository.spec.ts` and `HealthPage.test.tsx`'s empty-state coverage) and a live regression pass for the other three roles (no test credentials on hand for those seeded users; covered by the untouched-and-passing `HealthPage.test.tsx:137-153` manager test and the full 693/693 web suite).

## Deferred / Follow-up (do NOT implement in this batch)

- `MANAGER` + `VIEW_ALL_REVIEWS` and the whole `ManagerCapability` mechanism — its own later slice, which must also answer how a capability gets granted.
- Per-element history (FR-008's other half) — its own future exploration.
- App-wide filtering/sorting/pagination/search initiative — named on record, not started here.
