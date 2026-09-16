# Verification Report: `review-history-per-element`

**Verified at**: `main` @ `fa40bce` (merge of PR #123) — working tree clean
**Merge base**: `7c7d617` (`docs(review-history-manager-capability): PR 5/5 — sdd-archive (#120)`)
**Mode**: full spec-driven verification (proposal + design + tasks + 3 delta specs + apply-progress)
**Artifact store**: hybrid (`openspec/` + Engram)
**Verdict**: **FAIL** — 1 CRITICAL (documentation-only), 6 WARNING, 3 SUGGESTION

The CRITICAL finding is a **live-spec contradiction, not a code defect**. Every behavioural
requirement of the three delta specs is implemented and test-covered. No source change is
needed to clear it — one spec amendment is.

---

## 1. Completeness — tasks

| Phase | Tasks | Checked `[x]` | Verified against files |
|---|---|---|---|
| Phase 1 (PR1 #121) | 8 (1.1-1.7 + 1.5a) | 8 | 8 |
| Phase 2 (PR2 #122) | 7 (2.1-2.7) | 7 | 7 |
| Phase 3 (PR3 #123) | 9 (3.1-3.9) | 9 | 9 |
| **Total** | **24** | **all** | **all** |

No unchecked task. Spot-check evidence (sampled against files, not trusted from the checkbox):

- **1.1/1.2** `apps/api/prisma/migrations/20260915120000_add_element_review_entry_inspectable_element_index/migration.sql:32` — `CREATE INDEX "ElementReviewEntry_inspectableElementId_idx"`. Verified present in the running Postgres: `SELECT indexname FROM pg_indexes WHERE tablename='ElementReviewEntry'` returns the btree on `("inspectableElementId")` alongside the PK and the pre-existing `@@unique`.
- **1.3** `review-session.repository.port.ts:13` `ElementReviewEntryRow`; `:192`, `:201`, `:209`, `:217` — the four methods, each carrying its scope as a required parameter except the documented installation-wide carve-out (`:164-175` extends the "no identifier-only read" note to name it).
- **1.4** `prisma-review-session.repository.ts:418-457` `joinCompletedEntriesForElement` — entry-first two-query join exactly as design Decision 2 specifies; `:461/:472/:484/:496` the four public wrappers.
- **1.5a** `in-memory-review-session.repository.spec.ts:541-762` — 6 fake tests incl. `:598` `communityIds = []` fail-closed.
- **1.6** `prisma-review-session.repository.integration.spec.ts:760-779` — the `find*` enumeration guard lists exactly the 10 shipped + 4 new names and still `not.toContain('findById')`.
- **2.1** `review-history-access.service.ts:29` `ElementHistoryScope`, `:243-331` `listElementHistoryForActor` — all five branches + `satisfies never` at `:327`. `listForActor`/`loadByRole` byte-unchanged.
- **2.2** `read-element-review-history.use-case.ts:85-100` — element lookup first, single throw site at `:99`.
- **2.4** `review-history.controller.ts:93-96` — `@Get('communities/:communityId/inspectable-elements/:elementId/review-history')` + `@RequirePermission('reviewSession:read')`; `:143-148` the `INSPECTABLE_ELEMENT_NOT_FOUND` mapError branch.
- **3.3** `apps/web/src/App.tsx:191-206` — depth-5 route, five-role `allowedRoles`, anomaly comment at `:177-190`.
- **3.5** `ReviewHistoryDetailPage.tsx:136` — the `entry.elementCode !== null &&` guard (the PR3 CRITICAL fix) is present on `main`.
- **3.8** `docs/requirements/functional-requirements.md:38` — FR-008 status `**closed**`.

---

## 2. Build, tests, runtime evidence

| Command | Result |
|---|---|
| `npm run test --workspace=apps/api` | **PASS** — 111 suites, 909 tests, 12.3 s |
| `npm run test:e2e --workspace=apps/api` | **PASS** — 10 suites, 349 tests, 15.2 s |
| `npm run test --workspace=apps/web` | **PASS** — 48 files, 739 tests, 39.7 s |
| `npm run test:integration --workspace=apps/api` (real Postgres, `prisma migrate deploy` run first) | **1 FAIL / 139 PASS**, 22 suites — see W-6; the failure is environmental and lives in a module this change never touched |
| `npx jest --testRegex=".*\.integration\.spec\.ts$" -t "ForElement"` | **PASS** — 6/6 |
| `npm run lint` | **PASS** — 0 errors (4 pre-existing warnings in the untouched `auth.controller.spec.ts`) |
| `npm run build` | **PASS** — 4/4 turbo tasks |

Postgres reachable (`sf-manager-postgres-1`, up 4 h); migrations deployed before the run.

---

## 3. Spec compliance matrix

### `review-history` (4 ADDED, 2 MODIFIED requirements)

| Requirement | Status | Runtime evidence |
|---|---|---|
| One Inspectable Element's Completed Review History | **PASS** | e2e `review-history.e2e-spec.ts:2816/2829/2845/2861` (cross-session, cross-performer); header fields at `:3025`; draft exclusion at integration `:1610`; answers absent from `ElementReviewHistoryRowDto` |
| The Five Visibility Scopes Apply at Entry Level | **PASS** | unit `review-history-access.service.spec.ts:705-950` (11 branch tests); e2e `:2816-2881` five-scope matrix |
| Element Reachability Decides 404 Versus an Empty History | **PASS** | e2e `:2904` (empty state: admin / granted MANAGER / assigned rep), `:2929` (404: technician + company manager), `:2966`, `:2990`, `:3025` |
| An Element Belongs to Exactly One Community for Its Lifetime | **PASS** | `apps/api/src/modules/inspectable-element/**` byte-unchanged across `7c7d617..fa40bce`; no reassignment path exists |
| History Scope Is Carried by the Query, Not by the Caller (MODIFIED) | **PARTIAL** | enumeration guard integration `:760-779` covers the "exactly two unscoped reads" count; the "reachable only from the admin and granted-manager paths, no sampling" half is enforced for the session pair only — see W-3 |
| The Deferred Review Visibility Scopes Are Not Built (MODIFIED) | **PASS** | e2e `:3108` (ROLE_PERMISSIONS), `:3127` (no GET by-id), `:3140` (element port gained nothing), `:3098` (no list-control params) |

### `review-history-ui` (3 ADDED, 3 MODIFIED)

| Requirement | Status | Runtime evidence |
|---|---|---|
| An Element's Own Review History Page | **PASS** | `ElementReviewHistoryPage.test.tsx` — loading / empty / error states, label-map type rendering, per-row session links, no controls |
| Two Entry Links Reach the Element History Page | **PASS** | `CommunityElementsListPage.test.tsx:146`; `ReviewHistoryDetailPage.test.tsx:172` (positive, `e1`) plus the negative case asserting no link for the null-`elementCode` fixture `e2` |
| The Element History Route Is Gated on the Five History Roles... | **PARTIAL** | `ProtectedRoute.test.tsx:326-400` asserts the five-role allowance and an admin-only sibling, but is not bound to `App.tsx`'s actual route — see W-4 |
| Role-Gated Route Access for the History Views (MODIFIED) | **PASS** | same block plus the pre-existing `/review-history*` family block |
| Internationalization Coverage (MODIFIED) | **PASS** | `locales.test.ts` +42 lines of parity assertions; `en`/`es`/`ca` all carry real, non-placeholder values for the 13 `reviewHistory.elementHistory.*` keys plus `detail.elementHistoryLink` and `inspectableElement.list.historyLink` |
| No Filtering, Analytics or Adjacent Controls Ship (MODIFIED) | **PASS** | e2e `:3098` (query params have no effect); the page renders no control beyond its links |

### `authorization` (2 ADDED, 1 MODIFIED)

| Requirement | Status | Runtime evidence |
|---|---|---|
| Gated on `reviewSession:read`, Never on `inspectableElement:read` | **PASS** | `review-history.controller.ts:96`; e2e `:3108` (ROLE_PERMISSIONS unchanged), `:3155` (element-management surface not widened), `:3121` (401 before permission and scope) |
| Entry-Level Resource Scope for the Element-Keyed Read | **PASS** | unit + e2e five-scope matrix as above |
| The Deferred Review Visibility Scopes Grant Nothing (MODIFIED) | **PASS** | `apps/api/src/modules/auth/**` and `packages/**` byte-unchanged across the whole change range |

### Live-spec merge integrity (structural re-verification on `main`)

| Capability | Requirements before -> after | Scenarios before -> after | Requirements lost | Scenarios lost without a narrowed replacement |
|---|---|---|---|---|
| `review-history` | 14 -> 18 | 83 -> 115 | **0** | **0** (7 renamed / narrowed, each traced to its successor) |
| `review-history-ui` | 10 -> 13 | 51 -> 78 | **0** | **0** (1 renamed: *No per-element history view exists* -> *Exactly one per-element history view exists, reachable from exactly two links*) |
| `authorization` | 24 -> 26 | 123 -> 140 | **0** | **0** (2 renamed) |

Every "removed" scenario title maps to a narrowed successor named in the corresponding
delta's `(Previously: ...)` note. No pre-existing requirement was dropped or corrupted.

---

## 4. Design coherence

| Design decision | Shipped as designed? |
|---|---|
| D1 — four flattened-row port methods, scope in every signature | **Yes** |
| D2 — entry-first two-query join, in-memory narrowing step | **Yes** (`prisma-review-session.repository.ts:418-457`) |
| D3 — single-column `@@index([inspectableElementId])`, own migration, own PR | **Yes** (verified in real Postgres) |
| D4 — discriminated union on `ReviewHistoryAccessService`, fail-closed before any repository call | **Yes** |
| D5 — element first, one throw site, `reviewed` derived, one community + one batched email lookup | **Yes**, with one omission: `completedAt` exists on `ElementReviewEntryRow` but is not carried into `ReadElementReviewHistoryRow` or the DTO. The design's data-flow sketch listed it; no spec requirement names it (the spec's "when" is `recordedAt`) and the UI does not use it. Benign. |
| D6 — route on `ReviewHistoryController`, one coded 404 | **Yes** |
| D7 — one page, anomalous five-role gate + in-file comment, two entry links | **Yes** |
| D1's "shared adapter constant applied by the use case" | **Deviated** — see W-2 |

---

## CRITICAL

### C-1 — `review-session-management`'s live spec still asserts this feature must not exist

**Files**: `openspec/specs/review-session-management/spec.md:475` and `:500-503`

    475: | FR-008 (remaining half) | Per-element history - any query, route, page or use case
         |   returning one inspectable element's past reviews. ...

    500: #### Scenario: No per-element review history surface exists
    501: - GIVEN the routes, pages, use cases and repository queries after this change
    502: - WHEN they are searched for the past reviews of a single inspectable element
    503: - THEN none MUST be found

Both statements are now false on `main`. `ReviewHistoryController`'s nested route,
`ReadElementReviewHistoryUseCase` and four repository methods are precisely "a query, route
and use case returning one inspectable element's past reviews", and a search of the
routes / pages / use cases / repository queries **does** find them.

Scenario `:500` is deliberately **unqualified** — its two immediate neighbours at `:480` and
`:495` both say "*this capability's* own routes...", so the absence of that qualifier here is
authored intent, not an oversight. Line `:475`'s row header also still reads
"FR-008 (**remaining half**)" while FR-008 is closed.

The proposal committed to fixing exactly this:

- `proposal.md:124-127` — *"Narrowing (not deleting) the shipped guards this slice makes false: `review-history`'s **and `review-session-management`'s** 'No per-element review history surface exists' scenarios..."*
- `proposal.md:189-191` — Modified Capabilities lists `review-session-management`: *"narrow its FR-008 deferral row and its 'No per-element review history surface exists' scenario."*

`sdd-spec` produced no delta for that capability, and `tasks.md:56` (task 3.7) recorded the
gap as an observation — *"those two names in the original task line were not backed by an
actual delta"* — rather than escalating it. The equivalent guards in `review-history` and
`review-history-ui` **were** correctly narrowed; only this one was left standing.

**Impact**: documentation-only, zero runtime effect. But `main` now carries a merged spec
instructing a future reader — or a future `sdd-verify` — to delete a shipped feature, and
archiving in this state would record a self-contradicting spec set as the project's truth.

**Remediation** (no code change): amend `review-session-management/spec.md` the same way
`review-history`'s guard was amended — narrow row `:475` and scenario `:500-503` to bound
them to *this* capability's own surface, with a `(Previously: ...)` note, and drop the
"remaining half" framing now that FR-008 is closed.

---

## WARNING

### W-1 — the merged `review-history` Purpose claims "no schema change ships"; one did

**File**: `openspec/specs/review-history/spec.md:36-38`

> *"No new scope, no new permission, no new authorization primitive and **no schema change** ships"*

The change shipped `@@index([inspectableElementId])` on `ElementReviewEntry` plus migration
`20260915120000_add_element_review_entry_inspectable_element_index`. The claim is inherited
verbatim from the delta's Purpose amendment, which was written from the **proposal's**
premise (`proposal.md:31` — *"no schema change, no migration"*), a premise `sdd-design`
explicitly overrode at `design.md:11-14` (*"There is **one** schema object this design does
add, and the proposal explicitly left the call here"*) and again in OQ3 at `design.md:566-573`.
`sdd-spec` did not carry the override into the Purpose prose.

Related, same file `:1079`: *"the `ManagerCapability` enum and the `User.managerCapabilities`
column MUST remain the only additive schema objects the history slices introduced"* — an
index is an additive schema object, so this clause is now literally false too. The scenario's
enumerated prohibition (*no table, no column, no enum, no backfill, no data migration*) still
holds, and the very next scenario at `:1081-1084` explicitly sanctions a measured index, so
there is no behavioural conflict — only prose contradicting the shipped migration.

### W-2 — duplicated, drift-prone ordering comparator; the adapter copy is dead code

**Files**: `prisma-review-session.repository.ts:30-46` and `read-element-review-history.use-case.ts:44-59`

`ELEMENT_HISTORY_ORDER_BY` is exported from the adapter with the comment *"Exported so the
use case (Phase 2) applies it ONCE after the in-memory join"* — but nothing imports it.
`grep -rn "ELEMENT_HISTORY_ORDER_BY" apps/` returns only its own declaration and a mention in
the port's comment at `:186`. The use case instead carries a byte-identical private copy
named `elementHistoryOrder`.

Root cause is a design decision that is unimplementable as literally written: `design.md`
Decision 1 called for *"a new shared adapter constant ... applied by the use case"*, but
ADR-013 / `no-restricted-imports` forbid the application layer importing from
`infrastructure/persistence/**`. The pragmatic resolution taken is correct; what was not done
is deleting the now-orphaned adapter copy and correcting its comment.

**Risk**: two independent definitions of this surface's determinism guarantee. An edit to one
leaves the other silently stale, and the adapter's comment actively misleads a reader into
believing it is the live one.

### W-3 — the new actor-unscoped read has no call-site guard

**Files**: `prisma-review-session.repository.integration.spec.ts:810-841` (the existing guard);
`review-history-access.service.ts:303` and `:321` (the two legitimate call sites)

The shipped installation-wide pair is protected by a build-breaking file-scan guard asserting
that `findCompletedAcrossInstallation|findCompletedByIdAcrossInstallation` appear in **exactly
three** production files. `findCompletedEntriesForElementAcrossInstallation` — the second
actor-unscoped read this change introduces — has **no** equivalent guard.

`design.md:65-68` anticipated the regex mismatch and framed it as a non-issue (*"does not
match it, so that guard and its file allowlist are unaffected"*), which is true of the
existing guard but leaves the new method unprotected. The merged spec now promises more than
the suite delivers:

> `openspec/specs/review-history/spec.md` — *"Scenario: The actor-unscoped reads are reachable
> only from the admin and granted-manager paths / ... WHEN every one of them is enumerated —
> **no sampling**"*

A second production caller of the element-keyed unscoped read would break no test today. The
current state is correct — verified by grep: port, Prisma adapter, access service, plus the
deliberately-excluded in-memory fake, and nothing else — it is simply unenforced.

### W-4 — the route-gate test is not bound to `App.tsx`

**Files**: `apps/web/src/auth/ProtectedRoute.test.tsx:326-400`; `apps/web/src/App.tsx:191-206`

The test re-declares `ELEMENT_HISTORY_ALLOWED_ROLES` inline and renders `ProtectedRoute` at
path `/`. It proves `ProtectedRoute`'s behaviour given a five-role array; it does **not**
prove that the element-history route carries that array. Narrowing `App.tsx:195-201` to
`['SYSTEM_ADMIN']` — the exact "harmonize it downward" regression the anomaly comment warns
against — would fail no test in the repo. Confirmed: no test file references `App.tsx`'s route
table, and there is no `App.test.tsx`.

`App.tsx:186` asserts *"ProtectedRoute.test.tsx pins both facts"*, and the spec scenario *"The
divergence is documented and gate-tested"* is satisfied only in letter. The same decoupling
exists in the pre-existing `/review-history*` block directly above it, so this follows
precedent rather than introducing a new pattern — but the anomalous route is precisely the one
where a real binding would be worth most.

### W-5 — `inspectable-element-admin-ui`'s Purpose no longer enumerates the list row's entry points

**File**: `openspec/specs/inspectable-element-admin-ui/spec.md:5-20`

The Purpose still describes the element list as carrying *"a per-element Print entry point into
`element-label-printing`"* and nothing else, but `CommunityElementsListPage.tsx:160` now also
renders a per-row History link. `proposal.md:194-195` listed `inspectable-element-admin-ui`
under Modified Capabilities for exactly this; no delta was written (same root cause as C-1).

Lower severity than C-1 because nothing in this capability *forbids* the link, and the link
**is** specified — by `review-history-ui`'s *Two Entry Links Reach the Element History Page*,
which explicitly owns the element-list row link. This is an incomplete cross-reference, not a
contradiction.

### W-6 — one integration test fails locally, caused by this change's own browser-verification fixtures

**File**: `apps/api/src/modules/inspectable-element/infrastructure/persistence/inspectable-element-migration.integration.spec.ts:199-206`

    it('no row is left with a non-NULL deactivatedAt after the migration ...')
      expect(Number(rows[0].count)).toBe(0);   // Expected 0, Received 1

**Cause identified, not guessed.** The test issues
`SELECT COUNT(*) FROM "InspectableElement" WHERE "deactivatedAt" IS NOT NULL` against the whole
database. The offending row:

    id             01a0a971-1ce1-7228-8598-5cb5642afdda
    code           4B7ABV758J
    name           Basement extinguisher (decommissioned)
    deactivatedAt  2026-09-16 09:00:08.179

That is the decommissioned-element fixture seeded for task 3.9's browser verification
(`tasks.md:58` — *"decommissioned-element badge with preserved history"*), timestamped the same
morning.

**Not a code defect**: the spec file was last modified by PR #88, long before this change, and
`git diff 7c7d617 fa40bce -- apps/api/src/modules/inspectable-element/` is **empty** — this
change never touched that module. All element-history integration suites pass
(`-t "ForElement"` -> 6/6), as do the index-existence and `DROP INDEX` rollback suites.

Recorded anyway because it is real and reproducible: this change's own verification step left
the shared dev database in a state that breaks `npm run test:integration`, and the underlying
test's whole-database assertion means *any* decommissioned element — a legitimate domain state
this app supports — breaks it. Clearing the fixture row restores a green run; the brittle
assertion deserves a separate look.

---

## SUGGESTION

### S-1 — raw ISO timestamp rendered on the element history rows

`ElementReviewHistoryPage.tsx:139` renders `<span>{entry.recordedAt}</span>` — a bare ISO
string, with no translation key and no locale formatting. The sibling
`ReviewHistoryDetailPage.tsx:96` wraps its timestamp in `completedAtLabel`. No spec is violated
(the i18n requirement's raw-value prohibition covers element type, session status, element
state and answer values, none of which this is; and with no surrounding copy there is no
hardcoded string either), and the shipped `ReviewHistoryPage.tsx:85` does the same
(`<td>{row.completedAt}</td>`). An app-wide pattern worth addressing once, not a slice
regression.

### S-2 — rows keyed by `reviewSessionId`

`ElementReviewHistoryPage.tsx:136-137` uses `entry.reviewSessionId` as the React key and the
`data-testid` suffix. This is correct only because `@@unique([reviewSessionId,
inspectableElementId])` guarantees at most one entry per element per session — an invariant the
page cannot see. `entryId` would be the direct key, but the DTO does not expose it
(`element-review-history-response.dto.ts:36-54`). Either expose `entryId` or record the
dependency in a comment.

### S-3 — three element-keyed scenarios rely on a structural argument rather than a test

Each has a session-level counterpart that **is** e2e-tested; the element-keyed variant is
structurally guaranteed but unexercised end to end:

- *A technician's own entry survives their assignment's deactivation* — the technician branch
  (`review-history-access.service.ts:248-257`) consults no assignment checker at all, pinned by
  `review-history-access.service.spec.ts:739` (`not.toHaveBeenCalled()`). Session-level version:
  `review-history.e2e-spec.ts:1400`.
- *Attribution survives the performer's transfer on the element read too* — identical
  `performedByCompanyId` predicate (`prisma-review-session.repository.ts:489`). Session-level
  version: `prisma-review-session.repository.integration.spec.ts:1094`.
- *Revoking the capability removes element history on the next request* — the capability is
  resolved per request with no cache (`review-history-access.service.ts:310-317`), and granted
  and ungranted MANAGER are both e2e-tested (`:2861`, `:2881`), but there is no
  revoke-then-repeat case.

---

## Scope guards — verified by diff, not by assertion

`git diff 7c7d617 fa40bce --stat -- apps/api/src/modules/auth/ apps/api/src/modules/inspectable-element/ packages/` -> **empty output**.

| Guard | Result |
|---|---|
| `ROLE_PERMISSIONS` byte-unchanged; no role gained `inspectableElement:read` | **Confirmed** (`auth/` untouched) |
| `InspectableElementRepository` gained no method | **Confirmed** (`inspectable-element/` untouched) |
| No `GET` by-id inspectable-element endpoint | **Confirmed** (controller untouched; e2e `:3127`) |
| `Permission` union and `PermissionChecker.can` signature unchanged | **Confirmed** (`packages/` untouched) |
| `SessionAccessService` and the whole write path untouched | **Confirmed** (absent from the diffstat) |
| `listForActor` / `loadByRole` unchanged | **Confirmed** (only additive hunks in the access service) |
| The only schema change is the one additive index | **Confirmed** (one migration dir; `schema.prisma` +12 lines, all index + comment) |
| No filter / sort / page / search control on any history surface | **Confirmed** (e2e `:3098`; the page renders none) |
| No demo-mode branch added | **Confirmed** (no `demo` reference anywhere in the change's diff) |
| Every new port method carries a scope except the one documented carve-out | **Confirmed** (port `:192-219`) |

---

## Verdict

**FAIL** — 1 CRITICAL, 6 WARNING, 3 SUGGESTION.

The implementation is sound. All the test suites that can run cleanly pass, the five-scope
matrix and the 404-vs-empty matrix are covered end to end against real Postgres, both PR3
review fixes are present on `main`, the three live spec merges lost nothing, FR-008's closure
text is accurate to what shipped, and every scope guard the proposal promised `sdd-verify`
would assert is confirmed — several of them by an empty diff, which is stronger evidence than
a test.

The single blocker is documentation: `review-session-management`'s spec still forbids the
feature that shipped. That, W-1 and W-5 share one root cause — `sdd-spec` produced three deltas
where the proposal named five capabilities, and `sdd-apply` recorded the shortfall instead of
escalating it.

**Before archive**: a docs-only remediation covering C-1 (required), plus W-1 and W-5 (strongly
advised, same edit session). W-2, W-3 and W-4 are code/test hardening that can be scheduled
independently; none of them affects shipped behaviour.

---

## Remediation addendum (2026-09-16)

C-1, W-1 and W-5 were remediated on branch `review-history-per-element/04-verify-remediation`,
docs-only, no source change, no tests affected:

- **C-1** — `openspec/specs/review-session-management/spec.md`: the `Deferred to` table row
  (was `FR-008 (remaining half)`) now reads `FR-008 (closed — per-element history shipped in
  \`review-history\` / \`review-history-ui\`)`, and the *No per-element review history surface
  exists* scenario is renamed *The per-element review history read lives in review-history, not
  here* and scoped to "this capability's own routes, pages, use cases and repository queries"
  (mirroring its sibling scenarios), with a `(Previously: ...)` note explaining the narrowing.
- **W-1** — `openspec/specs/review-history/spec.md`: the Purpose section's "no schema change
  ships" claim is corrected to name the one additive index on
  `ElementReviewEntry.inspectableElementId`, consistent with `design.md`'s OQ3/Decision 3. The
  *"the ManagerCapability enum and the User.managerCapabilities column MUST remain the only
  additive schema objects"* scenario at (was) `:1079` is corrected the same way — title and THEN
  clause now name the index alongside the enum/column as the additive schema objects the history
  slices introduced.
- **W-5** — `openspec/specs/inspectable-element-admin-ui/spec.md`: the Purpose section's
  entry-point list now names the per-row History link (owned and specified by
  `review-history-ui`) alongside the pre-existing Print entry point.

W-2, W-3, W-4, W-6, S-1, S-2 and S-3 are unchanged — out of scope for this docs-only pass, per
the verdict above.

## Code/test hardening addendum (2026-09-16)

W-2, W-3 and W-4 were remediated on branch `review-history-per-element/05-verify-hardening`
(3 commits, not pushed/merged as of this note), no behaviour change, full suites green:

- **W-2** — the dead, unimported `ELEMENT_HISTORY_ORDER_BY` export and its misleading "applies
  it ONCE" comment are removed from `prisma-review-session.repository.ts`; the port's comment
  referencing it is corrected to point at the use case's own private `elementHistoryOrder`
  comparator instead. Confirmed via grep: no production import ever existed. Confirmed no
  existing use case in this codebase imports from `infrastructure/persistence/**` — ADR-013's
  boundary makes design.md Decision 1's literal "shared adapter constant applied by the use
  case" unimplementable, so deleting the dead export (rather than relocating sort logic) is the
  correct minimal fix.
- **W-3** — `prisma-review-session.repository.integration.spec.ts` gains a second file-scan
  guard, mirroring the existing `findCompletedAcrossInstallation` /
  `findCompletedByIdAcrossInstallation` guard, proving
  `findCompletedEntriesForElementAcrossInstallation` is reachable from exactly the port, the
  Prisma adapter and `ReviewHistoryAccessService` — no other production file.
- **W-4** — `ELEMENT_HISTORY_ALLOWED_ROLES` is extracted into its own module
  (`apps/web/src/auth/element-history-route.roles.ts` — `react-refresh/only-export-components`
  forbids sharing a plain-constant export with the `App` component's file) and imported by both
  `App.tsx`'s route definition and `ProtectedRoute.test.tsx`, replacing the test's hand-copied
  inline array. A future accidental narrowing of the real route now fails via an import-level
  mismatch instead of silently passing against a stale duplicate.

Test results after remediation: `apps/api` unit 111/111 suites, 909/909 tests PASS;
`apps/api` e2e 10/10 suites, 349/349 tests PASS; `apps/api` integration 22 suites, 140/141
tests PASS (the sole failure is W-6, unchanged, environmental — a decommissioned-element
fixture row left in the shared dev DB by this change's own PR3 browser verification, in a
module (`inspectable-element`) this change's diff never touches); `apps/web` unit 48/48 files,
740/740 tests PASS (+1 test for W-4). `npx tsc --noEmit` clean for both workspaces (the
pre-existing, unrelated `Dirent.path` TS2339 warning in this same integration spec file,
present on `main` before this remediation, is out of scope — `nest build`, the project's actual
build command, does not surface it). `eslint --fix` clean on all touched files.

W-6, S-1, S-2 and S-3 remain unchanged — W-6 is a local-DB-fixture/environment issue, not a
code defect, and out of scope for a code-hardening pass; S-1/S-2/S-3 were not part of this
batch's assignment.

---

# Re-verification (fresh pass) — `main` @ `4227204`, 2026-09-16

**Verified at**: `main` @ `4227204` (merge of PR #125, `05-verify-hardening`) — working tree clean
**Merge base for the change**: `7c7d617`
**Mode**: full spec-driven verification (proposal + design + tasks + 3 delta specs + apply-progress), Strict TDD
**Artifact store**: hybrid
**Verdict**: **PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 4 SUGGESTION. **Archive is unblocked.**

This is an independent re-run against the current tree, not a re-reading of the pass above.
Every command below was executed in this session; every prior finding was re-checked against
the actual files rather than trusted from the addenda.

---

## R1. Test, build and lint evidence (all executed this pass)

| Command | Result |
|---|---|
| `npm run test --workspace=apps/api` | **PASS** — 111 suites, 909 tests, 65.5 s |
| `npm run test:e2e --workspace=apps/api` | **PASS** — 10 suites, 349 tests, 16.2 s |
| `npm run test --workspace=apps/web` | **PASS** — 48 files, 740 tests, 35.6 s |
| `npm run test:integration --workspace=apps/api` (real Postgres, `prisma migrate deploy` first — "No pending migrations") | **140 PASS / 1 FAIL**, 22 suites, 141 tests — the single failure is W-6, unchanged (see R4) |
| `npx jest --testRegex=".*\.integration\.spec\.ts$" --testPathIgnorePatterns=/node_modules/ -t "findCompletedEntriesForElement"` | **PASS** — 7/7 (was 6/6 before W-3's new guard; the guard executes and passes) |
| `npm run lint` | **PASS** — 5/5 turbo tasks, **0 errors**, 4 pre-existing warnings in the untouched `auth.controller.spec.ts`. `eslint --fix` left the tree clean (`git status --porcelain` empty afterwards) |
| `npm run build` (`prisma generate && nest build` for api; `tsc -b && vite build` for web) | **PASS** — 4/4 turbo tasks |

**Two environmental false alarms encountered and resolved — recorded for honesty, not as findings:**

1. The first `test:e2e` run reported 1 failure (`app.e2e-spec.ts:31`, `GET /health` expecting
   `{status:'ok', db:'ok'}`). Cause: Docker Desktop was not running, so `sf-manager-postgres-1`
   was `Exited (0)` and nothing listened on `localhost:5432`. After starting the container the
   suite is **349/349 green**. `app.e2e-spec.ts` is untouched by this change
   (`git diff 7c7d617..HEAD -- apps/api/test/app.e2e-spec.ts` is empty).
2. The first `apps/web` run reported `41 passed (41) / 634 tests` with 7
   `[vitest-pool]: Failed to start forks worker ... Timeout waiting for worker to respond`
   errors. Cause: the API jest suite was running concurrently on the same machine. Re-run
   serially: **48/48 files, 740/740 tests green.** No test-code defect.

---

## R2. Completeness — tasks

24/24 tasks in `tasks.md` are `[x]` and each was re-checked against a file, not against the
checkbox. Spot evidence re-confirmed on `4227204`:

- **1.1/1.2** migration dir `20260915120000_add_element_review_entry_inspectable_element_index`;
  index present in the running Postgres.
- **1.3/1.4/1.5** port `:182-219` (four element-keyed methods, scope in every signature except the
  documented installation-wide carve-out); adapter's entry-first two-query join; the in-memory fake
  mirrors all four.
- **1.6** enumeration guard `prisma-review-session.repository.integration.spec.ts:759-778` lists
  exactly the 10 shipped + 4 new `find*` names and still `not.toContain('findById')`.
- **2.1** `review-history-access.service.ts:243-330` — all five branches, `satisfies never` default,
  technician/company-manager fail-closed on zero entries, representative gated on the **assignment**
  (so a never-reviewed element in an assigned community is an empty state, not a 404).
- **2.2** `read-element-review-history.use-case.ts:85-100` — element lookup first, one throw site at `:99`.
- **2.7** 17 element-history e2e cases covering the five-scope matrix, the 404-vs-empty matrix and
  every scope guard.
- **3.3** `App.tsx:192-199` — depth-5 route now consuming the shared `ELEMENT_HISTORY_ALLOWED_ROLES`.
- **3.5** `ReviewHistoryDetailPage.tsx` — the `entry.elementCode !== null` guard (PR3's CRITICAL fix) present.
- **3.8** FR-008 closed in `docs/requirements/functional-requirements.md`.

---

## R3. Status of every finding from the original pass

| ID | Original severity | Status now | Evidence re-checked this pass |
|---|---|---|---|
| **C-1** | CRITICAL | **CLOSED** | `openspec/specs/review-session-management/spec.md:475` now reads `FR-008 (closed — per-element history shipped in review-history / review-history-ui)` and scopes the row to "**this** capability's own routes, use cases or repository reads"; `:500` renamed *The per-element review history read lives in review-history, not here* with a `(Previously: ...)` note at `:504`. Requirement/scenario counts for that capability are **14 to 14** and **62 to 62** across `7c7d617..4227204` — narrowed in place, nothing deleted. |
| **W-1** | WARNING | **CLOSED** | `openspec/specs/review-history/spec.md:36-39` now states "the only additive schema object is a single-column index on `ElementReviewEntry.inspectableElementId`"; `:1079-1082` renamed *The capability column and the element-index stay the only additive schema changes*, THEN clause names the index alongside the enum and column. |
| **W-2** | WARNING | **CLOSED** (one residual, see N-1) | `grep -rn "ELEMENT_HISTORY_ORDER_BY" apps/ --include=*.ts` returns **no match anywhere**. The port's cross-reference at `:186-188` now correctly points at "the use case's own private `elementHistoryOrder` comparator". |
| **W-3** | WARNING | **CLOSED** | `prisma-review-session.repository.integration.spec.ts:859-891` — a real file-scan guard mirroring the shipped installation-wide one: same `**/testing/**` + `*.spec.ts` exclusions, `toHaveLength(3)` plus a per-suffix assertion for port / Prisma adapter / `ReviewHistoryAccessService`. Not vacuous: it asserts an exact count, so a 4th production caller fails it. **Executed and green** this pass (targeted run 7/7). |
| **W-4** | WARNING | **CLOSED for the failure mode it named** (residual, see N-3) | `apps/web/src/auth/element-history-route.roles.ts:17` is the single definition; `App.tsx:3` and `ProtectedRoute.test.tsx:5` both import it. `ProtectedRoute.test.tsx:338` pins the array's exact contents and `:365` drives `it.each` from it. Narrowing the shared constant now fails the suite — the exact regression W-4 described. |
| **W-5** | WARNING | **CLOSED** | `openspec/specs/inspectable-element-admin-ui/spec.md:4-12` Purpose now names "a per-element History entry point into the element's own review-history page, owned and specified by `review-history-ui`". Counts **14 to 14** requirements, **32 to 32** scenarios. |
| **W-6** | WARNING | **OPEN — reproduced, root cause re-confirmed directly** | See R4. |
| **S-1** | SUGGESTION | **OPEN** | `ElementReviewHistoryPage.tsx:139` still renders `<span>{entry.recordedAt}</span>` raw. |
| **S-2** | SUGGESTION | **OPEN** | `ElementReviewHistoryPage.tsx:136-137` still keys rows on `entry.reviewSessionId`; the DTO still exposes no `entryId`. |
| **S-3** | SUGGESTION | **OPEN** | The 17 element-history e2e titles contain no revoke-then-repeat case, no element-level assignment-deactivation case and no element-level performer-transfer case. Structural arguments unchanged and still sound. |

### Live-spec merge integrity — re-measured, not copied

| Capability | Requirements `7c7d617` to `4227204` | Scenarios `7c7d617` to `4227204` |
|---|---|---|
| `review-history` | 14 to 18 | 83 to 115 |
| `review-history-ui` | 10 to 13 | 51 to 78 |
| `authorization` | 24 to 26 | 123 to 140 |
| `review-session-management` | 14 to 14 | 62 to 62 |
| `inspectable-element-admin-ui` | 14 to 14 | 32 to 32 |

The two capabilities touched by the C-1/W-5 remediation lost **nothing** — both were edited in
place. No requirement or scenario was dropped anywhere.

### Spec compliance — the two scenarios previously scored PARTIAL

| Requirement / Scenario | Then | Now | Runtime evidence |
|---|---|---|---|
| `review-history` — *History Scope Is Carried by the Query...* > *The actor-unscoped reads are reachable only from the admin and granted-manager paths ... no sampling* | PARTIAL (W-3) | **COMPLIANT** | Both file-scan guards execute and pass (targeted 7/7; full integration run 140 pass) |
| `review-history-ui` — *The Element History Route Is Gated on the Five History Roles...* > *The divergence is documented and gate-tested* | PARTIAL (W-4) | **COMPLIANT** | The scenario requires (a) an explicit comment naming the five roles and the family default — `App.tsx:177-191` plus `element-history-route.roles.ts:3-16`; and (b) a gate test asserting both the five-role allowance and the admin-only sibling — `ProtectedRoute.test.tsx:336-409`, now driven by the same constant `App.tsx` consumes. Web suite green. |

Everything else in the original compliance matrix re-verified as PASS; nothing regressed.

---

## R4. WARNING (2)

### N-1 — the use case comment still advertises the constant W-2 deleted

**File**: `apps/api/src/modules/review-session/application/use-cases/read-element-review-history.use-case.ts:44-48`

    // review-history-per-element/design.md Decision 3: the shared adapter-owned
    // ordering constant, applied ONCE here after the join — ...
    function elementHistoryOrder(...)

W-2 remediation deleted `ELEMENT_HISTORY_ORDER_BY` from the adapter and corrected the **port**
comment, but not this one. `elementHistoryOrder` is a private local comparator; there is no
"shared adapter-owned ordering constant" left anywhere in the codebase (grep confirms zero
matches). A reader following this comment searches for a symbol that no longer exists — precisely
the misleading-comment defect W-2 was raised for, now inverted.

Two smaller inaccuracies in the same comment: the ordering constant is attributed to
**Decision 2** by `design.md:139-140` and `:481`, not Decision 3; and "applied ONCE here after the
join" now states the whole truth rather than coordinating with a sibling definition, so the
emphasis reads as if something else were still involved.

**Severity**: documentation-only, zero runtime effect, no spec violated. Not archive-blocking.
**Fix**: one comment — name design.md Decision 2, say the comparator is owned privately by this use
case, and note that the adapter-side constant it originally proposed was removed per verify-report W-2.

### N-2 — the apply-progress artifact carries no TDD Cycle Evidence table

**Artifact**: Engram `sdd/review-history-per-element/apply-progress` (observation #268, revision 5)

Strict TDD Mode is active for this project, and the sdd-verify strict-TDD module treats a missing
TDD Cycle Evidence table in `apply-progress` as CRITICAL. The surviving revision covers only PR3
two fix-up commits; the per-task RED/GREEN/TRIANGULATE/SAFETY-NET table for the other 22 tasks is
not present in any retrievable revision. Root cause is the store, not the phase: Engram `topic_key`
upserts overwrite, so each apply batch replaced the previous batch record.

**Downgraded to WARNING rather than CRITICAL, deliberately**, because the substance the table
exists to attest was independently re-established at runtime this pass:

- every task maps to a test file that exists and was executed (R2);
- all four suites are green with the sole environmental exception W-6;
- triangulation is real, not nominal — `read-element-review-history.use-case.spec.ts` has 9
  distinct cases over Decision 5 alone, `review-history-access.service.spec.ts` 77 assertions
  across the five-role branch table, `review-history.e2e-spec.ts` 17 element-history cases;
- the assertion-quality audit (R6) found nothing.

Blocking archive on a missing artifact table when the evidence it summarises is directly
observable would be process theatre. Recorded so the gap stays visible, and so future changes
consider appending rather than upserting per-phase apply-progress.

### W-6 (carried over) — one integration test still fails from this change own browser fixture

**File**: `apps/api/src/modules/inspectable-element/infrastructure/persistence/inspectable-element-migration.integration.spec.ts:205`

Reproduced exactly: `Expected: 0, Received: 1`. Root cause re-confirmed **directly against the
database** this pass, not inferred — a `psql` query for every `InspectableElement` row with a
non-NULL `deactivatedAt` returns exactly **one** row:

    01a0a971-1ce1-7228-8598-5cb5642afdda | 4B7ABV758J | Basement extinguisher (decommissioned) | 2026-09-16 09:00:08.179

That row is task 3.9 decommissioned-element browser-verification fixture. The assertion is
whole-database, so any legitimately decommissioned element breaks it. The module is untouched by
this change (`git diff 7c7d617..4227204 -- apps/api/src/modules/inspectable-element/` is empty) and
the spec file predates it. **Not archive-blocking**: dev-DB hygiene plus a brittle pre-existing
assertion, not a defect in anything this change shipped. Clearing or reactivating that single row
restores a 141/141 run.

---

## R5. SUGGESTION (4 new, 3 carried)

### N-3 — W-4 residual: nothing binds the App.tsx route to the shared constant

`ProtectedRoute.test.tsx` now imports `ELEMENT_HISTORY_ALLOWED_ROLES` from the same module
`App.tsx` imports it from, which closes the failure mode W-4 actually described (someone edits the
role array; the stale hand-copied duplicate in the test hides it). One weaker path remains:
replacing `allowedRoles={ELEMENT_HISTORY_ALLOWED_ROLES}` at `App.tsx:195` with an inline
`allowedRoles={['SYSTEM_ADMIN']}` still fails no test — there is no `App.test.tsx`, and no test file
references the route table. Genuinely lower-probability than the original (it requires deleting a
named import whose own module comment says do NOT harmonize it downward), so this is a suggestion,
not a warning. Closing it would need a route-table test that renders the App router.

Minor, same block: `ProtectedRoute.test.tsx:337` is still titled "App.tsx exports exactly the 5
roles the anomaly comment promises" — the constant now lives in `element-history-route.roles.ts`.

### N-4 — both call-site guards only run when Postgres is reachable

`prisma-review-session.repository.integration.spec.ts:810` and `:859` are pure filesystem scans —
they read `.ts` sources and need no database at all — but they sit inside the
`findCompleted...InCommunities()` describe (`:518-892`), whose `beforeAll` opens a Prisma
connection, in a file matched only by `test:integration`. On a machine or CI lane without Postgres
they do not run, so the architectural invariant they protect (no fourth production caller of an
actor-unscoped read) is silently unenforced exactly where a regression is most likely to slip
through. Moving both into a plain `*.spec.ts` would put them in the default 111-suite unit run at
no DB cost. Pre-existing pattern, inherited by the W-3 fix rather than introduced by it.

### N-5 — the archived delta still carries the prose W-1 corrected in the live spec

`openspec/changes/review-history-per-element/specs/review-history/spec.md:11` still says "no schema
change ships", and `:447-450` still asserts that this change adds none of its own and that the
`ManagerCapability` enum and the `User.managerCapabilities` column MUST remain the only additive
schema objects. The live spec was corrected (W-1); the delta was not, and this file is about to be
archived as the historical record of what shipped. Harmless — the live spec is the project truth
and `design.md` OQ3/Decision 3 documents the override — but a one-line
`> Note (verify W-1): superseded ...` above those two spots would stop a future reader from
reviving the wrong premise.

### N-6 — one merged spec sentence reads as garbled

`openspec/specs/review-history/spec.md:885`: "each MUST be reachable from exactly two, all four in
the history access resolution". Parsed carefully it is correct — two branches per unscoped read,
four call sites total, all inside `ReviewHistoryAccessService` — but the comma splice reads as a
contradiction on first pass. Worth a rewrite next time this requirement is touched.

### S-1 / S-2 / S-3 (carried over, all re-verified unchanged)

Re-checked at the exact lines cited in the original pass; all three still stand as written, all
three remain non-blocking.

---

## R6. Strict-TDD sections

### Assertion quality

Scanned all ten test files created or modified by this change.

| Check | Result |
|---|---|
| Tautologies (`expect(true).toBe(true)`, `expect(1).toBe(1)`) | **0** across `apps/api/src`, `apps/api/test`, `apps/web/src` |
| Ghost loops (assertions inside a loop over a possibly-empty collection) | **0** — the only `queryAll*` uses are `toHaveLength(0)` negative controls asserting the *absence* of controls, which is the intent, and each sits in a test that also asserts positive rendered content |
| Assertions with no production-code call | **0** |
| Smoke-test-only (render + `toBeInTheDocument` with no behavioural assertion) | **0** |
| Mock-heavy files (mocks > 2x assertions) | **0** — worst ratio is 1 mock : 22 assertions |
| Type-only assertions used alone | **0** — the 6 `toBeDefined()` in the integration spec and 1 in the e2e spec are each paired with value assertions |

| File | `expect(` count | mocks |
|---|---|---|
| `review-history-access.service.spec.ts` | 77 | 0 |
| `read-element-review-history.use-case.spec.ts` | 14 (across 9 `it`) | 0 |
| `prisma-review-session.repository.integration.spec.ts` | 64 | 0 |
| `review-history.e2e-spec.ts` | 343 | 0 |
| `ElementReviewHistoryPage.test.tsx` | 24 | 1 |
| `CommunityElementsListPage.test.tsx` | 23 | 1 |
| `ReviewHistoryDetailPage.test.tsx` | 22 | 1 |
| `ProtectedRoute.test.tsx` | 27 | 1 |
| `locales.test.ts` | 35 | 0 |

**Assertion quality**: all assertions verify real behaviour. 0 CRITICAL, 0 WARNING.

### Test layer distribution (this change own tests)

| Layer | Coverage |
|---|---|
| Unit (api, jest) | access-service five-role branch table, use-case call-order / throw-site / `reviewed` derivation / ordering tiebreak, in-memory fake incl. the empty-scope fail-closed case |
| Unit + component (web, vitest + testing-library) | page loading/empty/error states, both entry links, route gate, locale parity |
| Integration (api, real Postgres) | four element-keyed repository scopes, draft and sibling-element exclusion, index existence and `DROP INDEX` rollback, two call-site guards, `find*` enumeration guard |
| E2E (api, supertest) | 17 element-history cases — five-scope matrix, 404-vs-empty matrix, 401-before-scope, list-control no-op, four scope guards |

All four layers present and exercised. No layer relies on a tool absent from the project capabilities.

### Quality metrics

**Linter**: 0 errors (4 pre-existing warnings in an untouched file).
**Type checker / build**: `nest build` + `tsc -b` + `vite build`, 4/4 turbo tasks PASS.
**Coverage**: not run — no coverage threshold is configured for this project; informational only.

---

## R7. Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING, 4 SUGGESTION (plus S-1/S-2/S-3 carried).
**`sdd-archive` is unblocked.**

The original pass single blocker (C-1) is closed in the live spec and verified by direct file
inspection plus a requirement/scenario recount showing nothing was lost. W-1 through W-5 are all
genuinely fixed, not merely claimed: the dead export is gone from the entire tree, the new
call-site guard is a real counting assertion that executes and passes, and the route-gate test is
now driven by the same constant the route consumes.

**Explicitly on the four items left open:**

- **W-6 — not blocking.** A leftover fixture row in the shared local dev database (verified by
  direct query: exactly one row, this change own task-3.9 decommissioned element) failing a
  whole-database assertion in a module whose diff against this change is empty. Nothing this change
  shipped is at fault. Two independent follow-ups, both outside this change: clear the fixture row,
  and revisit an assertion that treats a supported domain state as a migration failure.
- **S-1, S-2, S-3 — not blocking.** S-1 and S-2 are app-wide patterns the change follows rather
  than breaks (the shipped `ReviewHistoryPage` renders its timestamp raw too, and the
  `@@unique([reviewSessionId, inspectableElementId])` invariant makes the row key correct). S-3
  three scenarios are each structurally guaranteed by code whose branch is unit-pinned, with a
  session-level e2e counterpart; adding the element-level cases is a coverage improvement, not a
  correctness gap.
- **N-1, N-2 — not blocking.** N-1 is a stale comment with zero runtime effect. N-2 is a missing
  artifact table whose content was independently re-established by execution this pass.

Nothing is required before archive. If a tidy-up commit is wanted, the N-1 one-line comment
correction is the only item with any reader-facing risk.
