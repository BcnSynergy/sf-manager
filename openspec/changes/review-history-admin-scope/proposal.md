# Proposal: System-Admin Review History Scope

## Intent

FR-008 defines four review-history visibility scopes. Three are shipped and
archived: `MAINTENANCE_TECHNICIAN` own + `COMMUNITY_REPRESENTATIVE` community
(`review-history`, archived 2026-09-09) and `MAINTENANCE_COMPANY_MANAGER`
company-wide (`review-history-company-scope`, archived 2026-09-13).

This slice builds the **fourth and last one being pursued now: a `SYSTEM_ADMIN`
sees every completed review session in the installation, with no scope filter at
all.** Verified today: `ReviewHistoryAccessService`'s `SYSTEM_ADMIN` branch
returns `[]`/`null` in both `listForActor` and `loadByRole`; `ROLE_PERMISSIONS`
grants `SYSTEM_ADMIN` 27 admin permissions and **no** `reviewSession:*`; the
`/review-history*` routes allow three roles, not this one.

So the role that administers every community, company, template and user — and
is the only role who can answer "did this building's reviews actually happen" —
is the one role that cannot read a single completed review. Every operator
support question, every compliance audit, every "this manager says they see
nothing" ticket today requires database access. That is the gap.

Success looks like: a `SYSTEM_ADMIN` logs in, follows a link from `/`, and reads
**every** completed session in the installation on the same `/review-history`
surface the other three roles already use, opening any one for the full record.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change** —
here that is pure role-widening of already-shipped pages, no new page.

Context: `[[sdd/explore/fr-008-global-and-per-element-scope]]`,
`openspec/changes/archive/2026-09-13-review-history-company-scope/`,
`openspec/changes/archive/2026-09-09-review-history/`, ADR-006, ADR-010,
ADR-011 (+ addenda), FR-008, FR-012.

## Settled scope decisions

Closed with the product owner before this proposal. **Inputs, not open items —
do not re-litigate in `sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **`SYSTEM_ADMIN` only** | `MANAGER` + `VIEW_ALL_REVIEWS` is explicitly **OUT**, deferred to its own later slice. It requires standing up the whole `ManagerCapability` mechanism (enum, `User.managerCapabilities` column + migration, capability checker) from scratch, with **no admin UI to grant the capability** — it would ship code with no reachable trigger. This slice MUST NOT touch `ManagerCapability` at all. |
| **Total oversight, no exceptions** | A `SYSTEM_ADMIN` sees **all** completed sessions, **including those of deactivated/soft-deleted communities and maintenance companies**. A deliberate divergence from the other three scopes (a representative loses a deactivated assignment's communities, a manager fails closed on a soft-deleted/company-less user): the purpose here is total system audit, not operational scoping. Deleted context must not hide a compliance record from the auditor. |
| **No scope predicate at all** | `SYSTEM_ADMIN` is unconditional — no Layer 2 checker call, no scope resolution, no fail-closed branch, because there is no scope to fail closed on. This is the first read path in the codebase with no scope narrowing, and that is the whole point of the slice. |
| **Reuse the shipped surface verbatim** | Same `/review-history` and `/review-history/:sessionId` pages and components the manager already uses since `review-history-company-scope` PR5. No new page, no admin variant, no new column, no controls. |
| **Demo mode gets no special handling** | FR-012's demo-mode `SYSTEM_ADMIN` auto-assignment is already gated by existing ADR-011 rules. This slice adds zero demo-mode-specific logic. |
| **Per-element history stays out** | FR-008's other half — a different query axis that would reverse `review-history-ui`'s standing "No Filtering, Analytics or Adjacent Controls Ship" rule. Its own future exploration/proposal, not touched here. FR-008 does not close with this slice. |

## Scope

### In Scope

**API (`apps/api/src/modules/review-session/`)**

- An **unscoped** repository method pair on `ReviewSessionRepository` —
  list + by-id, `WHERE status = 'completed'` and nothing else, following the
  shipped one-named-method-per-(scope × shape) convention with **no scope
  discriminant** (names are `sdd-design`'s). Same
  `COMPLETED_HISTORY_ORDER_BY` direction as every other list method.
- Both adapters (Prisma + in-memory fake) for the new pair.
- The `SYSTEM_ADMIN` branch in `ReviewHistoryAccessService.listForActor` and
  `loadByRole`, replacing the current `[]`/`null`: a direct repository call
  with no checker call before it. The exhaustive `switch` and its
  `satisfies never` backstop stay.
- Same routes (`GET /review-history`, `GET /review-history/:sessionId`),
  scope still resolved entirely server-side from the actor.
- Every shipped invariant holds: completed-only, drafts never surface,
  out-of-scope/nonexistent id → `404 REVIEW_SESSION_NOT_FOUND`. Note: for
  this actor only a genuinely nonexistent or draft id can 404.

**Authorization**

- `SYSTEM_ADMIN` gains `reviewSession:read` — its first `reviewSession:*`
  permission ever — and **nothing else** (no create/perform/complete/discard).
  `MANAGER` stays `[]`.
- The new visibility rule as a requirement in its own right: this permission
  plus the `SYSTEM_ADMIN` role grants **every** completed session, explicitly
  including those of deactivated/soft-deleted communities and companies.
- Narrowing (not deleting) the shipped deferral guards so
  `MANAGER`/`VIEW_ALL_REVIEWS`/`ManagerCapability` and per-element history
  stay explicitly unbuilt.

**Web (`apps/web/`)**

- Add `SYSTEM_ADMIN` to both `/review-history*` routes'
  `ProtectedRoute allowedRoles` in `App.tsx`.
- Add `SYSTEM_ADMIN` to `HealthPage.tsx`'s `REVIEW_HISTORY_ROLES` — no admin
  dashboard exists (verified), so `/` is the admin's entry point too, exactly
  as it is the manager's.
- Reuse `ReviewHistoryPage.tsx` / `ReviewHistoryDetailPage.tsx` unmodified.
  No new i18n key is anticipated (`health.reviewHistoryLink` already exists);
  any new key gets real `en`/`es`/`ca` translations.

**Documentation + cross-cutting**

- FR-008's status: the `SYSTEM_ADMIN` scope shipped; `MANAGER` +
  `VIEW_ALL_REVIEWS` and per-element history named as what remains.
- Unit, E2E four-role visibility matrix (including the deactivated-community
  and soft-deleted-company cases asserted as **visible** to the admin), and
  **browser verification** against a running dev server with a
  `SYSTEM_ADMIN` login (CLAUDE.md).

### Out of Scope (non-goals)

- **`MANAGER` + `VIEW_ALL_REVIEWS` and the entire `ManagerCapability`
  mechanism** — no enum, no `User.managerCapabilities`, no migration, no
  capability-gated permission layer, no grant UI. `MANAGER` stays `[]`.
- **Per-element history** (FR-008's other half).
- **A new admin dashboard**, navigation component or layout refactor.
- **Audit logging** of who read which history record.
- **Export** (FR-010), signing, PDFs, reports.
- **Filtering, sorting, pagination, search** — `review-history-ui`'s
  "No Filtering, Analytics or Adjacent Controls Ship" stays in force
  **unchanged**, even though this is now by far the largest list in the app.
- **Any schema change or migration.** "See everything" needs no column.
- **Any change to the other three roles' visibility**, to the review-session
  write path, or to `SessionAccessService` (byte-unchanged).
- **Demo-mode-specific logic** of any kind.

### Why this scope and not more (ADR-006)

`SYSTEM_ADMIN` global visibility is the one half of FR-008's fourth scope that
costs nothing structural: one method pair, one branch, one permission entry,
two role-list widenings, zero new primitives. `MANAGER`'s half needs a
capability mechanism that exists nowhere in the codebase and has no way to be
granted. Per-element history needs a product conversation about reversing a
standing UI rule. Bundling any of them would put the app's first unscoped read
in the same review as a new authorization primitive.

## Capabilities

### New Capabilities

- None. This extends `review-history` and `review-history-ui`; the surface,
  routes, pages and permission family all exist.

### Modified Capabilities

- `review-history` — add the `SYSTEM_ADMIN` unscoped visibility as a
  requirement in its own right (explicitly including deactivated/soft-deleted
  communities and companies); narrow *"The Deferred Review Visibility Scopes
  Are Not Built"* to `MANAGER`/`VIEW_ALL_REVIEWS`/`ManagerCapability` and
  per-element only, and amend its now-false scenarios (*"Every company-scoped
  query names a single company; no global query exists"*, *"The only migration
  is the attribution column and its backfill"*); confirm
  *"History Scope Is Carried by the Query, Not by the Caller"* still holds
  when the scope is "everything".
- `review-history-ui` — add `SYSTEM_ADMIN` to *"Role-Gated Route Access for
  the History Views"*; give it a reachable entry point from `/`; keep the
  no-filtering guard intact and unchanged.
- `authorization` — `SYSTEM_ADMIN` gains `reviewSession:read`; the global
  visibility rule; narrow *"The Deferred Review Visibility Scopes Grant
  Nothing"* to `MANAGER`/`VIEW_ALL_REVIEWS`/`ManagerCapability` and replace
  its now-false claims (*"`SYSTEM_ADMIN`'s row MUST be unchanged"*, *"No
  unscoped 'all sessions' history read MUST exist"*) with the precise new
  rule.

## Approach

Extend `review-session` again, at exactly the seam three prior slices built.

Four proposal-level choices:

1. **No scope predicate, stated as a requirement — not as an omission.** The
   admin's `WHERE` is `status = 'completed'`, full stop. The danger of this
   slice is that "no filter" is indistinguishable in code review from
   "forgot the filter", so the spec must assert the unscoped read is
   *intended* and the port must name it unmistakably (e.g. a name a reader
   cannot mistake for a scoped one).
2. **No Layer 2 checker call in the admin branch.** There is no
   `AdminScopeChecker` to add: a checker that always returns "everything" is
   ceremony that dilutes the meaning of the two real checkers. The role
   *is* the scope. This keeps `CommunityScopeChecker`/`CompanyScopeChecker`
   meaning exactly what they mean today.
3. **The new pair is the only unscoped read, and `findById` stays absent.**
   The shipped invariant is "no identifier-only read on the port". The by-id
   admin method takes an id and no scope — so it *is* an identifier-only
   read, for this actor by design. `sdd-design` MUST state how the invariant
   is preserved for every other caller (naming, reachability, and the fact
   that only `ReviewHistoryAccessService`'s admin branch may call it). **This
   is the single biggest decision in the slice.**
4. **Reuse the shipped surface end to end.** Same routes, same pages, same
   `reviewSession:read` permission — the scope, not the permission or the
   surface, is what differs. Four roles, one server-scoped endpoint, zero
   client-side filtering.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches
`review-history-admin-scope/<NN>-<slug>`, titles
`feat(review-history-admin-scope): PR N/M — ...`. Materially smaller than the
previous two slices; `sdd-tasks` owns the split and the 400-line forecast.

| PR | Content |
|---|---|
| ~1 | Unscoped port method pair + both adapters + the access-service `SYSTEM_ADMIN` branch |
| ~2 | `ROLE_PERMISSIONS` entry, visibility rule, E2E four-role matrix incl. the deactivated/soft-deleted cases |
| ~3 | Web role-widening + entry link, spec amendments, FR-008 status, browser verification |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `.../review-session/application/ports/review-session.repository.port.ts` | Modified | Unscoped completed list + by-id pair |
| `.../review-session/infrastructure/persistence/**` (Prisma + in-memory fake) | Modified | Adapters for the new pair |
| `.../review-session/application/services/review-history-access.service.ts` | Modified | `SYSTEM_ADMIN` branch in both switches, replacing `[]`/`null` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modified | `SYSTEM_ADMIN` gains `reviewSession:read` |
| `apps/web/src/App.tsx` | Modified | `SYSTEM_ADMIN` added to both `/review-history*` `allowedRoles` |
| `apps/web/src/pages/HealthPage.tsx` (+ `.test.tsx`) | Modified | `SYSTEM_ADMIN` added to `REVIEW_HISTORY_ROLES`; the manager's link-enumeration test needs an admin sibling |
| `apps/web/src/auth/ProtectedRoute.test.tsx` | Modified | 3-role route family becomes 4 |
| `openspec/specs/{review-history,review-history-ui,authorization}/spec.md` | Modified | Delta specs |
| `docs/requirements/functional-requirements.md` | Modified | FR-008 status |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Four-role visibility matrix + deactivated/soft-deleted visibility cases |

**No schema change, no migration, no new column, no backfill** — a real relief
versus the company-scope slice. Untouched: `modules/users/**`,
`modules/maintenance-company/**`, `modules/community/**`, both scope checkers,
`SessionAccessService`, and the entire write path.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The unscoped method is reachable from a non-admin path**, turning the app's first "see everything" query into a leak for the other three roles | High | The method is called from exactly one branch of one service; `sdd-verify` enumerates every call site; the E2E four-role matrix asserts each non-admin role still sees only its own scope after this change, no sampling |
| **The unscoped by-id method becomes a de facto bare `findById`**, destroying the shipped "no identifier-only read on the port" property | High | Approach choice 3 makes this `sdd-design`'s explicit deliverable, not an afterthought; naming must make misuse obvious; a test asserts no other use case calls it |
| **A reviewer or a later slice reads "no `WHERE` scope" as a bug and "fixes" it**, silently breaking admin oversight | Med | Spec asserts the unscoped read as intended behaviour with its own scenario, including the deactivated/soft-deleted cases; the port comment states it; the E2E test would fail on a re-added filter |
| **Scope creep into `MANAGER`/`VIEW_ALL_REVIEWS`.** "While we're here" is one `ROLE_PERMISSIONS` line away and pulls in the whole capability mechanism | High | Explicit non-goal; `sdd-verify` asserts `MANAGER` is still `[]` and that no `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` symbol exists anywhere |
| **The installation-wide list is unusable** — every session, every company, every community, all time, with no filter, sort or pagination by settled decision | Med | Accepted deliberately and on record; the app-wide filtering initiative (named in the company-scope slice) is the remedy. Flagged for browser verification with realistic volume so the pain is measured, not assumed |
| **Widening the shipped pages breaks the three roles already using them** | Low | Same surface, no variant; existing component/route tests keep asserting all four roles; browser verification per role |
| **`SYSTEM_ADMIN` gaining its first `reviewSession:*` permission is read as "admin can now perform reviews"** | Low | Exactly one permission added; spec scenario asserts no create/perform/complete/discard, and that `/review-sessions*` write routes are NOT widened |

## Rollback Plan

`git revert` the branch. **There is no migration and no schema change**, so
nothing is asymmetric — unlike `review-history-company-scope`, this rollback is
lossless. Reverting removes the unscoped port method pair and its adapters, the
access-service branch (back to `[]`/`null`), the `ROLE_PERMISSIONS` entry and
the two web role widenings, returning `SYSTEM_ADMIN` to holding no
`reviewSession:*`. No shipped port signature breaks; the other three roles'
paths are untouched.

Spec amendments and the FR-008 status must be reverted with the code, or the
specs will claim a grant the code no longer honours. Each PR in the sketched
chain reverts independently.

## Dependencies

- **`review-history` (archived 2026-09-09)** — routes,
  `ReviewHistoryAccessService`, both pages, the read-only detail view.
- **`review-history-company-scope` (archived 2026-09-13)** — the per-branch
  scope-resolution shape, the performer column on rows and the detail
  performer line (both already render for any actor), and the `HealthPage`
  entry-link precedent this slice copies.
- **`review-session` (FR-007)** — the aggregate, the permission family,
  `SessionAccessService` (stays byte-unchanged).
- **No new runtime dependency.** Reuses `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `buildCodedError`,
  `apiFetch`/`ApiError`, `ProtectedRoute allowedRoles`.
- For browser verification: a running dev server plus seeded data —
  completed sessions across **at least two different maintenance companies**
  and **two different communities**, plus at least one session whose
  community or company has been deactivated/soft-deleted.

## Success Criteria

**Reading all history**

- [ ] A `SYSTEM_ADMIN` sees **every** completed session in the installation,
      across all companies, communities and technicians, in the same
      deterministic order the other scopes use.
- [ ] They can open any of those sessions and read back the full recorded
      record, identically to what the performer would see.
- [ ] Sessions of a **deactivated/soft-deleted community or maintenance
      company are visible** to the admin — the one scope with no exceptions.
- [ ] An empty installation renders an empty state, not an error.
- [ ] Drafts never appear, for this actor either.

**Visibility**

- [ ] The three shipped scopes are **unchanged**: technician own-only
      (surviving assignment deactivation), representative active-communities
      only, manager own-company only and fail-closed on a null company.
- [ ] A nonexistent or draft `sessionId` still returns
      `404 REVIEW_SESSION_NOT_FOUND` for the admin.
- [ ] `SYSTEM_ADMIN` holds `reviewSession:read` and **no other**
      `reviewSession:*` permission; `MANAGER` is still `[]`.
- [ ] No write route (`/review-sessions*`) is widened to `SYSTEM_ADMIN`.

**Scope guards**

- [ ] No `ManagerCapability` enum, `User.managerCapabilities` field,
      `VIEW_ALL_REVIEWS` permission or capability-gated layer exists.
- [ ] No per-element history query, route or view exists.
- [ ] No pagination, date filter, sort or search control ships on any history
      read or page.
- [ ] The unscoped pair is called **only** from the `SYSTEM_ADMIN` branch of
      `ReviewHistoryAccessService`; no other use case or service reaches it.
- [ ] No migration was added; `schema.prisma` is unchanged.
- [ ] No demo-mode-specific branch was added.

**Documentation & quality**

- [ ] FR-008's status records the `SYSTEM_ADMIN` scope as shipped and names
      `MANAGER` + `VIEW_ALL_REVIEWS` and per-element history as what remains.
- [ ] Zero hardcoded UI strings; any new key has real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server
      with a `SYSTEM_ADMIN` login — not only test-verified (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Each has a working assumption; none blocks the next phases.

1. **Naming of the unscoped pair.** It must read as deliberately unscoped and
   must not be pickable by autocomplete for a scoped need (the company-scope
   slice deleted a dead method for exactly this reason). *Working
   assumption*: an explicit `…Unscoped`/`…AcrossInstallation` marker in the
   name rather than a bare `findAllCompleted`.
2. **How the "no identifier-only read" invariant is restated** now that one
   by-id method legitimately carries no scope. *Working assumption*: the
   invariant becomes "every by-id read carries a scope **or** is reachable
   only from the role branch that has none" — `sdd-design` owns the wording
   and the enforcement.
3. **Whether the `SYSTEM_ADMIN` branch needs any guard at all** beyond the
   role (e.g. a soft-deleted admin). *Working assumption*: authentication
   already resolves the actor; no extra check — but state it explicitly
   rather than letting the absence decide.
4. **Whether the existing row shape is sufficient** for an installation-wide
   list (community + performer + completedAt, no company column). *Working
   assumption*: unchanged — adding a company column is UI scope this slice's
   success criteria do not require (ADR-006).

## Deferred by this slice (ADR-006 record)

Not designed here, deliberately:

- **`MANAGER` + `VIEW_ALL_REVIEWS`** and the `ManagerCapability` mechanism —
  its own later slice, which must also answer how a capability gets granted.
- **Per-element history** — its own future exploration, which must first
  settle whether it reverses `review-history-ui`'s no-filtering rule.
- **App-wide filtering/sorting/pagination/search** — the cross-cutting
  initiative named in `review-history-company-scope`.

**FR-008 does not close with this slice.** It closes after the `MANAGER`
capability slice and the per-element slice land.

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding. `sdd-design` owns open questions 1-3, above all how the
unscoped by-id read preserves the shipped port invariant.
