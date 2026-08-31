# Design: Inspectable Elements per Community

## Technical Approach

Mirror `apps/api/src/modules/maintenance-company/**` file by file under
`apps/api/src/modules/inspectable-element/**` (proposal, Approach). The slice
adds one aggregate root that carries a **required parent id** — and that single
extra field is what makes this design different from `maintenance-company`'s:
the two modules must read each other in **opposite directions** (element →
community for the parent-existence guard, community → element for the
delete-block guard), which is the same Nest DI cycle
`maintenance-company/design.md` Decision 4 already solved without
`forwardRef()`. Decision 4 below applies that solution, inverted.

Four invariants carry the slice, each with a deliberately different enforcement
mechanism depending on what can actually express it:

| Invariant | Where it can live | Mechanism |
|---|---|---|
| An element always belongs to a **live** community | Not the FK — it guards hard deletes this project never performs, and cannot see `deletedAt` | Application guard: `COMMUNITY_REPOSITORY.findById` (ADR-010 filter is free) in all 4 use cases (Decision 5) |
| An element is addressable **only** through its own community | Yes — a single scoped read | `findByIdInCommunity(communityId, elementId)` on the port; the parent id is part of the read, not a caller-discipline check (Decision 5) |
| A community with active elements cannot be soft-deleted | Not a constraint — cross-table + `deletedAt` predicate | Pure domain policy + a `NOT EXISTS` guard inside the community's own soft-delete `UPDATE` (Decision 6) |
| `ElementType` means the same thing in Postgres, the domain and Zod | Partly — the type system closes two of the three edges | Three compile-time gates, one runtime parity spec (Decision 1) |

Everything else is flat CRUD that clones the archived module.

## Architecture Decisions

### Decision 1: the `ElementType` three-way-declaration seam

The proposal settles that the TypeScript union is authoritative and the Postgres
enum is its persistence projection (choice 4). It does not settle *how* drift is
caught. Note the hard constraint: `packages/validation` cannot import from
`apps/api` (dependency direction is `apps/web`/`apps/api` → `@sf-manager/validation`),
so the Zod enum can never literally `import` the domain union.

**Where each declaration lives:**

```ts
// apps/api/src/modules/inspectable-element/domain/element-type.ts
import type { ElementType as ValidatedElementType } from '@sf-manager/validation';

// Authoritative domain union (ADR-008 / ADR-013 — no $Enums.ElementType).
// `satisfies` is the compile-time gate for the domain ⊆ Zod direction: adding
// a member here without adding it to elementTypeSchema fails the build.
// Precedent for the const-array + satisfies shape: MAINTENANCE_ROLES in
// packages/validation/src/users/create-user.schema.ts.
export const ELEMENT_TYPES = ['EXTINGUISHER'] as const satisfies readonly ValidatedElementType[];
export type ElementType = (typeof ELEMENT_TYPES)[number];
```

```prisma
// apps/api/prisma/schema.prisma — the projection, mirroring `Role`/`Locale`
enum ElementType { EXTINGUISHER }
```

```ts
// packages/validation/src/inspectable-element/inspectable-element.schema.ts
export const elementTypeSchema = z.enum(['EXTINGUISHER']);
export type ElementType = z.infer<typeof elementTypeSchema>;
```

**How each edge is closed — four gates, three of them free:**

| Edge | Gate | Fails the build when |
|---|---|---|
| Prisma ⇄ domain | `InspectableElementMapper`'s **direct assignment** `elementType: record.elementType` (`toDomain`) and `elementType: element.elementType` (`toPersistence`) — no cast, exactly as `CommunityMapper` does for `Locale` | Either side gains or loses a value |
| Zod → domain | `CreateInspectableElementRequest['elementType']` flows through the controller into the use-case input typed `ElementType` | Zod gains a value the domain lacks |
| domain → Zod | `as const satisfies readonly ValidatedElementType[]` above | The domain gains a value Zod lacks |
| domain → UI | `Record<ElementType, string>` in `apps/web/src/inspectable-element/element-type-labels.ts` (mirrors `locale-labels.ts`) | A new value ships with no i18n label |

| Option for the mapper | Tradeoff | Verdict |
|---|---|---|
| An **exhaustive `switch`** with a `default: never` arm | The task's default instinct, but it is gratuitous divergence: `CommunityMapper`/`UserMapper` translate `Locale`/`Role` by direct assignment because the value sets are *identical strings*, and structural assignability already fails the build in **both** directions. A switch adds a hand-maintained arm per value that can only ever be `case 'X': return 'X'` | **Rejected** |
| **Direct assignment**, no cast, no switch | Follows the two shipped mappers verbatim; the compile error appears at the assignment, which is where the drift actually is | **Chosen** |

Plus one runtime parity spec —
`inspectable-element/infrastructure/persistence/element-type-parity.integration.spec.ts`
(placed under `infrastructure/persistence/**` so it may import `@prisma/client`
without violating ADR-013's `no-restricted-imports` rule) asserting
`[...ELEMENT_TYPES].sort()` equals `Object.values($Enums.ElementType).sort()`
equals `[...elementTypeSchema.options].sort()`. This is the proposal's stated
mitigation ("a test asserts all three agree") and it is the only gate that
catches a *generated-client-out-of-date* mismatch, which the type system cannot
see.

### Decision 2: `name`, `location`, `description` and `serialNumber` are all plain fields — no Value Objects

Per ADR-006's addendum the call is re-derived per slice, not copied. The
codebase rule (`maintenance-company` Decision 3, `community` Decision 5) is: a
field becomes a Value Object when it carries **behaviour beyond validation**.
`PlainPassword` is still the only VO in the repo, and only for `toString()`
redaction.

| Field | Invariant | Behaviour beyond validation? | Verdict |
|---|---|---|---|
| `name` | non-empty, trimmed, **not unique** (settled) | None. Never parsed, compared or formatted | Plain `string` |
| `location` | non-empty, trimmed, **not unique** (settled) | None. Free text — "ground-floor corridor". A future structured location (floor/zone) would be an *entity or a composite*, not a string wrapper | Plain `string` |
| `description` | optional, trimmed-non-empty-if-present | None | `string \| null` |
| `serialNumber` | optional, **informational only** — not a lookup key, not unique, no format rule (settled) | This is the one field that *looks* like it wants a VO, and the settled decision is precisely what disqualifies it: a `SerialNumber` VO would exist to own a format/checksum rule the proposal explicitly refuses to add. Wrapping it now builds the scaffolding for a rule that does not exist | `string \| null` |

*Revisit trigger*: if `serialNumber` ever becomes a lookup key or gains a
manufacturer-format rule, it follows `taxId`'s path — a Zod `.refine()` first,
a VO only if it grows real behaviour (`manufacturer()`, formatted display).

The entity therefore performs **no validation in its constructor**, mirroring
`MaintenanceCompany`/`Community`/`User`; trimming and non-emptiness live in the
shared Zod schema (ADR-015).

### Decision 3: `installedAt` is a Postgres `DATE`, transported as an ISO `YYYY-MM-DD` string, and a future date is allowed

There is **no date-only precedent in this schema** — every existing temporal
column (`createdAt`, `updatedAt`, `deletedAt`, `deactivatedAt`, `expiresAt`) is
a `TIMESTAMP(3)`. All of them are *instants* the server writes. `installedAt` is
the first **calendar date a human types**, which is a different thing.

| Option | Tradeoff | Verdict |
|---|---|---|
| `DateTime` → `TIMESTAMP(3)`, wire format ISO-8601 instant | Mirrors the existing columns, but an admin who types `2026-03-15` in a UTC+2 browser can see `2026-03-14` rendered back after a round trip. A pure timezone-shift bug class, invisible in tests that run in UTC and reported by users months later | **Rejected** |
| `String` column holding `'YYYY-MM-DD'` | No timezone semantics at all, but throws away date arithmetic Postgres gives for free — and FR-009's overdue-check math (deferred, but the column outlives this slice) would have to cast it back | **Rejected** |
| `DateTime @db.Date` → Postgres `DATE`, wire format `'YYYY-MM-DD'` | Postgres physically cannot store a time component, so the drift is impossible at the storage layer rather than merely avoided by convention. Domain field stays a `Date`; both boundary conversions are pinned to UTC midnight in one place | **Chosen** |

Conversions live in two pure domain functions — not a VO (Decision 2), mirroring
the pure-function shape of `last-admin.policy.ts` /
`maintenance-company-deletion.policy.ts`:

```ts
// domain/installed-at.ts
export function parseInstalledAt(iso: string): Date { return new Date(`${iso}T00:00:00.000Z`); }
export function formatInstalledAt(value: Date): string { return value.toISOString().slice(0, 10); }
```

Zod validates the wire shape with `z.iso.date()` (Zod 4, already the version in
use — `z.email()` appears in `create-user.schema.ts`), so a malformed date is a
plain 400 before any use case runs.

**Future installation dates are allowed, deliberately.** A scheduled
installation is legitimately registered before the extinguisher is physically
mounted, and nothing in this slice *reads* `installedAt` for a compliance clock
(hydrostatic tracking is deferred). A rejection rule would enforce nothing while
blocking a valid workflow, and day-granularity "is it in the future" checks
against a server clock are exactly where off-by-one rejections come from.
Handoff: if `sdd-spec` rules otherwise, the delta is one `.refine()` on the
shared schema and one spec scenario — no structural change.

### Decision 4: the `community` ⇄ `inspectable-element` DI cycle, broken the Decision-4 way (no `forwardRef()`)

Two dependencies point in opposite directions:

- `inspectable-element → community` — the parent-existence guard needs
  `findById` (proposal choice 2: consume the **already-exported**
  `COMMUNITY_REPOSITORY` token).
- `community → inspectable-element` — the delete block needs an active-element
  count.

Registering both as module imports is a Nest DI cycle. This is structurally the
same problem `maintenance-company/design.md` Decision 4 solved, and its verdict
table applies unchanged (`forwardRef()` rejected on evidence: this repo has been
bitten by DI-bootstrap crashes; hoisting into `shared/` inverts the boundary).

| Option | Tradeoff | Verdict |
|---|---|---|
| `forwardRef()` on both modules | Encodes the cycle instead of removing it; already rejected once in this codebase on evidence | **Rejected** |
| Invert: `CommunityModule` imports `InspectableElementModule` and injects `INSPECTABLE_ELEMENT_REPOSITORY` (the literal mirror of `maintenance-company → users`), with `inspectable-element` owning a narrow `CommunityLookup` | Cycle-free and symmetric with the sibling slice, but contradicts the proposal's **settled** choice 2, and costs **two** new adapters: a `CommunityLookup` probe *and* nothing reused, because `COMMUNITY_REPOSITORY` is already exported and already applies ADR-010's filter | **Rejected** |
| `inspectable-element` imports `CommunityModule` (reuses the exported port, zero new read code); `community` owns a narrow, one-method counter port + its own ~12-line adapter | Honours settled choice 2, one new boundary crossing, **one** new adapter total, no `forwardRef`, no `shared/` inversion | **Chosen** |

```ts
// modules/community/application/ports/inspectable-element-counter.port.ts
// Owned by `community`, NOT imported from the inspectable-element module —
// this is what keeps the Nest module graph acyclic without forwardRef().
// Exact analogue of users/application/ports/maintenance-company-lookup.port.ts.
export interface InspectableElementCounter {
  // Active = not soft-deleted (ADR-010). Soft-deleted elements do NOT block
  // a community's deletion.
  countActiveByCommunity(communityId: string): Promise<number>;
}
export const INSPECTABLE_ELEMENT_COUNTER = Symbol('INSPECTABLE_ELEMENT_COUNTER');
```

Adapter `PrismaInspectableElementCounter` lives in
`community/infrastructure/persistence/` and is a single
`prisma.inspectableElement.count({ where: { communityId, deletedAt: null } })`.
`PrismaModule` is `@Global()`, so it resolves `PrismaService` with no module
import at all. Two adapters touching one table is the same accepted price
Decision 4 paid for `MaintenanceCompanyLookup`, and it is a read-only count, not
shared ownership.

**Deviation from the task brief, stated so it is not mistaken for drift**: the
brief proposed `countActiveByCommunity` **on `InspectableElementRepositoryPort`**.
That placement is what creates the cycle. The method is therefore *not* added to
`InspectableElementRepositoryPort` at all — no in-module caller needs it, and
adding unreachable port surface is the same dead-weight the sibling design
rejected when it dropped `TRANSACTION_CONFLICT`.

### Decision 5: the parent-existence guard and the scoped read

All four use cases resolve the community first:

```
communityRepository.findById(communityId)  →  null ⇒ CommunityNotFoundError (404 COMMUNITY_NOT_FOUND)
```

`findById` already carries ADR-010's `deletedAt: null` filter, so *"soft-deleted
community behaves as non-existent"* is satisfied with no extra predicate — the
same "for free" property `countActiveByMaintenanceCompany` relies on.

For update / soft-delete the element read is **community-scoped by
construction**:

```ts
findByIdInCommunity(communityId: string, elementId: string): Promise<InspectableElement | null>
```

| Option | Tradeoff | Verdict |
|---|---|---|
| `findById(elementId)` then compare `element.communityId !== communityId` in each use case | Works, but the success criterion *"the parent id in the path is enforced, not decorative"* becomes a per-caller discipline rule that a fifth use case can silently forget | **Rejected** |
| `findByIdInCommunity(communityId, elementId)` — one query, `where: { id, communityId, deletedAt: null }` | The scope is a property of the port. Wrong-community, unknown-id and soft-deleted all collapse to `null` ⇒ one indistinguishable 404, which is exactly what the criterion asks for | **Chosen** |

Writes stay keyed by `elementId` alone (`updateById`, `softDeleteById`), mirroring
`maintenance-company`'s findById→updateById flow: the scoped read is the
enforcement point, and `communityId` is immutable (never in the update changes),
so no write can escape the scope its read established.

**Ordering is fixed**: community check first, element check second. A request
against an unknown community *and* an unknown element deterministically returns
`COMMUNITY_NOT_FOUND`, never a coin flip.

### Decision 6: the community delete guard — mirror the **final** shipped shape (atomic), not the superseded check-then-act

`SoftDeleteMaintenanceCompanyUseCase` was read, not assumed. Its shape is
**not** the simple count-then-block the proposal's risk table describes; that was
PR 7. Phase 8 replaced the enforcement with an atomic
`UPDATE … WHERE … AND NOT EXISTS (…)` returning `boolean`, precisely because
check-then-act across two repositories was a documented TOCTOU. Repeating the
superseded shape here would knowingly re-ship a bug this codebase already paid to
fix.

| Option | Tradeoff | Verdict |
|---|---|---|
| Count → `assert` → `softDeleteById(): Promise<void>` (the PR7 shape the proposal's risk row describes) | Smallest diff, but a concurrent element creation between the count and the write leaves an active element under a soft-deleted community — an orphan the elements list can no longer reach, since the community is gone from `GET /communities` | **Rejected** |
| A cross-repository transaction / `UnitOfWork` | The seam does not exist, and `maintenance-company` Decision 6 already refused to invent it for one invariant | **Rejected** |
| `CommunityRepository.softDeleteById` becomes atomic and returns `boolean`, exactly as `MaintenanceCompanyRepository.softDeleteById` does | The invariant check and the write are one Postgres statement. Cost: the port signature, the Prisma adapter, and the in-memory fake — three mechanical edits inside `community`, on top of the one guard the proposal already sanctions | **Chosen** |

```sql
UPDATE "Community"
SET "deletedAt" = now()
WHERE "id" = ${id}::uuid
  AND "deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "InspectableElement"
    WHERE "communityId" = ${id}::uuid AND "deletedAt" IS NULL
  )
```

Cross-module table reference inside `community`'s infrastructure is precedented
verbatim: `PrismaMaintenanceCompanyRepository.softDeleteById` already raw-queries
`"User"` the same way.

Supporting pieces, each a one-for-one mirror:

- `community/domain/community-deletion.policy.ts` →
  `assertNoActiveElementsAttached(count)` — pure, no ports, no I/O, mirroring
  `maintenance-company-deletion.policy.ts`.
- `community/domain/errors/community-has-active-elements.error.ts` — carries
  `activeElementCount` so the 409 message says *how many* elements must be
  removed first, mirroring `MaintenanceCompanyHasActiveUsersError`.
- The counter read is demoted to fast path + accurate message; the `UPDATE` is
  authoritative. On `false`, the use case re-checks with `findById` as the sole
  existence oracle (404 if it vanished, otherwise
  `CommunityHasActiveElementsError`) — the exact re-check discipline PR8's
  review established.
- **The representative-deactivation cascade now runs only when the delete
  actually happened** (`wasDeleted === true`). Today it runs unconditionally
  after a `void` soft-delete; gating it is strictly more correct — cascading
  after a refused delete would be a bug.

### Decision 7: error mapping — a new `mapMutationError` branch, and a coded **404**

`CommunityController.mapMutationError` was read: it is two lines
(`CommunityNotFoundError` → 404, else rethrow). It is **not** generic enough to
pick up the new error — it needs one new branch:

```ts
if (error instanceof CommunityHasActiveElementsError) {
  return buildCodedError(HttpStatus.CONFLICT, error.message, 'COMMUNITY_HAS_ACTIVE_ELEMENTS');
}
```

`CommunityErrorCode` gains `'COMMUNITY_HAS_ACTIVE_ELEMENTS'`. Because
`apps/web/src/community/error-messages.ts` types its map as
`Record<CommunityErrorCode, string>`, adding the member to the mirrored web
union **forces** the i18n key — the web side cannot silently forget it. And
because `CommunitiesListPage.tsx` already renders `actionErrorKey` from
`mapApiErrorToMessageKey`, the new 409 renders a real localized message with
**zero page changes**.

`InspectableElementErrorCode = 'COMMUNITY_NOT_FOUND' | 'INSPECTABLE_ELEMENT_NOT_FOUND'`.
Both are **404s on the same call**, which is exactly the coded-error
convention's earning test (*"only a status with more than one reachable cause on
the same call gets a code"*) — without codes, the edit page cannot tell "this
community is gone" from "this element is gone", and those need different copy.

This requires widening `buildCodedError`'s `CodedErrorStatus` (today
`BAD_REQUEST | CONFLICT`) with `NOT_FOUND: 'Not Found'` — two additive lines,
no behaviour change for existing callers, already guarded by
`coded-error.spec.ts`. **Reported as a finding** (the proposal fences
`coded-error.ts` as used-as-is).

### Decision 8: routes — nested on both sides, same segment, and the ordering rules

**API** — `@Controller('communities/:communityId/inspectable-elements')`:

| Method | Path | Permission | Result |
|---|---|---|---|
| `POST` | `/communities/:communityId/inspectable-elements` | `inspectableElement:create` | 201 · 404 `COMMUNITY_NOT_FOUND` |
| `GET` | `/communities/:communityId/inspectable-elements` | `inspectableElement:read` | 200 (that community's active elements only) · 404 `COMMUNITY_NOT_FOUND` |
| `PATCH` | `.../inspectable-elements/:elementId` | `inspectableElement:update` | 200 · 404 `COMMUNITY_NOT_FOUND` \| `INSPECTABLE_ELEMENT_NOT_FOUND` |
| `DELETE` | `.../inspectable-elements/:elementId` | `inspectableElement:delete` | 204 · 404 (same two codes) |

Four permissions, not one, mirroring `community:*` / `maintenanceCompany:*`
granularity so the deferred `MANAGER` slice can grant read without delete. All
four go to the `SYSTEM_ADMIN` row only; the other four rows stay `[]`.

*Ordering, verified not assumed*: this controller has **no static sub-path**, so
there is no intra-controller static/dynamic contest. Across controllers,
`CommunityController` declares no `@Get(':id')` at all, and its
`@Delete(':id')` / `@Patch(':id')` are depth-2 while every element route is
depth-4 or depth-5 — Express cannot confuse them. The literal `inspectable-elements`
segment also differs from `representatives` / `technicians` at position 3.
Registration order in `app.module.ts` is therefore irrelevant here; the comment
in `inspectable-element.controller.ts` records exactly that so a future reader
does not "fix" a non-problem.

**Web routes use the same `inspectable-elements` segment, not a shorter
`elements`.**

| Option | Tradeoff | Verdict |
|---|---|---|
| `/communities/:communityId/elements/...` | Shorter, and closer to FR-006's sketched `/elements/{code}` | **Rejected** — every existing web route mirrors its API path segment verbatim (`/users`, `/communities`, `/maintenance-companies`). Forking here creates two names for one concept *and* pre-empts the `/elements` namespace with a *different* meaning (a community-scoped list, not a global code lookup), which is precisely the inconsistency Open Question 3 exists to prevent |
| `/communities/:communityId/inspectable-elements/...` | Verbose; verbosity is not a cost worth a naming fork | **Chosen** |

Three routes, all `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`:

```
/communities/:communityId/inspectable-elements               → CommunityElementsListPage
/communities/:communityId/inspectable-elements/new           → InspectableElementCreatePage
/communities/:communityId/inspectable-elements/:elementId/edit → InspectableElementEditPage
```

*React Router ordering note* (written into `App.tsx` in the same comment style
the existing `/communities/new` and `/maintenance-companies/new` blocks use):
the static `new` segment ranks above a dynamic segment regardless of declaration
order, and here the two are not even the same depth — `.../new` is 4 segments
while `.../:elementId/edit` is 5, so no URL can match both. The existing
`/communities/:id` (depth 2) and `/communities/:id/edit` (depth 3) are likewise
unreachable from these. The element routes use `:communityId`/`:elementId`
rather than the existing `:id`, matching the API path params exactly; params are
scoped per matched route, so mixing conventions across route objects is
harmless.

Params flow via `useParams<{ communityId: string; elementId: string }>()`.

### Decision 9: the elements list is a distinct route — confirmed

The proposal proposed it; the codebase confirms it. `CommunityDetailPage` already
renders two `AssignmentSection`s driving eight endpoints; elements are the
highest-cardinality entity in the system (dozens to hundreds per community).
Embedding would mean either paginating inside a detail page that has no
pagination concept, or rendering hundreds of rows under two assignment widgets.
A distinct route keeps `CommunityDetailPage`'s diff to **one `<Link>`** — its
only sanctioned change — and lets `CommunityElementsListPage` clone
`MaintenanceCompaniesListPage.tsx` verbatim.

Naming: the list page is `CommunityElementsListPage` (community-scoped view) and
the forms are `InspectableElement{Create,Edit}Page` (element-scoped) — the names
encode the scope difference rather than being inconsistent by accident.

The edit page inlines its list-and-select (`listInspectableElements(communityId)`
then `.find(e => e.id === elementId)`) rather than extracting a hook, mirroring
`MaintenanceCompanyEditPage.tsx`'s single-caller precedent — `useCommunity` was
extracted only because *two* pages needed the identical guardrail. Load states
are the same four: `loading | loaded | not-found | error`.

## Where the settled policies live in code

| Policy (already settled) | Location |
|---|---|
| Element belongs to a live community | `COMMUNITY_REPOSITORY.findById` in all 4 use cases → `CommunityNotFoundError` → **404 `COMMUNITY_NOT_FOUND`** |
| Wrong-community / unknown / soft-deleted element are indistinguishable | **No branching code.** `findByIdInCommunity(communityId, elementId)` returns `null` for all three → **404 `INSPECTABLE_ELEMENT_NOT_FOUND`** |
| Soft-deleted elements invisible everywhere | **No new code.** `PrismaInspectableElementRepository extends SoftDeletableRepository`; `withDefaultFilter` covers both reads |
| No uniqueness on `name` / `location` | Enforced by **absence** — no index, no read-check. Locked in by an e2e creating two identical elements in one community |
| `serialNumber` informational only | Enforced by absence — no unique index, no `findBySerialNumber` on the port |
| Community delete blocked by active elements | `community/domain/community-deletion.policy.ts` + the `NOT EXISTS` guard in `PrismaCommunityRepository.softDeleteById` → **409 `COMMUNITY_HAS_ACTIVE_ELEMENTS`** (Decision 6) |
| Soft-deleted elements do not block community deletion | **No new code.** `deletedAt IS NULL` in both the counter's `where` and the `NOT EXISTS` subquery |
| No cascade of community delete to its elements | Enforced by absence — `SoftDeleteCommunityUseCase` never touches the element repository beyond the count (settled: block-only) |
| Roles stay inert | `role-permission.checker.ts` gains entries on the `SYSTEM_ADMIN` row **only**; the four other rows stay `[]`, asserted by e2e. `PermissionChecker.can`'s signature is untouched |
| `elementType` never rendered raw | `Record<ElementType, string>` label map (`element-type-labels.ts`) — a missing entry is a compile error |

## Data Flow — `POST /communities/:communityId/inspectable-elements`

    AuthenticatedGuard → PermissionsGuard('inspectableElement:create') → Controller
         │ ZodValidationPipe(createInspectableElementSchema)
         │   └ name/location/description/serialNumber trimmed; installedAt is
         │     a strict 'YYYY-MM-DD' (z.iso.date()) — malformed ⇒ plain 400
         ▼
    CreateInspectableElementUseCase
         │ 1. communityRepository.findById(communityId)   ← ADR-010 filter free
         │      └ null ⇒ CommunityNotFoundError
         │              → 404 { code: COMMUNITY_NOT_FOUND }
         │              ✗ STOP — no element row is created
         │ 2. idGenerator.generate()                      → UUIDv7 (ADR-009)
         │ 3. new InspectableElement({ ..., installedAt: parseInstalledAt(iso),
         │                             description: input.description ?? null,
         │                             serialNumber: input.serialNumber ?? null,
         │                             deletedAt: null })
         ▼ 4. elementRepository.create(element)   ← plain insert, no read-check:
             │                                     nothing about this entity is unique
             └ ok → 201
         ▼
    InspectableElementResponseDto
      { id, communityId, elementType, name, description, location,
        serialNumber, installedAt: formatInstalledAt(...) }
      (deletedAt is never returned — mirrors every sibling response DTO)

## Data Flow — `DELETE /communities/:id` (the new block guard)

Deliberately the mirror image of `DELETE /maintenance-companies/:id`: same
lookup-then-count shape, same atomic write, and it now ends in a refusal where it
previously always succeeded.

    AuthenticatedGuard → PermissionsGuard('community:delete') → CommunityController
         │ SoftDeleteCommunityUseCase
         ▼ 1. communityRepository.findById(id)   → 404 CommunityNotFoundError
         │                                         (missing OR already deleted)
         ▼ 2. elementCounter.countActiveByCommunity(id)   [community-owned port,
         │      └ where { communityId, deletedAt: null }   Decision 4]
         │         ⇒ soft-deleted elements are NOT counted
         ▼ 3. assertNoActiveElementsAttached(count)       [pure domain policy]
             ├ count > 0 → CommunityHasActiveElementsError(count)
             │             → 409 { code: COMMUNITY_HAS_ACTIVE_ELEMENTS }
             │             ✗ STOP — deletedAt stays null, no element is touched,
             │                      and the representative cascade never runs
             └ count == 0 ↓
         ▼ 4. communityRepository.softDeleteById(id)  → boolean  [ATOMIC:
             │    UPDATE … AND NOT EXISTS(active element) — Decision 6]
             ├ false → re-check: findById(id) null ⇒ 404
             │         else ⇒ CommunityHasActiveElementsError (concurrent create)
             └ true  ↓
         ▼ 5. existing representative-deactivation cascade, UNCHANGED
             (now gated on step 4 having actually written) → 204

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `enum ElementType`; `InspectableElement` model with `@@index([communityId])`; comment block flagging the Prisma-invisible FK |
| `apps/api/prisma/migrations/<ts>_add_inspectable_element/migration.sql` | Create | `CREATE TYPE` + `CREATE TABLE` + Prisma-visible index + **hand-written FK** to `Community(id)` `ON DELETE RESTRICT` |
| `.../inspectable-element/domain/element-type.ts` | Create | `ELEMENT_TYPES` + `ElementType` (Decision 1) |
| `.../inspectable-element/domain/inspectable-element.entity.ts` | Create | Hand-written, zero Prisma (ADR-013); plain fields (Decision 2); no constructor validation |
| `.../inspectable-element/domain/installed-at.ts` | Create | `parseInstalledAt` / `formatInstalledAt` (Decision 3) |
| `.../inspectable-element/domain/errors/inspectable-element-not-found.error.ts` | Create | Mirrors `MaintenanceCompanyNotFoundError` |
| `.../inspectable-element/application/ports/inspectable-element.repository.port.ts` | Create | `Symbol` token; **no** `transactional()`, **no** `countActiveByCommunity` (Decision 4) |
| `.../inspectable-element/application/use-cases/**` | Create | create / list-by-community / update / soft-delete, each with the parent guard |
| `.../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository.ts` | Create | Fake with scoping parity — `findByIdInCommunity` must reproduce the community filter |
| `.../inspectable-element/infrastructure/persistence/**` | Create | Adapter (`extends SoftDeletableRepository`) + mapper + `element-type-parity.integration.spec.ts` + migration guard spec |
| `.../inspectable-element/presentation/**` | Create | Controller, DTOs, `inspectable-element-error-code.ts` (2 values) |
| `.../inspectable-element/inspectable-element.module.ts` | Create | Imports `CommunityModule` for `COMMUNITY_REPOSITORY` (Decision 4) |
| `apps/api/src/app.module.ts` | Modify | Register `InspectableElementModule` |
| `apps/api/src/shared/presentation/http/coded-error.ts` | **Modify (reported finding)** | Widen `CodedErrorStatus` with `NOT_FOUND` (Decision 7) |
| `.../community/application/ports/inspectable-element-counter.port.ts` | Create | `countActiveByCommunity` + `INSPECTABLE_ELEMENT_COUNTER` token (Decision 4) |
| `.../community/infrastructure/persistence/prisma-inspectable-element-counter.repository.ts` | Create | ~12-line count probe; `PrismaService` via `@Global()` `PrismaModule` |
| `.../community/application/ports/community.repository.port.ts` | Modify | `softDeleteById(): Promise<boolean>` + doc comment on the atomic guarantee |
| `.../community/infrastructure/persistence/prisma-community.repository.ts` | Modify | `softDeleteById` becomes the atomic `$executeRaw` with `NOT EXISTS` (Decision 6) |
| `.../community/application/use-cases/testing/in-memory-community.repository.ts` | Modify | Fake reproduces the boolean contract |
| `.../community/domain/community-deletion.policy.ts` | Create | `assertNoActiveElementsAttached` — pure |
| `.../community/domain/errors/community-has-active-elements.error.ts` | Create | Carries `activeElementCount` |
| `.../community/application/use-cases/soft-delete-community.use-case.ts` | Modify | Guard + re-check; cascade gated on `wasDeleted` |
| `.../community/presentation/community.controller.ts` | Modify | One new `mapMutationError` branch + `@ApiConflictResponse` on DELETE |
| `.../community/presentation/community-error-code.ts` | Modify | `+ COMMUNITY_HAS_ACTIVE_ELEMENTS` |
| `.../community/community.module.ts` | Modify | Bind `INSPECTABLE_ELEMENT_COUNTER`. **Imports nothing new** |
| `apps/api/src/shared/application/authorization/permission.ts` | Modify | `inspectableElement:create\|read\|update\|delete` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `SYSTEM_ADMIN` row only; other four stay `[]` |
| `packages/validation/src/inspectable-element/inspectable-element.schema.ts` + `src/index.ts` | Create/Modify | `elementTypeSchema`, create/update schemas |
| `apps/web/src/api/inspectable-element.ts` | Create | Typed calls + mirrored `InspectableElementErrorCode` |
| `apps/web/src/api/community.ts` | Modify | Mirrored `CommunityErrorCode` gains the new value |
| `apps/web/src/community/error-messages.ts` | Modify | New key — **forced** by `Record<CommunityErrorCode, string>` |
| `apps/web/src/inspectable-element/{error-messages,element-type-labels}.ts` | Create | `status`/`code`-only map; `Record<ElementType, string>` label map |
| `apps/web/src/pages/CommunityElementsListPage.tsx` | Create | Clones `MaintenanceCompaniesListPage.tsx` |
| `apps/web/src/pages/InspectableElement{Create,Edit}Page.tsx` | Create | Clone the `MaintenanceCompany{Create,Edit}Page` siblings |
| `apps/web/src/pages/CommunityDetailPage.tsx` | Modify | **One `<Link>`** to the community's elements |
| `apps/web/src/App.tsx` | Modify | 3 role-gated nested routes + ordering comments (Decision 8) |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `inspectableElement.*` + `community.error.hasActiveElements` |
| `apps/api/test/inspectable-element.e2e-spec.ts` | Create | Full lifecycle + auth matrix |
| `apps/api/test/community.e2e-spec.ts` | Modify | Delete-block scenarios |

## Interfaces

```ts
// modules/inspectable-element/application/ports/inspectable-element.repository.port.ts
export interface InspectableElementRepository {
  create(element: InspectableElement): Promise<void>;

  // Community-scoped by construction (Decision 5): wrong community, unknown
  // id and soft-deleted all resolve to null — one indistinguishable 404.
  findByIdInCommunity(communityId: string, elementId: string): Promise<InspectableElement | null>;

  // Default deletedAt: null filter (ADR-010).
  findAllByCommunity(communityId: string): Promise<InspectableElement[]>;

  // communityId and elementType are NOT updatable — an element does not move
  // between communities and does not change type in this slice.
  // `null` explicitly clears an optional field; `undefined` leaves it alone.
  updateById(
    elementId: string,
    changes: {
      name?: string;
      description?: string | null;
      location?: string;
      serialNumber?: string | null;
      installedAt?: Date;
    },
  ): Promise<void>;

  // Sets deletedAt (ADR-010). Plain void — unlike CommunityRepository, no
  // cross-table invariant blocks this write, so there is nothing to make
  // atomic (contrast Decision 6).
  softDeleteById(elementId: string): Promise<void>;

  // NO countActiveByCommunity: it would force CommunityModule to import this
  // module and close a DI cycle (Decision 4). It lives on community's own
  // InspectableElementCounter port instead.
}
export const INSPECTABLE_ELEMENT_REPOSITORY = Symbol('INSPECTABLE_ELEMENT_REPOSITORY');
```

```ts
// modules/community/application/ports/community.repository.port.ts (changed member)
// Now mirrors MaintenanceCompanyRepository.softDeleteById: returns true iff
// this call actually flipped deletedAt (row existed, was not already deleted,
// AND had no active InspectableElement attached at WRITE time). The atomic
// UPDATE is the authoritative enforcement; the use case's count read is only a
// fast path and an accurate error message (Decision 6).
softDeleteById(id: string): Promise<boolean>;
```

```ts
// packages/validation/src/inspectable-element/inspectable-element.schema.ts
export const elementTypeSchema = z.enum(['EXTINGUISHER']); // ADR-008
export type ElementType = z.infer<typeof elementTypeSchema>;

export const createInspectableElementSchema = z.object({
  elementType: elementTypeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1).optional(),
  installedAt: z.iso.date(), // 'YYYY-MM-DD' (Decision 3)
});

// `.nullable()` on the two optional fields is the ONLY way to clear a
// mistyped serialNumber or an obsolete description; without it the field is
// write-once forever. Explicit null ⇒ clear, absent ⇒ leave alone.
export const updateInspectableElementSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  location: z.string().trim().min(1).optional(),
  serialNumber: z.string().trim().min(1).nullable().optional(),
  installedAt: z.iso.date().optional(),
});
```

```sql
-- migrations/<ts>_add_inspectable_element/migration.sql (hand-edited)
CREATE TYPE "ElementType" AS ENUM ('EXTINGUISHER');

CREATE TABLE "InspectableElement" (
    "id"           UUID NOT NULL,
    "communityId"  UUID NOT NULL,
    "elementType"  "ElementType" NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "location"     TEXT NOT NULL,
    "installedAt"  DATE NOT NULL,          -- Decision 3, not TIMESTAMP(3)
    "serialNumber" TEXT,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "InspectableElement_pkey" PRIMARY KEY ("id")
);

-- Prisma-VISIBLE (@@index in schema.prisma). Postgres does not auto-index FK
-- columns, and every list query plus the delete guard's NOT EXISTS filters on
-- exactly this column.
CREATE INDEX "InspectableElement_communityId_idx" ON "InspectableElement"("communityId");

-- Hand-edited: schema.prisma has no `@relation` here (ADR-013), so this FK is
-- INVISIBLE to Prisma's migration diffing. ON DELETE RESTRICT is correct and
-- never fires — Community rows are never hard-deleted (ADR-010). It matches
-- the invariant rather than enforcing it, which is exactly why the
-- has-active-elements rule needs Decision 6, not this FK.
--
-- WARNING (concrete, previously observed): `prisma migrate dev --create-only`
-- emitted DropForeignKey statements for every @relation-less FK when the
-- maintenance-company migration was generated. There are now FIVE such FKs
-- (CommunityRepresentative x2, CommunityTechnician x2, User_maintenanceCompanyId).
-- DELETE any such statements from the generated file; the pg_constraint
-- integration guard is the backstop.
ALTER TABLE "InspectableElement" ADD CONSTRAINT "InspectableElement_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (domain) | `assertNoActiveElementsAttached` (0 / 1 / n); `parseInstalledAt`/`formatInstalledAt` round-trip incl. a DST-boundary date and a UTC-offset-sensitive one; entity holds values verbatim with no validation | Pure, table-driven, mirroring `maintenance-company-deletion.policy.spec.ts` |
| Unit (schema) | `elementTypeSchema` rejects unknown values; trims; `description`/`serialNumber` optional **and** explicitly nullable on update; `installedAt` rejects `'2026-3-1'`, `'not-a-date'`, `'2026-02-30'`; a future date is **accepted** | `packages/validation` tests |
| Unit (use case) | Parent guard fires before any write (assert `create` **never called**); community check precedes element check; `findByIdInCommunity` with a foreign `communityId` yields 404; update never mutates `communityId`/`elementType`; **community delete blocked before `softDeleteById` is called**; cascade **not** run when `softDeleteById` returns `false` | Hermetic, in-memory fakes; the element fake must reproduce the community scoping |
| Integration | The hand-written FK is in `pg_constraint` with `ON DELETE RESTRICT`; the `communityId` index is in `pg_indexes`; the 5 pre-existing FKs survive; `installedAt` column type is `date`; **three-way `ElementType` parity** (`ELEMENT_TYPES` / `$Enums.ElementType` / `elementTypeSchema.options`); atomic `softDeleteById` returns `false` with an active element present | Real Postgres, mirroring `maintenance-company-migration.integration.spec.ts` |
| E2E | Full lifecycle; element under A never listed under B; create under unknown/soft-deleted community ⇒ 404 `COMMUNITY_NOT_FOUND` **and no row written**; PATCH/DELETE cross-community ⇒ 404 `INSPECTABLE_ELEMENT_NOT_FOUND`; two identical name+location accepted; duplicate/absent `serialNumber` accepted; soft-deleted element absent from list; **community delete blocked ⇒ 409 `COMMUNITY_HAS_ACTIVE_ELEMENTS`, `deletedAt` still null, elements untouched**; delete succeeds with only soft-deleted elements; 401/403 on all 4 routes; the four non-admin rows still `[]`; `body.code` asserted per cause | `apps/api/test/inspectable-element.e2e-spec.ts` + community e2e additions |
| Component (web) | List loading/empty/error/rows; create + edit forms; `not-found` on an unknown `elementId`; element type rendered via the label map (**assert the raw string `EXTINGUISHER` is absent from the DOM**); confirmed delete; `error-messages.ts` differential test proving `.message` is never read; locale key-set parity | Vitest + RTL, mirroring `MaintenanceCompan*Page.test.tsx`; `locales.test.ts` extends to `inspectableElement.*` |
| Browser | Every UI success criterion, per CLAUDE.md "Verifying UI Changes" | `npm run dev` + `claude-in-chrome`; explicitly incl. the blocked-community-delete message and the date field round-tripping the same day in a non-UTC browser |

## Migration / Rollout

One additive migration: a new enum type, a new table, one Prisma-visible index,
one hand-written FK. No existing table is reshaped, no data is backfilled, and
nothing is dropped. The only non-additive element of the whole slice is
`SoftDeleteCommunityUseCase`'s new refusal path — a genuine behaviour change
(today community soft-delete is unconditional).

Rollback = revert the branch and drop the FK, the table and the enum type.
Elements registered during the slice's life are lost with the table; nothing
else references them (no review-side entity exists yet).

If the chain is split across PRs, the migration PR is the only one carrying
schema state, and the `coded-error.ts` widening (Decision 7) should ride with the
API presentation PR that first needs a coded 404 — it reverts independently and
carries no schema state.

## Open Questions

- [x] **Open Question 3 — URL segment naming.** Resolved as *no conflict, and
      no fork*: this slice uses `inspectable-elements` on **both** the API and
      the web, so there is exactly one name for the concept. FR-006's
      `/elements/{code}` is a globally-unique, inherently un-nested lookup and
      will therefore add a flat route regardless of what this slice does.
      Recommendation for FR-006 (noted, not built): name it
      `/inspectable-elements/by-code/{code}` so the resource name stays single;
      if printed-label character count argues for the shorter `/e/{code}` or
      `/elements/{code}`, treat it as a deliberate public short alias and say so
      in that slice's design rather than renaming this one.
- [ ] Confirm at apply time that `prisma migrate dev --create-only` does not
      emit `DropForeignKey` for any of the **five** existing `@relation`-less
      FKs; delete any it emits. The `pg_constraint` integration test is the
      guard either way — this exact incident already happened once.
- [ ] Confirm at apply time that `$Enums` is exported at runtime (not
      type-only) by the installed `prisma-client-js` version. If it is not, the
      parity spec reads the top-level generated `ElementType` const instead; the
      three compile-time gates (Decision 1) are unaffected either way.
- [ ] **`sdd-spec` owns the future-`installedAt` product rule.** Designed as
      *allowed* (Decision 3). The stricter answer costs one `.refine()` on the
      shared schema and one spec scenario — no structural change.
- [ ] **`sdd-spec` owns whether `PATCH` may clear `description`/`serialNumber`.**
      Designed as *yes, via explicit `null`* because otherwise a mistyped serial
      number is unremovable. If spec says no, drop `.nullable()` from both
      fields and `| null` from `updateById`'s `changes`.

## Findings reported to the proposal

1. **`shared/presentation/http/coded-error.ts` cannot stay untouched.** Its
   `CodedErrorStatus` is a closed `BAD_REQUEST | CONFLICT` union; the two earned
   404 codes require widening it with `NOT_FOUND`. Two additive lines, zero
   behaviour change, already covered by `coded-error.spec.ts`. Reported per the
   proposal's own instruction (Decision 7).
2. **The proposal's Risks row describing `maintenance-company`'s delete guard is
   out of date.** It says the concurrent-create race is *"documented as an
   accepted anomaly there too"* — that was PR 7. Phase 8 **closed** it with an
   atomic `UPDATE … NOT EXISTS`. This design mirrors the shipped final shape, so
   `CommunityRepository.softDeleteById` changes from `Promise<void>` to
   `Promise<boolean>` and `PrismaCommunityRepository` gains raw SQL — three
   mechanical edits inside `community` beyond the single guard the proposal
   sanctions (Decision 6).
3. **`countActiveByCommunity` does NOT go on `InspectableElementRepositoryPort`.**
   That placement forces `CommunityModule` to import `InspectableElementModule`
   and closes a DI cycle against the proposal's settled choice 2. It lives on a
   narrow, `community`-owned `InspectableElementCounter` port instead — the exact
   `MaintenanceCompanyLookup` pattern (Decision 4).
4. **The `community` web slice needs three more files than Affected Areas
   lists** — `apps/web/src/api/community.ts` (mirrored union),
   `apps/web/src/community/error-messages.ts` (forced by
   `Record<CommunityErrorCode, string>`) and the `community.error.hasActiveElements`
   locale keys. `CommunitiesListPage.tsx` itself needs **zero** changes: it
   already renders `actionErrorKey` from `mapApiErrorToMessageKey`.

## Rules Applied

| Rule | Where it is honoured |
|---|---|
| **ADR-006** walking skeleton — design per slice, defer the rest | No `code`, `imageUrl`, `active`, hydrostatic fields, typed details, or second enum value anywhere in this design. VO call re-derived per field (Decision 2), not copied. Forward-compat observations are one-liners, never structures |
| **ADR-006 addendum** — every domain slice ships its own minimal UI | Decision 9: three pages, one `<Link>` on `CommunityDetailPage`, nothing more |
| **ADR-007 / ADR-008** — closed catalogs as hand-written unions | Decision 1: `ElementType` is a TS union first, a Postgres enum second, mirroring `Locale`/`Role` |
| **ADR-009** — UUIDv7 from the app | `idGenerator.generate()` in the create use case; `@db.Uuid`, no DB default |
| **ADR-010** — soft delete only | `extends SoftDeletableRepository` everywhere; `deletedAt IS NULL` in the counter and the `NOT EXISTS` subquery; `deletedAt` never in a response DTO |
| **ADR-011** — permissions in the rule table, not scattered | Four `inspectableElement:*` permissions on the `SYSTEM_ADMIN` row only; `PermissionChecker.can` signature untouched |
| **ADR-013** — domain has zero Prisma; `@prisma/client` confined to `infrastructure/persistence/**` | Hand-written entity + mapper; the parity spec is deliberately placed under `infrastructure/persistence/` so it may import `$Enums`; no `@relation`, hence the hand-written FK |
| **ADR-015** — `@sf-manager/validation` is the single validation source | One schema file consumed by the pipe, the DTO types and all three web forms |
| **Coded-error convention** (`maintenance-company` Decision 1) | Per-module local union; `buildCodedError`; a code only where a status has >1 reachable cause on the same call — which is exactly why the two 404 codes are earned and why no 201/204 gets one |
| **`forwardRef()` is not an answer** (`maintenance-company` Decision 4) | Decision 4: one precedented import direction + one narrow consumer-owned port |
| **Prefer an atomic DB statement over application-level locking** (Decisions 2/6 of the sibling design) | Decision 6: the delete block is a `NOT EXISTS` inside the write, not a check-then-act |
| **Follow the existing pattern unless the change addresses it** (sdd-design rule) | Direct-assignment mapper over an exhaustive switch (Decision 1); inlined list-and-select over a premature hook (Decision 9); `mapMutationError` gains a branch rather than being generalised |
| **CLAUDE.md — Git & PR conventions** | `stacked-to-main`; branches `inspectable-elements/<NN>-<slug>`; PR titles `type(scope): PR N/M — …`; every PR gets an independent fresh-context review |
| **CLAUDE.md — Verifying UI changes** | Browser row in the Testing Strategy is mandatory, not optional; test-only verification must be stated explicitly if it happens |
