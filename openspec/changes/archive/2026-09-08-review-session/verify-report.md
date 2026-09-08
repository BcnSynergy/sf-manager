# Verification Report: review-session (FR-007 — Perform a Review Session)

**Change**: `review-session`
**Verified against**: `main` @ `eb2ea79` (PR 8/8, working tree clean)
**Mode**: Strict TDD
**Artifact store**: hybrid (canonical: `openspec/changes/review-session/`; mirror: Engram `sdd/review-session/*`)
**Date**: 2026-09-08

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING, 5 SUGGESTION. Nothing blocks
`sdd-archive`.

Every requirement across all 6 delta specs is implemented and, with the four
exceptions named below, backed by a test that passed at runtime during this
verification. All 11 design decisions are implemented as designed. All 8
tasks.md phases are genuinely done — every task was cross-checked against
source, not against its checkbox.

---

## Completeness

| Metric | Value |
|---|---|
| Tasks total | 63 (across 8 phases) |
| Tasks complete | 63 |
| Tasks incomplete | 0 |
| Deferred (explicitly, by user) | 1 — ADR-011 addendum (tasks.md *Deferred / Follow-up*) |

Spot-checked against source, not checkboxes. Every task carrying a `RED/GREEN`
annotation has a corresponding `*.spec.ts` that exists on `main` and passed in
this run. Every file named in a task exists at the stated path. Task-level
claims that go beyond the design (5.3's `z.union` instead of
`z.discriminatedUnion`, 6.5's wrong-element-type limitation, 6.4's
self-scoped-endpoint judgment call) are all documented inline in tasks.md and
were independently confirmed against the code.

---

## Build & Tests Execution

All commands run by this verification against `main` @ `eb2ea79`, with a
freshly started Postgres 18 (`docker compose up -d`) and `prisma migrate
deploy` reporting **no pending migrations**.

**Build**: PASSED

```text
npm run build              -> 4 successful, 4 total (exit 0)
  @sf-manager/api:build    -> prisma generate + nest build, clean
  @sf-manager/web:build    -> vite, 225 modules, clean
  (only pre-existing informational warning: web chunk > 500 kB)
```

**Lint**: PASSED

```text
npm run lint               -> 5 successful, 5 total (exit 0)
  @sf-manager/api:lint     -> 4 problems (0 errors, 4 warnings)
      all 4 warnings are pre-existing @typescript-eslint/no-unsafe-argument
      in auth/presentation/auth.controller.spec.ts — untouched by this change
  @sf-manager/web:lint     -> clean
  @sf-manager/validation   -> clean
eslint --fix produced no working-tree changes (git status clean afterwards).
```

**Tests**: 1738 passed / 0 failed / 0 skipped

```text
npm run test --workspace=apps/api             -> 102 suites, 727 tests (exit 0)
npm run test:integration --workspace=apps/api ->  19 suites, 104 tests (exit 0)
npm run test:e2e --workspace=apps/api         ->   9 suites, 271 tests (exit 0)
npm run test --workspace=apps/web             ->  45 files,  636 tests (exit 0)
```

The apply phase's claim of **727 unit + 104 integration + 271 e2e + 636 web**
is **exactly confirmed** on current `main`. No regressions in the adjacent
capabilities this change touched (`community`, `user-management-roles`,
`inspectable-elements`, `label-printing`, `checklist-management`) — their
suites are inside the four runs above and all pass.

**ADR-013 import boundary**: no `@prisma/client` import exists outside
`infrastructure/persistence/**` (the 8 grep hits are all comments citing the
rule).

---

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | WARN | The `sdd/review-session/apply-progress` topic (Engram #198, 28 revisions) was upserted down to a final one-paragraph status note. Its own header claims "Full PR1-8 history preserved verbatim from prior revisions" — it is not; `topic_key` upsert overwrote it. No per-PR TDD Cycle Evidence table survives. See W-1. |
| All tasks have tests | PASS | Every `RED/GREEN`-annotated task maps to an existing spec file |
| RED confirmed (test files exist) | PASS | Verified file-by-file for phases 1-7 |
| GREEN confirmed (tests pass) | PASS | 1738/1738 pass at runtime in this verification |
| Triangulation adequate | PASS | Reconstructed from the test files rather than the lost report. Representative: `assignment-community-scope.checker.spec.ts` is `describe.each` over 5 roles x {no row, deactivated row, active row} = the exact 15 cases task 2.4 specified; `review-session.entity.spec.ts` is `it.each` over 4 mutating methods x {draft, completed}; `role-permission.checker.spec.ts` is `it.each` over the full 29-permission x 5-role cross-product |
| Safety Net for modified files | PASS | Every modified shipped port/adapter (`InspectableElementRepository`, both assignment repos, `ReviewTemplateRepository`) kept its existing suite green — proven by the 727/104/271 runs |

**TDD compliance**: 5/6 checks pass. The one gap is artifact retention, not
protocol compliance — the RED/GREEN discipline is independently evidenced by
the test files themselves and by the per-PR fresh-context reviews recorded in
the session history.

### Assertion Quality Audit

Scanned every test file created or modified by this change (the review-session
API module, `review-session.e2e-spec.ts`, the 4 web page test files,
`error-messages`/`answer-value-labels`, both assignment-repo specs, the scope
checker spec, `role-permission.checker.spec.ts`).

| Banned pattern | Found |
|---|---|
| Tautologies | 0 |
| Assertions with no production-code call | 0 |
| Ghost loops (assertions over a possibly-empty collection) | 0 — the only loop-driven assertion iterates a 29-element literal array that cannot be empty |
| Orphan empty-collection assertions | 0 — the two empty-array assertions in the scope matrix each sit beside a companion test asserting a populated result |
| Type-only assertions used alone | 0 — both `not.toBeNull()` occurrences are immediately followed by value assertions on the same object |
| Smoke-test-only (render + toBeInTheDocument, no behaviour) | 0 — every web page test asserts navigation, message identity, request payload or preserved state |
| Implementation-detail coupling (CSS classes, mock call counts as the assertion) | 0 |
| Mock-heavy files (mocks > 2x assertions) | 0 |

**Assertion quality**: all assertions verify real behaviour.

Two assertions are worth calling out as *positively* strong:
`review-session.e2e-spec.ts:652` deep-equals the **entire response body**
across four distinct rejection causes (not just the status), and
`ReviewSessionElementPage.test.tsx:59` asserts the identical rendered string
across three distinct rejection causes — exactly what the indistinguishability
requirements demand, and neither could pass by accident.

### Test Layer Distribution

| Layer | Tests | Files | Tool |
|---|---|---|---|
| Unit (API) | 727 | 102 | Jest |
| Integration (API, real Postgres) | 104 | 19 | Jest + Prisma |
| E2E (API, real HTTP) | 271 | 9 | Jest + Supertest |
| Unit/Component (web) | 636 | 45 | Vitest + Testing Library |
| **Total** | **1738** | **175** | |

Every spec scenario that can be exercised end-to-end is covered at the E2E
layer, not only at the unit layer — `review-session.e2e-spec.ts` alone carries
21 tests across 8 describe blocks mapped 1:1 to tasks 6.3-6.11.

### Changed File Coverage

`npm run test:cov --workspace=apps/api` (unit config only — it excludes
`*.integration.spec.ts` and the e2e project by design).

| File | Line % | Branch % | Rating |
|---|---|---|---|
| `review-session/domain/**` (all) | 100 | 100 | Excellent |
| `review-session/domain/errors/**` | 100 | 100 | Excellent |
| `review-session/application/services/**` | 100 | 100 | Excellent |
| `review-session/application/ports/**` | 100 | 100 | Excellent |
| `review-session/application/use-cases/**` | 97.19 | 81.35 | Excellent |
| `open-review-session.use-case.ts` | 100 | 100 | Excellent |
| `complete-review-session.use-case.ts` | 93.10 | 70 | Acceptable (L70, L98 — two defensive-branch throws) |
| `discard-review-session.use-case.ts` | 91.66 | 66.66 | Acceptable (L34) |
| `assignment-community-scope.checker.ts` | 100 | 100 | Excellent |
| `community-scope.checker.port.ts` | 100 | 100 | Excellent |
| `review-session.module.ts` | 100 | 100 | Excellent |
| `presentation/review-session.controller.ts` | 79.12 | 72.09 | Understated — see S-4 |
| `infrastructure/persistence/prisma-review-session.repository.ts` | 13.51 | 6.12 | Understated — see S-4 |
| `infrastructure/persistence/review-session.mapper.ts` | 36.36 | 0 | Understated — see S-4 |

The three low numbers are an artifact of the coverage command's scope, not a
real gap: the Prisma adapter is exercised by a 503-line
`prisma-review-session.repository.integration.spec.ts` against real Postgres,
and the controller by all 21 review-session E2E tests — neither is included in
`test:cov`. Domain and application layers, where this slice's behaviour
actually lives, are at 100%.

---

## Spec Compliance Matrix

Six delta specs, 40 requirements, ~150 scenarios. Reported per requirement;
every non-COMPLIANT row is expanded in *Issues Found*.

### `review-session-management` (new capability, 13 requirements)

| Requirement | Evidence | Result |
|---|---|---|
| Open a Review Session Against a Community and a Specific Template | `open-review-session.use-case.spec.ts`; e2e "Full lifecycle"; caller names `templateId`, gated by `findById` + `status === 'active'`; the session carries no `elementType`/`frequency` column at all (schema.prisma:338) so derivation is structural | COMPLIANT |
| At Most One Open Draft Per Community, Template and User | Hand-written partial unique index `ReviewSession_open_draft_key ... WHERE status='draft'`; P2002 -> `OpenDraftAlreadyExistsError`; concurrency proven by the open-draft race integration test (task 4.12) | COMPLIANT |
| Only the Opener May Resume a Draft Session | `findByIdForPerformer(id, performedById)` — the port exposes **no** `findById(id)`; e2e scope matrix asserts 404 for another performer; no handover operation exists anywhere in the module | COMPLIANT |
| Discard a Draft Session | `discardDraft` hard delete `WHERE status='draft'`; e2e "Discard cascade" proves the freed pair by re-opening the identical triple successfully | COMPLIANT |
| Resolve an Element by Code Within the Session's Scope | `resolve-element-by-code.use-case.ts` + `findReviewableByCode(communityId, elementType, code)`; e2e lifecycle | COMPLIANT |
| Rejected Codes Are Indistinguishable | e2e task 6.5 deep-equals the **full body** for unknown / foreign-community / decommissioned / soft-deleted; unit spec covers the same four | PARTIAL — wrong-element-type case untestable today (W-2) |
| Sessions Render the Template's Frozen Snapshot | e2e task 6.6: live-pool edit then soft-delete, rendered wording unchanged; `findFrozenWithSnapshot` is the only read path in all three consuming use cases | PARTIAL — post-completion readback not directly asserted (W-3) |
| Record an Element's Answers | `record-entry.use-case.spec.ts`; exact-set match against the frozen snapshot (both under- and over-supply collapse to `ANSWERS_DO_NOT_MATCH_TEMPLATE`); `@@unique([reviewSessionId, inspectableElementId])` + aggregate-level upsert prove re-record-not-duplicate; Zod rejects out-of-range values | COMPLIANT |
| An Unreviewed Element Requires a Recorded Reason | `ElementReviewEntry.unreviewed()` throws `MissingObservationsError` on empty/whitespace (unit); Zod XOR at the wire; Postgres CHECK backstop; e2e lifecycle marks an element unreviewed and reads it back | COMPLIANT |
| Complete a Session With Explained Gaps Only | `complete-review-session.use-case.spec.ts` (8 cases incl. cross-community isolation); `completion-coverage.spec.ts`; e2e task 6.11 both directions | COMPLIANT |
| Completed Sessions Are Immutable | `review-session.entity.spec.ts` `it.each` x 4 methods x 2 statuses; e2e 6.7 (403 permission gate) **and** 6.8 (409 domain guard as the session's own performer) — the non-vacuous pair the design's 2026-09-06 correction demanded | COMPLIANT |
| Review Records Carry No Deletion Path | `review-session-migration.integration.spec.ts` asserts no `deletedAt` on the three tables against real Postgres; the port exposes no delete for entries/answers | COMPLIANT |
| Adjacent Review Capabilities Are Not Introduced | e2e task 6.10 (4 tests): symbol and route-decorator scan for scheduling/reminder/export/history across API **and** web, plus a live query proving the Postgres `ReviewSessionStatus` enum declares no `signed` | COMPLIANT |

### `authorization` (4 ADDED, 4 MODIFIED)

| Requirement | Evidence | Result |
|---|---|---|
| Permission Check on Review Session Endpoints | All 8 routes carry `@RequirePermission` (read line-by-line in `review-session.controller.ts`); e2e asserts 401-before-403 ordering | COMPLIANT |
| Technician and Representative Become Operational | `role-permission.checker.spec.ts` cross-product: both roles hold the identical 5 `reviewSession:*` and **nothing else**; `SYSTEM_ADMIN` explicitly denied all 5; `MANAGER`/`MAINTENANCE_COMPANY_MANAGER` empty; the `Record<Role, Permission[]>` is still exhaustive; `can(role, permission)` signature unchanged | COMPLIANT |
| Resource Scope — an Active Assignment Is Required Beyond the Permission | The 3-layer design is implemented exactly; `SessionAccessService` is the only session load path (the port has no `findById`); the e2e scope matrix hits all 8 routes | PARTIAL on 2 of 8 routes — S-3 |
| Assignments Confer No Permission Outside the Review-Session Surface | `PermissionsGuard` provably never reads assignment state (reads only `request.user.role`); ROLE_PERMISSIONS cross-product; e2e 403s exist for both roles on `/checklist-questions` and `/communities` | PARTIAL — no runtime test with an **active assignment** present (W-4) |
| Permission Check on Community and Assignment Endpoints (MODIFIED) | `community.e2e-spec.ts` non-admin 403s intact; no non-`SYSTEM_ADMIN` row holds a `community:*` | COMPLIANT |
| Maintenance-Role Permissions Stay Inert (MODIFIED) | `maintenanceCompanyId` appears in no authorization code path; the company association confers no scope (`isAssignedTo` consults only assignment rows) | COMPLIANT |
| Permission Check on Inspectable Element Endpoints (MODIFIED) | Decommission/reactivate reuses `inspectableElement:update`; no new element permission in the `Permission` union | COMPLIANT |
| Non-Admin Roles Remain Inert After the Checklist Permissions Are Added (MODIFIED) | Cross-product test; no `managerCapabilities`/`MANAGE_CHECKLIST_CONTENT` symbol exists | COMPLIANT |

### `inspectable-element-management` (5 ADDED, 1 REMOVED)

| Requirement | Evidence | Result |
|---|---|---|
| Element Active State | `deactivatedAt DateTime?` (schema.prisma:200), `isDeactivated` getter, orthogonal to `deletedAt`; a decommissioned element stays in the admin list and is excluded from sessions only | COMPLIANT |
| Decommission and Reactivate an Element | Existing update path + guard chain; `inspectable-element.e2e-spec.ts` round trip | COMPLIANT |
| Pre-Existing Elements Are Active After the Migration | Nullable `ADD COLUMN` with no default and no backfill (design Decision 3); the migration integration spec asserts `is_nullable='YES'` and zero non-null rows | COMPLIANT |
| Element State Exposed on Element Responses | DTO carries `deactivatedAt`; the list includes decommissioned and excludes soft-deleted | COMPLIANT |
| Resolving an Element by Code Is Always Scope-Constrained | **No `findByCode(code)` exists anywhere** (grep-verified across `apps/api/src`); only `findReviewableByCode(communityId, elementType, code)` and its sibling `findReviewableById` | COMPLIANT |
| *(REMOVED)* Element Lifecycle Filtering Unchanged | Superseded as the delta states; no surviving test asserts that no active-state concept exists | COMPLIANT |

### `inspectable-element-admin-ui` (3 ADDED)

| Requirement | Evidence | Result |
|---|---|---|
| Element State Shown in the List | `CommunityElementsListPage.tsx:113` localized `columnState`; `data-element-state` gives a non-label visual distinction; soft-deleted still excluded | COMPLIANT |
| Decommission and Reactivate Control | `InspectableElementEditPage.tsx` `ConfirmDialog` gates decommission (reactivate deliberately not gated); single-element, no reason, no bulk variant | COMPLIANT |
| Internationalization Coverage for the State Controls | `locales.test.ts` parity; the error mapper branches only on `status`/`code` | COMPLIANT |

### `review-session-ui` (10 requirements)

| Requirement | Evidence | Result |
|---|---|---|
| Role-Gated Route Access for the Field Flow | `App.tsx:285-325` — 4 routes, `allowedRoles={['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']}`, static-before-dynamic ordering; `NotAuthorized`, not a redirect | COMPLIANT |
| Both Non-Admin Roles Have a Reachable Entry Point | `HealthPage.tsx:47` role-conditional link; browser-verified for both roles (task 8.2) | COMPLIANT |
| Open a Session From Assigned Communities Only | `get-review-scope.use-case.ts` merges only **active** assignments and drops soft-deleted communities via `findById`; `ReviewSessionNewPage.test.tsx` covers loading/error/empty | COMPLIANT |
| Manual Code Entry Only | Typed input; trimmed and uppercased before navigation (`ReviewSessionDetailPage.test.tsx:86`); no runtime camera or media-device code anywhere | COMPLIANT (see S-1) |
| Answer an Element's Questions | `ReviewSessionElementPage.test.tsx` — snapshot order, exactly 3 values, save confirmation + continue, and answers preserved on save failure | COMPLIANT |
| Rejected Codes Get One Uniform Message | The server collapses every cause to one `ELEMENT_NOT_FOUND`; `error-messages.ts` adds no re-branching; the test asserts the identical rendered string across 3 causes | COMPLIANT |
| Pause, Resume and Discard a Draft | Reload-survivable routes; `GET /review-sessions` returns only the caller's own drafts; discard behind `ConfirmDialog` with a cancel test | COMPLIANT |
| Complete a Session and Explain Its Gaps | Completion rejected with 409 + `elementCodes`, surfaced as deep links to each element's answer route; a completed session reloads read-only with no mutating control | COMPLIANT |
| Internationalization Coverage | 67 `reviewSession.*` keys present in all of `en`/`es`/`ca`; independently checked for placeholder or English-fallback values — the only 3 identical-to-English values are legitimately identical words ("No" in es/ca, "Element {{code}}" in ca) | COMPLIANT |
| No Offline, History or Scheduling Surface | Grep for serviceWorker / workbox / indexedDB / localStorage / caches.open / registerSW across `apps/web/src` and `vite.config.ts`: **zero hits** | COMPLIANT |

### `review-template-management` (3 ADDED, 1 REMOVED)

| Requirement | Evidence | Result |
|---|---|---|
| Resolve the Currently Active Template for an Element Type | `findActiveByElementType(elementType): Promise<ReviewTemplate[]>` — returns a **list**, never disambiguating across frequency lineages; `in-memory-review-template.repository.spec.ts` covers active-only, drafts/retired excluded, soft-deleted excluded, absence reported | COMPLIANT |
| Session Consumption Reads the Frozen Snapshot | `findFrozenWithSnapshot` is the sole read path in all three consuming use cases; e2e task 6.6 | COMPLIANT |
| Template Authoring Is Unchanged by Session Consumption | No new status, no new write path; `soft-delete-draft-review-template.use-case.spec.ts` still rejects soft-deleting an `active` template with 409 | COMPLIANT |
| *(REMOVED)* No Review Session Surface | Superseded by this change, as the delta states | COMPLIANT |

**Compliance summary**: 40/40 requirements implemented. 36 fully COMPLIANT
with passing runtime evidence, 4 PARTIAL (detailed below). 0 FAILING,
0 UNTESTED.

---

## Coherence (Design)

All 11 numbered decisions verified against source.

| Decision | Followed? | Evidence |
|---|---|---|
| 1 — `observations` on `ElementReviewEntry`, entry is answers XOR observations | Yes | Private constructor + `reviewed()`/`unreviewed()` factories; the both-populated state is genuinely unconstructible. All three enforcement layers present: domain factory, Zod XOR at the wire, Postgres btrim CHECK |
| 2 — unreviewed is a **stored** entry; completion requires total entry coverage | Yes | `computeUncoveredElements(activeElements, session.entries)`; the required set is evaluated at completion time; 409 `UNREVIEWED_ELEMENTS_WITHOUT_REASON` carries the offending codes |
| 3 — `deactivatedAt DateTime?`, orthogonal to `deletedAt`, no backfill | Yes | The migration is a single nullable `ADD COLUMN` with no default; the eligibility predicate `deletedAt IS NULL AND deactivatedAt IS NULL` appears in exactly the repository methods Decision 6 names; reuses `inspectableElement:update` |
| 4 — scope check is 3 composable layers; `SessionAccess` owns the only session read path | Yes | `PermissionsGuard` untouched; `CommunityScopeChecker` port in `shared/`, adapter in `community/`; `SessionAccessService.loadForActor` is the only sessionId-to-aggregate path and the port exposes no `findById`. Both failure causes collapse to the same `ReviewSessionNotFoundError`. The full 9-row rejection matrix matches the shipped controller mapping exactly |
| 4 (2026-09-07 correction) — soft-deleted-community gap | Yes | `open-review-session.use-case.ts:78` runs `communityRepository.findById` **before** `isAssignedTo`, both collapsing to 403 `COMMUNITY_NOT_IN_SCOPE`; `isAssignedTo` itself left single-responsibility as decided |
| 5 — `findActiveByUser` on both assignment ports; the scope check adds no method | Yes | Both ports gained it, both adapters and fakes implement it, `countActiveByUser` untouched; the per-request check still uses the pre-existing `findByCommunityAndUser` |
| 6 — one by-code method, scope in the signature, one return path | Yes | `findReviewableByCode` only; **no `findByCode(code)` exists in the codebase**; `communityId`/`elementType` are read off the loaded aggregate and frozen template, never off the request; one null, one error, one coded response |
| 7 — the session stores `templateId` only; that FK *is* the version | Yes | No `templateVersion` column and no `elementType` column on `ReviewSession`; every consumer re-derives `elementType` from `findFrozenWithSnapshot` |
| 8 — `ReviewSessionStatus` is draft/completed; immutability on the aggregate root | Yes | The enum declares two values in TS, Prisma and Zod (3-way parity integration spec); the aggregate guards all four mutators; the repository has no `updateById` and no status setter; `complete`/`discardDraft`/`upsertEntry` each carry `WHERE status='draft'` |
| 9 — plain fields and pure functions, no Value Objects | Yes | Every field is a plain `readonly`; the three-way enum seam is in place |
| 10 — flat `/review-sessions` API + 4 reload-survivable web routes | Yes | All 8 routes present with the exact methods, paths and permissions the table specifies; `/review-scope` is a separate top-level path as designed; 4 web routes, one `LoadState` each |
| 11 — the frozen question set is fetched per element, one round trip | Yes | `GET .../elements/:code` returns element + questions + entry; `GET /review-sessions/:sessionId` returns entries and coverage counts and **no** question set |

### Design deviations (all documented, all improvements)

| Deviation | Assessment |
|---|---|
| `InspectableElementRepository.findReviewableById` added (not in the design's File Changes) | Accept — closes the PR5 fresh-context review's CRITICAL cross-community write bug on `PUT .../entries/:elementId`; mirrors `findReviewableByCode`'s collapsing WHERE one-for-one |
| `InspectableElementRepository.findActiveByCommunityAndType` added | Accept — Decision 2's required set needs it; documented in task 6.1 |
| Zod `z.union` of two strict objects instead of a literal `z.discriminatedUnion` | Accept — the wire body has no discriminator field and Decision 1 rejected adding one; the XOR guarantee is identical and is covered by `review-session.schema.spec.ts` |
| `upsertEntry` returns a boolean with its own `WHERE status='draft'` | Accept — PR6 review finding M1; a genuine concurrency backstop the design's void signature lacked |
| `buildCodedError` gained an optional 4th `extra` parameter | Accept — additive, RED/GREEN-covered, needed for the 409 `elementCodes` body the design itself specifies |
| `open-review-session` validates the named `templateId` via `findById` + status check rather than re-checking membership of `findActiveByElementType`'s result | Accept — semantically equivalent and cheaper; the rejection is identical (404 `ACTIVE_TEMPLATE_NOT_FOUND`) for unknown, draft and retired ids alike |

### Design "Open Questions" — status

| Question | Status |
|---|---|
| ADR-011 addendum | **Still open — EXPECTED.** Explicitly postponed by the user and recorded in tasks.md *Deferred / Follow-up*. **Not** a verification defect. See S-5 |
| `GET /review-sessions` returns drafts only — "confirm during sdd-verify's scope-guard check" | **CONFIRMED CORRECT.** `findDraftsByPerformer` is the only list query; no cross-session, per-element or per-community history query, route or page exists (e2e 6.10 asserts this against both API and web). Completed sessions remain individually readable by their own performer via `GET /review-sessions/:sessionId`, which is resume/read-back, not history |
| The completion rejection body volunteers uncovered element codes | **CONFIRMED ACCEPTABLE.** The disclosure is strictly within scope: the caller is an actively-assigned performer of that community and could already enumerate exactly those codes by walking the session. It leaks nothing across a community boundary, and Decision 2's own rationale ("the UI can navigate to them") is realised by task 7.7's deep links |

---

## Scope-Guard Verification (proposal *Success Criteria*)

| Guard | Result |
|---|---|
| No review-history route, page, use case or repository query (FR-008) | Verified by e2e 6.10 plus independent grep |
| No scheduling, due-date, overdue or reminder logic (FR-009) | Zero hits for dueDate / overdue / reminder / cadence / schedul* across the module and the web flow |
| No code path transitions a session to `signed`; no export or document generation (FR-010) | `signed` is absent from the TS union, the Prisma enum (asserted live against Postgres) and the Zod schema. Zero pdf / export / generateDocument symbols |
| No camera/scanner dependency, no offline storage, no service worker, no sync logic | Holds for runtime; see S-1 for a wording nit about a pre-existing test-only devDependency |
| No `deletedAt` on any of the three new tables | Asserted against real Postgres in `review-session-migration.integration.spec.ts` |
| `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` remain empty | Cross-product unit test |
| `SYSTEM_ADMIN`'s permissions unchanged; the table stays exhaustive | Explicit "denies SYSTEM_ADMIN on every reviewSession:*" test; the `Record<Role, Permission[]>` shape is unchanged |
| Hand-written FKs and indexes survive the migrations | `pg_indexes`/`pg_constraint` integration spec: 6 FKs (2 with ON DELETE CASCADE), the partial unique draft index, the observations CHECK, plus the 12 pre-existing hand-written objects |
| `domain-model-inspections.md` no longer describes `CommunityMaintenanceAssignment` as the scoping mechanism | Corrected under an explicit "correction, review-session PR 8" heading; `deactivatedAt` and the `observations` placement are both documented |

---

## Issues Found

### CRITICAL

**None.**

### WARNING

**W-1 — The TDD Cycle Evidence table is unrecoverable from `apply-progress`.**
The Engram topic `sdd/review-session/apply-progress` (#198) went through 28
`topic_key` upserts and its final revision is a one-paragraph chain-complete
note. Its own header asserts "Full PR1-8 history preserved verbatim from prior
revisions" — that is not true; the upsert overwrote it. Strict-TDD
verification of the RED / GREEN / TRIANGULATE / SAFETY-NET columns therefore
had to be reconstructed from the test files and from tasks.md's per-task
annotations instead of read from the report.
*Assessment*: this is an **artifact-retention** failure, not a TDD-compliance
failure. Everything the table would have claimed is independently
corroborated: every RED/GREEN task has a spec file, all 1738 tests pass, and
the triangulation is visible as `it.each`/`describe.each` tables in the
sources. Recorded so the next slice fixes the retention pattern (append a
revision, or use per-PR topic keys), not because the discipline lapsed.

**W-2 — "A wrong-element-type code behaves exactly like a nonsense code" has
no covering test at any layer.** `ElementType` currently declares only
`EXTINGUISHER` (`inspectable-element/design.md` Decision 1), so the fixture is
unconstructible — there is no second element type to build it from. Tasks 5.1
and 6.5 both document this honestly. The mechanism *is* present and was
inspected: `elementType` is a required predicate in the single WHERE of both
`findReviewableByCode` and its in-memory fake, so a wrong-type code collapses
to the same null as every other cause.
*Action*: this scenario becomes constructible — and MUST be added — the moment
a second `ElementType` ships. Worth carrying into that slice's tasks.md rather
than losing it here.

**W-3 — "A completed session reads back as it was answered" is not directly
asserted.** The e2e frozen-snapshot test (task 6.6) exercises a **draft**
session only. No test edits the live pool, completes the session, and then
reads the answers back paired with their snapshotted wording.
*Assessment*: the inference is sound — `SessionAccessService.loadForActor` is
status-agnostic, so `GET .../elements/:code` returns the same
`findFrozenWithSnapshot` payload for a completed session as for a draft, and
`findFrozenWithSnapshot` filters status IN ('active','retired') so a retired
template still serves. But "sound inference" is not the runtime evidence this
spec's own wording ("including after it is completed") asks for.
*Action*: a roughly 10-line addition to the existing task 6.6 describe block
would close it. Cheap; recommended as follow-up, not a blocker.

**W-4 — "Assignments Confer No Permission Outside the Review-Session Surface"
has no runtime test with an active assignment in place.** Both scenarios
specify a technician/representative who **is** actively assigned to community
C and must still get 403 on `/users`, `/communities`,
`/maintenance-companies`, `/checklist-questions`, `/review-templates` and the
inspectable-element admin endpoints "including ones concerning C". The
existing e2e 403s for those roles (`checklist-question.e2e-spec.ts`,
`community.e2e-spec.ts`) seed the roles **without** an assignment.
*Assessment*: low real risk. `PermissionsGuard` reads only
`request.user.role` and has no access to assignment state at all, so an
assignment cannot influence the decision by construction, and the
ROLE_PERMISSIONS cross-product test proves neither role holds any
non-`reviewSession:*` permission. The gap is that the *combination* is never
exercised end-to-end.
*Action*: one e2e block seeding an assigned technician and asserting 403
across the six admin surfaces would close it definitively.

### SUGGESTION

**S-1 — Task 8.4's claim "no `apps/web` camera/scanner dependency" is
imprecise.** `apps/web` carries `jsqr` as a **devDependency**. It is a QR
*decoder*, it predates this change (added by `label-printing` PR 5/7,
`17894d6`), and its only consumer is `ElementQrCode.test.tsx`, which decodes a
rendered canvas to assert the QR's *output*. No runtime code imports it and
nothing in the app requests camera or media-device permission — the spec's
actual requirement ("no camera capture, no media-device permission prompt")
holds. Only the task's blanket wording overstates. Recommend rewording, not
removing.

**S-2 — `GET /review-scope` and `CommunityScopeChecker` disagree on an edge
case.** `get-review-scope.use-case.ts` merges *both* technician and
representative assignments for the user regardless of role, while
`AssignmentCommunityScopeChecker.isAssignedTo` dispatches strictly on the
caller's role. A user whose role is `MAINTENANCE_TECHNICIAN` but who also
holds a representative assignment row would see that community **offered** in
the scope list and then get 403 `COMMUNITY_NOT_IN_SCOPE` on open. It fails
closed, has no security impact, and is probably unreachable given the
role-drift guards on assignment reactivation — but it is confusing UX if it
ever occurs. Either filter the scope list by role, or document the merge as
deliberate.

**S-3 — The 8-route scope matrix asserts a rejection on 6 routes and an empty
result set on 2.** `GET /review-scope` and `GET /review-sessions` are
self-scoped (they name no third-party resource), so task 6.4 asserts an empty
payload rather than a 403/404, documented inline as a judgment call. The
substance of the requirement — "holding a permission grants nothing on a
community you are not assigned to" — is fully proven for both. Flagged only
because the spec's wording is "each endpoint individually MUST refuse", which
an empty 200 satisfies in spirit but not literally. No code change
recommended; consider tightening the spec's wording at archive time instead.

**S-4 — `npm run test:cov` understates changed-file coverage.** The coverage
command runs the unit Jest project only, so `prisma-review-session.repository.ts`
reports 13.5% and the controller 79% despite being covered by a 503-line
integration spec and 21 E2E tests. Consider a combined coverage run (or a
documented note) so future verifications do not misread these numbers as a
real gap.

**S-5 — The ADR-011 addendum remains unwritten.** Expected and explicitly
deferred by the user, so **not** counted against this change. Now that the
whole feature has shipped, the trigger condition the design named ("after PR 2
ships") is long past. Recommend resurfacing it immediately after
`sdd-archive`, including its stated second job: correcting ADR-011's own stale
reference to ADR-005's `CommunityMaintenanceAssignment` model — the same drift
this change just corrected in `domain-model-inspections.md`.

---

## Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 4 WARNING, 5 SUGGESTION.

The implementation matches its specs, its design and its tasks. The three
genuinely novel mechanisms this slice carried — resource-scoped authorization,
non-leaking by-code resolution, and completed-session immutability — are each
enforced **structurally** (a property of a port signature, or an
unconstructible domain state) rather than by per-caller discipline, exactly as
the design argued they should be, and each is proven at the E2E layer with
non-vacuous assertions. All four warnings concern missing or unrecoverable
*evidence*, not incorrect *behaviour*; none of them describes a defect a user
could hit.

**Ready for `sdd-archive`.**
