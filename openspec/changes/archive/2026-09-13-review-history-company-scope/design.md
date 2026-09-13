# Design: Company-Scoped Review History

## Technical Approach

A third scope on the already-shipped `review-history` surface, plus the one
structural change that makes it truthful: the performing **company is a column
on the session**, not a join to the performer's current employment.

The slice's five auditable rules, each in exactly one place:

| Rule | Where it is enforced | How it is auditable |
|---|---|---|
| Caller holds `reviewSession:read` | `PermissionsGuard` + `@RequirePermission` (Layer 1) | Route decorator; `ROLE_PERMISSIONS` gains one entry |
| A manager's scope is **their own company id**, re-read per request | `CompanyScopeChecker.resolveCompanyScope` (Layer 2, new sibling port), fail-closed exhaustive `switch`, no cache | One adapter, table-driven over all 5 roles |
| Attribution never drifts | `ReviewSession.performedByCompanyId`, written at INSERT, never updated | No port method can write it after creation |
| A technician always sees their **own** performed sessions, and only those | The port method name and its `WHERE` — `…ForPerformer` (no community conjunct) | 6 history methods, 6 trivial `WHERE` clauses |
| Null company ⇒ nothing, never everything | Branch returns `[]`/`null` **before** any repository call | One `if` per side, unit-asserted |

**Verified before designing, not assumed** (all read on `main` at 2026-09-09):
`AccessTokenPayload` is exactly `{ sub, email, role }` — no `maintenanceCompanyId`,
and `VerifiedAccessToken` adds only `jti`/`exp`. `User` has **no name field** —
`email` is the only human-readable identifier a performer has. `ReviewHistoryRowDto`
**and** `ReviewHistoryDetailResponseDto` both carry `performedById` (a raw UUID)
and neither page renders it. `ReviewHistoryAccessService` resolves the community
scope **before** its role `switch`, with an early `communityIds.length === 0`
return — the exact line the settled reversal has to move. `UsersModule` imports
nothing from any module, so `ReviewSessionModule → UsersModule` is acyclic.
`PrismaMaintenanceCompanyLookup` is the shipped precedent for "consumer owns a
narrow cross-module read port whose adapter touches `PrismaService` directly".
`SoftDeleteMaintenanceCompanyUseCase` refuses while any active user is attached
(`countActiveByMaintenanceCompany`), so an authenticating manager's company
cannot be soft-deleted underneath them. `20260904090000_add_inspectable_element_code`
is the shipped in-migration backfill precedent.

## Architecture Decisions

### Decision 1 — snapshot at **creation**, in the INSERT, and give it no update path (open question 1)

**Choice**: `ReviewSession.performedByCompanyId: string | null`, added to
`ReviewSessionProps`/the entity/the mapper, set by `OpenReviewSessionUseCase`
from the performer's current `maintenanceCompanyId` and written by
`repository.create()`. No repository method, use case or route ever writes it
again — `complete()` and `discardDraft()` keep their exact shipped signatures.

**Alternatives considered**: write it in `CompleteReviewSessionUseCase` /
`repository.complete(id, at, companyId)`.

**Rationale**: completion is the one write in this module with a concurrency
backstop (`updateMany … WHERE status='draft'`, affected-row count as the
signal); threading an authorization-relevant value through it widens the exact
statement the design least wants to touch. Creation writes the value once, in
the same INSERT that creates the row, so "the write path forgot the snapshot"
(proposal Risk, High) becomes structurally impossible rather than test-enforced:
there is no second path. Immutability is likewise structural — the port exposes
no setter, mirroring how `ReviewSession` has no `deletedAt` because no path
deletes a completed session.

**Accepted consequence, stated**: a draft opened before a technician transfers
and completed after is attributed to the **old** company. That is the right
answer — the work was started on that company's behalf — and it is the same
direction as the settled "frozen at performance time" decision.

**Null is normal, not an error**: a `COMMUNITY_REPRESENTATIVE` performs sessions
and has no `maintenanceCompanyId`. Those sessions are attributed to no company
and appear in **no** manager's list (proposal Approach choice 4).

### Decision 2 — one additive migration: nullable column, index, hand-written FK, and a backfill of **every** row

**Choice**: `20260909…_add_review_session_performed_by_company/migration.sql`,
hand-written per this schema's convention:

```sql
ALTER TABLE "ReviewSession" ADD COLUMN "performedByCompanyId" UUID;

CREATE INDEX "ReviewSession_performedByCompanyId_idx"
  ON "ReviewSession"("performedByCompanyId");           -- Prisma-VISIBLE (@@index)

-- Hand-written cross-module FK, INVISIBLE to Prisma (no @relation, ADR-013).
-- RESTRICT like the other four: MaintenanceCompany is soft-delete-only (ADR-010).
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_performedByCompanyId_fkey"
  FOREIGN KEY ("performedByCompanyId") REFERENCES "MaintenanceCompany"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Best-effort backfill (settled decision): ALL rows, not only completed ones.
UPDATE "ReviewSession" rs
   SET "performedByCompanyId" = u."maintenanceCompanyId"
  FROM "User" u
 WHERE u."id" = rs."performedById"
   AND rs."performedByCompanyId" IS NULL;
```

**Rationale for backfilling drafts too** — this is the non-obvious part.
Decision 1 writes the column at *creation*; a draft that already exists when
this migration runs was created before that code shipped, so if the backfill
filtered `WHERE status = 'completed'` that draft would be **permanently
unattributed** once completed, with no path to ever fix it. Filtering by status
would have quietly manufactured the exact bug this slice exists to prevent.
`u."maintenanceCompanyId"` may itself be `NULL` (representatives, grandfathered
users); those rows stay null, which is the fail-closed answer.

The column stays **nullable forever** — no `SET NOT NULL` closing step, unlike
the `code` precedent — because null is a legitimate, permanent state here.

**Migration test**: extend
`review-session/infrastructure/persistence/review-session-migration.integration.spec.ts`
(the shipped precedent) with the new column/index/FK presence assertions, the
continued presence of `ReviewSession_open_draft_key` and the other 6 FKs, and a
row-level backfill assertion against real Postgres.

### Decision 3 — the manager's company is resolved **per request from the database**, never from a JWT claim (open question 2 — the slice's biggest decision)

**Choice**: `resolveCompanyScope(userId, role)` hits `User` on every
`/review-history` request. `AccessTokenPayload` is **unchanged** — no
`maintenanceCompanyId` claim, no re-issue, no `/auth/me` change.

**Alternative considered**: sign `maintenanceCompanyId` into the access token
alongside `role`, inheriting the staleness tradeoff ADR-011's 2026-08-22
addendum already accepted.

**Rationale — and the security implication of both sides, stated explicitly**:

- *If it were a claim*: the token becomes a **bearer of tenant scope**. A
  manager moved from company A to company B, or detached from a company
  entirely, keeps reading company A's complete RIPCI compliance history for up
  to the full access-token lifetime (2h, `auth-minimal-skeleton` addendum) with
  **no revocation path** — the deny-list is keyed on `jti`, there is no `userId`
  column to bulk-invalidate by, and `User.sessionsValidFrom` is still an
  unbuilt ADR-011 follow-up. That is categorically worse than the accepted
  `role` staleness: a stale `role` narrows or widens *which endpoints* a person
  reaches inside one already-authorized installation, whereas a stale company
  claim crosses a **customer boundary** and exposes another maintenance
  company's records. It would also create a second source of truth for
  `maintenanceCompanyId` — one in the DB, one in the token — which is precisely
  the "which company does this belong to?" ambiguity `performedByCompanyId`
  exists to remove.
- *Per-request read*: costs one indexed primary-key lookup on two read-only
  endpoints, and it is the contract the whole `authorization` spec is already
  written against — `CommunityScopeChecker` deliberately re-reads with no
  cache so *"deactivating an assignment removes access on the next request"*.
  Detaching a manager from a company revokes their history on the very next
  request, by the same mechanism, with nothing new to reason about.

**Fail-closed by construction**: the adapter resolves through a lookup that
excludes soft-deleted users (ADR-010), so a soft-deleted manager resolves to
`null` and sees nothing. A `null` company short-circuits **before** any
repository call — the manager's branch never reaches a query with an absent
filter.

### Decision 4 — the resolution is a **shared Layer 2 authorization port**, sibling to `CommunityScopeChecker` (open question 3)

**Choice**: a new file beside the shipped one:

```ts
// shared/application/authorization/company-scope.checker.port.ts
export interface CompanyScopeChecker {
  // The maintenance company whose review history this actor may read, or null
  // when they have no company-wide scope at all. Same fail-closed exhaustive
  // role dispatch and same no-cache, re-read-every-call contract as
  // CommunityScopeChecker. MAINTENANCE_COMPANY_MANAGER is the ONLY role that
  // ever resolves to a non-null value — a MAINTENANCE_TECHNICIAN has a
  // maintenanceCompanyId too, and it deliberately grants nothing here.
  resolveCompanyScope(userId: string, role: Role): Promise<string | null>;
}
export const COMPANY_SCOPE_CHECKER = Symbol('COMPANY_SCOPE_CHECKER');
```

Adapter: `modules/users/infrastructure/authorization/user-company-scope.checker.ts`,
bound and **exported** by `UsersModule`; `ReviewSessionModule` imports
`UsersModule`. Placement mirrors the shipped precedent exactly —
`AssignmentCommunityScopeChecker` lives in `community`, the module that owns the
assignment tables; `User.maintenanceCompanyId` is owned by `users`.

**Alternatives considered**: (a) a third branch of `CommunityScopeChecker` —
rejected by proposal Approach choice 3, and it would corrupt that port's one
question; (b) a review-session-local port — rejected: ADR-011 Decision 1 gives
`MAINTENANCE_COMPANY_MANAGER` two more company-scoped powers (scoped CRUD on
their technicians, onboarding/disabling), so the *next* consumer of "what
company scopes this actor" is already named in an accepted ADR, and a
module-local answer would force a second, independently-maintained fail-closed
role dispatch. The file count is identical either way (one port + one adapter);
only the address differs.

**The exhaustive `switch` is the point**, not the return value: adding a 6th
role fails the build until someone decides whether it has a company scope,
exactly as `ROLE_PERMISSIONS` and `AssignmentCommunityScopeChecker` already do.

### Decision 5 — a **second**, deliberately separate cross-module read: `UserDirectory`, module-local and non-authorizing

**Choice**: `review-session/application/ports/user-directory.port.ts`, owned by
its consumer (the `MaintenanceCompanyLookup` precedent), adapter
`review-session/infrastructure/persistence/prisma-user-directory.ts` reading
`PrismaService` directly, plus an in-memory fake:

```ts
export interface UserDirectory {
  // WRITE path (Decision 1): the performer's CURRENT company, snapshotted at
  // creation. Role-agnostic on purpose — this is a data fact, not a grant.
  findMaintenanceCompanyId(userId: string): Promise<string | null>;

  // READ path (Decision 7): display-only emails, ONE batched query for the
  // whole result set. DELIBERATELY includes soft-deleted users — a manager's
  // entire purpose is reading sessions performed by technicians who have
  // since left, so ADR-010's default filter is the wrong default here.
  findEmailsByIds(userIds: readonly string[]): Promise<Map<string, string>>;
}
```

**Why not fold either method into `CompanyScopeChecker`** (the tempting move —
both read a user's company): the authorization port must be role-dispatched and
fail-closed; this one must be role-agnostic and soft-delete-inclusive. Merging
them puts a security-critical contract on a general-purpose lookup, which is
exactly how a future caller accidentally hands a technician company-wide scope.
Opposite filters, opposite failure directions, two ports.

**Why not inject `USER_REPOSITORY`** (which `UsersModule` already exports, and
which `ListReviewHistoryUseCase` has precedent for with `COMMUNITY_REPOSITORY`):
`UserRepository.findById` applies ADR-010's `deletedAt: null` filter, so exactly
the departed technicians a manager most needs to see would render as unknown;
and it would hand a read-only history use case `create`/`updateById`/
`softDeleteById`/`transactional`.

### Decision 6 — the repository port: +4 methods, **−2**, still no unscoped read

**Choice**: the four shipped `findCompleted…` methods become six, and the two
community-narrowed performer methods are **deleted**, not left in place:

```ts
// NEW — company scope (Decision 3/4). Ordering: the shipped
// COMPLETED_HISTORY_ORDER_BY constant, identical to the other list methods.
findCompletedForCompany(companyId: string): Promise<ReviewSession[]>;
findCompletedByIdForCompany(id: string, companyId: string): Promise<ReviewSession | null>;

// NEW — replace the technician's community-narrowed pair (Decision 7).
findCompletedForPerformer(performedById: string): Promise<ReviewSession[]>;
findCompletedByIdForPerformer(id: string, performedById: string): Promise<ReviewSession | null>;

// REMOVED — no caller survives the reversal:
//   findCompletedForPerformerInCommunities
//   findCompletedByIdForPerformerInCommunities

// UNCHANGED — the representative's pair:
//   findCompletedInCommunities / findCompletedByIdInCommunities
```

**Rationale**: one named method per (scope × shape), no discriminant, inherited
verbatim from the shipped Decision 3. Leaving the two orphaned methods on a
security-critical port is worse than the delete: a dead method whose name reads
plausibly ("for performer, in communities") is the one a future caller picks by
autocomplete, silently reinstating the reversed rule.

**Named-collision note**: `findCompletedByIdForPerformer(id, performedById)` sits
next to the shipped, status-agnostic `findByIdForPerformer(id, performedById)`
used by the **write** path. The `findCompleted…` prefix is this port's
established marker for a history read; the two are distinguished by it and by an
integration test asserting the new one never returns a draft. Reusing
`findByIdForPerformer` plus a caller-side `status === 'completed'` check is
rejected outright — that is caller-side narrowing, which the shipped spec
requirement *"History Scope Is Carried by the Query, Not by the Caller"* forbids.

### Decision 7 — the technician-own-history reversal: scope resolution moves **inside** the role branches

**Choice**: `ReviewHistoryAccessService` stops resolving any scope before its
`switch`. Each role branch resolves the scope **it** needs, and only that one:

```ts
async listForActor(actor: Actor): Promise<ReviewSession[]> {
  switch (actor.role) {
    // REVERSED 2026-09-09: own performed sessions, unconditionally. No
    // Layer 2 call at all — "mine" is performer identity (Layer 3), never
    // community membership. There is no communityIds parameter left to
    // forget, and the performer filter is still in the WHERE, so this
    // widens the technician's view by exactly zero other people's sessions.
    case 'MAINTENANCE_TECHNICIAN':
      return this.repository.findCompletedForPerformer(actor.userId);

    // UNCHANGED, byte for byte in behaviour: still gated on a currently
    // active assignment, still re-read per request.
    case 'COMMUNITY_REPRESENTATIVE': {
      const communityIds =
        await this.communityScopeChecker.listAssignedCommunityIds(actor.userId, actor.role);
      if (communityIds.length === 0) return [];
      return this.repository.findCompletedInCommunities(communityIds);
    }

    case 'MAINTENANCE_COMPANY_MANAGER': {
      const companyId =
        await this.companyScopeChecker.resolveCompanyScope(actor.userId, actor.role);
      if (companyId === null) return [];            // fail closed, before any query
      return this.repository.findCompletedForCompany(companyId);
    }

    case 'SYSTEM_ADMIN':
    case 'MANAGER':
      return [];
    default: { actor.role satisfies never; return []; }
  }
}
```

`loadCompletedForActor` changes identically: the pre-`switch`
`listAssignedCommunityIds` call and its `if (communityIds.length === 0) throw`
move into the representative branch of `loadByRole`; `loadByRole` loses its
`communityIds` parameter and becomes `async`; the single
`if (!session) throw new ReviewSessionNotFoundError()` throw site in
`loadCompletedForActor` is untouched, so a manager's out-of-company id, a
technician's foreign id, a draft, a nonexistent id and a null company scope all
still collapse to one indistinguishable 404.

**Why this is the precise shape of the reversal, and where it could go wrong**:

| Must hold | Enforced by |
|---|---|
| A deactivated technician still sees their own sessions | The technician branch makes **no** Layer 2 call, so the deleted early-return can no longer swallow it |
| A technician sees **no one else's** sessions, deactivated or not | `findCompletedForPerformer`'s `WHERE performedById = :self` — unchanged, and the *only* filter, so it cannot be widened by omission |
| A representative's rule is untouched | Their branch is the shipped code, moved verbatim, including the empty-scope early return |
| The old rule cannot come back by accident | The two `…ForPerformerInCommunities` methods are deleted from the port (Decision 6) |

The mistake this design is deliberately shaped against: simply deleting the
pre-`switch` early return while leaving the technician calling
`findCompletedForPerformerInCommunities(userId, [])` — which would return an
empty list forever — or, worse, "fixing" that by dropping the performer filter
instead of the community filter, which would show every technician their
community-mates' sessions.

### Decision 8 — the row (and the record) names the performer, for **all three roles** (open question 4)

**Choice**: `ReviewHistoryRowDto` and `ReviewHistoryDetailResponseDto` each gain
`performedByEmail: string`, resolved by one `UserDirectory.findEmailsByIds` call
per request over the distinct `performedById` values in the result (one query,
not N — unlike the shipped per-community `communityName` loop, because a
company-wide list can span many technicians). Unresolvable ⇒ `''`, and both
pages render a localized placeholder, exactly as `reviewHistory.list.communityUnknown`
already does for a soft-deleted community. Both pages render a Performer column
for every role — **no role-conditional variant**, per the shipped
`review-history-ui` rule *"the same surface, with no reduced or alternative
variant"*.

**Alternatives considered**: ship `performedById` and render the UUID
(rejected — a compliance record whose reader cannot attribute it to a person is
not a compliance record, and success criterion *"Each row identifies who
performed the session"* would be met only on a technicality); render the column
only for the manager (rejected by the shipped no-variant requirement).

**Note**: `User` has no name field, so `email` **is** the identity this app can
show today. This closes the archived design's own *"Performer identity in the
representative's view"* open question rather than adding a new one.

### Decision 9 — the manager's scope ANDs with **nothing** (open question 6)

**Choice**: `WHERE performedByCompanyId = :companyId AND status = 'completed'`.
Full stop. Explicitly **not** conjoined with: any community assignment or
`CommunityScopeChecker` call; the performer's *current* employment; the
performer's `deletedAt`; the community's `deletedAt`; the template's status.

**Rationale**: every one of those conjuncts would silently subtract sessions the
manager is commercially accountable for — a departed technician's work is
exactly what a manager most needs. Recorded as a requirement so it cannot be
"inherited by accident" from the community-scoped roles later.

### Decision 10 — the manager's entry point is a role-conditional link on `/` (open question 5)

**Choice**: `HealthPage.tsx` gains a second role-gated `Link` — to
`/review-history`, shown for `MAINTENANCE_COMPANY_MANAGER` only, alongside the
shipped `/review-sessions` link for the two performing roles. New i18n key
`health.reviewHistoryLink` in `en`/`es`/`ca`. `App.tsx`'s two
`/review-history*` `ProtectedRoute allowedRoles` gain
`MAINTENANCE_COMPANY_MANAGER`; the `/review-sessions*` routes **do not**.

**Rationale**: the shipped entry point routes through `/review-sessions`, the
**write** surface, which this role must never reach. `/` is already every
authenticated role's landing page and already carries the role-conditional-link
precedent (`review-session` design Decision 10) — the minimum viable answer, no
navigation component, no layout refactor (ADR-006).

### Decision 11 — what the ADR-011 addendum must say (settled decision: it ships here)

Authored as `## Addendum (2026-09-09): review-history-company-scope — a third
scope-resolution path, and the first MAINTENANCE_COMPANY_MANAGER permission`,
appended after the 2026-09-08 addendum, matching that addendum's style (numbered
points, a code/table block, explicit "rejected" notes, a pointer to this
design). It MUST state, and needs no further product input to write:

1. **Layer 2 now has two ports, not one.** Extend the shipped three-layer table:
   `CommunityScopeChecker` (user → communities, `community` module adapter) and
   `CompanyScopeChecker` (user → own maintenance company, `users` module
   adapter) are siblings; both are fail-closed, exhaustive on `Role`, and
   re-read per request with no cache. A `MAINTENANCE_COMPANY_MANAGER` resolves
   through the second and **never** through the first — routing them through
   `CommunityScopeChecker` would grant them exactly nothing, since they hold no
   community assignment.
2. **The review-session module has multiple access services and, now, three
   scope-resolution paths** — the deferred-twice record. `SessionAccessService`
   (write, performer-only, any status) and `ReviewHistoryAccessService` (read,
   completed-only, three scopes) are siblings, a departure from `review-session`
   design Decision 4's "one door" phrasing. The invariant that phrasing existed
   to protect is preserved **by the port, not by the service count**:
   `ReviewSessionRepository` still exposes no identifier-only read; all six
   history methods and `findByIdForPerformer` carry a performer, community or
   company scope as a required parameter.
3. **`MAINTENANCE_COMPANY_MANAGER` becomes operational** — `ROLE_PERMISSIONS`
   maps it to `['reviewSession:read']`, its first non-empty entry since the
   2026-08-22 addendum declared all four roles inert, and it delivers ADR-011
   Decision 1's promised *"read access to every ReviewSession performed by any
   technician of their company"*. `MANAGER` stays `[]`; `SYSTEM_ADMIN` still
   holds no `reviewSession:*`; Decision 1's other two manager powers (scoped
   technician CRUD, onboarding/disabling) and Decision 2's `ManagerCapability`
   mechanism remain unbuilt.
4. **Attribution is frozen, not derived** — `ReviewSession.performedByCompanyId`
   snapshots the performer's company at creation. Decision 1's phrase *"performed
   by any technician of their company"* is therefore implemented as *"performed
   **on behalf of** their company"*: a technician who transfers does not move
   their past reviews. Backfill of pre-existing rows is best-effort from current
   employment (stated, accepted limitation).
5. **Rejected, with the reason**: adding `maintenanceCompanyId` to the access
   token. Record Decision 3's staleness/blast-radius argument in two sentences,
   and note that this is a *deliberate divergence* from how `role` is handled —
   so a future reader does not "harmonize" the two without re-deciding.

`sdd-apply` writes this file; no product input remains.

## Data Flow

    GET /review-history                     (AuthenticatedGuard -> PermissionsGuard: reviewSession:read)
      -> ReviewHistoryAccessService.listForActor(actor)
           switch(role)   [exhaustive, `satisfies never`, scope resolved INSIDE each branch]
             MAINTENANCE_TECHNICIAN       -> findCompletedForPerformer(userId)         [no Layer 2 call]
             COMMUNITY_REPRESENTATIVE     -> listAssignedCommunityIds -> [] ==> []     [unchanged]
                                          -> findCompletedInCommunities(ids)
             MAINTENANCE_COMPANY_MANAGER  -> resolveCompanyScope -> null ==> []        [fail closed]
                                          -> findCompletedForCompany(companyId)
             SYSTEM_ADMIN | MANAGER       -> []
      -> communityRepository.findById   once per distinct community in the RESULT
      -> userDirectory.findEmailsByIds  ONE query for all distinct performers
      -> rows, completedAt DESC, id DESC

    POST /review-sessions   (write path, Decision 1)
      -> OpenReviewSessionUseCase
           -> userDirectory.findMaintenanceCompanyId(performedById)   -> string | null
           -> new ReviewSession({ …, performedByCompanyId })
           -> repository.create()      INSERT once; no path ever updates the column

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `performedByCompanyId String? @db.Uuid` + `@@index`; FK comment block per ADR-013 |
| `apps/api/prisma/migrations/2026…_add_review_session_performed_by_company/migration.sql` | Create | Column, index, hand-written FK, all-rows backfill (Decision 2) |
| `.../review-session/domain/review-session.entity.ts` | Modify | `performedByCompanyId: string \| null`, readonly, no setter |
| `.../review-session/infrastructure/persistence/review-session.mapper.ts` | Modify | Map the column both directions |
| `apps/api/src/shared/application/authorization/company-scope.checker.port.ts` | Create | Layer 2 sibling port (Decision 4) |
| `.../users/infrastructure/authorization/user-company-scope.checker.ts` | Create | Adapter: exhaustive fail-closed `switch`, soft-delete-excluding read |
| `.../users/users.module.ts` | Modify | Bind + **export** `COMPANY_SCOPE_CHECKER` |
| `.../review-session/application/ports/user-directory.port.ts` | Create | Module-local, non-authorizing (Decision 5) |
| `.../review-session/infrastructure/persistence/prisma-user-directory.ts` | Create | Reads `PrismaService` directly; email read includes soft-deleted |
| `.../review-session/application/use-cases/testing/in-memory-user-directory.ts` | Create | Fake for unit tests |
| `.../review-session/application/ports/review-session.repository.port.ts` | Modify | +4 methods, −2 (Decision 6); **still no unscoped `findById`** |
| `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` | Modify | Four queries, shared `COMPLETED_HISTORY_ORDER_BY`; two deleted |
| `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` | Modify | Same four/two, same ordering |
| `.../review-session/application/services/review-history-access.service.ts` | Modify | Scope resolution moves inside the branches (Decision 7) |
| `.../review-session/application/services/session-access.service.ts` | **Unchanged** | Write-path gate, deliberately untouched |
| `.../review-session/application/use-cases/open-review-session.use-case.ts` | Modify | Snapshot the performer's company at creation (Decision 1) |
| `.../review-session/application/use-cases/list-review-history.use-case.ts` | Modify | Batch performer-email resolution (Decision 8) |
| `.../review-session/application/use-cases/read-review-history.use-case.ts` | Modify | Same, for the single performer |
| `.../review-session/presentation/dto/review-history-row.dto.ts`, `…-detail-response.dto.ts` | Modify | `performedByEmail` |
| `.../review-session/review-session.module.ts` | Modify | Import `UsersModule`; bind `USER_DIRECTORY` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `MAINTENANCE_COMPANY_MANAGER: ['reviewSession:read']` — nothing else |
| `apps/web/src/api/review-history.ts` | Modify | `performedByEmail` on both response types |
| `apps/web/src/pages/ReviewHistoryPage.tsx` (+ test) | Modify | Performer column + placeholder fallback |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) | Modify | Performer line |
| `apps/web/src/pages/HealthPage.tsx` (+ test) | Modify | Manager entry link (Decision 10) |
| `apps/web/src/App.tsx` | Modify | Widen the two `/review-history*` routes only |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | `health.reviewHistoryLink`, `reviewHistory.*.columnPerformer`, `performerUnknown` |
| `.../review-session/infrastructure/persistence/review-session-migration.integration.spec.ts` | Modify | Column/index/FK + row-level backfill assertions |
| `apps/api/test/review-history.e2e-spec.ts` | Modify | Three-role matrix, both null cases, transfer case, deactivation-reversal case |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modify | The addendum (Decision 11) |
| `docs/requirements/functional-requirements.md` | Modify | FR-008: three of four scopes shipped |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (api) | `UserCompanyScopeChecker` | Table-driven over all 5 roles × {no company, company, soft-deleted user}; only `MAINTENANCE_COMPANY_MANAGER` ever non-null |
| Unit (api) | `ReviewHistoryAccessService` dispatch | Technician reaches `findCompletedForPerformer` and **never** the scope checker; representative's path byte-identical to shipped; manager with `null` company reaches **no** repository call |
| Unit (api) | The reversal, explicitly | Technician with zero active assignments still gets their own sessions (list **and** by id); the same technician still gets `[]`/404 for another performer's session |
| Unit (api) | `OpenReviewSessionUseCase` | Every created session carries the performer's company; a performer with none creates a `null`-attributed session |
| Unit (api) | Email resolution | One `findEmailsByIds` call regardless of row count; soft-deleted performer still resolves; unresolvable ⇒ `''` |
| Integration (api) | Port surface guard | Enumerate `ReviewSessionRepository`: no identifier-only read; the two `…ForPerformerInCommunities` methods are **gone** |
| Integration (api) | Migration | Column, index, FK present; `ReviewSession_open_draft_key` and all 7 FKs intact; backfill attributes each row to its performer's company; down-migration clean |
| Integration (api) | Company queries | `findCompletedForCompany` never returns another company's or a `null`-company row; ordering identical to the other two list methods |
| E2E (api) | Three-role visibility matrix, no sampling | Manager sees all own-company sessions across technicians and communities; none of another company's; both null cases (manager without company, session without company) ⇒ empty/404 |
| E2E (api) | Attribution survives transfer | Complete a session, move the technician to company B, assert it stays with A's manager and never appears for B's |
| E2E (api) | Reversal | Technician completes a session, assignment deactivated, identical request ⇒ still present **and** still readable by id; a community-mate's session ⇒ 404 before and after |
| E2E (api) | Scope guards | `MANAGER` still `[]`; `SYSTEM_ADMIN` 403; no `ManagerCapability`/`VIEW_ALL_REVIEWS` symbol; no query/sort/page parameter accepted; manager 403 on every `/review-sessions*` route |
| Unit (web) | Pages | All three roles render the same surface; performer column + placeholder; manager link on `/` and only for that role; no filtering control |
| Unit (web) | i18n | `locales.test.ts` parity for the new keys |
| Browser | CLAUDE.md | Real dev server; log in as `MAINTENANCE_COMPANY_MANAGER` (plus regression passes for the other two roles); company-wide list at realistic volume, drill-in, empty state, entry point |

## Migration / Rollout

One additive migration (Decision 2), applied with `prisma migrate deploy`; no
downtime and no code depends on the column until PR 2. Delivery follows the
proposal's `stacked-to-main` sketch, branches
`review-history-company-scope/<NN>-<slug>`; the migration is its own PR.
`sdd-tasks` owns the split and the 400-line forecast.

**Rollback — the asymmetric part, as the proposal asked this design to settle**:
the safe rollback is **revert the code, keep the column**. Once reverted, the
column is nullable, written by nothing and read by nothing — inert, and it
preserves the backfill so re-applying the change later does not re-derive
attribution from employment that has drifted further. Drop it (down migration:
drop FK, drop index, drop column) only if the change is abandoned permanently.
Spec amendments and the ADR-011 addendum revert **with** the code, or the specs
will claim a deferral the code no longer honours.

## Open Questions

- [x] **Company-scoped list volume measured via task 6.8's browser
      verification** (Decision 9 + the settled no-filtering decision). This
      is the first query in the app with no narrowing conjunct beyond one
      indexed equality; the index makes the query cheap, but the payload and
      the page are unbounded. At the seeded volume exercised (a company with
      2 technicians completing sessions across 2 communities, plus a
      cross-company and an unattributed control) the manager's list rendered
      instantly with no observable pain — too small a sample to validate
      unbounded growth, but nothing to fix at this change's scale. Also
      exercised and confirmed working end-to-end in the real browser: a
      technician transferred to a different company AFTER completing a
      session stays attributed to the original company's manager, and is
      correctly absent from the new company's manager (Decision 1,
      attribution frozen at performance time — the highest-risk scenario for
      an unbounded/unfiltered query to get wrong); and the empty-list state
      for a company with zero completed sessions renders a clean "No
      completed reviews found" message, not an error. Not a blocker at
      current scale — the app-wide filtering initiative remains the named
      remedy for volume once it materializes as a real pain point.
- [x] **`UserDirectory` is review-session's first deliberate bypass of ADR-010's
      soft-delete default filter** (Decision 5). Correct here, and narrowly
      scoped to one email lookup (`findEmailsByIds`, shipped in Phase 3).
      Carried forward as a **watch item, not a blocker**: if a second such
      read appears anywhere in the codebase, revisit whether "historical
      identity of a departed user" deserves a named, shared read model
      rather than a per-module exception — rule of three, not before. No
      second instance exists as of this change; nothing to build now.
