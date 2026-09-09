# Tasks: Company-Scoped Review History

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2300-2900 total (1 migration + backfill + integration test extension, 1 new shared Layer 2 port + adapter, repository port +4/-2 methods x2 adapters, access-service reversal across 2 branches, 2 use cases, 1 new cross-module port (`UserDirectory`, 2 methods) + adapter + fake, 2 DTOs, 1 role-permission entry, 2 web pages + entry link + routing, 3 locale files, full E2E three-role matrix, 4 delta-spec merges, 1 ADR addendum) |
| 400-line budget risk | High — PR 1, PR 2, PR 3 and PR 4 each sit near or above the 400-line budget individually; none is safely mergeable as a single PR |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 6 (see Suggested Work Units) — refined from the proposal's 5-PR sketch to 6, splitting the sketch's PR 2 into two reviewable units (see rationale below) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Refinement over the proposal's sketch

The proposal's PR 2 ("company-scoped port methods, adapters, access-service
branch, use cases, route wiring") bundles two things that are each
independently sized and independently risky: (a) the new authorization
infrastructure (`CompanyScopeChecker` port/adapter, the repository's +4/−2
method set) and (b) the access-service behavior change that consumes it
(the technician own-history reversal **and** the new company branch, plus
the performer-email read). Splitting them gives each PR a single, auditable
concern and keeps both under the 400-line pressure point; bundled, the
combined PR would clear ~850-1000 lines. The technician reversal and the
company branch stay **together** in one PR (see Phase 3 rationale) because
they are the same mechanical change to `ReviewHistoryAccessService` — moving
scope resolution inside each role branch — and splitting *that* would leave
the file's `switch` in a half-migrated state between two PRs.

### Suggested Work Units

| Unit | Goal | PR | Est. lines | Notes |
|---|---|---|---|---|
| 1 | Migration + backfill + write-path snapshot | PR 1 | ~500 | Isolated per proposal/design explicit call-out; no dependency on later units; independently revertible (design Rollback: revert code, keep column) |
| 2 | Company-scope authorization port + repository scope methods (+4/−2), both adapters | PR 2 | ~500 | Depends on PR 1's column; introduces `CompanyScopeChecker` and the six-method repository surface, deletes the two orphaned methods |
| 3 | Access-service reversal (technician own-history) + company branch + use cases + performer-email read | PR 3 | ~450 | Depends on PR 2's port/repository surface; the one PR where both authorization-surface changes to `ReviewHistoryAccessService` land together |
| 4 | Authorization wiring (`ROLE_PERMISSIONS`) + full E2E three-role visibility matrix | PR 4 | ~450 | Depends on PR 3; the E2E suite is the main line-count driver, not the wiring itself |
| 5 | Web: role-widening, manager entry point, performer column, i18n | PR 5 | ~400 | Depends on PR 4 (needs the full API surface incl. `performedByEmail` and the manager's 2xx responses) |
| 6 | ADR-011 addendum, FR-008 status, delta-spec merges, browser verification, final checks | PR 6 | ~200 | Depends on PR 5; no application code |

## Phase 1: Migration + Backfill + Write-Path Snapshot (PR 1)

Traces: design Decisions 1-2; spec `review-session-management` — *A Session
Records the Company on Whose Behalf It Was Performed*.

- [x] 1.1 `apps/api/prisma/schema.prisma` — add `performedByCompanyId String? @db.Uuid` to `ReviewSession` + `@@index`; hand-written FK comment block per ADR-013 convention (design Decision 2).
- [x] 1.2 `apps/api/prisma/migrations/2026…_add_review_session_performed_by_company/migration.sql` — hand-write: `ALTER TABLE … ADD COLUMN`, `CREATE INDEX`, the cross-module FK (`ON DELETE RESTRICT ON UPDATE CASCADE`, invisible to Prisma per ADR-013), and the all-rows backfill `UPDATE … FROM "User" … WHERE "performedByCompanyId" IS NULL` (design Decision 2 — **not** filtered by `status`, so drafts-that-later-complete are not permanently unattributed).
- [x] 1.3 RED/GREEN `.../review-session/domain/review-session.entity.ts` — add `performedByCompanyId: string | null`, readonly, no setter (immutability is structural, not test-enforced).
- [x] 1.4 RED/GREEN `.../review-session/infrastructure/persistence/review-session.mapper.ts` — map the column both directions.
- [x] 1.5 RED/GREEN `.../review-session/application/ports/user-directory.port.ts` — create `UserDirectory` with `findMaintenanceCompanyId(userId): Promise<string | null>` only (design Decision 5 write-path half; `findEmailsByIds` is Phase 3's).
- [x] 1.6 RED/GREEN `.../review-session/infrastructure/persistence/prisma-user-directory.ts` — implement `findMaintenanceCompanyId`, reading `PrismaService` directly (module-local port, `MaintenanceCompanyLookup` precedent).
- [x] 1.7 RED/GREEN `.../review-session/application/use-cases/testing/in-memory-user-directory.ts` — fake with `findMaintenanceCompanyId`.
- [x] 1.8 RED/GREEN `.../review-session/application/use-cases/open-review-session.use-case.ts` — call `userDirectory.findMaintenanceCompanyId(performedById)`, pass `performedByCompanyId` into `new ReviewSession({...})`; no other write path ever sets it (design Decision 1).
- [x] 1.9 `.../review-session/review-session.module.ts` — bind `USER_DIRECTORY` to the Prisma adapter.
- [x] 1.10 Unit: `OpenReviewSessionUseCase` — every newly created session carries the performer's company; a performer with none creates a `null`-attributed session (spec: *A newly opened session carries the performer's company* / *A performer with no company yields an absent attribution*).
- [x] 1.11 Unit: a representative-opened session is attributed by the identical rule (spec scenario: *A representative-opened session is attributed the same way*).
- [x] 1.12 RED/GREEN extend `.../review-session/infrastructure/persistence/review-session-migration.integration.spec.ts` (shipped precedent) — assert the new column, index and FK are present; `ReviewSession_open_draft_key` and the other existing FKs are intact; the backfill attributes **every** pre-existing row (draft and completed alike) to its performer's company at migration time, including rows whose performer has no company (stay `null`); down-migration drops FK, index and column cleanly (spec: *Pre-existing completed sessions are backfilled once*).
- [x] 1.13 Integration: no application write path other than session creation writes, clears or changes `performedByCompanyId` on any session, including a `completed` one — enumerate `complete()`/`discardDraft()`/every route (spec: *Immutability of completed sessions is not weakened*, *No caller can supply or override the attribution*).

## Phase 2: Company-Scope Authorization Port + Repository Scope Methods (PR 2)

Traces: design Decisions 3-4, Decision 6; spec `authorization` — *Company-Wide
Review History Scope for a Maintenance Company Manager*; spec `review-history`
— *History Scope Is Carried by the Query, Not by the Caller*.

- [ ] 2.1 RED/GREEN `apps/api/src/shared/application/authorization/company-scope.checker.port.ts` — create `CompanyScopeChecker.resolveCompanyScope(userId, role): Promise<string | null>`, `COMPANY_SCOPE_CHECKER` symbol (design Decision 4).
- [ ] 2.2 RED/GREEN `.../users/infrastructure/authorization/user-company-scope.checker.ts` — implement with the same fail-closed exhaustive `switch` shape as `AssignmentCommunityScopeChecker` (`role satisfies never` default); only `MAINTENANCE_COMPANY_MANAGER` ever resolves non-null; the lookup excludes soft-deleted users (ADR-010), so a soft-deleted manager resolves to `null`.
- [ ] 2.3 `.../users/users.module.ts` — bind **and export** `COMPANY_SCOPE_CHECKER`.
- [ ] 2.4 `.../review-session/review-session.module.ts` — import `UsersModule` (verified acyclic in design's pre-work).
- [ ] 2.5 Unit: `UserCompanyScopeChecker` — table-driven over all 5 roles × {no company, has company, soft-deleted user}; only `MAINTENANCE_COMPANY_MANAGER` ever non-null; every other role always `null` regardless of company data (spec: *The manager's scope is resolved without the community-assignment check*, *The company association still confers no history scope on a technician*).
- [ ] 2.6 RED/GREEN `.../review-session/application/ports/review-session.repository.port.ts` — add `findCompletedForCompany(companyId)`, `findCompletedByIdForCompany(id, companyId)`, `findCompletedForPerformer(performedById)`, `findCompletedByIdForPerformer(id, performedById)`; **delete** `findCompletedForPerformerInCommunities` and `findCompletedByIdForPerformerInCommunities` (design Decision 6 — no orphaned methods survive on this port).
- [ ] 2.7 RED/GREEN `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` — implement the 4 new methods (`status = 'completed'` + the named scope predicate only — no extra conjunct, design Decision 9's principle applied to the technician method too); remove the 2 deleted methods' implementations; company/list methods share the existing `COMPLETED_HISTORY_ORDER_BY` constant.
- [ ] 2.8 RED/GREEN `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` — same 4 methods added, same 2 removed, same ordering.
- [ ] 2.9 Integration: `findCompletedForCompany`/`findCompletedByIdForCompany` never return another company's or a `null`-company row (spec: *Another company's sessions never appear*, *A session with no attributed company appears nowhere*); asserted against both adapters.
- [ ] 2.10 Integration: enumerate `ReviewSessionRepository` — no method returns a session or list from an identifier alone without a performer, community or company scope in its signature; the two deleted methods no longer exist (spec: *No unscoped session read exists*, *Every company-scoped query names a single company; no global query exists*).
- [ ] 2.11 Integration: ordering parity — `findCompletedForCompany` returns `completedAt DESC, id DESC`, identical direction to the shipped list methods (spec: *A manager sees every technician's work across communities* — deterministic chronological order).
- [ ] 2.12 Integration: the company predicate matches the session's own `performedByCompanyId` only — never a join through `performedById → User.maintenanceCompanyId` (spec: *The company scope never joins to the performer's current company*).

## Phase 3: Access-Service Reversal + Company Branch + Use Cases + Performer Email (PR 3)

Traces: design Decisions 5, 7, 8, 9; spec `authorization` — *Resource Scope for
Review History Reads* (MODIFIED); spec `review-history` — *A Maintenance
Company Manager's Company-Wide Completed Review History*, *Scoped Read-Back of
One Historical Session* (MODIFIED).

Both the technician own-history reversal and the new company branch are the
same mechanical change — scope resolution moving inside each role branch of
`ReviewHistoryAccessService` — and ship together in this one PR (see Review
Workload Forecast rationale). Tasked separately below so each RED/GREEN pair
and its spec trace stays unambiguous.

- [ ] 3.1 RED/GREEN `.../review-session/application/ports/user-directory.port.ts` — add `findEmailsByIds(userIds: readonly string[]): Promise<Map<string, string>>` (design Decision 5 read-path half — deliberately soft-delete-**inclusive**, the module's first bypass of ADR-010's default filter).
- [ ] 3.2 RED/GREEN `.../review-session/infrastructure/persistence/prisma-user-directory.ts` — implement `findEmailsByIds` with one batched query over the distinct ids, including soft-deleted users.
- [ ] 3.3 RED/GREEN `.../review-session/application/use-cases/testing/in-memory-user-directory.ts` — add `findEmailsByIds` to the fake.
- [ ] 3.4 Unit: `findEmailsByIds` — one call regardless of row count; a soft-deleted performer's email still resolves; an unresolvable id maps to `''` (design Decision 8).
- [ ] 3.5 RED/GREEN `.../review-session/application/services/review-history-access.service.ts` — `listForActor`: remove the pre-`switch` `listAssignedCommunityIds` call; `MAINTENANCE_TECHNICIAN` branch calls `findCompletedForPerformer(actor.userId)` directly, no Layer 2 call at all; `COMMUNITY_REPRESENTATIVE` branch moves verbatim (unchanged behavior); new `MAINTENANCE_COMPANY_MANAGER` branch calls `companyScopeChecker.resolveCompanyScope`, short-circuits to `[]` on `null` **before** any repository call, else calls `findCompletedForCompany` (design Decision 7).
- [ ] 3.6 RED/GREEN same file — `loadCompletedForActor`/`loadByRole`: identical restructuring for the by-id read; `loadByRole` loses its `communityIds` parameter and becomes fully role-dispatched internally; the single `ReviewSessionNotFoundError` throw site stays untouched, so a manager's out-of-company id, a technician's foreign id, a draft, a nonexistent id and a null company scope all still collapse to one indistinguishable 404 (design Decision 7 table).
- [ ] 3.7 Unit: technician branch reaches `findCompletedForPerformer`/`findCompletedByIdForPerformer` and **never** calls `communityScopeChecker` (spec: *A technician's own completed session stays readable after their assignment is deactivated*).
- [ ] 3.8 Unit: the reversal, explicitly — a technician with zero active assignments (none, or one deactivated) still gets their own sessions in the list and by id; the same technician still gets `[]`/`ReviewSessionNotFoundError` for another performer's session, deactivated or not (spec: *A deactivated technician gains nothing beyond their own work*).
- [ ] 3.9 Unit: representative branch is byte-identical in behavior to the shipped code — active-assignment gate, empty-scope early return, both unchanged (spec: *A representative loses community history on deactivation*, unchanged).
- [ ] 3.10 Unit: manager branch — `null` company reaches **no** repository call (fail-closed before query); a resolved company id reaches exactly one call to `findCompletedForCompany`/`findCompletedByIdForCompany`; deactivating every one of the manager's technicians' assignments changes nothing about the manager's own result (spec: *A manager's history is unaffected by any assignment change*).
- [ ] 3.11 Unit: `SessionAccessService`'s existing suite passes **unmodified** (proof the write-path sibling service changed nothing).
- [ ] 3.12 RED/GREEN `.../review-session/application/use-cases/list-review-history.use-case.ts` — after `listForActor`, batch-resolve `performedByEmail` via one `userDirectory.findEmailsByIds` call over the distinct `performedById` values in the result; maps to `ReviewHistoryRowDto[]` including `performedByEmail` (design Decision 8, Data Flow: one query, not N).
- [ ] 3.13 RED/GREEN `.../review-session/application/use-cases/read-review-history.use-case.ts` — same single-performer `performedByEmail` resolution for `ReviewHistoryDetailResponseDto`.
- [ ] 3.14 `.../review-session/presentation/dto/review-history-row.dto.ts`, `.../review-history-detail-response.dto.ts` — add `performedByEmail: string`.
- [ ] 3.15 Unit: unresolvable `performedByEmail` renders as `''` at the DTO/use-case boundary, not an error (spec: *Each row identifies its performer*).

## Phase 4: Authorization Wiring + E2E Visibility Matrix (PR 4)

Traces: design Decision 11's point 3; spec `authorization` — *The Maintenance
Company Manager Becomes Operational*, *The Deferred Review Visibility Scopes
Grant Nothing* (MODIFIED), *The Company Association Itself Confers No
Permission* (MODIFIED, RENAMED from *Maintenance-Role Permissions Stay
Inert*).

- [ ] 4.1 RED/GREEN `.../auth/infrastructure/authorization/role-permission.checker.ts` — `MAINTENANCE_COMPANY_MANAGER: ['reviewSession:read']`, nothing else; `MANAGER` and `SYSTEM_ADMIN` rows untouched.
- [ ] 4.2 Unit: `ROLE_PERMISSIONS` — the manager entry equals exactly `['reviewSession:read']`; contains none of `reviewSession:create/perform/complete/discard`, no `user:*`/`community:*`/`maintenanceCompany:*`/`inspectableElement:*`/`checklistQuestion:*`/`reviewTemplate:*`; `MANAGER` still `[]`; `SYSTEM_ADMIN` unchanged (spec scenarios: *The manager holds exactly one permission*, *The manager gains no write member…*, *MANAGER and SYSTEM_ADMIN are untouched*).
- [ ] 4.3 Unit: the permission table stays an exhaustive `Record<Role, Permission[]>` — a new `Role` value without an entry fails the build; `PermissionChecker.can`'s signature is unchanged (no resource parameter).
- [ ] 4.4 E2E `apps/api/test/review-history.e2e-spec.ts` — three-role visibility matrix, no sampling: manager sees every completed session across their company's technicians and communities; another company's sessions never appear on list or by-id; a manager with no company gets an empty list on request, not everything; a session with no attributed company is invisible to every manager, on list and by-id (spec: *A manager sees their whole company's completed history*, *Another company's sessions are never visible*, *A manager with no maintenance company sees nothing*, *A session with no attributed company is invisible to every manager*).
- [ ] 4.5 E2E: attribution survives transfer — complete a session under company X, transfer the technician to company Y, assert the session stays with X's manager and never appears for Y's, on both list and by-id (spec: *Attribution survives the performer's transfer*).
- [ ] 4.6 E2E: reversal — a technician completes a session, their assignment is deactivated, an identical request still returns the session in the list **and** succeeds by id; a community-mate's session (never performed by this technician) still returns `404 REVIEW_SESSION_NOT_FOUND`, before and after deactivation (spec: *A technician's own completed session stays readable after their assignment is deactivated*, *A deactivated technician gains nothing beyond their own work*).
- [ ] 4.7 E2E: the representative's gate is unchanged — deactivating a representative assignment removes community history access on the next request, with no grace period; reassignment restores it (spec: *A representative loses community history on deactivation*, *A representative's access returns with a new active assignment* — both regression, not new behavior).
- [ ] 4.8 E2E: the manager's scope requires no community assignment of any kind, active or deactivated (spec: *The manager's scope is resolved without the community-assignment check*).
- [ ] 4.9 E2E: drafts stay out of every scope — a company's draft session is excluded from the manager's list and its by-id request is refused indistinguishably from nonexistent (spec: *Drafts stay out of the company scope*).
- [ ] 4.10 E2E: indistinguishable 404 across all three roles — deep-equal status/code/body for a nonexistent id, another performer's session (technician), another community's session (representative), another company's session (manager); no distinct "exists but not yours" code (spec: *Rejection… MUST reuse the same status, error code and message as a nonexistent session*, both authorization and review-history capabilities).
- [ ] 4.11 E2E: scope guards — `MANAGER` still `[]` and 403 on every history route; `SYSTEM_ADMIN` 403 on every history route and holds no `reviewSession:*`; no `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` symbol found anywhere; every manager write attempt on `/review-sessions*` routes is 403 with no write performed; no page/cursor/limit/offset/date-range/sort/search parameter accepted on any of the three scopes; the migration directory contains only the one attribution-column migration (spec: *No manager capability or global-review mechanism is introduced*, *The manager gains no write member…*, *No list-control parameters are accepted*, *The only migration is the attribution column and its backfill*).
- [ ] 4.12 E2E: scope is checked in addition to, never instead of, the permission — a caller with a set company but no `reviewSession:read` gets 403 on every history endpoint (spec: *Scope is checked in addition to the permission, not instead of it*, both roles' variant).

## Phase 5: Web — Role Widening, Entry Point, Performer Column, i18n (PR 5)

Traces: design Decisions 8, 10; spec `review-history-ui` — *Role-Gated Route
Access for the History Views* (MODIFIED), *A Reachable Entry Point for the
Maintenance Company Manager That Bypasses the Write Surface* (ADDED), *The
History List Renders the Server-Scoped Result Unfiltered* (MODIFIED).

- [ ] 5.1 `apps/web/src/api/review-history.ts` — add `performedByEmail` to both the list-row and detail response types.
- [ ] 5.2 RED/GREEN `apps/web/src/pages/ReviewHistoryPage.tsx` (+ test) — render a Performer column for every role, no role-conditional variant; localized placeholder for an unresolved (`''`) email, same pattern as `reviewHistory.list.communityUnknown`; the manager's company-wide result renders unfiltered — no client-side narrowing by community, performer or date (spec: *A multi-performer caller sees who performed each row*, *A manager's company-wide list is rendered unfiltered*).
- [ ] 5.3 RED/GREEN `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) — render the performer line for every role, same placeholder rule; test asserts still no mutation control renders (regression of the shipped no-write-control rule) and no manager-specific variant (spec: *A manager reads back a session performed under their company* — same recorded record as the performer sees).
- [ ] 5.4 `apps/web/src/App.tsx` — widen the two `/review-history*` `ProtectedRoute allowedRoles` to include `MAINTENANCE_COMPANY_MANAGER`; the `/review-sessions*` routes are **not** widened (spec: *A maintenance company manager reaches the identical history views*, *The manager is still denied the review-session write routes*).
- [ ] 5.5 RED/GREEN `apps/web/src/pages/HealthPage.tsx` (+ test) — add a second role-gated `Link` to `/review-history`, shown for `MAINTENANCE_COMPANY_MANAGER` only, alongside the shipped `/review-sessions` link for the two performing roles (design Decision 10; spec: *The manager reaches history from the app's entry page*, *The manager's path never crosses the write surface*).
- [ ] 5.6 Unit: enumerate every navigation control rendered for a signed-in `MAINTENANCE_COMPANY_MANAGER` across the app — none navigates to `/review-sessions` or any session-performing view; none offers to open/resume/answer/record/mark-unreviewed/enter-code/complete/discard a session (spec: *No write control is rendered for the manager*).
- [ ] 5.7 Unit: the other two roles' shipped `/review-sessions` entry point and route access are unaffected by the new link/route widening (spec: *The other two roles' entry point is unchanged*, regression).
- [ ] 5.8 Unit: another role (not one of the three) sees an explicit "not authorized" message on any review-history route, not a silent redirect; unauthenticated redirected to `/login` (spec: *Another role is denied with an explicit message*, *Unauthenticated visitor redirected to login* — regression + manager coverage added).
- [ ] 5.9 `apps/web/src/i18n/locales/{en,es,ca}.json` — real translations: `health.reviewHistoryLink`, the Performer column header, the unresolved-performer placeholder; extend `locales.test.ts` parity coverage for every new key.

## Phase 6: ADR-011 Addendum, FR-008 Status, Spec Merges, Verification (PR 6)

Traces: design Decision 11 (the addendum's 5 required content points); settled
decision *"The ADR-011 addendum ships here"*; proposal Success Criteria
*Documentation* + *Quality*.

- [ ] 6.1 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` — author `## Addendum (2026-09-09): review-history-company-scope — a third scope-resolution path, and the first MAINTENANCE_COMPANY_MANAGER permission`, appended after the 2026-09-08 addendum, matching its style. MUST cover, as its acceptance criteria (design Decision 11, verbatim structure):
  1. Layer 2 now has two sibling ports — `CommunityScopeChecker` and `CompanyScopeChecker` — both fail-closed, exhaustive on `Role`, re-read per request with no cache; the manager resolves through the second and never the first.
  2. The review-session module now has three scope-resolution paths across its two sibling access services (`SessionAccessService`, `ReviewHistoryAccessService`), a departure from `review-session` design Decision 4's "one door" phrasing — with the surviving invariant stated precisely (no identifier-only read on the port).
  3. `MAINTENANCE_COMPANY_MANAGER` becomes operational — `['reviewSession:read']`, delivering ADR-011 Decision 1's promised company-wide read visibility; `MANAGER`/`SYSTEM_ADMIN` and the role's two other named-but-unbuilt powers stay explicitly unbuilt.
  4. Attribution is frozen, not derived — `performedByCompanyId` at creation, backfill best-effort, stated as accepted limitation.
  5. Rejected, with the reason — a `maintenanceCompanyId` access-token claim, staleness/blast-radius argument in two sentences, flagged as a deliberate divergence from `role`'s handling.
- [ ] 6.2 `docs/requirements/functional-requirements.md` — FR-008 status: three of four scopes shipped (technician, representative, company); global scope named as the sole remaining one.
- [ ] 6.3 Merge `openspec/changes/review-history-company-scope/specs/authorization/spec.md` deltas into `openspec/specs/authorization/spec.md` — ADDED requirements inserted, MODIFIED requirements replaced wholesale, the RENAME (*Maintenance-Role Permissions Stay Inert* → *The Company Association Itself Confers No Permission*) applied, all scenarios carried over verbatim.
- [ ] 6.4 Merge `.../specs/review-history/spec.md` deltas into `openspec/specs/review-history/spec.md` — including the RENAME of the assignment-requirement (*…, Including for One's Own Sessions* → *…, Except for One's Own Performed Sessions*) with its E2E scenario inverted per the migration note, not deleted.
- [ ] 6.5 Merge `.../specs/review-history-ui/spec.md` deltas into `openspec/specs/review-history-ui/spec.md`.
- [ ] 6.6 Merge `.../specs/review-session-management/spec.md` deltas into `openspec/specs/review-session-management/spec.md`.
- [ ] 6.7 Run full suites: `npm run test --workspace=apps/api`, `npm run test:integration --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`, `npm run test --workspace=apps/web`, `npm run lint`, `npm run build`. All green; record final counts.
- [ ] 6.8 Browser verification (CLAUDE.md) against a running dev server with seeded data per proposal's Dependencies (a maintenance company, its `MAINTENANCE_COMPANY_MANAGER`, two technicians of that company with completed sessions on different communities, one technician of a different company with a completed session, one session whose performer has since transferred): log in as `MAINTENANCE_COMPANY_MANAGER` — entry link on `/`, company-wide list at realistic volume (measure and record the pain point per design's Open Questions), drill into a session performed by a technician the manager has no community relationship to, empty state for a company with no sessions; regression passes for `MAINTENANCE_TECHNICIAN` (own-history survives deactivation) and `COMMUNITY_REPRESENTATIVE`.
- [ ] 6.9 Confirm scope guards from proposal Success Criteria against the shipped code, not just tests: no `ManagerCapability` enum/`User.managerCapabilities`/`VIEW_ALL_REVIEWS` symbol; no unscoped "all sessions" query; no pagination/date-filter/sort/search control on any history read or page; no per-element history query/route/view; the repository port still exposes no unscoped `findById`; no write path touches a completed session beyond the attribution column written at performance time; `modules/users/**` and `modules/maintenance-company/**` gained no new manager-facing CRUD.
- [ ] 6.10 Update design.md's Open Questions section (precedent from the archived `review-history` change) — note the company-wide list's measured volume from 6.8 as the named remedy's evidence; carry forward `UserDirectory`'s soft-delete bypass as a "rule of three, not before" watch item.

## Deferred / Follow-up (do NOT implement in this batch)

- FR-008's global visibility scope (`SYSTEM_ADMIN`/`MANAGER` + `VIEW_ALL_REVIEWS`) and the whole `ManagerCapability` mechanism — its own later slice.
- Per-element history filtering (FR-008's other half).
- The company manager's other ADR-011 powers — scoped CRUD on their company's technicians, onboarding/disabling users.
- Company-attribution history/versioning (effective-dated employment, correction UI for a wrong backfill).
- The app-wide filtering/sorting/pagination/search initiative — named on record, not started, stubbed or parameterized here.
