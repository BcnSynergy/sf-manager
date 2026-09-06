# Design: Perform a Review Session

## Technical Approach

One new `apps/api/src/modules/review-session/**` module in the established
hexagonal mirror, one aggregate rooted at `ReviewSession` (proposal "Approach").
The three genuinely novel mechanisms are each solved by making the constraint a
**property of a port signature**, not a discipline every caller must remember —
the shape `InspectableElementRepository.findByIdInCommunity` already ships and
already documents ("the scope is a property of the port, not a per-caller
discipline check"):

| Novel mechanism | How it becomes structural |
|---|---|
| Resource scope | One `SessionAccess` application service is the **only** way any use case obtains a session (Decision 4) |
| By-code leakage | No `findByCode(code)` ever exists; the only by-code method takes `communityId` + `elementType` as required parameters the caller cannot supply (Decision 6) |
| Completed-session immutability | Aggregate root refuses every mutation when `status !== 'draft'`; there is no `updateById` on the repository (Decision 8) |
| Mandatory skip reasons | Completion requires an **entry** for every active element; the entry itself is `answers XOR observations` (Decisions 1–2) |

Verified before designing, not assumed: `PermissionsGuard` reads only
`request.user.role` and never `request.params`; `findFrozenWithSnapshot` filters
`status IN ('active','retired')`, so it keeps serving a session whose template
was retired later; `findByCommunityAndUser` already exists on **both**
assignment ports and already returns `deactivatedAt`; `apps/web` has no client
cache layer (no react-query) and no navigation component.

## Architecture Decisions

### Decision 1 — `observations` lives on `ElementReviewEntry`, nullable, and is the entry's skip reason (BLOCKING decision, resolved)

**Choice**: `observations: string | null` on `ElementReviewEntry`. An entry is
valid iff **exactly one** of these holds:

- `answers.length > 0 && observations === null` — the element was reviewed
- `answers.length === 0 && observations !== null` — the element was not
  reviewed, and this is why

There is no session-level free-text `observations`. When an element **is**
reviewed the field is `null` — not `''`, not "not applicable".

**Enforcement, in three layers, deliberately not one**:

1. **Domain invariant (primary)** — `ElementReviewEntry` has no public
   constructor. Two named factories, `ElementReviewEntry.reviewed(props)` and
   `ElementReviewEntry.unreviewed(props)`, are the only ways to build one;
   `unreviewed` throws `MissingObservationsError` on an empty/whitespace
   reason. The illegal state is unconstructible, so no application-layer `if`
   guards it.
2. **Zod (`packages/validation`)** — the request body is a
   `z.discriminatedUnion`, so a body carrying both keys or neither is a 400
   before the use case runs.
3. **Postgres CHECK (backstop)** — hand-written, invisible to Prisma:
   `CHECK ("observations" IS NULL OR btrim("observations") <> '')`. It cannot
   see the child rows, so it guards only the intra-row half; that is honest
   about what a table constraint can do here rather than pretending to enforce
   the whole invariant.

**Alternatives**: (a) session-level free text — rejected: the confirmed product
rule is "mandatory **per unreviewed element**", and one text blob cannot be
attributed to an element, so the rule would be unenforceable and the compliance
record would say "some things were skipped" instead of "extinguisher E-12,
sealed room"; (b) both — rejected: two places to write the same fact, and no
requirement in this slice reads a session-level note; (c) a separate
`SkippedElement` table — rejected, it splits coverage across two tables so
"which active elements are unaccounted for" needs a three-way diff.

**Rationale**: the per-element reason and the per-element answers are the same
fact about the same element — one row, one identity, one uniqueness constraint
(`@@unique([reviewSessionId, inspectableElementId])`), and one query answers
"what happened to this element in this session".

### Decision 2 — an unreviewed element is a stored entry, and completion requires total entry coverage

**Choice**: skipping is a **stored fact**, never a computed diff.
`CompleteReviewSessionUseCase` computes the set of elements that are
`deletedAt IS NULL AND deactivatedAt IS NULL` in the session's community with
the session's `elementType`, subtracts the elements that already have an entry,
and **rejects completion** with `409 UNREVIEWED_ELEMENTS_WITHOUT_REASON` if the
remainder is non-empty (the response lists the offending element codes so the
UI can drive the user straight to them).

This is the precise reading of the two settled product rules together:

| Product rule | What it constrains |
|---|---|
| "Partial completion is allowed" | Coverage of **answers** — an element may end with zero answers |
| "`observations` is mandatory per unreviewed element" | Coverage of **entries** — every active element must have one |

**Alternatives**: (a) absence of an entry means "skipped", reason unattributable
— rejected, it contradicts the mandatory-reason rule directly; (b) store the
skip set on the session as an array of element ids — rejected, it is a second
representation of a fact the entry table already holds, and Postgres cannot FK
an array element.

**Rationale**: a compliance record read three years later must state, per
element, either the answers or why not. Deriving "skipped" as a diff makes that
record depend on the element table's *present* state — decommission an element
next year and a past session silently gains or loses a gap. Storing it freezes
the fact at completion time.

**Accepted consequences, stated rather than discovered later**:

- The required set is evaluated **at completion time**, so an element
  decommissioned or soft-deleted mid-walk drops out of it (correct — it is no
  longer expected), and an element **created** mid-walk joins it (the performer
  marks it unreviewed with a reason, or reviews it).
- A `draft` has no coverage requirement at all. The rule fires exactly once,
  on the completion transition.

### Decision 3 — `deactivatedAt DateTime?` on `InspectableElement`, orthogonal to `deletedAt`

**Choice**: `deactivatedAt DateTime? // NULL = active`, following the shipped
`CommunityTechnician`/`CommunityRepresentative` precedent verbatim
(community/design.md Decision 3: "`deactivatedAt`, not `deletedAt` — this is
domain state, not an administrative delete"). Not a boolean.

**Composition with `deletedAt` — two independent columns, two different
audiences**:

| Column | Meaning | Effect on reads |
|---|---|---|
| `deletedAt` | administrative delete (ADR-010) | Hides the row from **every** read, unchanged |
| `deactivatedAt` | domain state: decommissioned | Hides it from **review eligibility only**; it stays in the admin list so it can be reactivated |

Review eligibility is therefore `deletedAt IS NULL AND deactivatedAt IS NULL`,
and it appears in exactly one place — Decision 6's query. A soft-deleted element
cannot be reactivated because the update path already 404s on it; no extra rule
needed.

**Alternatives**: `boolean active NOT NULL DEFAULT true` — rejected on three
counts: it breaks the shipped `NULL = active` convention this codebase already
reads fluently; it needs a column default that then lingers in the schema (the
exact debris `label-printing` Decision 4a had to write a cleanup migration for);
and it discards the decommission timestamp for zero savings.

**Migration consequence — the backfill disappears**: `ADD COLUMN
"deactivatedAt" TIMESTAMP(3)` leaves every existing row `NULL`, i.e. active, by
construction. The proposal's "hand-written backfill marking every existing row
active" is **not needed** and must not be written; the success criterion "no row
is left indeterminate" is satisfied structurally. The migration integration spec
asserts `is_nullable = 'YES'` and `COUNT(*) WHERE "deactivatedAt" IS NOT NULL =
0`.

**No new permission**: set/unset reuses `inspectableElement:update` via the
existing `PATCH .../inspectable-elements/:elementId` body
(`{ "deactivated": true | false }` → `deactivatedAt = now() | null`), so the
admin control is a checkbox on the existing edit form and `updateById`'s
`changes` type gains one member.

### Decision 4 — the scope check is an application-layer service that owns the only session read path

**Choice**: three composable layers; none of them is a widened
`PermissionChecker.can()` and none of them lives in `PermissionsGuard`.

```
Layer 1  role → permission        PermissionsGuard + @RequirePermission   (unchanged)
Layer 2  user → community          CommunityScopeChecker port             (new, shared)
Layer 3  user → this session       SessionAccess application service      (new, module-local)
```

- **Layer 2** — `shared/application/authorization/community-scope.checker.port.ts`:
  `isAssignedTo(userId, role, communityId): Promise<boolean>`. Adapter in
  `modules/community/infrastructure/authorization/assignment-community-scope.checker.ts`
  dispatches on role: `MAINTENANCE_TECHNICIAN` → technician repo,
  `COMMUNITY_REPRESENTATIVE` → representative repo, **every other role →
  `false`** (fail closed, exhaustive `switch`). It calls the *existing*
  `findByCommunityAndUser` on either port and returns
  `row !== null && row.deactivatedAt === null` — so "deactivating an assignment
  removes access on the next request" is true for free, with no cache to
  invalidate. `CommunityModule` provides it; `ReviewSessionModule` imports
  `CommunityModule`. No cycle: community does not import review-session.
- **Layer 3** — `application/services/session-access.service.ts`, one method
  `loadDraftForActor` / `loadForActor(sessionId, actor)`. It is the **only**
  code in the module that turns a `sessionId` into an aggregate:
  `repository.findByIdForPerformer(sessionId, actor.userId)` (scope in the port
  signature) → `null` ⇒ `ReviewSessionNotFoundError`; then
  `communityScopeChecker.isAssignedTo(...)` → `false` ⇒ **the same**
  `ReviewSessionNotFoundError`. `ReviewSessionRepository` exposes **no**
  `findById(id)` at all, so a use case that forgets the scope check has nothing
  to call.

**Alternatives**: (a) decorator + enriched guard — rejected on read evidence:
`PermissionsGuard` never touches `request.params`, and on the by-code route the
community is not in the params **at all** (it is derived from the session), so
a guard would have to perform two DB reads and re-derive domain state before
the use case runs; (b) repository-level constraint only — rejected: it secures
reads but says nothing about "may this actor complete this session"; (c)
widening `PermissionChecker.can(role, permission, resource)` — rejected per
proposal Approach 2 and ADR-011 Decision 3, and it would drag resource identity
into the exhaustive `Record<Role, Permission[]>` table whose build-breaking
exhaustiveness this slice must keep intact.

**Rejection matrix** — fixed here so E2E asserts a table, not a vibe:

| Situation | Status | `code` |
|---|---|---|
| No/invalid token | 401 | — |
| Role lacks the route's permission | 403 | — |
| `POST /review-sessions` naming a community that does not exist **or** one the actor is not actively assigned to | 403 | `COMMUNITY_NOT_IN_SCOPE` |
| No `active` template for the element type | 404 | `ACTIVE_TEMPLATE_NOT_FOUND` |
| Open draft already exists for (community, template, actor) | 409 | `OPEN_DRAFT_ALREADY_EXISTS` |
| `sessionId` unknown **or** another performer's **or** assignment since deactivated | 404 | `REVIEW_SESSION_NOT_FOUND` |
| Any code that is not resolvable in scope (Decision 6) | 404 | `ELEMENT_NOT_FOUND` |
| Any write to a non-`draft` session | 409 | `REVIEW_SESSION_NOT_EDITABLE` |
| Complete with active elements lacking an entry | 409 | `UNREVIEWED_ELEMENTS_WITHOUT_REASON` |
| Answer set ≠ the frozen question set | 400 | `ANSWERS_DO_NOT_MATCH_TEMPLATE` |

Why 403 on open but 404 on session routes: on `POST` the caller *named* the
community, so "not yours" leaks nothing it did not already supply, and the UI
needs the distinction. A `sessionId` is server-generated and never guessable, so
existence is the secret and 404 is the safe answer.

**Confirmed with the product owner** (2026-09-06): this 403 carve-out is
deliberately scoped to identifiers the caller already supplied and asserts
intent over (`communityId` on open) — it does not weaken the indistinguishable-
rejection rule for identifiers that ARE the secret being resolved (`sessionId`,
element `code`). `CommunityScopeChecker.isAssignedTo` is a single boolean with
no existence branch: a nonexistent `communityId` and an existing-but-unassigned
one both simply return `false`, so both already produce the identical
`403 COMMUNITY_NOT_IN_SCOPE` — there is no separate 404 path for "community
does not exist" on this route. `authorization/spec.md`'s indistinguishable-
rejection requirement is worded to apply to session/element identifiers
specifically; it does not extend to a community named on creation.

**ADR-011 addendum: needed, and NOT written by this design.** This slice
supplies the first concrete implementation of ADR-011 Decision 3's "separate,
composable check layered on top" and makes two roles operational for the first
time — every prior slice recorded its authorization deltas as an ADR-011
addendum. This design records the shape; **writing the addendum is a separate,
user-confirmed step** (flagged as a risk/next-step, not silently authored here).
It should also correct ADR-011's own text, which still points at ADR-005's
`CommunityMaintenanceAssignment` scoping model — the same drift the domain-model
doc carries.

### Decision 5 — `findActiveByUser` on both assignment ports; the scope check itself adds no method

**Choice**:

```ts
// CommunityTechnicianRepository (new) — mirrors findActiveByCommunity's naming
findActiveByUser(userId: string): Promise<CommunityTechnician[]>;
// CommunityRepresentativeRepository (new) — same signature, sibling shape
findActiveByUser(userId: string): Promise<CommunityRepresentative[]>;
```

Both filter `deactivatedAt IS NULL`. `countActiveByUser` is **kept unchanged** —
it still serves the multi-community warning and the soft-delete cascade; no
shipped signature is broken.

**These are for the scope *listing* endpoint only.** The per-request scope check
(Decision 4, Layer 2) needs no new method: `findByCommunityAndUser` already
exists on both ports and already returns `deactivatedAt`. Adding a
single-community `isActivelyAssigned` helper was rejected — it would be a second
truth about the same fact, one indexed row read cheaper than nothing.

`GET /review-scope` resolves community **names** by calling the existing
`CommunityRepository.findById` per assignment. Accepted at this cardinality (a
technician holds a handful of communities); revisit with a `findManyByIds` if a
real list ever grows — an explicit, measured deferral, not an oversight.

### Decision 6 — one by-code method, scope in the signature, one return path

**Choice**:

```ts
// InspectableElementRepository (new) — no findByCode(code) is ever added
findReviewableByCode(
  communityId: string,
  elementType: ElementType,
  code: string,
): Promise<InspectableElement | null>;
```

The adapter's single `WHERE` is
`code = $3 AND "communityId" = $1 AND "elementType" = $2 AND "deletedAt" IS NULL
AND "deactivatedAt" IS NULL`.

**Why responses are byte-identical rather than merely "similar"**: there is
literally one failing return path. Unknown code, foreign community, wrong
element type, decommissioned and soft-deleted all collapse to the same `null`
**inside the query**, before any code can branch on why. The use case cannot
distinguish them either, so it throws one `InspectableElementNotFoundError`,
mapped by the controller to one
`buildCodedError(NOT_FOUND, <one message>, 'ELEMENT_NOT_FOUND')`. Distinguishing
would require adding a second query — the leak would have to be written on
purpose.

**And the caller cannot widen the scope**: `communityId` and `elementType` are
**not** request parameters. They are read off the aggregate that
`SessionAccess` already loaded (Decision 4), so a client cannot vary them. This
is what makes the guarantee structural rather than a code-review convention.

**Alternatives**: (a) `findByCode(code)` + a post-filter in the use case —
rejected, that is exactly the "bare global read" proposal Approach 3 forbids,
and one forgetful caller re-opens cross-community enumeration; (b) filter
`deactivatedAt` in the use case so the error could say "decommissioned" —
rejected, the distinguishable message *is* the leak.

**Index**: none added. `code` is `@unique`, so `InspectableElement_code_key`
yields at most one row and the remaining predicates are a filter on that row —
constant work whether the code is yours, foreign, or nonexistent, which
incidentally keeps the timing side channel flat.

### Decision 7 — the session stores `templateId` only; that FK *is* the version

**Choice**: `ReviewSession.templateId` references the **frozen version row**
resolved at open time. No `templateVersion` column, no per-session copy of the
question text.

**Rationale**: in this schema each activated version is its own `ReviewTemplate`
row (`checklist-management` Decision 3 — version assigned in the activation
transaction, predecessor retired), and the immutable wording already lives in
that row's `ReviewTemplateQuestion` snapshot. So the FK is already a pointer to
an immutable version — denormalizing `version` would duplicate a value that
cannot change. Verified load-bearing detail: `findFrozenWithSnapshot` filters
`status IN ('active','retired')`, so activating a successor (which retires this
row) does **not** break an old session's read.

**Alternatives**: (a) denormalized `templateVersion Int` — rejected, derivable
and therefore driftable; (b) copying question text onto each
`ElementReviewEntry` — rejected, a second snapshot of an already-frozen
snapshot, and it would make the entry table quadratic in question count.

**New template query** (`ReviewTemplateRepository`):
`findActiveByElementType(elementType: ElementType): Promise<ReviewTemplate[]>` —
returns every `status = 'active'` template for the type. It returns a **list**,
not one row, because the one-active-per-lineage index is keyed on
`(elementType, frequency)`, so an element type can legitimately have one active
`QUARTERLY` and one active `ANNUAL` template. `GET /review-scope` surfaces them
by `(elementType, frequency)` and the open request names one `templateId`; the
use case re-validates that the id is in that active set before storing it.

### Decision 8 — `ReviewSessionStatus` declares `draft | completed` only

**Choice**: two values. `signed` is not declared.

**Alternatives**: declare `draft | completed | signed` upfront — rejected.

**Rationale**: the exhaustiveness argument that justifies inert rows in
`Record<Role, Permission[]>` does not transfer — that table is a `Record` whose
missing key breaks the build, whereas an unreachable enum member is just an
extra branch every `switch`, mapper and test must carry to satisfy a state no
code can produce, and that `sdd-verify` would then have to prove unreachable.
Precedent: `ReviewTemplateStatus` declared exactly the three states it used.
Adding it in FR-010 is one `ALTER TYPE ... ADD VALUE` — the cheapest possible
future migration. ADR-006 says don't build the referent before it exists.

**Immutability, since the enum is now binary**: it is the aggregate root's job,
not the controller's. `ReviewSession.recordEntry(...)`, `.markUnreviewed(...)`,
`.complete()` and `.discard()` each throw `ReviewSessionNotEditableError` when
`status !== 'draft'`. The repository deliberately exposes **no** `updateById`,
**no** `delete` for non-drafts and **no** status setter — `complete(sessionId)`
and `discardDraft(sessionId)` are the only transitions, each with `status =
'draft'` in its own `WHERE`, so a lost race fails on affected-row-count rather
than silently editing a completed review.

### Decision 9 — plain fields and pure functions; no Value Objects

**Choice**: every field on all three entities is a plain `readonly` field, and
the two enums follow the shipped **three-way seam**: the TypeScript union in
`review-session/domain/{review-session-status,answer-value}.ts` is
authoritative, the Prisma enum is its persistence projection, the Zod schema in
`packages/validation` is its wire projection, and a parity integration spec
asserts all three agree (`ElementType` / `ReviewFrequency` /
`ReviewTemplateStatus` precedent, three times over).

**Rationale**: this module's per-slice re-derivation (ADR-006 addendum) lands
where `installed-at.ts` and `element-code.ts` landed — `observations` carries no
behaviour beyond a trim and a length bound, both owned by Zod on write;
`AnswerValue` is a closed set, which a union already expresses with better
exhaustiveness checking than a class. The behaviour this slice genuinely has
(the immutability rule, the `answers XOR observations` invariant) is
**aggregate-root behaviour**, not field behaviour, so it belongs on
`ReviewSession`/`ElementReviewEntry` — where Decisions 1 and 8 put it — and a VO
would not have hosted it anyway.

### Decision 10 — flat `/review-sessions` API; four distinct, reload-survivable web routes

**API** (ADR-014). A session is addressed by its own id and carries its
community as a property, so it is a top-level resource, not a community
sub-resource.

| Method | Route | Permission |
|---|---|---|
| GET | `/review-scope` | `reviewSession:create` |
| POST | `/review-sessions` | `reviewSession:create` |
| GET | `/review-sessions` | `reviewSession:read` |
| GET | `/review-sessions/:sessionId` | `reviewSession:read` |
| GET | `/review-sessions/:sessionId/elements/:code` | `reviewSession:perform` |
| PUT | `/review-sessions/:sessionId/entries/:elementId` | `reviewSession:perform` |
| POST | `/review-sessions/:sessionId/complete` | `reviewSession:complete` |
| DELETE | `/review-sessions/:sessionId` | `reviewSession:discard` |

Five new `Permission` members (`reviewSession:create|read|perform|complete|
discard`), granted identically to `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE`. `SYSTEM_ADMIN` gets **none** of them (its row is
unchanged); `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` stay `[]`.
`reviewSession:complete` is separate from `:perform` for the reason
`reviewTemplate:activate` is separate from `:update` — an irreversible
transition is not an ordinary edit.

`GET /review-scope` is a **separate top-level path on purpose**: Express matches
in declaration order (unlike React Router), so a nested `/review-sessions/scope`
would sit one careless reordering away from being swallowed by
`@Get(':sessionId')`. Sidestepping the trap beats commenting on it.

**One write endpoint for both outcomes**: `PUT .../entries/:elementId` takes a
Zod `discriminatedUnion` — `{ answers: [{questionId, value}] }` or
`{ observations: string }` — and full-replaces the entry. One idempotent write
path means the `answers XOR observations` invariant has exactly one place to
live, and "I answered it, then found the room sealed" is one call, not a
delete-then-create.

**Durability granularity**: proposal Approach 1 ("persisted as recorded, not
batched at the end") is satisfied at **element** granularity — one PUT per
element the moment the performer finishes it. That is the unit of the field
workflow and the unit the proposal itself names ("Each answered element is
durable the moment it is recorded"). Per-answer POSTs were rejected: N round
trips on a field connection, and a partially-answered element is not a
meaningful state.

**Web** — four routes, not one stateful route:

| Route | Page |
|---|---|
| `/review-sessions` | Entry point: resumable draft(s) + Start a session |
| `/review-sessions/new` | Open form, driven by `GET /review-scope` |
| `/review-sessions/:sessionId` | The walk: code entry, progress, complete, discard |
| `/review-sessions/:sessionId/elements/:code` | Answer form for one element |

**Rationale**: `label-printing` Decision 6 already rejected router-state passing
and hidden in-page modes for this codebase, on the grounds that neither survives
a reload or a shared URL — a technician's phone locking mid-walk is exactly that
failure. Each page keeps one `LoadState`, matching every shipped page. The two
non-admin roles get `ProtectedRoute allowedRoles={['MAINTENANCE_TECHNICIAN',
'COMMUNITY_REPRESENTATIVE']}` — the first non-`SYSTEM_ADMIN` routes in the app.
Entry point: `/` (`HealthPage`) is already reachable by every authenticated role
and already has the logout control, so the minimum viable landing is a
role-conditional link to `/review-sessions` there — no navigation component, no
layout refactor.

### Decision 11 — the frozen question set is fetched per element, in one round trip

**Choice**: `GET /review-sessions/:sessionId/elements/:code` returns
`{ element, questions, entry }` — element identity, the frozen snapshot, and
any existing entry. The answer page makes exactly **one** request.
`GET /review-sessions/:sessionId` returns entries and coverage counts, **not**
the question set.

**Alternatives**: fetch once per session and hold it in React state across
elements — rejected. It only works while the SPA keeps state, and Decision 10
deliberately chose reload-survivable routes: a direct link or a phone unlock
would arrive with an empty cache and need the fetch anyway, so the "once"
version is really "once, plus a fallback path that is only exercised on the
sad path" — the worst kind of code. There is no client cache layer in
`apps/web` (no react-query), and building one for this would be speculative per
ADR-006.

**Cost check, not hand-waving**: the payload is a handful of short strings, and
the session's snapshot rows are read by `templateId` through
`ReviewTemplateQuestion`'s existing `@@index([templateId])`. Staleness is
impossible by construction — the set is frozen.

## Data Flow

    OPEN
    GET /review-scope
      -> findActiveByUser(both ports) -> communityRepository.findById per id
      -> reviewTemplateRepository.findActiveByElementType(*)
    POST /review-sessions {communityId, templateId}
      -> communityScopeChecker.isAssignedTo -> false => 403 COMMUNITY_NOT_IN_SCOPE
      -> template still active? => else 404 ACTIVE_TEMPLATE_NOT_FOUND
      -> idGenerator.generate() -> repository.create(draft)
           -> P2002 on ReviewSession_open_draft_key => 409 OPEN_DRAFT_ALREADY_EXISTS

    WALK                                        (repeat per element)
    GET /review-sessions/:id/elements/:code
      -> SessionAccess.loadForActor  ---------> 404 REVIEW_SESSION_NOT_FOUND
      -> findReviewableByCode(session.communityId, session.elementType, code)
           -> null (unknown | foreign | wrong type | decommissioned | deleted)
                                       -------> 404 ELEMENT_NOT_FOUND  (one path)
      -> findFrozenWithSnapshot(session.templateId)  [frozen wording only]
    PUT /review-sessions/:id/entries/:elementId
      -> SessionAccess.loadForActor -> session.recordEntry(...)
           -> status != draft ------------------> 409 REVIEW_SESSION_NOT_EDITABLE
           -> ElementReviewEntry.reviewed | .unreviewed   (answers XOR observations)
      -> repository.upsertEntry(entry, answers)   [durable immediately]

    COMPLETE
    POST /review-sessions/:id/complete
      -> SessionAccess.loadForActor -> session.complete()
      -> active elements of (community, elementType) MINUS entries
           -> non-empty ------------------------> 409 UNREVIEWED_ELEMENTS_WITHOUT_REASON
      -> repository.complete(id)  [WHERE status = 'draft'; 0 rows => 409]

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `ReviewSession`, `ElementReviewEntry`, `QuestionAnswer`, `ReviewSessionStatus`, `AnswerValue`; `InspectableElement.deactivatedAt` |
| `apps/api/prisma/migrations/<ts>_add_inspectable_element_deactivated_at/migration.sql` | Create | One `ADD COLUMN` — no backfill (Decision 3) |
| `apps/api/prisma/migrations/<ts>_add_review_session/migration.sql` | Create | 3 tables, 2 enums, 6 hand-written FKs, partial unique draft index, `observations` CHECK |
| `apps/api/src/modules/review-session/domain/review-session.entity.ts` | Create | Aggregate root; `recordEntry`/`complete`/`discard` guard `status === 'draft'` |
| `.../domain/element-review-entry.entity.ts` | Create | `reviewed()` / `unreviewed()` factories — Decision 1 |
| `.../domain/question-answer.entity.ts` | Create | `questionId` + `AnswerValue` |
| `.../domain/{review-session-status,answer-value}.ts` | Create | Authoritative TS unions (Decision 9) |
| `.../domain/errors/*.ts` | Create | Not-found, not-editable, missing-observations, unreviewed-without-reason, open-draft-exists |
| `.../application/ports/review-session.repository.port.ts` | Create | No `findById`, no `updateById` (Decisions 4, 8) |
| `.../application/services/session-access.service.ts` | Create | The single session load path |
| `.../application/use-cases/*.use-case.ts` | Create | scope, open, list-own, read, resolve-code, upsert-entry, complete, discard |
| `.../application/use-cases/testing/in-memory-review-session.repository.ts` | Create | Fake, mirroring the shipped module shape |
| `.../infrastructure/persistence/{prisma-review-session.repository,review-session.mapper}.ts` | Create | Aggregate load/store; `P2002` → `OpenDraftAlreadyExistsError` |
| `.../presentation/review-session.controller.ts` + `dto/**` | Create | 8 routes, `@RequirePermission`, `mapMutationError` |
| `.../review-session.module.ts` | Create | Imports Community/InspectableElement/ReviewTemplate modules |
| `apps/api/src/shared/application/authorization/permission.ts` | Modify | 5 new `reviewSession:*` members |
| `apps/api/src/shared/application/authorization/community-scope.checker.port.ts` | Create | Layer 2 port |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | Two roles cease to be `[]`; `SYSTEM_ADMIN` untouched |
| `.../community/infrastructure/authorization/assignment-community-scope.checker.ts` | Create | Layer 2 adapter, fail-closed `switch` |
| `.../community/application/ports/community-{technician,representative}.repository.port.ts` | Modify | `findActiveByUser` (Decision 5) |
| `.../community/infrastructure/persistence/**` | Modify | Adapters + in-memory fakes for both |
| `.../review-template/application/ports/review-template.repository.port.ts` | Modify | `findActiveByElementType` |
| `.../inspectable-element/application/ports/inspectable-element.repository.port.ts` | Modify | `findReviewableByCode`; `updateById` gains `deactivatedAt` |
| `.../inspectable-element/domain/inspectable-element.entity.ts` | Modify | `deactivatedAt` + `isDeactivated` getter |
| `.../inspectable-element/{mapper,use-cases,dto,controller}` | Modify | `deactivated` end to end |
| `packages/validation/src/review-session/**` | Create | Open/entry (discriminated union)/answer schemas + enum parity |
| `packages/validation/src/inspectable-element/**` | Modify | `deactivated?: boolean` on the update schema |
| `apps/web/src/api/review-session.ts` | Create | `apiFetch` client |
| `apps/web/src/pages/ReviewSession{s,New,Detail,Element}Page.tsx` (+ tests) | Create | Decision 10's four pages |
| `apps/web/src/App.tsx` | Modify | First non-`SYSTEM_ADMIN` routes |
| `apps/web/src/pages/HealthPage.tsx` | Modify | Role-conditional entry link |
| `apps/web/src/pages/InspectableElementEditPage.tsx`, `CommunityElementsListPage.tsx` | Modify | Decommission control + state column |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real translations |
| `apps/api/test/review-session.e2e-spec.ts` | Create | Lifecycle, scope matrix, immutability |
| `docs/architecture/domain-model-inspections.md` | Modify | `CommunityMaintenanceAssignment` drift; `deactivatedAt`; `observations` |

## Interfaces / Contracts

```prisma
enum ReviewSessionStatus { draft completed }   // Decision 8 — no `signed`
enum AnswerValue { YES NO NOT_APPLICABLE }

model ReviewSession {
  id            String              @id @db.Uuid   // UUIDv7 from the app (ADR-009)
  communityId   String              @db.Uuid
  templateId    String              @db.Uuid       // the FROZEN version row — Decision 7
  performedById String              @db.Uuid
  status        ReviewSessionStatus
  startedAt     DateTime            @default(now())
  completedAt   DateTime?
  // NO deletedAt — ADR-010's stricter rule for review records
  @@index([communityId])
  @@index([performedById])
  // One open draft per (community, template, performer) is a HAND-WRITTEN
  // PARTIAL UNIQUE INDEX — `@@unique` has no WHERE clause, so Prisma cannot
  // express it and is blind to it (the checklist-management precedent):
  //   CREATE UNIQUE INDEX "ReviewSession_open_draft_key"
  //     ON "ReviewSession"("communityId","templateId","performedById")
  //     WHERE "status" = 'draft';
}

model ElementReviewEntry {
  id                   String   @id @db.Uuid
  reviewSessionId      String   @db.Uuid
  inspectableElementId String   @db.Uuid
  observations         String?  // NON-NULL iff unreviewed — Decision 1
  recordedAt           DateTime @default(now())
  @@unique([reviewSessionId, inspectableElementId])
  // Hand-written, Prisma-invisible backstop for the intra-row half only:
  //   ALTER TABLE "ElementReviewEntry" ADD CONSTRAINT
  //     "ElementReviewEntry_observations_not_blank"
  //     CHECK ("observations" IS NULL OR btrim("observations") <> '');
}

model QuestionAnswer {
  id                   String      @id @db.Uuid
  elementReviewEntryId String      @db.Uuid
  questionId           String      @db.Uuid  // provenance: ReviewTemplateQuestion.questionId
  answer               AnswerValue
  @@unique([elementReviewEntryId, questionId])
}
```

```ts
// application/ports/review-session.repository.port.ts
// Scope is a PROPERTY OF THE PORT, not a per-caller discipline check —
// verbatim the InspectableElementRepository.findByIdInCommunity precedent.
// There is deliberately NO findById(id), NO updateById and NO status setter
// (Decisions 4 and 8).
export interface ReviewSessionRepository {
  create(session: ReviewSession): Promise<void>;                       // P2002 => OpenDraftAlreadyExistsError
  findByIdForPerformer(id: string, performedById: string): Promise<ReviewSessionAggregate | null>;
  findDraftsByPerformer(performedById: string): Promise<ReviewSession[]>;
  upsertEntry(sessionId: string, entry: ElementReviewEntry, answers: QuestionAnswer[]): Promise<void>;
  complete(id: string, at: Date): Promise<boolean>;   // WHERE status='draft'; false => 409
  // Discard mechanism (resolved 2026-09-06, was unspecified): a HARD DELETE of
  // the ReviewSession row, WHERE status='draft' (false => 409, mirroring
  // complete()). The enum is closed to draft|completed (Decision 8) and there
  // is no deletedAt on any of the three tables, so soft-delete is not an
  // option here. ElementReviewEntry/QuestionAnswer FKs to ReviewSession must
  // declare ON DELETE CASCADE so a discarded draft's recorded entries/answers
  // are removed with it, not orphaned — add this explicitly to the
  // hand-written FK migration SQL alongside the other cross-module FKs.
  discardDraft(id: string): Promise<boolean>;         // WHERE status='draft'; false => 409
}

// shared/application/authorization/community-scope.checker.port.ts
// ADR-011 Decision 3's "separate, composable check layered on top", made real.
// Fail-closed: any role other than the two operational ones returns false.
export interface CommunityScopeChecker {
  isAssignedTo(userId: string, role: Role, communityId: string): Promise<boolean>;
}
export const COMMUNITY_SCOPE_CHECKER = Symbol('COMMUNITY_SCOPE_CHECKER');
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (api) | `ElementReviewEntry` invariant | `unreviewed('')`/whitespace throws; `reviewed()` leaves `observations === null`; the both-populated state is unconstructible |
| Unit (api) | Immutability | `recordEntry`/`complete`/`discard` on a `completed` aggregate each throw `ReviewSessionNotEditableError` |
| Unit (api) | `CommunityScopeChecker` | Table-driven over all 5 roles × {no row, deactivated row, active row}; every non-operational role is `false` |
| Unit (api) | Completion coverage | Active element with no entry ⇒ reject; decommissioned mid-walk ⇒ not required; entry with only `observations` ⇒ accepted |
| Integration (api) | Schema survival | `pg_indexes`/`pg_constraint`: 6 FKs (the two rooted at `ReviewSession` — `ElementReviewEntry`, `QuestionAnswer`'s parent chain — declare `ON DELETE CASCADE` for `discardDraft`), `ReviewSession_open_draft_key` partial unique, `observations` CHECK, no `deletedAt` column on the three tables |
| Integration (api) | Discard cascade | Discarding a draft with recorded entries/answers removes them too (no orphaned rows); discarding a non-draft returns 409 and deletes nothing |
| Integration (api) | Enum parity | Prisma enums == domain unions == Zod schemas (the shipped 3-way parity spec) |
| Integration (api) | Open-draft race | Two concurrent opens for the same (community, template, performer) ⇒ exactly one 201, one 409 |
| E2E (api) | Scope matrix | An authenticated, correctly-permissioned, **unassigned** user hits **every one** of the 8 routes — one test per route, no sampling (proposal risk 1) |
| E2E (api) | Code indistinguishability | Assert `status` **and** the whole response body are deep-equal for: unknown code, foreign-community code, wrong-element-type code, decommissioned code, soft-deleted code |
| E2E (api) | Frozen snapshot | Edit the live `ChecklistQuestion` pool after opening ⇒ the session's rendered wording is unchanged |
| E2E (api) | Immutability (permission gate) | After completing: PUT entry, POST complete, DELETE as `SYSTEM_ADMIN` — all rejected with 403 (proves the permission gate; `SYSTEM_ADMIN` holds no `reviewSession:*` permission at all, so this never reaches the domain guard) |
| E2E (api) | Immutability (domain guard) | Same three calls made **as the session's own performer** (who legitimately holds the permission) after completion — all rejected with 409 `REVIEW_SESSION_NOT_EDITABLE`. This is the case that actually exercises the domain-layer invariant; the `SYSTEM_ADMIN` row above alone would be a vacuous test (correction, 2026-09-06 — cross-check flagged the original single row as unable to prove the domain rule) |
| E2E (api) | Scope guards | No history route, no scheduling, no `signed` value in the DB enum, no export |
| Unit (web) | Pages | 4 pages × loading/error/empty; the code-entry error path renders one message for every rejection reason |
| Unit (web) | i18n | `locales.test.ts` parity across `en`/`es`/`ca` for the new keys |
| Browser | CLAUDE.md | Real dev server, seeded community/template/elements; login as **each** non-admin role; open → walk → skip with reason → pause → resume → complete; foreign code rejected; admin decommission round-trip |

## Migration / Rollout

Two forward migrations, applied with `prisma migrate deploy` (the
`review-template`/`label-printing` precedent — `migrate dev` would offer a reset
against the drifted local checksum, and this schema now carries a dozen
hand-written objects Prisma cannot see). Order matters: the
`InspectableElement.deactivatedAt` migration ships in PR ~1 and stands alone;
the review-session migration ships in PR ~3 and depends on nothing from it
except Decision 6's eligibility predicate.

No data migration and no backfill (Decision 3). Rollback is drop-the-tables plus
drop-the-column; recorded sessions die with the tables, which `git revert`
cannot undo — do not perform real reviews against this slice until it is
browser-verified. The authorization change is safe in the revert direction: both
roles return to `[]`.

## Open Questions

- [ ] **ADR-011 addendum** (Decision 4) — needs a real addendum file, not a
      design note. Deliberately **not** written here; needs user confirmation
      before authoring. It should also correct ADR-011's own reference to
      ADR-005's `CommunityMaintenanceAssignment` scoping model.
- [ ] `GET /review-sessions` returns the actor's **draft** sessions only. Listing
      one's own completed sessions is arguably FR-008 (history) — this design
      draws the line at drafts; confirm during `sdd-verify`'s scope-guard check.
- [ ] The completion rejection body lists the uncovered element codes so the UI
      can navigate to them. That is a within-scope disclosure (the actor is
      assigned to the community), but it is the one place the API volunteers
      element codes the user did not ask for — worth a second look in review.
