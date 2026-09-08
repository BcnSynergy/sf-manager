# Proposal: View Review History

## Intent

`review-session` (FR-007) shipped the write path and archived 2026-09-08. It
left completed reviews effectively **write-only**: the moment a session
transitions to `completed` it disappears from every surface in the app.
Verified by direct read — `ReviewSessionRepository.findDraftsByPerformer` backs
`GET /review-sessions` and filters to drafts by design; the only by-id read is
`findByIdForPerformer`, reachable solely through `SessionAccessService`; there
is no bare `findById`, no cross-session query, and no history page anywhere in
`apps/web`. The shipped `review-session-management` spec asserts this
positively ("No review history surface exists").

So today: a technician finishes a building walk and cannot look at what they
recorded an hour later. A community representative — who may perform reviews on
their own community — cannot see the review a technician performed on that same
community at all. The RIPCI compliance record the product exists to produce is
in the database and unreadable by the people responsible for it.

Success looks like: a `MAINTENANCE_TECHNICIAN` opens a chronological list of
their own completed sessions and drills into any one to read back exactly what
was answered; a `COMMUNITY_REPRESENTATIVE` sees the same list for **their
community's** completed sessions regardless of who performed them, and can read
any of those back.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change** —
sixth slice under that rule, and the second to be reachable by non-`SYSTEM_ADMIN`
roles.

Context: `[[sdd/review-history/explore]]`,
`openspec/changes/archive/2026-09-08-review-session/` (proposal, design
Decisions 4/6/10, specs), ADR-006, ADR-010, ADR-011 + its 2026-09-08 addendum,
ADR-014, `docs/requirements/functional-requirements.md` FR-008.

## Settled scope decisions

Closed with the product owner before this proposal. **Inputs, not open items —
do not re-litigate in `sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **Two of FR-008's four visibility scopes only** | In: a `MAINTENANCE_TECHNICIAN` sees **their own** completed sessions; a `COMMUNITY_REPRESENTATIVE` sees **their community's**. Out: `MAINTENANCE_COMPANY_MANAGER` company-wide, and `SYSTEM_ADMIN`/`MANAGER` + `VIEW_ALL_REVIEWS` global. |
| **Why that cut** | The two in-scope visibilities reuse the **already shipped** Layer 2 `CommunityScopeChecker` — the only two roles its exhaustive switch resolves. The two deferred ones need infrastructure that does not exist: `ManagerCapability` / `User.managerCapabilities` from ADR-011 Decision 2 was **never implemented anywhere in code** (verified against `user.entity.ts`), and company scope needs a `ReviewSession → User.maintenanceCompanyId` join no port supports. Building either is a separate, larger prerequisite slice — ADR-006 discipline. |
| **Flat chronological list, no filter-by-element** | FR-008's wording is "per element and per community". This slice delivers the **per-community** (and per-performer) half. Narrowing a history list to one element's past reviews is deferred, deliberately and explicitly. |
| **Drill-in shows the full record** | Opening one historical session shows its recorded answers and observations — the same read-back FR-007 already built, extended with a scope path for viewing a session you did not perform (the representative case). |
| **Completed sessions only** | The open draft stays exclusively in `review-session`'s existing resume flow (`GET /review-sessions`). Drafts never appear in history. |

## Scope

### In Scope

**API read side (`apps/api/src/modules/review-session/`)**

- New repository port methods for the two scopes — one named method per real
  scope, scope in the signature, following `findByIdForPerformer` /
  `findReviewableByCode`'s shipped precedent (explore Approach 2). Two methods
  now; the deferred scopes add their own later without reshaping anything.
- Use cases for "my completed history" and "my community's completed history",
  and a **read path for a completed session the actor did not perform**.
- New route(s) for the list, and a scoped detail read. Route shape is
  `sdd-design`'s call (see *Open questions*).
- All reads exclude drafts and respect the shipped rejection matrix: an
  unreachable `sessionId` stays `404 REVIEW_SESSION_NOT_FOUND`, indistinguishable
  from nonexistent.

**Authorization**

- The **new visibility rule** as a requirement in its own right: holding
  `reviewSession:read` grants a representative history on communities they are
  **actively assigned to** and nothing else; a technician's own-history read
  grants nothing about anyone else's sessions. Reuses `CommunityScopeChecker`;
  **no new scope-check infrastructure**.
- `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` remain `[]`. `SYSTEM_ADMIN` gains
  no review-session permission.

**Web (`apps/web/`)**

- A history list page — one unfiltered table, single `LoadState`, **no
  client-side filtering** (trust the server-scoped endpoint, per
  `ReviewSessionsPage.tsx`'s documented precedent).
- A read-only historical-session view rendering entries, answers and
  observations. Whether it reuses or forks `ReviewSessionDetailPage.tsx` is
  `sdd-design`'s call — that page is a *draft-walk* page (code entry, complete,
  discard), so a read-only view is not a free reuse.
- Routes under `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE']}` and a reachable entry point from the existing
  `/review-sessions` surface.

**Cross-cutting**

- Shared Zod schemas in `packages/validation` if any request shape needs them
  (ADR-015).
- Real `en`/`es`/`ca` translations, parity-enforced by `locales.test.ts`.
- **Amending the shipped scope guards**: `review-session-management`'s "Adjacent
  Review Capabilities Are Not Introduced" and `review-session-ui`'s equivalent
  both currently assert that **no** history surface exists. This change makes
  those statements false by design — the FR-008 rows must be narrowed to what
  stays deferred (company/global visibility, per-element filtering), not simply
  deleted. FR-009 and FR-010 rows stay intact.
- Unit, integration and E2E tests, plus **browser verification** against a
  running dev server including a login as each in-scope role (CLAUDE.md).

### Out of Scope (non-goals)

- **Company-wide visibility** (`MAINTENANCE_COMPANY_MANAGER`) and **global
  visibility** (`SYSTEM_ADMIN` / `MANAGER` + `VIEW_ALL_REVIEWS`) — and therefore
  the entire `ManagerCapability` mechanism: no enum, no `User.managerCapabilities`
  field, no migration, no capability-gated permission layer. Both roles stay `[]`.
- **Per-element history filtering** — no "show me this extinguisher's past
  reviews" view, no element-scoped query.
- **Pagination, date-range filters, search or sorting controls** — no list page
  in this codebase has any of these yet.
- **Editing, annotating, commenting on or deleting history.** ADR-010:
  completed sessions are permanently immutable; this slice is read-only end to
  end and adds no write path.
- **Signing and export** (FR-010) — no `signed` transition, no PDF, no document
  generation.
- **Scheduling, due dates, overdue lists, reminders** (FR-009).
- **Analytics, aggregates, compliance dashboards or per-community statistics.**
- **Notifications** of any kind.
- Any change to `modules/users/**`, `modules/maintenance-company/**`, the
  authentication mechanism, or the review-session **write** path.

### Why this scope and not more (ADR-006)

The two in-scope visibilities are the ones that cost nothing structural: both
roles already hold `reviewSession:read`, both already resolve through
`CommunityScopeChecker`, and both already have reachable non-admin routes. The
two deferred visibilities each require building a mechanism from zero
(`ManagerCapability`; a cross-module company join). Bundling them would roughly
double the slice and put its riskiest new authorization surface — a global
"see everything" capability — into the same review as the first history page.
They are separately valuable and separately reviewable.

## Capabilities

### New Capabilities

- `review-history` — reading completed review sessions beyond the performer's
  own draft flow: the per-performer and per-community scopes, the completed-only
  rule, and the scoped read-back of one historical session.
- `review-history-ui` — the history list and the read-only historical-session
  view, with their role-scoped entry points.

### Modified Capabilities

- `authorization` — the review-history visibility rule: `reviewSession:read`
  plus active community assignment grants a representative history on that
  community only; a technician is limited to `performedById = self`. Deferred
  roles explicitly remain unprivileged.
- `review-session-management` — narrow the FR-008 row of "Adjacent Review
  Capabilities Are Not Introduced" so it defers company/global visibility and
  per-element filtering rather than all history.
- `review-session-ui` — same narrowing on the UI-side scope guard.

## Approach

Extend the existing `review-session` module rather than creating a new one: the
aggregate, the repository and the scope layers all live there, and a separate
read module would need its own copy of Layer 3 to stay safe.

Four proposal-level choices:

1. **One named repository method per scope, not a parameterized filter object.**
   Two small methods whose `WHERE` clause is trivially auditable beat one method
   that branches on a discriminated scope kind — the same reasoning
   `CommunityScopeChecker`'s exhaustive fail-closed switch and `findReviewableByCode`
   already encode. With only two scopes the duplication cost is negligible; the
   "one branch silently missing a filter" risk is not.

2. **Reuse the shipped Layer 2 scope check; add no new authorization layer.**
   `CommunityScopeChecker.isAssignedTo` and
   `CommunityRepresentativeRepository.findActiveByUser` both shipped with
   `review-session` and cover exactly the two in-scope roles. Assignment
   deactivation therefore removes history access on the next request for free,
   with no cache to invalidate.

3. **The non-performer detail read gets its own scope-carrying path — it does
   not loosen `SessionAccessService`.** That service exists *because*
   `ReviewSessionRepository` has no bare `findById`, so no use case can skip the
   check. Whatever ships must preserve that property: the new read carries its
   scope in the port signature (e.g. by community), exactly as
   `findByIdForPerformer` does. **Extend vs. sibling service is `sdd-design`'s
   call** (see *Open questions*) — the invariant is not.

4. **Trust the server-scoped endpoint on the client.** The history list renders
   whatever the scoped endpoint returns, with zero client-side filtering —
   `ReviewSessionsPage.tsx` and `CommunityElementsListPage.tsx` both already
   document this as the house rule, and client-side scope filtering is a
   security anti-pattern regardless.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches `review-history/<NN>-<slug>`,
titles `feat(review-history): PR N/M — ...`. Materially smaller than
`review-session`'s eight; `sdd-tasks` owns the split and the 400-line forecast.

| PR | Content |
|---|---|
| ~1 | Read-side ports + adapters + the two list use cases + list route |
| ~2 | Scoped historical-session detail read (the non-performer path) + E2E scope matrix |
| ~3 | Web: history list + read-only detail, routes, i18n |
| ~4 | Spec-guard amendments, docs, browser verification, final checks |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `.../review-session/application/ports/review-session.repository.port.ts` | Modified | Two scoped completed-history queries + a scoped by-id read |
| `.../review-session/infrastructure/persistence/**` (Prisma + in-memory fake) | Modified | Adapters for the new methods |
| `.../review-session/application/services/session-access.service.ts` | Modified/Sibling | The non-performer read path — shape is `sdd-design`'s |
| `.../review-session/application/use-cases/**` | New | List own history, list community history, read one historical session |
| `.../review-session/presentation/review-session.controller.ts` + `dto/**` | Modified | New read route(s) |
| `apps/web/src/pages/ReviewHistory*.tsx` (names TBD) | New | List + read-only detail |
| `apps/web/src/api/review-session.ts`, `App.tsx` | Modified | Client calls, routes, entry point |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real translations |
| `openspec/specs/review-session-management/spec.md`, `review-session-ui/spec.md` | Modified | Narrow the FR-008 scope guards |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Visibility matrix, drafts-excluded, rejection parity |

**No schema change and no migration** — every field this slice reads already
exists. Untouched: `modules/users/**`, `modules/maintenance-company/**`,
`role-permission.checker.ts`'s role rows (if choice 3 below resolves to reusing
`reviewSession:read`), and the entire write path.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **A history query leaks another community's or performer's sessions.** This is the first cross-session read in the codebase; a missing `WHERE` returns other people's compliance records | High | Scope lives in the port signature, never in caller-side filtering; E2E asserts the full visibility matrix — technician sees none of another technician's, representative sees none of another community's — one test per route, no sampling |
| **The non-performer read path becomes a bare `findById` in disguise**, quietly destroying the "no use case can skip the check" property `SessionAccessService` was built to guarantee | High | Approach choice 3 states the invariant as binding; `sdd-verify` asserts no unscoped `findById` exists on the repository port after the change |
| **Drafts leak into history** — a missing `status = completed` filter puts a half-finished walk in a compliance list | Med | Completed-only asserted as a spec requirement with its own scenario, not left to the query |
| **Scope creep into the deferred visibilities.** "While we're here, let a manager see everything" is one `ROLE_PERMISSIONS` line away, and would silently pull in ADR-011 Decision 2 | High | Explicit non-goal; `sdd-verify` asserts `MANAGER`/`MAINTENANCE_COMPANY_MANAGER` are still `[]` and that no `ManagerCapability` type exists |
| **The shipped scope guards get deleted instead of narrowed**, losing the FR-009/FR-010 protections along with the FR-008 one | Med | Named as in-scope work with an explicit instruction: narrow the FR-008 row, keep the rest |
| **Reusing `ReviewSessionDetailPage.tsx` drags draft-only controls (complete, discard, code entry) onto a completed record** | Med | Read-only view treated as its own requirement; `sdd-design` decides reuse vs. fork deliberately, and a test asserts no mutation control renders for a completed session |
| **A technician loses access to their own past work** when an assignment is deactivated, because the shipped Layer 3 ANDs performer with *current* assignment | Med | Flagged as an open product question below with a stated working assumption — must be settled in `sdd-spec`, not discovered in code |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to the new keys |

## Rollback Plan

`git revert` the branch. **There is no migration and no schema change**, so
there is nothing asymmetric to undo — reverting removes read routes, read-side
port methods, two pages and locale keys, and returns the app to its current
state where completed sessions are simply unreadable. No shipped port signature
is broken and no existing behaviour changes; the write path is untouched.

The one non-code artifact is the spec-guard amendment: reverting must also
restore `review-session-management` / `review-session-ui`'s original FR-008 rows,
or the specs will claim a deferral the code no longer honours in the other
direction. Each PR in the sketched chain reverts independently.

## Dependencies

- **`review-session` (FR-007) — shipped and archived 2026-09-08.** Supplies the
  entities, `CommunityScopeChecker`, `SessionAccessService`, the two operational
  roles and their permissions. This slice consumes all of it and modifies only
  its read side.
- **`community` assignments** — `CommunityRepresentativeRepository.findActiveByUser`
  and `CommunityTechnicianRepository.findActiveByUser` already exist; no new
  method is anticipated.
- **No new runtime dependency.** Reuses `AuthenticatedGuard` + `PermissionsGuard`
  + `@RequirePermission`, `buildCodedError`, `apiFetch`/`ApiError`,
  `ProtectedRoute allowedRoles`.
- For browser verification: a running dev server plus seeded data — at least one
  **completed** session, a technician who performed it, a second technician who
  did not, and a representative assigned to that community.

## Success Criteria

**Reading history**

- [ ] A `MAINTENANCE_TECHNICIAN` sees a chronological list of their own
      completed sessions and can open any one to read back its recorded answers
      and observations.
- [ ] A `COMMUNITY_REPRESENTATIVE` sees the completed sessions of every
      community they are actively assigned to, **including sessions they did not
      perform**, and can read any of them back.
- [ ] Drafts never appear in history; the existing resume flow is unchanged.
- [ ] An empty history renders an empty state, not an error.

**Visibility**

- [ ] A technician sees **none** of another technician's sessions, on any route.
- [ ] A representative sees **none** of another community's sessions.
- [ ] Deactivating an assignment removes the representative's access on the next
      request.
- [ ] An out-of-scope `sessionId` returns `404 REVIEW_SESSION_NOT_FOUND`,
      indistinguishable from a nonexistent one.
- [ ] `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` are still `[]`; `SYSTEM_ADMIN`
      holds no review-session permission.

**Scope guards**

- [ ] No `ManagerCapability` enum, `User.managerCapabilities` field, migration or
      capability-check layer exists.
- [ ] No company-scoped or global review query exists.
- [ ] No per-element history query, route or view exists.
- [ ] No pagination, date filter, sort or search control ships.
- [ ] No write path touches a completed session; no scheduling, signing or
      export surface exists.
- [ ] No migration was added.

**Quality**

- [ ] Zero hardcoded UI strings; new keys have real `en`/`es`/`ca` translations,
      parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] The repository port still exposes no unscoped `findById`.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      including a login as each in-scope role — not only test-verified (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Deliberately unresolved here. Each has a working assumption; none blocks the
next phases from starting.

1. **Route shape.** One `GET /review-sessions/history` resolved server-side per
   actor, versus `GET /communities/:communityId/review-sessions` for the
   representative plus an own-history variant. ADR-014 and design Decision 10's
   flat `/review-sessions` precedent both bear on it, as does `GET /review-scope`'s
   warning about Express declaration-order collisions with `@Get(':sessionId')`.
   *Working assumption*: one route, scope resolved server-side.
2. **Extend `SessionAccessService` or add a read-only sibling** for the
   non-performer detail read. A real architectural call with security stakes —
   the invariant in Approach choice 3 constrains the answer but does not pick it.
   `sdd-design` owns this; it is the biggest single decision in the slice.
3. **Permission reuse.** `reviewSession:read` for the history routes with scope
   doing the narrowing, versus a distinct `reviewSession:readHistory`.
   *Working assumption*: reuse `reviewSession:read` — the scope, not the
   permission, is what differs.
4. **Does a technician keep access to their own completed sessions after their
   community assignment is deactivated?** The shipped Layer 3 ANDs performer with
   current assignment, so today the answer would be no. For a compliance record
   authored by that technician, that is arguably wrong. *Working assumption*:
   inherit the shipped semantics (current assignment required) — but state it
   explicitly as a requirement either way, rather than letting the existing code
   decide by default. **A product answer here changes a spec requirement.**
5. **What one history row shows** — started/completed timestamps, community,
   element type, coverage counts, performer name (a cross-module read into
   `users` for the representative's view, which no port supports today). *Working
   assumption*: only fields already reachable from the session aggregate; no new
   cross-module read.
6. **Whether the representative's list groups or labels by community** when they
   are assigned to more than one. *Working assumption*: a flat list with a
   community column.

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding.

`sdd-spec` writes the settled decisions above as already-decided requirements
across the new `review-history` and `review-history-ui` capabilities, plus
deltas on `authorization`, `review-session-management` and `review-session-ui`.
It must state the **visibility rule**, the **completed-only rule** and the
**indistinguishable 404** as requirements in their own right, and must narrow
rather than delete the shipped FR-008 scope guards.

`sdd-design` owns open questions 1, 2, 3, 5 and 6 — above all the
extend-vs-sibling call on `SessionAccessService`, which must preserve the
"no unscoped `findById`" invariant.
