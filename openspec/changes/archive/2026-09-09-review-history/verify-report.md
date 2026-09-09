# Verification Report: review-history (FR-008, first slice — View Review History)

**Change**: `review-history`
**Verified against**: `main` @ `19bb0fd` (PR 4/4 merged)
**Mode**: Strict TDD
**Artifact store**: hybrid (canonical: `openspec/changes/review-history/`; mirror: Engram `sdd/review-history/*`)
**Date**: 2026-09-09

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING, 6 SUGGESTION. Nothing blocks
`sdd-archive`.

Every requirement across the five delta specs is implemented, and every one is
backed by a test that passed at runtime during this verification except the one
scenario named in W-1. All 7 design decisions are implemented as designed. All
40 tasks.md checkboxes are genuinely done — each was cross-checked against
source, not against its checkbox. The three security guarantees this slice
turns on — no unscoped session read, indistinguishable 404, and no mutation
control on a completed record — are each enforced **structurally** (a required
parameter in a port signature, a single throw site, and the physical absence of
the controls from the file) rather than by caller discipline.

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total (on disk, `tasks.md`) | 40 (across 6 phases) |
| Tasks complete | 40 |
| Tasks incomplete | 0 |
| Deferred (explicitly, user-confirmed) | 3 — ADR-011 addendum, performer identity, frozen element codes |

Verified by counting `- [x]` (40) and `- [ ]` (0) in
`openspec/changes/review-history/tasks.md`. Every file named in a task exists
at the stated path; every task carrying a `RED/GREEN` annotation has a
corresponding spec file on `main` that passed in this run. Task-level claims
that go beyond the design (3.6's deferred `mapError`, 5.6's "role-gating
covered by the existing generic `ProtectedRoute.test.tsx`") are documented
inline in tasks.md and were independently confirmed against the code.

Note the artifact disagreement recorded as W-4: the denominator differs across
tasks.md (40), Engram `apply-progress` ("33/33") and the Engram `tasks` note
("35/38"). The numerator is not in question — zero tasks are unchecked.

---

## Build & Tests Execution

All commands run by this verification against `main` @ `19bb0fd`, with the
already-running `sf-manager-postgres-1` container.

**Build**: PASSED

```text
npm run build              -> 4 successful, 4 total (exit 0)
```

**Lint**: PASSED

```text
npm run lint               -> 5 successful, 5 total (exit 0)
```

**Tests**: 1846 passed / 0 failed (second integration run; see W-3 for the
first)

```text
npm run test --workspace=apps/api             -> 105 suites, 773 tests (exit 0)
npm run test:integration --workspace=apps/api ->  19 suites, 108 tests
                                                 run 1: 1 FAILED (W-3, pre-existing flake)
                                                 run 2: 108/108 passed (exit 0)
npm run test:e2e --workspace=apps/api         ->  10 suites, 295 tests (exit 0)
npm run test --workspace=apps/web             ->  47 files,  670 tests (exit 0)
```

Task 6.4's claim of **773 unit + 108 integration + 295 e2e + 670 web** is
**exactly confirmed** on current `main`.

**No migration**: `git log --name-only a3673b1^..19bb0fd` touches **zero**
files under `apps/api/prisma/`. The two "prisma" matches are the src-layer
adapter and its integration spec. The spec scenario *"No migration ships with
this change"* holds by direct evidence.

**Untouched-by-design files confirmed absent from the diff**:
`session-access.service.ts`, `role-permission.checker.ts`,
`review-session.controller.ts`, `apps/api/prisma/**`. Design Decisions 1 and 5
are preserved literally, not just in spirit.

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | WARN | `sdd/review-history/apply-progress` (Engram #211, **16 revisions**) was upserted down to a chain-complete summary. No per-PR TDD Cycle Evidence table survives. See W-2 |
| All tasks have tests | PASS | Every `RED/GREEN`-annotated task maps to an existing spec file |
| RED confirmed (test files exist) | PASS | Verified file-by-file across all 9 test files this change created or modified |
| GREEN confirmed (tests pass) | PASS | 1846/1846 pass at runtime in this verification |
| Triangulation adequate | PASS | Reconstructed from the sources. `assignment-community-scope.checker.spec.ts` is table-driven over all 5 roles x {no row, deactivated row, active rows}; `review-history.e2e-spec.ts` carries 24 tests across 3 describe blocks; both empty-scope tests assert all four new methods in one case |
| Safety Net for modified files | PASS | `record-entry.use-case.spec.ts` was updated with the 4 new port members on its hand-rolled repository double and stayed green; `SessionAccessService`'s own suite passes **unmodified** (task 3.3) — the proof Decision 1 changed nothing on the write path |

**TDD compliance**: 5/6 checks pass. The one gap is artifact retention, not
protocol compliance.

### Assertion Quality Audit

Scanned all 9 test files created or modified by this change.

| Banned pattern | Found |
|---|---|
| Tautologies (`expect(true).toBe(true)`) | 0 |
| Assertions with no production-code call | 0 |
| Ghost loops (assertions over a possibly-empty collection) | 0 |
| Orphan empty-collection assertions | 0 — every `toEqual([])` sits beside a companion test asserting a populated result (technician-sees-own, representative-sees-cross-performer, both list methods with rows) |
| Type-only assertions used alone (`toBeDefined`, `not.toBeNull`) | 0 occurrences at all |
| Smoke-test-only (render + toBeInTheDocument, no behaviour) | 0 |
| Implementation-detail coupling (CSS classes, mock call counts as the assertion) | 0 |
| Mock-heavy files (mocks > 2x assertions) | 0 |
| Incomplete cycle (test passes because the code path never runs) | 0 — see below |

**Assertion quality**: all assertions verify real behaviour.

Three assertions are worth calling out as *positively* strong, because each is
the kind that usually goes vacuous and here does not:

- `ReviewHistoryDetailPage.test.tsx:123-134` — the "no mutating control"
  test **first** awaits `findByTestId('review-history-detail-entry-e1')`,
  proving the page actually rendered its record, and only then asserts
  `queryAllByRole('button')` / `('textbox')` are empty and no `form`/`input`
  exists. Without that first await this would be the classic
  always-passes-because-nothing-rendered test. It is not.
- `review-history.e2e-spec.ts:860-874` — deep-equals the **entire response
  body** (not just the status) between a nonexistent id and another
  performer's session. Repeated at 876 and 892 for the other two causes.
- `error-messages.test.ts:63-85` — deliberately assigns four **different**
  `.message` strings to four `ApiError`s that share one code, then asserts the
  mapper collapses them to a `Set` of size 1. It could not pass by accident,
  and it is the exact anti-message-coupling guarantee the UI spec demands.

### Test Layer Distribution

| Layer | Tests | Files | Tool |
|---|---|---|---|
| Unit (API) | 773 | 105 | Jest |
| Integration (API, real Postgres) | 108 | 19 | Jest + Prisma |
| E2E (API, real HTTP) | 295 | 10 | Jest + Supertest |
| Unit/Component (web) | 670 | 47 | Vitest + Testing Library |
| **Total** | **1846** | **181** | |

`review-history.e2e-spec.ts` alone carries 24 tests across 3 describe blocks
mapped to tasks 3.8, 4.7-4.10. Every visibility rule is proven at the E2E
layer, not only at the unit layer.

### Changed File Coverage

`npm run test:cov --workspace=apps/api` (unit project only — it excludes
`*.integration.spec.ts` and the e2e project by design).

| File | % Stmts | % Branch | Uncovered | Rating |
|---|---|---|---|---|
| `assignment-community-scope.checker.ts` | 100 | 100 | — | Excellent |
| `community-scope.checker.port.ts` | 100 | 100 | — | Excellent |
| `fake-community-scope.checker.ts` | 100 | 100 | — | Excellent |
| `list-review-history.use-case.ts` | 100 | 87.5 | — | Excellent |
| `read-review-history.use-case.ts` | 96 | 75 | L77 (defensive `ActiveTemplateNotFoundError`) | Excellent |
| `review-history-access.service.ts` | 93.54 | 94.44 | L122-123 (`satisfies never` backstop in `loadByRole`) | Excellent — see S-2 |
| `review-history-row.dto.ts` | 100 | 75 | — | Excellent |
| `review-history-detail-response.dto.ts` | 100 | 75 | — | Excellent |
| `review-history.controller.ts` | 66.66 | 60 | L48, L69-100 | Understated — see S-5 |

The controller number is an artifact of the coverage command's scope: those
exact lines are the two handlers, exercised by all 24 E2E tests, which
`test:cov` does not include. Application and Layer-2 code, where this slice's
behaviour lives, is at 93-100%.

---

## Spec Compliance Matrix

Five delta specs. Reported per requirement; every non-COMPLIANT row is expanded
in *Issues Found*.

### `review-history` (new capability, 9 requirements)

| Requirement | Evidence | Result |
|---|---|---|
| A Performer's Own Completed Review History | `review-history-access.service.spec.ts:41`; e2e 444 (own sessions across every assigned community, the other technician's session excluded, `performedById` uniform), 461, 472 (empty list is 200, not an error); ordering asserted at the adapter layer in both the fake and the Prisma integration spec | COMPLIANT |
| A Representative's Community-Scoped Completed Review History | `review-history-access.service.spec.ts:54`; e2e 490 (sees a technician-performed session), 506 (community D never appears, every row is C) | PARTIAL — the multi-community flat list scenario has no covering test at any layer (W-1) |
| Only Completed Sessions Appear in History | in-memory repo spec 147/175/218; Prisma integration 673; e2e 521, 540 (draft absent from both lists), 911 (draft by id gives 404 identical to nonexistent). The draft-resume flow is untouched — `review-session.controller.ts` is absent from the diff | COMPLIANT (see S-4) |
| Scoped Read-Back of One Historical Session | `read-review-history.use-case.spec.ts:86,137,195`; e2e 744, 769 (unreviewed entry plus reason), 784 (representative reads a session they did not perform), 802 (each entry identifies its element), 815 (decommissioned element gives `elementCode: null`, entry retained) | COMPLIANT |
| History Scope Is Carried by the Query, Not by the Caller | Port surface read directly: the only reads are `findByIdForPerformer`, `findDraftsByPerformer` and the four `findCompleted` methods, every one carrying a performer and/or community scope as a **required** parameter — there is no `findById`. Asserted by the integration guard at `prisma-review-session.repository.integration.spec.ts:742`. Neither use case fetches wider and narrows afterwards | COMPLIANT |
| An Out-of-Scope Historical Session Is Indistinguishable From a Nonexistent One | One throw site (`review-history-access.service.ts:87,92`), one mapping (`review-history.controller.ts:86-92`). E2E 860/876/892/911 deep-equal the **whole body** across all four causes. No "exists but not yours" code exists in `CODE_MESSAGE_KEYS` or in the controller | COMPLIANT |
| History Access Requires a Currently Active Community Assignment, Including for One's Own Sessions | Structural: `communityIds` is a required parameter of the technician's **own**-history queries, and `listAssignedCommunityIds` is re-read per request with no cache. E2E 1061 (technician's own session becomes unreadable on deactivation, returns on reassignment) and 1123 (same for the representative) | COMPLIANT |
| History Adds No Write Path | The controller declares two `@Get` handlers and nothing else; all four new port methods are reads; neither use case calls a mutator. Verified by direct read of all four files | COMPLIANT |
| The Deferred Review Visibility Scopes Are Not Built | Grep across `apps` and `packages` for `ManagerCapability` / `managerCapabilities` / `VIEW_ALL_REVIEWS`: **one** hit, a pre-existing prose comment in `permission.ts:17` describing a hypothetical future slice — no enum, no field, no migration. No company-scoped query on the port. No per-element history route. E2E 966 asserts page/cursor/limit/offset/date-range/sort/search change nothing on either route | COMPLIANT |

### `authorization` (2 ADDED requirements)

| Requirement | Evidence | Result |
|---|---|---|
| Resource Scope for Review History Reads | Both routes carry `@RequirePermission('reviewSession:read')` — read line-by-line, no exception. `assignment-community-scope.checker.spec.ts` is table-driven over all 5 roles x {no row, deactivated row, active rows}. E2E 938/947/959 (MANAGER, MAINTENANCE_COMPANY_MANAGER, SYSTEM_ADMIN all 403 on **both** routes), 563 (401 unauthenticated), 1061/1123 (deactivation revokes on the next request) | COMPLIANT (401 tested on the list route only — S-3) |
| The Deferred Review Visibility Scopes Grant Nothing | `role-permission.checker.ts` read directly: `MANAGER: []`, `MAINTENANCE_COMPANY_MANAGER: []`, the `SYSTEM_ADMIN` row holds **zero** `reviewSession:*` members, and both operational rows hold **only** the five `reviewSession:*` and nothing else. The file is absent from this change diff — unchanged by construction. `maintenanceCompanyId` appears in no history code path | COMPLIANT |

### `review-history-ui` (new capability, 7 requirements)

| Requirement | Evidence | Result |
|---|---|---|
| Role-Gated Route Access for the History Views | `App.tsx:338-356` — both routes under `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']}`; the not-authorized-message and redirect-to-login halves are covered by the shared `apps/web/src/auth/ProtectedRoute.test.tsx` per repo convention (no per-page duplication), documented in task 5.6 | COMPLIANT |
| A Reachable Entry Point From the Existing Review-Session Surface | `ReviewSessionsPage.tsx:68` renders a Link to `/review-history`, covered by `ReviewSessionsPage.test.tsx`; each history row renders a Link to its detail route (`ReviewHistoryPage.tsx:76`, test at `ReviewHistoryPage.test.tsx:76`) | COMPLIANT |
| The History List Renders the Server-Scoped Result Unfiltered | `ReviewHistoryPage.tsx` contains **no** filter, sort, slice or search state — it maps rows straight through. Four distinct states (loading / error / empty / loaded), each with its own testid and its own test (`ReviewHistoryPage.test.tsx:37,45,54,63`). Community column rendered per row (test at 85) | COMPLIANT |
| Read-Only Historical Session View | `ReviewHistoryDetailPage.tsx` is a genuine fork — zero button, form or input elements in the file, and the assertion at `ReviewHistoryDetailPage.test.tsx:123` is non-vacuous (it proves the record rendered first). Entries, answers, observations and snapshotted wording all rendered; a null `elementCode` renders the localized `reviewHistory.detail.elementCodeUnknown` (test at 113) | COMPLIANT (raw-questionId fallback nit — S-1) |
| An Unreachable Session Gets One Uniform Message | `mapApiErrorToMessageKey` branches **only** on `.code` and `.status`, never `.message` — proven by `error-messages.test.ts:63` across four causes with four different messages. The page selects it via `ApiError` only (`ReviewHistoryDetailPage.tsx:57-61`) | COMPLIANT |
| Internationalization Coverage | 16 `reviewHistory.*` keys plus `reviewSession.entry.historyLink`, all present with real (non-placeholder) values in en/es/ca — dumped and read individually. `locales.test.ts` guards them twice: cross-locale key-set parity **and** a hand-maintained `REQUIRED_REVIEW_HISTORY_KEY_PATHS` existence list (the guard that catches a key missing from all three at once). Answer enums go through `mapAnswerValueToLabelKey`, a `Record<AnswerValue, string>` so a new member is a compile error, not a runtime raw-string leak | COMPLIANT |
| No Filtering, Analytics or Adjacent Controls Ship | Both pages read in full: no pagination, infinite scroll, date filter, sort or search control; no per-element view; no signing/export/schedule/attachment affordance | COMPLIANT |

### `review-session-management` and `review-session-ui` (1 MODIFIED requirement each)

| Requirement | Evidence | Result |
|---|---|---|
| Adjacent Review Capabilities Are Not Introduced (narrowed) | Canonical `openspec/specs/review-session-management/spec.md` carries the narrowed text verbatim, Purpose amended, delta-only "(Previously: ...)" annotation correctly stripped. The narrowing is **correct, not over-narrow**: the scenario explicitly preserves "the shipped performer-scoped, status-agnostic by-id read stays exactly as it is" — this is PR4 fresh-context review fix, and it is present in the merged canonical file | COMPLIANT |
| No Offline, History or Scheduling Surface (narrowed) | Canonical `openspec/specs/review-session-ui/spec.md` likewise carries the narrowed text verbatim with the same preservation clause | COMPLIANT |

**Compliance summary**: 19/19 requirements implemented. 18 fully COMPLIANT with
passing runtime evidence, 1 PARTIAL (W-1). 0 FAILING, 0 UNTESTED requirements.

### Spec merge fidelity (task 6.3)

Independently re-verified for this phase, not taken on trust from the PR review:

| Merge | Method | Result |
|---|---|---|
| `review-history` delta into `openspec/specs/review-history/spec.md` | `diff` | byte-identical (289 lines) |
| `review-history-ui` delta into `openspec/specs/review-history-ui/spec.md` | `diff` | byte-identical (197 lines) |
| `authorization` delta requirements into `openspec/specs/authorization/spec.md` L476-575 | `diff` against delta L17-117 | byte-identical; Purpose amendment applied |
| `review-session-management` delta into canonical | read side by side | faithful; delta-only "(Previously: ...)" stripped, Purpose amended |
| `review-session-ui` delta into canonical | read side by side | faithful; delta-only "(Previously: ...)" stripped |

All five merges are complete and faithful.

### Pre-merge bug fixes — confirmed present in current code

Verified against the source, not against the memory record:

| Fix | Confirmation |
|---|---|
| PR3 — raw enum rendered to the user | `ReviewHistoryDetailPage.tsx:122` calls `t(mapAnswerValueToLabelKey(answer.answer))`; `answer-value-labels.ts` maps all three `AnswerValue` members to `reviewSession.answer.*` keys, which exist in all three locales |
| PR3 — build-breaking test fixture | `npm run build` exits 0 and `apps/web` runs 670/670 green on current `main` |
| PR4 — spec over-narrowing contradicting the shipped `GET /review-sessions/:sessionId` | The preservation clause is present in **both** the delta and the merged canonical `review-session-management` spec (scenario "This capability own surface adds no cross-session query") and in the `review-session-ui` equivalent |
| PR1 review — soft-deleted community renders a blank name | `ReviewHistoryPage.tsx:72` renders `t('reviewHistory.list.communityUnknown')` for an empty `communityName`; covered by `ReviewHistoryPage.test.tsx:95` |

---

## Coherence (Design)

All 7 numbered decisions verified against source.

| Decision | Followed? | Evidence |
|---|---|---|
| 1 — read-only **sibling** service; `SessionAccessService` byte-unchanged | Yes | `review-history-access.service.ts` exists with exactly `listForActor` plus `loadCompletedForActor`. `session-access.service.ts` is **absent from the entire diff**, and its existing suite passes unmodified. The binding invariant is preserved where the decision said it would be — in the port, which still exposes no identifier-only read |
| 2 — active-community set becomes Layer 2 second method | Yes | `listAssignedCommunityIds(userId, role)` added to the shared port; `AssignmentCommunityScopeChecker` implements it with the same fail-closed exhaustive switch (`role satisfies never` default), reusing the shipped `findActiveByUser` on both assignment ports. `isAssignedTo` untouched. No cache — re-read per request, which is what makes retroactive revocation structural |
| 3 — four named methods, one per (scope x shape), no discriminant | Yes | All four present on the port and both adapters. Every Prisma WHERE carries `status: 'completed'` plus `communityId: { in: [...] }`, plus `performedById` on the two performer-scoped ones. A shared `COMPLETED_HISTORY_ORDER_BY` constant is used by both list methods. The empty-scope footgun is asserted in **both** the fake and the Prisma integration spec, as the decision demanded |
| 4 — separate `/review-history` route tree on its own controller | Yes | `review-history.controller.ts` is a new file with `@Controller()` and two full-path `@Get` handlers. No path prefix is shared with `review-sessions/:sessionId`, so the Express declaration-order trap is structurally impossible. No `communityId` is accepted from the client on either route |
| 5 — reuse `reviewSession:read`; no new permission | Yes | Both routes carry `@RequirePermission('reviewSession:read')`. `permission.ts` and `role-permission.checker.ts` are both absent from the diff — no new enum member, no `ROLE_PERMISSIONS` row changed |
| 6 — row and record shape | Yes | `ReviewHistoryRowDto` is exactly id, communityId, communityName, performedById, startedAt, completedAt — no coverage counts, no performer name column in the UI. The detail is a superset with `questions` (from `findFrozenWithSnapshot`) and a nullable `elementCode` (from `findActiveByCommunityAndType`) |
| 7 — the web read-only view is a fork, not a reuse | Yes | `ReviewHistoryDetailPage.tsx` is a new file; `ReviewSessionDetailPage.tsx` is absent from the diff. No `ConfirmDialog` import, no mutation handlers, no `useState` beyond the three load-state hooks. No new `packages/validation` schema (neither route takes a body or a query parameter) |

### Design deviations (all documented in-code, all improvements)

| Deviation | Assessment |
|---|---|
| `mapError` maps **two** errors, not the "3-line" single case the design sketched | Accept — the second is `ActiveTemplateNotFoundError`, a defensive-only path in `read-review-history.use-case.ts:77`. Mapping it prevents an unmapped 500 and mirrors `review-session.controller.ts`. It cannot leak existence: it is only reachable **after** the scope check passed |
| `communityName` resolved once per distinct community in the **result**, not once per community in the **scope** (Decision 6 wording) | Accept — strictly fewer queries (the result set is a subset of the scope), same bound, documented in `list-review-history.use-case.ts:18-24` and covered by the test "resolves communityName once per distinct community, not per row". Recommend correcting the design text at archive (S-6) |
| Task 3.6 deferred `mapError` from PR1 to PR2 | Accept — the list route throws no mapped error; adding a dead method in PR1 would have been premature. Documented inline in tasks.md |

### Design "Open Questions" — status

Per the phase brief, the documented deferrals are **not** findings. Recorded
here for the archive:

| Question | Status |
|---|---|
| ADR-011 addendum (two access services, Layer 2 gains a listing method) | **Still open — EXPECTED.** Explicitly deferred, needs user confirmation, per the `review-session` precedent. Not a verification defect. Note this is now the **second** consecutive change to carry it |
| Performer identity in the representative view | **Still open — EXPECTED.** Named, deliberate gap; needs a users read no port supports today |
| Element codes resolved live, not frozen | **Still open — EXPECTED.** The durable fix is a schema change, explicitly out of scope |
| `GetReviewScopeUseCase` unions both assignment kinds without role dispatch, while `listAssignedCommunityIds` dispatches on role — "confirm sdd-verify reads the asymmetry as intentional" | **CONFIRMED INTENTIONAL.** Read both. `GetReviewScopeUseCase` serves the open-session form on the **write** path and is correct for that purpose; `listAssignedCommunityIds` is strictly narrower and fail-closed per role. Neither is drift. The write path was deliberately not refactored, which is the right ADR-006 call |
| Soft-deleted community renders a blank `communityName` (PR1 review) | **RESOLVED in PR3**, as the design records — confirmed in `ReviewHistoryPage.tsx:72` and its test |
| Raw ISO-8601 timestamps (PR4 browser verification) | **EXPECTED — pre-existing, app-wide.** Confirmed independently: `ReviewSessionsPage.tsx:84` renders a raw `startedAt` on `main` today, shipped by the already-archived `review-session` change. Not a review-history regression, and the `review-history-ui` i18n requirement wording ("timestamps **surrounding copy**") is satisfied — the column heading and the `completedAtLabel` wrapper are both translated |

---

## Scope-Guard Verification

| Guard | Result |
|---|---|
| No `ManagerCapability` / `managerCapabilities` / `VIEW_ALL_REVIEWS` mechanism anywhere | VERIFIED — one hit across all of `apps` and `packages`, a pre-existing prose comment in `permission.ts:17`. No enum, no field, no migration, no capability layer |
| Every history endpoint requires `@RequirePermission('reviewSession:read')`, no exception | VERIFIED by direct read — 2 routes, 2 decorators, 1:1 |
| Detail page has zero mutation controls | VERIFIED structurally — no button, form, input or textarea element exists in `ReviewHistoryDetailPage.tsx`; the test proves it after confirming the record rendered |
| List page has zero client-side filtering / pagination / sorting / search | VERIFIED — no filter, sort, slice, no query state, no controls. Rows are mapped straight through |
| Indistinguishable 404 is structural (keyed off error code, not message) | VERIFIED on both sides — backend: one `ReviewSessionNotFoundError` throw site, one mapping; frontend: `mapApiErrorToMessageKey` reads only `.code`/`.status` and is tested against four deliberately-differing `.message` values |
| i18n key coverage complete, no raw fallback keys | VERIFIED — 17 keys, real values in en/es/ca, both `locales.test.ts` guards (parity plus required-path existence) cover them |
| No new migration | VERIFIED — zero files under `apps/api/prisma/` in the diff |
| MANAGER and MAINTENANCE_COMPANY_MANAGER still empty; SYSTEM_ADMIN holds no `reviewSession:*` | VERIFIED by direct read; `role-permission.checker.ts` is absent from the diff |
| No unscoped session read on the port | VERIFIED by direct enumeration and by the integration guard test |
| No list-control parameter accepted | VERIFIED — no `@Query` in the controller; e2e asserts response equality with and without 8 such parameters |

---

## Issues Found

### CRITICAL

**None.**

### WARNING

**W-1 — The spec scenario "Multiple assignments produce one flat list" has no
covering test at any layer.** The `review-history` spec requires: GIVEN a
`COMMUNITY_REPRESENTATIVE` actively assigned to communities C **and** D, each
with completed sessions, THEN a single list MUST be returned containing the
completed sessions of both, each row identifying its own community.
`findCompletedInCommunities` is called with a **single-element** array
everywhere it is tested — `in-memory-review-session.repository.spec.ts:186`
(`['community-1']`), `prisma-review-session.repository.integration.spec.ts:701`
(`[communityId]`), and the e2e fixture assigns the representative to C only
(the test at 506 asserts every returned row has `communityId === communityC.id`).

*Assessment*: **not a defect, and deliberately not raised to CRITICAL** despite
the strict-TDD module gate of "no covering test implies CRITICAL UNTESTED". The
multi-element `{ in: [...] }` predicate **is** exercised end-to-end — by the
technician sibling method at `review-history.e2e-spec.ts:444`, where the caller
is assigned to C and D and both `sessionByUForC` and `sessionForD` come back in
one flat list. `findCompletedInCommunities` differs from
`findCompletedForPerformerInCommunities` by exactly one thing: the absence of
the `performedById` predicate. There is no untested branch. What is missing is
the scenario own runtime evidence, not the behaviour.

*Action*: seeding a second representative assignment in the existing e2e
fixture and asserting both communities rows appear with distinct
`communityId` values would close it in roughly 15 lines. Recommended as a
follow-up, not a blocker.

**W-2 — The TDD Cycle Evidence table is unrecoverable from `apply-progress`,
for the second change in a row.** Engram topic `sdd/review-history/apply-progress`
(#211) went through **16** `topic_key` upserts; its final revision is a
chain-complete summary. No per-PR RED / GREEN / TRIANGULATE / SAFETY-NET table
survives, so strict-TDD verification of those columns had to be reconstructed
from the test files and the tasks.md annotations.

*Assessment*: an **artifact-retention** failure, not a TDD-compliance failure.
Everything the table would have claimed is independently corroborated: every
RED/GREEN task has a spec file that exists and passes, all 1846 tests are
green, triangulation is visible as table-driven cases in the sources, and the
safety net is visible as the `record-entry.use-case.spec.ts` port-double update
plus the unmodified `SessionAccessService` suite.

*Why this is a WARNING rather than a repeat SUGGESTION*: the `review-session`
verify report raised this **exact** issue as its W-1 on 2026-09-08 and
recommended "append a revision, or use per-PR topic keys". The recommendation
was not adopted, and the same information was lost again one change later.
Recommend acting on it before the next change apply phase — per-PR topic keys
(`sdd/{change}/apply-progress/pr-1`) are the cheapest fix.

**W-3 — A pre-existing flaky integration test produced a red build on the first
full run of this verification.**
`PrismaUserRepository (integration) > countActiveByRole() excludes soft-deleted
users` failed with `Expected: 2150, Received: 2151`; the whole
`test:integration` run exited non-zero. A second, otherwise-identical run
passed 108/108.

*Root cause* (read at
`apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts:309-317`):
the test takes a **global** count of active `COMMUNITY_REPRESENTATIVE` users,
soft-deletes one row, re-counts, and asserts `after === before - 1`. Any other
Jest worker that creates an active representative between the two counts breaks
it. The shared database now holds roughly 2150 such users from accumulated
runs, which both widens the race window and makes the assertion increasingly
fragile.

*Assessment*: **not a review-history regression** — the file belongs to the
archived `user-management-roles` change and is absent from this change diff.
Recorded because the skill own gate is "test command exits non-zero implies
CRITICAL", and it did, once. It is downgraded to WARNING because it is
reproducibly transient, unrelated to this change, and the second run was clean.

*Action*: make the assertion self-scoped (count only the two users the test
creates, e.g. by filtering on their own ids) rather than counting the whole
table, and consider a periodic test-database reset. Otherwise this will keep
biting every future verification.

**W-4 — Three artifacts disagree on the task count.** `tasks.md` on disk has
**40** checkboxes across 6 phases, all checked. Engram `apply-progress` (#211)
claims "33/33 tasks complete across all 6 phases". The Engram `tasks` note
(#210) claims "35/38 tasks complete (32 prior + 3 this batch)".

*Assessment*: cosmetic. The number that matters — unchecked tasks — is **zero**
by direct count, and every task was individually cross-checked against source
in this verification. But a downstream reader (or the archive report) that
trusts either Engram figure will record a wrong total.

*Action*: `sdd-archive` should take **40/40** from `tasks.md`, the canonical
artifact in this hybrid store, and correct the two Engram mirrors.

### SUGGESTION

**S-1 — `ReviewHistoryDetailPage.tsx:121` can render a raw UUID to the user.**
`questionTextById.get(answer.questionId) ?? answer.questionId` falls back to
printing the raw question id if the frozen snapshot lacks that question. The
`review-history-ui` spec forbids raw identifiers two lines earlier for
`elementCode`, which correctly uses `t('reviewHistory.detail.elementCodeUnknown')`.

*Assessment*: believed **unreachable** — answers are validated against the same
frozen snapshot at record time (`ANSWERS_DO_NOT_MATCH_TEMPLATE`), and
`findFrozenWithSnapshot` returns the exact version bound by `session.templateId`,
so the map always resolves. But the inconsistency is one line away from the
correct treatment. Recommend a localized neutral label for symmetry.

**S-2 — The `satisfies never` backstop in `loadByRole` is uncovered.**
`review-history-access.service.ts:122-123` is the only uncovered branch in the
service. Its twin in `listForActor` **is** covered by the explicit test
"refuses (yields []) for a role value outside the Role union". A five-line
mirror of that test for the by-id path would take the service to 100%.

**S-3 — The 401 e2e test covers only the list route.**
`review-history.e2e-spec.ts:563` asserts 401 on `GET /review-history`. The
authorization spec scenario says "the caller calls **any** history endpoint".
The global `AuthenticatedGuard` makes this structurally guaranteed for
`GET /review-history/:sessionId` too, so the risk is nil — but the wording asks
for both. One extra line.

**S-4 — "A session enters history only on completion" is proven in two halves,
never as one before/after assertion.** The draft-exclusion tests (521, 540)
prove the "before", and every session in the history fixtures got there via a
real `POST /review-sessions/:id/complete` (400, 417, 435), which proves the
"after". No single test asserts "S absent, complete S, S now present". The
substance is covered; the scenario literal shape is not.

**S-5 — `npm run test:cov` understates changed-file coverage, again.**
`review-history.controller.ts` reports 66.66% / 60% because the coverage command
runs the unit Jest project only, excluding the 24 E2E tests that exercise
exactly the uncovered lines (L48, L69-100). The `review-session` verify report
raised the identical point as its S-4 and recommended a combined coverage run
or a documented note; neither happened, and the next verification will misread
these numbers a third time. Cheap to fix once.

**S-6 — Correct design.md Decision 6 `communityName` wording at archive.**
The decision says the name is resolved "once per community in the **actor
scope** — not per row". The implementation resolves once per distinct community
**in the result**, which is a subset of the scope and therefore strictly better.
The code comment already records the real behaviour; the design text does not.
Worth a one-line correction so the archived design matches the archived code.

---

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING, 6 SUGGESTION.

The implementation matches its specs, its design and its tasks. The three
guarantees this slice actually turns on are each enforced **structurally**
rather than by caller discipline, exactly as the design argued they should be:
the scope is a *required parameter* of every query, so a use case that forgets
it has nothing to call; the 404 is a *single throw site with a single mapping*,
so no cause can diverge; and the read-only view is a *fork with the controls
physically absent*, so no `isDraft &&` condition can be edited into a leak.
Each is proven at the E2E layer with non-vacuous assertions — the whole-body
deep-equal and the four-different-messages-one-key test in particular could not
pass by accident.

None of the four warnings describes a defect a user could hit. W-1 and W-4
concern missing *evidence* and inconsistent *bookkeeping*. W-2 and W-3 are
repeat process issues inherited from the previous cycle (artifact retention and
a shared-database test flake) that this change did not cause and should not be
blocked on — but that will keep recurring until someone fixes them.

**Ready for `sdd-archive`.**
