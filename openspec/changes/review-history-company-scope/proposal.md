# Proposal: Company-Scoped Review History

## Intent

`review-history` (FR-008, first slice) shipped and archived 2026-09-09 with
**two** of FR-008's four visibility scopes: a `MAINTENANCE_TECHNICIAN` sees the
sessions they performed, a `COMMUNITY_REPRESENTATIVE` sees their actively
assigned communities'. Both resolve through the shipped Layer 2
`CommunityScopeChecker`; both deferred scopes were cut because they needed
infrastructure that did not exist.

This slice builds the third: **a `MAINTENANCE_COMPANY_MANAGER` sees every
completed review session performed on behalf of their maintenance company.**
ADR-011 Decision 1 has promised exactly this since the role was declared
("Read access to every `ReviewSession` performed by any technician of their
company"), and the role has been inert (`ROLE_PERMISSIONS` → `[]`) ever since.

Today a company manager can log in and reach nothing. The people commercially
and legally accountable for the RIPCI work their technicians perform cannot see
any of it — not one session, not one answer. Every review their company
produces is visible to the technician who walked the building and to the
community that received the visit, and invisible to the company that signed the
contract.

Success looks like: a `MAINTENANCE_COMPANY_MANAGER` logs in, opens the same
`/review-history` surface the other two roles already use, sees every completed
session performed under their company's name across all technicians and all
communities, and can open any one to read back the full recorded record.

This slice also carries the structural change that makes the scope truthful:
the performing **company is frozen onto the session at performance time**, so a
technician changing employer never rewrites who a past review belongs to.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change** —
here it is mostly role-widening on already-shipped pages, not new pages.

Context: `[[sdd/explore/maintenance-company-manager-review-history]]`,
`[[sdd/review-history-company-scope/product-decisions]]`,
`openspec/changes/archive/2026-09-09-review-history/` (proposal, design
Decisions 1/2/3/4, specs), ADR-006, ADR-010, ADR-011 + its 2026-09-08 addendum,
ADR-013, `docs/requirements/functional-requirements.md` FR-008.

## Settled scope decisions

Closed with the product owner on 2026-09-09, before this proposal. **Inputs,
not open items — do not re-litigate in `sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **Attribution is frozen at performance time** | A new `ReviewSession` column (working name `performedByCompanyId`) snapshots the performing technician's maintenance company, written by the system when the session is created/completed. A manager MUST always see what was done in their company's name, even after that technician moves on. The manager's view MUST NOT be derived from the technician's **current** `User.maintenanceCompanyId`. |
| **Backfill is best-effort** | Existing completed sessions are backfilled with the performer's current `maintenanceCompanyId`. Accepted, explicitly: rows are wrong for any technician who already switched companies — deemed rare and acceptable, not worth a history mechanism the schema never had. |
| **No filtering, sorting, pagination or search** | `review-history-ui`'s shipped "No Filtering, Analytics or Adjacent Controls Ship" requirement stays in force **unchanged**, including for the company-wide list, even though it is the largest list in the app so far. |
| **Filtering is a separate, app-wide initiative** | Filtering/sorting/pagination/search across **all** entities is a future cross-cutting slice of its own, not a review-history feature. Named here as a deferred item so it is on record; nothing about it is scoped, designed or prepared for in this change. |
| **The ADR-011 addendum ships here** | Deferred twice already (`review-session`, then `review-history` design Open Questions). This slice adds a third scope-resolution path to the review-session module, making it the natural — and final acceptable — moment to document the module's departure from the "one door" access-service pattern. |
| **Only the third scope** | FR-008's fourth and last scope (`SYSTEM_ADMIN`/`MANAGER` + `VIEW_ALL_REVIEWS`, global visibility) and the whole `ManagerCapability` mechanism stay deferred to their own later slice. FR-008 closes only after that one lands. |
| **A technician's own history survives assignment deactivation** (added 2026-09-09, REVERSES a prior decision) | The shipped `review-history` requirement — confirmed with the product owner on 2026-09-08, enforced by a dedicated E2E scenario — currently says a `MAINTENANCE_TECHNICIAN` loses access to their OWN performed sessions on a community the moment their assignment there is deactivated. The product owner has now reversed this: a technician MUST always be able to see the sessions they personally performed, regardless of current assignment status. This does NOT extend to other technicians' sessions on that community — a deactivated technician still sees nothing beyond their own performed work. In scope for THIS change's `sdd-spec`/`sdd-design`, alongside the company scope, since both touch the same `Resource Scope for Review History Reads` requirement: amend `openspec/specs/authorization/spec.md` (flip or replace the "requires a currently active assignment" scenario), the `ReviewHistoryAccessService`/repository scope-resolution logic, and the corresponding E2E test. This directly changes the risk framing below — the community-assignment gate no longer needs to be preserved for the technician's own-history case, only for cross-technician visibility. |

## Scope

### In Scope

**Data model (`apps/api/prisma/`)**

- A nullable company column on `ReviewSession` snapshotting the performing
  technician's maintenance company, plus its index — the read path filters on
  exactly this column on every manager request.
- A **migration with a data backfill** for already-completed sessions, per the
  settled decision. First migration in this module's history slices; the
  hand-written-FK conventions of ADR-013 apply (no Prisma `@relation` for a
  cross-module FK).
- The write path populates the column when a session is opened/completed. This
  is the first time `review-session` needs to know a user's company — it has no
  port for that today (verified: no `maintenanceCompanyId` reference anywhere in
  `modules/review-session/src`).

**API read side (`apps/api/src/modules/review-session/`)**

- Company-scoped list and by-id repository port methods, one named method per
  (scope × shape), following design Decision 3's shipped precedent — no scope
  discriminant, no parameterized filter object.
- The company branch in the read-side access service and its use cases: this
  actor's scope is **a company id, not a set of community ids**, so it does not
  and must not route through `CommunityScopeChecker.listAssignedCommunityIds`.
- Same routes (`GET /review-history`, `GET /review-history/:sessionId`), scope
  still resolved entirely server-side from the actor. No new route is
  anticipated; confirming that is `sdd-design`'s.
- All the shipped invariants hold unchanged: completed-only, no unscoped
  `findById` on the port, out-of-scope id → `404 REVIEW_SESSION_NOT_FOUND`
  indistinguishable from nonexistent.

**Authorization**

- `MAINTENANCE_COMPANY_MANAGER` gains `reviewSession:read` (its first
  permission ever) and **nothing else**; `MANAGER` and `SYSTEM_ADMIN` rows are
  untouched.
- The **new visibility rule** as a requirement in its own right: this
  permission plus the actor's own company grants the completed sessions
  attributed to that company and nothing else. Crucially, the shipped
  requirement *"History Access Requires a Currently Active Community
  Assignment"* must be **narrowed to the two community-scoped roles**, not
  applied to the manager — a manager holds no community assignment, so
  inheriting it verbatim would grant them exactly nothing.
- Narrowing (not deleting) the shipped deferral guards so the global scope,
  `VIEW_ALL_REVIEWS` and `ManagerCapability` stay explicitly unbuilt.

**Web (`apps/web/`)**

- Role-widening of the two shipped pages/routes (`ReviewHistoryPage.tsx`,
  `ReviewHistoryDetailPage.tsx`, `ProtectedRoute allowedRoles`) — same surface,
  no manager-specific variant, per `review-history-ui`'s "the same surface,
  with no reduced or alternative variant" rule.
- A reachable entry point for the manager. The shipped entry-point requirement
  routes through `/review-sessions` (the technician/representative **write**
  surface), which the manager must not gain; the manager needs a direct link
  from `/` (`HealthPage.tsx`'s existing role-conditional link is the precedent).
- A row must identify **who performed** the session for this actor — a
  company-wide list of one technician's name repeated is not what a manager
  needs. Whether the shipped row shape already carries it is `sdd-design`'s to
  confirm (see *Open questions*).
- Real `en`/`es`/`ca` translations for any new key, parity-enforced.

**Documentation**

- **The ADR-011 addendum** recording the review-session module's multiple
  access services / scope-resolution paths, and this slice's activation of the
  first `MAINTENANCE_COMPANY_MANAGER` permission against ADR-011 Decision 1.
- FR-008's status in `docs/requirements/functional-requirements.md` reflects
  three of four scopes shipped.

**Cross-cutting**

- Unit, integration (migration + backfill against real Postgres, per the
  shipped `review-session-migration.integration.spec.ts` precedent), E2E
  visibility matrix, and **browser verification** against a running dev server
  including a login as `MAINTENANCE_COMPANY_MANAGER` (CLAUDE.md).

### Out of Scope (non-goals)

- **Global visibility** (`SYSTEM_ADMIN` / `MANAGER` + `VIEW_ALL_REVIEWS`) and
  the entire `ManagerCapability` mechanism: no enum, no
  `User.managerCapabilities`, no capability-gated permission layer. Both roles
  stay exactly as they are.
- **Filtering, sorting, pagination and search** — deferred to the separate
  app-wide initiative named above. Not prepared for, not stubbed, not
  parameterized "just in case".
- **Per-element history filtering** (FR-008's other half).
- **The company manager's other ADR-011 powers** — scoped CRUD on their
  company's technicians, onboarding/disabling users. This slice gives the role
  read access to reviews only; `modules/users/**` and
  `modules/maintenance-company/**` are untouched apart from any read port this
  slice must consume.
- **Company-attribution history/versioning.** One frozen snapshot column, no
  effective-dated employment table, no correction UI for a wrong backfill.
- **Editing, annotating or deleting history** (ADR-010: completed sessions are
  permanently immutable). Read-only end to end.
- **Signing/export (FR-010), scheduling/reminders (FR-009), analytics,
  aggregates, per-company dashboards, notifications.**
- Any change to the technician's or representative's existing visibility
  behaviour, or to the review-session **write** flow beyond populating the new
  column.

### Why this scope and not more (ADR-006)

The third scope is the one whose prerequisite is real but bounded: one column,
one migration, one new scope predicate. The fourth needs a capability
mechanism that exists nowhere in the codebase and whose blast radius is "one
role sees every compliance record in the installation" — a different risk
class, deserving its own review. Bundling them would put the app's first
global-read surface into the same PR chain as its first data-model change to
`ReviewSession`.

## Capabilities

### New Capabilities

- None. This slice extends `review-history` and `review-history-ui` rather than
  introducing a capability; the surface, the routes and the pages already exist.

### Modified Capabilities

- `review-history` — add the company-wide visibility scope (attributed by the
  frozen performing company, **not** by the performer's current company, and
  **not** gated on community assignment) as a requirement in its own right;
  narrow *"The Deferred Review Visibility Scopes Are Not Built"* to the global
  scope and per-element half only, and amend its now-false scenarios (*"No
  company-scoped or global review query exists"*, *"No migration ships with this
  change"*); scope *"History Access Requires a Currently Active Community
  Assignment"* to the two community-scoped roles.
- `review-history-ui` — add `MAINTENANCE_COMPANY_MANAGER` to the role-gated
  routes; give it a reachable entry point that does not route through the
  review-session write surface; keep the no-filtering guard intact.
- `authorization` — `MAINTENANCE_COMPANY_MANAGER` gains `reviewSession:read`;
  the company-scope visibility rule; narrow *"The Deferred Review Visibility
  Scopes Grant Nothing"* to `MANAGER`/`SYSTEM_ADMIN`/`ManagerCapability`, and
  replace its now-false claim that `maintenanceCompanyId` has no effect on any
  history authorization decision with the precise new rule; also amend
  *"Resource Scope for Review History Reads"* so a technician's OWN performed
  sessions no longer require a currently-active assignment (reversed
  2026-09-09) while an active assignment stays required to see anyone else's.
- `review-session-management` — a completed session records the company on
  whose behalf it was performed, frozen at performance time and immutable
  thereafter; narrow its FR-008 deferral row accordingly.

## Approach

Extend the `review-session` module again, as `review-history` did — the
aggregate, the port and both access services live there.

Five proposal-level choices:

1. **Freeze the attribution in the row, do not join to the user.** The manager's
   query filters `ReviewSession.performedByCompanyId`, never
   `performedById → User.maintenanceCompanyId`. This is what makes the settled
   product decision structural rather than a convention someone can forget: there
   is no join to accidentally write the other way, and the "who did this belong
   to" answer cannot drift when an employment record changes.
2. **One named repository method per (scope × shape), no scope discriminant.**
   Inherited verbatim from design Decision 3. The company scope is a third
   `WHERE`, trivially auditable; a branching query builder with three scopes is
   exactly the "one branch silently missing a filter" risk this surface cannot
   take.
3. **Company scope is a new Layer 2 resolution, not a third branch of the
   community checker.** `CommunityScopeChecker` answers "which communities is
   this actor assigned to" and correctly returns `[]` for a manager. Forcing the
   company scope through it would either grant nothing or corrupt its meaning.
   The company path resolves the actor's own company and carries **that** in the
   port signature — the binding invariant (scope lives in the port, never in
   caller-side filtering; no identifier-only read) is preserved unchanged. Where
   that resolution lives, and whether it is a shared authorization port shaped
   like `CommunityScopeChecker`, is `sdd-design`'s.
4. **Fail closed on a missing company, both sides.** `User.maintenanceCompanyId`
   is nullable and `performedByCompanyId` will be too. A manager with no company
   MUST see nothing — never everything; a session with no attributed company MUST
   appear in no manager's list. Stated here as binding because the null-handling
   failure mode is a silent full-table read.
5. **Reuse the shipped surface end to end.** Same routes, same pages, same
   `reviewSession:read` permission — the scope, not the permission or the
   surface, is what differs. Three roles, one server-scoped endpoint, zero
   client-side filtering.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches
`review-history-company-scope/<NN>-<slug>`, titles
`feat(review-history-company-scope): PR N/M — ...`. `sdd-tasks` owns the split
and the 400-line forecast; the migration should be its own reviewable PR.

| PR | Content |
|---|---|
| ~1 | Schema column + migration + backfill + write-path snapshot, with migration integration tests |
| ~2 | Company-scoped port methods, adapters, access-service branch, use cases, route wiring |
| ~3 | Authorization: role permission, visibility rule, E2E scope matrix across all three roles |
| ~4 | Web role-widening, manager entry point, performer identification on rows, i18n |
| ~5 | Spec amendments, ADR-011 addendum, FR-008 status, browser verification, final checks |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` + `prisma/migrations/**` | Modified/New | Company snapshot column, index, migration **with data backfill** |
| `.../review-session/domain/review-session.entity.ts` | Modified | The session carries its performing company |
| `.../review-session/application/ports/review-session.repository.port.ts` | Modified | Company-scoped list + by-id reads (still no unscoped `findById`) |
| `.../review-session/infrastructure/persistence/**` (Prisma + in-memory fake) | Modified | Adapters for the new methods and the new column |
| `.../review-session/application/services/review-history-access.service.ts` | Modified | The company branch — third scope-resolution path |
| `.../review-session/application/use-cases/open-review-session.use-case.ts` | Modified | Snapshot the performer's company at creation |
| `.../review-session/application/use-cases/**` (history) | Modified/New | Company-scoped list and read |
| A company-resolution port consumed by `review-session` | New | The module reads no user's company today — shape is `sdd-design`'s |
| `.../auth/**` `ROLE_PERMISSIONS` / role-permission checker | Modified | `MAINTENANCE_COMPANY_MANAGER` → `['reviewSession:read']` |
| `apps/web/src/App.tsx`, `pages/ReviewHistory*.tsx`, `pages/HealthPage.tsx` | Modified | Role-widening, manager entry point, performer on rows |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real translations |
| `openspec/specs/{review-history,review-history-ui,authorization,review-session-management}/spec.md` | Modified | Delta specs |
| `docs/adr/ADR-011-*.md`, `docs/requirements/functional-requirements.md` | Modified | Addendum + FR-008 status |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Three-role visibility matrix, attribution-survives-transfer case, technician's-own-history-survives-deactivation case |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **A company query leaks another company's sessions**, or a null company degrades to an unfiltered read returning every compliance record in the installation | High | Approach choice 4 states fail-closed as binding; scope lives in the port signature; E2E asserts the full three-role matrix plus the two null cases (manager without company, session without company) explicitly, no sampling |
| **The backfill is wrong or partially applied**, silently attributing reviews to the wrong company — the one thing this change is supposed to get right | High | Backfill is a reviewed migration PR of its own, with an integration test against real Postgres asserting row-level attribution; wrongness for already-transferred technicians is a **stated accepted** limitation, not an undetected bug |
| **The write path forgets the snapshot** on some creation route, producing sessions permanently invisible to every manager — and unfixable later, since the whole point is that current employment is not the source of truth | High | The column is written in the session's own creation path, not by a caller; a test asserts a newly opened session always carries the performer's company; `sdd-design` decides creation vs. completion deliberately |
| **The manager is forced through the community-assignment gate** and sees an empty list — the gate was designed for the two community-scoped roles, not a company-scoped one | High | Named as in-scope spec work: the manager's scope resolution bypasses `CommunityScopeChecker` entirely (per Approach choice 3), so this risk is about not accidentally routing the manager through it, not about preserving it unchanged. **Updated 2026-09-09**: the representative's community-gate stays exactly as shipped; the technician's own-history gate is being deliberately narrowed by this same change (see the new settled decision above) so it no longer blocks a technician's own performed sessions, only other technicians'. `sdd-verify` asserts: representative gate unchanged, technician's own-session access survives deactivation, technician still cannot see a community-mate's sessions after deactivation (or before, for that matter) |
| **Scope creep into global visibility.** "While we're here, let `MANAGER` see everything too" is one `ROLE_PERMISSIONS` line away and pulls in the whole `ManagerCapability` mechanism | Med | Explicit non-goal; `sdd-verify` asserts `MANAGER` is still `[]`, `SYSTEM_ADMIN` holds no `reviewSession:*`, and no `ManagerCapability`/`VIEW_ALL_REVIEWS` symbol exists |
| **The company list is large and unusable** — all technicians × all communities × all time, with no filter, sort or pagination by settled decision | Med | Accepted deliberately and on record; the app-wide filtering initiative is the named remedy. Flagged for browser verification with realistic volume so the pain is measured, not assumed |
| **A migration on `ReviewSession` breaks the hand-written partial unique index or the FK conventions** Prisma cannot see (ADR-013) | Med | The shipped `review-session-migration.integration.spec.ts` precedent covers exactly this; extend it rather than trusting Prisma's diff |
| **Widening the shipped pages breaks the two roles already using them**, or shows the manager a technician-only control | Med | Same surface, no variant, per the shipped UI requirement; component tests keep asserting all three roles' rendering; browser verification for each |
| **The ADR-011 addendum slips a third time** | Med | In scope as a named deliverable with its own PR row and success criterion |
| ES/CA translations stubbed with English placeholders | Low | Real translations in scope; `locales.test.ts` parity guard covers new keys |

## Rollback Plan

`git revert` the branch **plus a down migration** — unlike `review-history`,
this change is asymmetric, and that is its defining rollback property.

- Code revert removes the company-scoped reads, the role's permission, the
  page role-widening and the entry point, returning the manager to inert. No
  shipped port signature breaks; the technician and representative paths are
  untouched.
- The column must be dropped explicitly. Dropping it **discards the backfill**,
  so re-applying the change later re-derives attribution from current
  employment, which will have drifted further. Reverting after the change has
  been live is therefore lossy in a way no previous history slice was —
  `sdd-design` should state whether the safe rollback is "revert code, keep the
  column" (recommended default: the column is nullable and unread by any
  remaining code path).
- Spec amendments and the ADR-011 addendum must be reverted together with the
  code, or the specs will claim a deferral the code no longer honours in the
  other direction.
- Each PR in the sketched chain reverts independently; the migration PR is the
  one that needs a deliberate decision rather than a `git revert`.

## Dependencies

- **`review-history` (FR-008, first slice) — shipped and archived 2026-09-09.**
  Supplies the routes, `ReviewHistoryAccessService`, the read-side port methods,
  both pages and the read-only detail view. This slice adds a third scope to all
  of it.
- **`review-session` (FR-007)** — the aggregate, the write path, the
  permission family, `SessionAccessService` (which stays byte-unchanged).
- **`users` / `maintenance-company`** — `User.maintenanceCompanyId` and the
  `MaintenanceCompany` table already exist; this slice needs a read of a user's
  company from the review-session module, which no port provides today.
- **No new runtime dependency.** Reuses `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `buildCodedError`,
  `apiFetch`/`ApiError`, `ProtectedRoute allowedRoles`.
- For browser verification: a running dev server and seeded data — a
  maintenance company, a `MAINTENANCE_COMPANY_MANAGER` for it, at least two
  technicians of that company with completed sessions on **different**
  communities, one technician of a **different** company with a completed
  session, and ideally one session whose performer has since transferred.

## Success Criteria

**Reading company history**

- [ ] A `MAINTENANCE_COMPANY_MANAGER` sees every completed session attributed
      to their company, across all their technicians and all communities, in
      the same deterministic order the other scopes use.
- [ ] They can open any of those sessions and read back the full recorded
      record, identically to what the performer would see.
- [ ] Each row identifies who performed the session.
- [ ] An empty company history renders an empty state, not an error.

**Attribution**

- [ ] A session completed by a technician who **later transfers** to another
      company still appears for the original company's manager, and does **not**
      appear for the new company's manager.
- [ ] Every newly opened session carries the performer's company.
- [ ] Pre-existing completed sessions were backfilled and are visible.

**Visibility**

- [ ] A manager sees **none** of another company's sessions, on any route.
- [ ] A manager with no maintenance company sees **nothing** — not everything.
- [ ] A session with no attributed company appears in no manager's list.
- [ ] An out-of-scope `sessionId` returns `404 REVIEW_SESSION_NOT_FOUND`,
      indistinguishable from a nonexistent one.
- [ ] The representative's visibility, including the assignment-deactivation
      rule, is unchanged and still enforced.
- [ ] A technician's OWN performed sessions remain visible to them after their
      community assignment is deactivated (reversed 2026-09-09, see settled
      decisions) — but they still see **none** of another technician's
      sessions on that community, deactivated or not.
- [ ] `MAINTENANCE_COMPANY_MANAGER` holds `reviewSession:read` and nothing
      else; `MANAGER` is still `[]`; `SYSTEM_ADMIN` holds no `reviewSession:*`.

**Scope guards**

- [ ] No `ManagerCapability` enum, `User.managerCapabilities` field or
      `VIEW_ALL_REVIEWS` permission exists.
- [ ] No unscoped "all sessions" query exists.
- [ ] No pagination, date filter, sort or search control ships on any history
      read or page.
- [ ] No per-element history query, route or view exists.
- [ ] The repository port still exposes no unscoped `findById`.
- [ ] No write path touches a completed session beyond the attribution column
      written at performance time.
- [ ] `modules/users/**` and `modules/maintenance-company/**` gain no new
      manager-facing CRUD.

**Documentation**

- [ ] The ADR-011 addendum is written, recording the module's multiple
      access-service/scope-resolution paths and this slice's activation of the
      first `MAINTENANCE_COMPANY_MANAGER` permission.
- [ ] FR-008's status reflects three of four scopes shipped, with the global
      scope named as the remaining one.

**Quality**

- [ ] Zero hardcoded UI strings; new keys have real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] The migration applies and rolls back cleanly against real Postgres, with
      the hand-written partial unique index and FKs intact.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      including a login as `MAINTENANCE_COMPANY_MANAGER` — not only
      test-verified (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Deliberately unresolved here. Each has a working assumption; none blocks the
next phases from starting. **None of them reopens a settled decision above.**

1. **Snapshot at creation or at completion?** The settled decision says "at
   creation/completion" without picking. Creation is earlier and simpler but
   attributes a draft opened before a transfer; completion matches "performed on
   behalf of" more literally but leaves drafts unattributed. *Working
   assumption*: at creation, since a draft is already the performer's committed
   act — but state it explicitly as a requirement either way.
2. **Where the manager's company is resolved.** The access token carries only
   `sub`, `email`, `role` (verified in `token-issuer.port.ts`) — **not**
   `maintenanceCompanyId`. So either a per-request read of the actor's company
   (a cross-module port the review-session module does not have), or a new token
   claim (inheriting `role`'s documented accepted-staleness tradeoff, and its
   consequence: a company change would not take effect until the token expires).
   *Working assumption*: a per-request read, mirroring how the community scope is
   re-read on every request with no cached grant. **This is the biggest single
   decision in the slice** and it has a security-staleness dimension.
3. **The shape of the company-scope resolution.** A shared authorization port
   sibling to `CommunityScopeChecker`, versus a review-session-local port. Bears
   directly on the ADR-011 addendum's content. *Working assumption*: `sdd-design`
   chooses; the invariant (scope carried in the port signature, fail-closed on
   null) is not negotiable either way.
4. **Whether a history row already carries the performer's identity.** The
   shipped row shape was designed for scopes where the performer is usually the
   caller or a single community's visitor; a company-wide list needs the
   performer's name, which may be a cross-module read into `users` that no port
   supports. *Working assumption*: reuse whatever the shipped row already
   exposes; add a cross-module read only if it genuinely does not identify the
   performer.
5. **What the manager's entry point looks like.** A direct `/review-history`
   link from `/` (the `HealthPage.tsx` precedent) versus something else. The
   shipped requirement's route through `/review-sessions` cannot be reused — the
   manager must not reach the write surface. *Working assumption*: a
   role-conditional link on `/`, exactly as the other two roles got theirs.
6. **Does the manager's own-company scope AND with anything at all?** No
   community assignment, no per-community narrowing, no active-employment check
   on the performing technician. *Working assumption*: company id alone, plus
   completed-only. Any additional conjunct must be stated as a requirement, not
   inherited by accident.

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding.

`sdd-spec` writes the settled decisions above as already-decided requirements:
the company-wide visibility scope, the frozen-attribution rule, and the
fail-closed null rule, each in its own right — and must **narrow rather than
delete** the shipped deferral guards and the community-assignment requirement.

`sdd-design` owns open questions 1–6, above all question 2 (where the manager's
company is resolved, and its staleness tradeoff) and question 3 (the shape of
the company-scope resolution), which together determine the ADR-011 addendum's
content.
