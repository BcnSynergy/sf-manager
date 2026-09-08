# Design: View Review History

## Technical Approach

A **read-only extension of the existing `review-session` module** (proposal
"Approach"), built so that every visibility rule is a property of a port
signature rather than a caller-side `if` — the same structural move
`review-session`'s design used for `findByIdForPerformer` and
`findReviewableByCode`.

Four rules must be auditable at a glance. Each one lives in exactly one place:

| Rule (non-negotiable per proposal Risks) | Where it is enforced | How it is auditable |
|---|---|---|
| Caller holds `reviewSession:read` | `PermissionsGuard` + `@RequirePermission` (Layer 1, unchanged) | Route decorator |
| Actor's community set = **currently active** assignments only | `CommunityScopeChecker.listAssignedCommunityIds` (Layer 2), fail-closed exhaustive `switch`, no cache | One adapter, table-driven over all 5 roles |
| Technician sees only own; representative sees any performer in scope | The **port method name and its `WHERE`** — `…ForPerformerInCommunities` vs `…InCommunities` | 4 methods, 4 trivial `WHERE` clauses |
| Completed-only | Same `WHERE` — `status = 'completed'` appears in all four | Method names all start `findCompleted…` |
| Indistinguishable 404 | `null` ⇒ `ReviewSessionNotFoundError` ⇒ `REVIEW_SESSION_NOT_FOUND` | One throw site, one mapping |

Verified before designing, not assumed: `ReviewSessionRepository` has no bare
`findById`; `SessionAccessService.loadForActor` is performer-scoped and
status-agnostic; `CommunityScopeChecker.isAssignedTo` is a single-community
boolean with no listing method; `findActiveByUser` already ships on **both**
assignment ports; `ReviewSession` carries **no** `elementType` (it lives on the
template); `ReviewSessionDetailResponseDto` carries entries + coverage but **no
question wording**; `ReviewSessionController` uses `@Controller()` with full
paths per handler, so `review-sessions/:sessionId` is a declaration-order
hazard for any literal sibling segment.

## Architecture Decisions

### Decision 1 — a read-only **sibling** service, not an extended `SessionAccessService` (proposal open question 2)

**Choice**: a new `application/services/review-history-access.service.ts`
(`ReviewHistoryAccessService`) with two methods, `listForActor(actor)` and
`loadCompletedForActor(sessionId, actor)`. `SessionAccessService` is left
**byte-unchanged**.

**Alternatives considered**: add `loadCompletedForActor` to
`SessionAccessService`; or a generic `loadForActor(sessionId, actor, scope)`
taking a scope discriminant.

**Rationale**: `SessionAccessService` is the **write path's gate** — every
mutating use case (`record-entry`, `complete`, `discard`) depends on its exact
semantics: performer-only, any status. Putting the widest read gate (any
performer, completed-only) on the same class leaves the two one autocomplete
entry apart, and the failure mode is a mutating use case calling the permissive
method. That is precisely the "bare `findById` in disguise" risk the proposal
rates **High**. The two services also have genuinely different invariants:
*"may this actor ACT on this draft"* versus *"may this actor READ this completed
record"* — different status filter, different scope predicate, different
return shape.

**The binding invariant is preserved, and it is preserved by the port, not by
the service count.** Approach choice 3's property is stated in `review-session`
design Decision 4 as *"`ReviewSessionRepository` exposes no `findById(id)` at
all, so a use case that forgets the scope check has nothing to call."* That is a
property of the **port surface**. After this change the port still exposes no
identifier-only read: all four new methods carry a performer and/or community
scope as a required parameter. Two doors, each with its own lock, and no
unlocked wall. `sdd-verify` asserts it by enumerating the port's methods
(spec: *"No unscoped session read exists"*).

**Durable enough to record**: this makes the module's access-service count two,
which is a departure from Decision 4's "one door" phrasing. Per
`openspec/config.yaml` `rules.design`, an **ADR-011 addendum** should record it.
Not authored here — the `review-session` precedent is that addenda are a
separate, user-confirmed step (see Open Questions).

### Decision 2 — the active-community set becomes Layer 2's second method, and that is what makes the resolved product decision structural

**Choice**: add one method to the shipped shared port:

```ts
// shared/application/authorization/community-scope.checker.port.ts
listAssignedCommunityIds(userId: string, role: Role): Promise<string[]>;
```

`AssignmentCommunityScopeChecker` implements it with the **same exhaustive
fail-closed `switch`** it already uses: `MAINTENANCE_TECHNICIAN` →
`technicianRepository.findActiveByUser`, `COMMUNITY_REPRESENTATIVE` →
`representativeRepository.findActiveByUser`, every other role → `[]`, `default`
→ `role satisfies never; return []`. Both repository methods **already ship**;
no community-module port changes (proposal Dependencies: *"no new method is
anticipated"*). `isAssignedTo` is untouched.

**This is the mechanism the resolved product decision demanded.** Confirmed
2026-09-08 and written into the spec (*"History Access Requires a Currently
Active Community Assignment, Including for One's Own Sessions"*): a technician
whose assignment is deactivated loses their **own** history for that community,
retroactively. It is enforced by making `communityIds` a **required parameter of
the technician's own-history queries** —
`findCompletedForPerformerInCommunities(performedById, communityIds)`. Deactivate
the assignment and the community drops out of the set, so the session drops out
of the `WHERE`. There is no `if (assignmentStillActive)` anywhere to forget, and
no cache to invalidate — the set is re-read on every request, exactly like
`isAssignedTo`.

**Alternatives considered**: (a) call `findActiveByUser` on both assignment
ports directly from the review-session use case (what `GetReviewScopeUseCase`
does today) — rejected: it would be a **second truth** about the
role→assignment-kind mapping, and the fail-closed exhaustiveness that makes
Layer 2 trustworthy would exist in one place and not the other; (b) a new
`CommunityScopeLister` port — rejected: it splits one question ("what is this
actor's community scope") across two adapters and two fakes for no gain.

**Noted, deliberately not fixed**: `GetReviewScopeUseCase` unions both
assignment kinds **without** role dispatch. That is correct for its own purpose
(the open-session form), it is the write path, and changing it is out of scope.
`listAssignedCommunityIds` is strictly narrower. Flagged so `sdd-verify` reads
the difference as intentional.

### Decision 3 — four named methods, one per (scope × shape); no scope discriminant

**Choice**: four additions to `ReviewSessionRepository`. Every one carries
`status = 'completed'` and `"communityId" IN (:communityIds)` in its `WHERE`.

```ts
// application/ports/review-session.repository.port.ts  (still NO findById)
findCompletedForPerformerInCommunities(
  performedById: string, communityIds: readonly string[],
): Promise<ReviewSession[]>;

findCompletedInCommunities(
  communityIds: readonly string[],
): Promise<ReviewSession[]>;

findCompletedByIdForPerformerInCommunities(
  id: string, performedById: string, communityIds: readonly string[],
): Promise<ReviewSession | null>;

findCompletedByIdInCommunities(
  id: string, communityIds: readonly string[],
): Promise<ReviewSession | null>;
```

Both list methods order **`completedAt DESC, id DESC`** — a single ordering
constant shared by both adapters, because the spec requires the two lists'
direction to be *identical* and *deterministic* (`id` is a UUIDv7, so it is a
time-ordered tiebreak, ADR-009).

**Alternatives considered**: one list + one by-id method taking a
`{ kind: 'own' | 'community' }` discriminated union. **Rejected by proposal
Approach choice 1**: "one branch silently missing a filter" is the exact risk
this slice cannot take; two trivially readable `WHERE` clauses beat one branching
query builder.

**Reconciling the count with the proposal**: the proposal's In Scope budgets
"**Two methods now**" for the **list** scopes ("one named method per real
scope"), and its Affected Areas row separately names "Two scoped
completed-history queries **+ a scoped by-id read**" — three in total. Four =
2 list + 2 by-id, so the delta against the proposal is that the by-id read is
deliberately split in two, for the same reason the list pair is split. The
technician's performer filter is a **narrowing** of the community filter, so a
single `findCompletedByIdInCommunities` shared by both roles would need a
caller-side `session.performedById === actor.userId` check for the technician,
and omitting it would leak the whole community. Spec *"History Scope Is Carried
by the Query, Not by the Caller"* — scenario *"Scope is never applied after the
fact"* — forbids exactly that caller-side narrowing, so the split is demanded by
a written requirement, not chosen as a preference.

**Empty-scope footgun, made explicit**: an actor with no active assignment gets
`communityIds = []`. Prisma's `{ in: [] }` matches **no rows** (it compiles to a
false predicate), which is the fail-closed answer — an empty successful list,
never "everything". This is asserted directly, in both the in-memory fake and an
integration test, because it is the single silent-catastrophe case in this
design.

### Decision 4 — a separate `/review-history` route tree, not `/review-sessions/history` (proposal open question 1)

**Choice**: two routes on a **new** `presentation/review-history.controller.ts`:

| Method | Route | Permission | Returns |
|---|---|---|---|
| GET | `/review-history` | `reviewSession:read` | `ReviewHistoryRowDto[]` |
| GET | `/review-history/:sessionId` | `reviewSession:read` | `ReviewHistoryDetailResponseDto` |

Scope is resolved **server-side from the actor's role** (proposal's working
assumption); no `communityId` is ever accepted from the client, so the caller
cannot widen the scope.

**Alternatives considered**: (a) `GET /review-sessions/history` — the literal
segment `history` would be a sibling of the shipped `@Get('review-sessions/:sessionId')`.
**Checked rather than assumed**: this app runs the Express adapter; Nest
registers handlers on the Express router in declaration order and Express
matches first-registered-first, with **no** static-before-param specificity
sorting (Fastify's radix router would sort it; Express does not). So the literal
route works *only while it is declared above* the param route — one reordering
or one merge from silent breakage. `review-session` design Decision 10 already
settled the house response to this exact trap ("sidestepping the trap beats
commenting on it") by putting `/review-scope` at top level. Same move here.
(b) `GET /communities/:communityId/review-sessions` — rejected: it puts a
scope identifier in the URL that the server must then verify, it needs a second
own-history route anyway, and ADR-014 + Decision 10 already established that a
session is a top-level resource addressed by its own id, not a community
sub-resource.

**Why a separate controller file**: `review-sessions/:sessionId` and
`/review-history/:sessionId` share no path prefix, so registration order between
the two controllers is irrelevant — the collision is structurally impossible,
not merely avoided. It also leaves `review-session.controller.ts` (a
security-critical shipped file) untouched, keeping PR diffs focused. The new
controller carries its own 3-line `mapError` for the one error it can throw
(`ReviewSessionNotFoundError` → 404 `REVIEW_SESSION_NOT_FOUND`); extracting a
shared mapper for one case would be worse than the duplication.

**Why not extend `GET /review-sessions/:sessionId` to fall back to a history
scope**: it would change the behaviour of a route the draft walk depends on, and
mix two access rules in one handler. Rejected outright.

### Decision 5 — reuse `reviewSession:read` (proposal open question 3): assumption **validated**

**Choice**: both history routes use `@RequirePermission('reviewSession:read')`.
`Permission` gains **no** new member; `ROLE_PERMISSIONS` is **unchanged**;
`MANAGER` and `MAINTENANCE_COMPANY_MANAGER` stay `[]`; `SYSTEM_ADMIN` still
holds no `reviewSession:*`.

**Rationale**: a `reviewSession:readHistory` member would be granted to exactly
the same two roles as `reviewSession:read`, so it would have **zero
discriminating power** — an inert enum member that every `Record<Role,
Permission[]>` row and every test must carry to express nothing. What actually
differs between the draft read and the history read is **scope**, and ADR-011
Decision 3 plus `review-session` design Decision 4 already place scope in a
separate composable layer, not in the permission table.

**Accepted consequence, stated rather than discovered**: `reviewSession:read`
now gates history too, so "revoke history but keep drafts" is not expressible
today. If that need ever appears the split costs one enum member and two
`ROLE_PERMISSIONS` rows — cheap later, speculative now (ADR-006).

### Decision 6 — what a history row and a history record contain (proposal open questions 5 and 6)

**List row** — `{ id, communityId, communityName, performedById, startedAt,
completedAt }`. Flat chronological list with a **community column** (open
question 6's working assumption, **confirmed**): grouping is a presentation
affordance with no data behind it, and it would break the chronology across
group boundaries that the spec requires; every shipped list page is one flat
single-`LoadState` table (`ReviewSessionsPage.tsx` renders literally one column
plus a link).

- `communityName` is resolved by calling the **existing**
  `CommunityRepository.findById` **once per community in the actor's scope** —
  not per row. Cost is bounded by the scope size, not the result size, which is
  the same accepted cardinality `GetReviewScopeUseCase` already runs at
  (Decision 5 of `review-session`). No new port method, no new module import
  (`ReviewSessionModule` already depends on `CommunityModule`).
- **No performer name.** Confirmed: that needs a `users` read no port supports,
  and the proposal fences it out. `performedById` ships in the payload (it is
  already on the aggregate and on the shipped detail DTO, so it costs nothing and
  is the join key any follow-up needs), but the **UI renders no performer
  column** — a raw UUID is worse than nothing. Named as a real UX gap in Open
  Questions rather than papered over.
- No coverage counts, no template/element-type column, no pagination, no sort or
  filter controls (spec guard).

**Detail record** — `ReviewHistoryDetailResponseDto` is a **superset** of the
shipped `ReviewSessionDetailResponseDto`, because the spec requires the
read-back to be *"paired with the template snapshot's wording"* and the shipped
DTO deliberately omits it (Decision 11 fetches the question set per element, via
a `reviewSession:perform` route that is a draft-walk affordance and must not be
reused for a completed record). So the history detail use case additionally
calls the **existing** `ReviewTemplateRepository.findFrozenWithSnapshot(session.templateId)`
— which filters `status IN ('active','retired')`, so a retired successor version
still reads back correctly — and returns `questions: TemplateQuestionEntry[]`
alongside the entries.

That template read also yields `elementType`, which lets the use case call the
**existing** `InspectableElementRepository.findActiveByCommunityAndType(communityId,
elementType)` — the same universe `CompleteReviewSessionUseCase` already
computes over — to attach `elementCode: string | null` to each entry.
**Deliberate, minimal, and its cost is stated**: an entry the reader cannot
attribute to a physical element is not a compliance record. The code is resolved
**live**, so an element decommissioned or soft-deleted after completion renders
`null` and the UI falls back to a neutral label. Freezing the code onto the entry
row is the durable fix and needs a schema change — explicitly out of scope
(see Open Questions).

### Decision 7 — the web read-only view is a **fork**, not a reuse of `ReviewSessionDetailPage.tsx`

**Choice**: two new pages, `ReviewHistoryPage.tsx` and
`ReviewHistoryDetailPage.tsx`. `ReviewSessionDetailPage.tsx` is untouched.

**Rationale — the data source forces it, before the controls even matter**:
`ReviewSessionDetailPage` calls `readReviewSession(sessionId)` against
`GET /review-sessions/:sessionId`, which is performer-scoped; a representative
reading a session they did not perform would get a 404 there. The history detail
must call `GET /review-history/:sessionId` and consume a **different response
shape** (Decision 6's superset with `questions` and `elementCode`). Reuse would
mean parameterising both the fetch and the render — a page with two modes, which
`label-printing` Decision 6 already rejected for this codebase.

The proposal's stated risk (reuse dragging complete/discard/code-entry onto a
completed record) is the second reason, not the first: those controls are today
gated behind `isDraft &&`, so they would *happen* to be hidden — a correctness
that survives only until someone edits that condition. The fork removes them
from the file entirely. The read-only page drops nine `useState` hooks, the
`ConfirmDialog` import, and both mutation handlers — roughly 80 lines against
310. A test asserts **no mutation control renders** on the history detail page.

Routes: `/review-history` and `/review-history/:sessionId`, both under
`ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN','COMMUNITY_REPRESENTATIVE']}`.
Entry point: a `Link` to `/review-history` from `ReviewSessionsPage.tsx`, which
is already both non-admin roles' reachable surface. Zero client-side filtering
(proposal Approach choice 4); one `LoadState` per page; error text exclusively
via `mapApiErrorToMessageKey`.

**No new `packages/validation` schema.** Neither route takes a body or a query
parameter, so there is nothing to validate at the wire boundary (ADR-015 applies
to request shapes; there are none). The web client's response types are declared
in `apps/web/src/api/review-history.ts`, mirroring `review-session.ts`.

## Data Flow

    GET /review-history                            (AuthenticatedGuard -> PermissionsGuard: reviewSession:read)
      -> ReviewHistoryAccessService.listForActor(actor)
           -> communityScopeChecker.listAssignedCommunityIds(userId, role)   [Layer 2, no cache]
                -> []  ==> empty list, 200            (fail closed; never "everything")
           -> switch(role)  [exhaustive, `satisfies never`]
                MAINTENANCE_TECHNICIAN   -> findCompletedForPerformerInCommunities(userId, ids)
                COMMUNITY_REPRESENTATIVE -> findCompletedInCommunities(ids)
                otherwise                -> []
      -> communityRepository.findById  ONCE PER SCOPE COMMUNITY -> name map
      -> rows, ordered completedAt DESC, id DESC

    GET /review-history/:sessionId
      -> ReviewHistoryAccessService.loadCompletedForActor(sessionId, actor)
           -> listAssignedCommunityIds(userId, role)
           -> switch(role)
                MAINTENANCE_TECHNICIAN   -> findCompletedByIdForPerformerInCommunities(id, userId, ids)
                COMMUNITY_REPRESENTATIVE -> findCompletedByIdInCommunities(id, ids)
                otherwise                -> null
           -> null  ==> ReviewSessionNotFoundError  (unknown | draft | foreign performer |
                                                     foreign community | deactivated assignment
                                                     -- ONE return path, indistinguishable)
      -> reviewTemplateRepository.findFrozenWithSnapshot(session.templateId)   [frozen wording]
      -> inspectableElementRepository.findActiveByCommunityAndType(...)        [live codes, nullable]
      -> 200 { session, entries[+answers,+observations,+elementCode], coverage, questions }
                                                    ==> 404 REVIEW_SESSION_NOT_FOUND

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/shared/application/authorization/community-scope.checker.port.ts` | Modify | `listAssignedCommunityIds` (Decision 2); `isAssignedTo` untouched |
| `.../community/infrastructure/authorization/assignment-community-scope.checker.ts` | Modify | Implement it with the same fail-closed exhaustive `switch`; reuses shipped `findActiveByUser` |
| `.../review-session/application/ports/review-session.repository.port.ts` | Modify | Four `findCompleted…` methods (Decision 3); **still no `findById`** |
| `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` | Modify | Four queries; shared ordering constant; `{ in: [] }` fail-closed |
| `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` | Modify | Same four, same ordering, same empty-scope behaviour |
| `.../review-session/application/services/review-history-access.service.ts` | Create | The sibling gate (Decision 1) — two methods, two exhaustive switches |
| `.../review-session/application/use-cases/list-review-history.use-case.ts` | Create | Scope → rows + community-name map (Decision 6) |
| `.../review-session/application/use-cases/read-review-history.use-case.ts` | Create | Scoped record + frozen questions + live element codes |
| `.../review-session/presentation/review-history.controller.ts` | Create | Two routes, `reviewSession:read`, own 3-line `mapError` |
| `.../review-session/presentation/dto/review-history-row.dto.ts` | Create | List row |
| `.../review-session/presentation/dto/review-history-detail-response.dto.ts` | Create | Superset of the shipped detail DTO + `questions`, `elementCode` |
| `.../review-session/review-session.module.ts` | Modify | Register the controller, the service and the two use cases |
| `.../review-session/application/services/session-access.service.ts` | **Unchanged** | Decision 1 — deliberately not touched |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | **Unchanged** | Decision 5 — no new permission |
| `apps/api/prisma/**` | **Unchanged** | No schema change, no migration |
| `apps/web/src/api/review-history.ts` | Create | `apiFetch` client + response types |
| `apps/web/src/pages/ReviewHistoryPage.tsx` (+ test) | Create | Flat table: Community, Completed at, open link |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) | Create | Read-only record; no mutation control (Decision 7) |
| `apps/web/src/pages/ReviewSessionsPage.tsx` | Modify | Entry-point `Link` to `/review-history` |
| `apps/web/src/App.tsx` | Modify | Two `ProtectedRoute` routes for the two non-admin roles |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real translations, parity-enforced |
| `openspec/specs/review-session-management/spec.md`, `review-session-ui/spec.md` | Modify | **Narrow** the FR-008 rows; keep FR-009/FR-010 intact |
| `apps/api/test/review-history.e2e-spec.ts` | Create | Full visibility matrix |

## Interfaces / Contracts

```ts
// application/services/review-history-access.service.ts
// Sibling of SessionAccessService (design Decision 1), NOT a replacement.
// SessionAccess = "may this actor ACT on this draft" (performer-only, any status).
// This    = "may this actor READ this completed record" (completed-only, scope-widened
// for a representative). The invariant both rely on is unchanged and lives in the PORT:
// ReviewSessionRepository still exposes no identifier-only read.
@Injectable()
export class ReviewHistoryAccessService {
  // Empty scope => empty list, never an error and never an unscoped query.
  listForActor(actor: Actor): Promise<ReviewSession[]>;
  // Unknown | draft | foreign performer | foreign community | deactivated
  // assignment all collapse to ONE ReviewSessionNotFoundError.
  loadCompletedForActor(sessionId: string, actor: Actor): Promise<ReviewSession>;
}

// shared/application/authorization/community-scope.checker.port.ts  (Layer 2, extended)
export interface CommunityScopeChecker {
  isAssignedTo(userId: string, role: Role, communityId: string): Promise<boolean>; // unchanged
  // Same fail-closed exhaustive role dispatch as isAssignedTo, re-read per request
  // (no cache), reusing the shipped findActiveByUser on both assignment ports.
  // Any role without an assignment kind => []. This is what makes the
  // "a technician loses their OWN history when deactivated" rule structural.
  listAssignedCommunityIds(userId: string, role: Role): Promise<string[]>;
}
```

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (api) | `AssignmentCommunityScopeChecker.listAssignedCommunityIds` | Table-driven over all 5 roles × {no row, deactivated row, active rows}; every non-operational role returns `[]`; deactivated rows never appear |
| Unit (api) | `ReviewHistoryAccessService` role dispatch | Technician hits the `ForPerformer` method, representative the community one, every other role reaches **no** repository call and yields `[]` / `ReviewSessionNotFoundError` |
| Unit (api) | Empty scope | `communityIds = []` ⇒ empty list and `null` by id — asserted against **both** the fake and (integration) the Prisma adapter, since `{ in: [] }` is the silent-catastrophe case |
| Unit (api) | `SessionAccessService` regression | Its existing suite must pass **unmodified** — proof Decision 1 changed nothing on the write path |
| Unit (api) | Read-history use case | Frozen questions come from `findFrozenWithSnapshot`; a decommissioned element yields `elementCode: null` rather than dropping the entry |
| Integration (api) | Port surface guard | Enumerate `ReviewSessionRepository`'s methods: none returns a session (or list) from an identifier alone — spec *"No unscoped session read exists"* |
| Integration (api) | Ordering parity | Both list methods return `completedAt DESC, id DESC`; identical direction, deterministic on equal timestamps |
| E2E (api) | Visibility matrix, one test per route, no sampling | technician sees none of another technician's; representative sees none of another community's; representative **does** see a technician-performed session in scope |
| E2E (api) | Drafts excluded | Draft absent from both lists; draft by id ⇒ 404; completing it makes it appear |
| E2E (api) | Indistinguishable 404 | Deep-equal status **and** whole response body for: unknown id, draft, other performer's, other community's, since-deactivated assignment |
| E2E (api) | Retroactive own-history revocation | Technician reads own completed session; assignment deactivated; identical request ⇒ absent from list **and** 404 by id, on the very next request |
| E2E (api) | Scope guards | `MANAGER`/`MAINTENANCE_COMPANY_MANAGER` still `[]`; `SYSTEM_ADMIN` 403 on both routes; no `ManagerCapability`; no query/sort/page parameter accepted; no new migration |
| Unit (web) | Pages | Both pages × loading/error/empty/loaded; history detail renders **no** complete, discard or code-entry control; list applies no client-side filtering |
| Unit (web) | i18n | `locales.test.ts` parity across `en`/`es`/`ca` for the new keys |
| Browser | CLAUDE.md | Real dev server; log in as **each** in-scope role; technician own history + drill-in; representative cross-performer history + drill-in; deactivate an assignment and re-load; empty state |

## Migration / Rollout

**No migration required** — no schema change, no new column, no backfill; every
field read already exists (proposal's explicit constraint, and a spec guard).
Rollback is `git revert` of the branch: it removes two routes, four port
methods, one Layer 2 method, two use cases, one service, two pages and locale
keys. No shipped signature is broken and no existing behaviour moves —
`SessionAccessService`, `ROLE_PERMISSIONS`, `isAssignedTo` and the whole write
path are untouched by construction. The revert must also restore the original
FR-008 rows in the two amended spec files.

Delivery follows the proposal's `stacked-to-main` sketch (branches
`review-history/<NN>-<slug>`); `sdd-tasks` owns the split and the 400-line
forecast.

## Open Questions

- [ ] **ADR-011 addendum** (Decision 1) — the module now has two access
      services, a departure from `review-session` Decision 4's "one door"
      phrasing, and Layer 2 gains a listing method. Durable enough to record per
      `rules.design`. Deliberately **not** authored here; needs user
      confirmation, per the `review-session` precedent.
- [ ] **Performer identity in the representative's view** (Decision 6) — the API
      returns `performedById`, the UI renders no performer column, so a
      representative cannot tell two same-day sessions apart without opening
      them. Resolving names needs a `users` read no port supports. A named,
      deliberate gap for a follow-up slice, not an oversight.
- [ ] **Element codes are resolved live, not frozen** (Decision 6) — an element
      decommissioned or soft-deleted after completion reads back as
      `elementCode: null`. The durable fix is snapshotting the code onto
      `ElementReviewEntry`, which is a schema change and explicitly out of scope
      here. Worth an FR-010 (signing/export) prerequisite note.
- [ ] `GetReviewScopeUseCase` resolves the actor's communities by unioning both
      assignment ports **without** role dispatch, while `listAssignedCommunityIds`
      dispatches on role (Decision 2). Both are correct for their own purpose and
      this design deliberately does not refactor the write path — confirm
      `sdd-verify` reads the asymmetry as intentional rather than as drift.
