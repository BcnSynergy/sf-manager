# Design: Maintenance Company + `User.maintenanceCompanyId`

## Technical Approach

Mirror `apps/api/src/modules/community/**` layer-for-layer under
`apps/api/src/modules/maintenance-company/**` (proposal, Approach). The slice
adds one aggregate root (`MaintenanceCompany`) plus one nullable foreign
attribute on an existing aggregate (`User.maintenanceCompanyId`), and that
second half is what makes this design different from `community`'s: the two
modules need to read each other, in **opposite directions**, which is a Nest
DI cycle waiting to happen. Decision 4 breaks it without `forwardRef()`.

Three invariants carry the slice, and each gets a deliberately different
enforcement mechanism depending on whether a database constraint can actually
express it:

| Invariant | Can the DB express it? | Mechanism |
|---|---|---|
| `taxId` unique **among active companies** | Yes — partial unique index | Index is the *only* enforcement; `P2002` → `TaxIdAlreadyInUseError`. Race-free by construction (Decision 2) |
| A company with active users cannot be soft-deleted | No — cross-table + `deletedAt` predicate; the FK guards *hard* deletes this project never performs | Pure domain policy + a count through `UserRepository` (Decision 4) |
| `maintenanceCompanyId` required iff role is maintenance-side | No — cross-column `CHECK` Postgres would need, and the app owns the message anyway | Shared Zod refinement (web + API) + a pure domain policy at the write path only (Decision 5) |

That table is the design in one screen: use the constraint where it fits, use
the domain where it does not, and never pretend a mechanism enforces something
it structurally cannot (Decision 6).

## Architecture Decisions

### Decision 1 (Open Question 5): the rule of three fires — extract the **envelope builder**, keep the **unions** local

This is the third consumer, and the trigger was pre-designed by
`community-minimal-ui` design.md Decision 1 precisely so nobody re-litigates
it at n=3:

> *Extraction trigger (mechanical, pre-designed so nobody re-litigates it)*: at
> the **third** module needing coded conflicts, create
> `apps/api/src/shared/presentation/http/coded-conflict.ts` exporting
> `buildCodedConflict(message, code)`, and migrate **all** existing callers in
> that same PR. The per-module unions stay where they are — only the envelope
> builder moves.

The trigger separates two things the original `users-minimal-ui` wording
conflated. They resolve differently.

| What is duplicated | Option | Tradeoff | Verdict |
|---|---|---|---|
| **The code union** (n=3) | Hoist into `@sf-manager/validation` | ADR-015 charters that package as *"shared validation: Zod, single source of truth for backend validation and frontend forms"* — error taxonomy is not validation. Worse, the three unions still share exactly **one** value (`TRANSACTION_CONFLICT`, and after Decision 6 this module does not even have it): a shared home becomes a god-union coupling every module's presentation layer, or per-module files in a package that would then import each module's presentation concepts — an inverted boundary | **Rejected (third time, on unchanged and now stronger evidence)** |
| **The code union** | `modules/maintenance-company/presentation/maintenance-company-error-code.ts`, mirrored as a literal union in `apps/web/src/api/maintenance-company.ts` | File-for-file with `users` and `community`. Drift guarded by the proven mechanism: an e2e assertion on `body.code` per cause | **Chosen** |
| **The `{statusCode, error, message, code}` envelope builder** (n=3) | Keep a third private copy | The pre-designed trigger fires here, and its **only** stated blocker at n=2 was scope: *"the proposal fences `users` API as unchanged, so `UsersController` cannot be migrated in this chain."* That blocker is **gone** — this proposal already modifies `apps/api/src/modules/users/presentation/**`. Deferring a third time would require a technical reason, and there is none | **Rejected** |
| **The envelope builder** | `apps/api/src/shared/presentation/http/coded-error.ts`, **all three** callers migrated in one mechanical PR | Zero behaviour change; both existing modules already have e2e assertions on `body.code` per cause, so the migration is guarded by tests that already exist | **Chosen** |

**Two deliberate deviations from the pre-designed trigger, stated so they are
not mistaken for drift:**

1. **Name and signature.** `buildCodedConflict(message, code): ConflictException`
   becomes `buildCodedError(status, message, code): HttpException`, in
   `coded-error.ts` not `coded-conflict.ts`. Decision 5 introduces the first
   coded **400** (`MAINTENANCE_COMPANY_NOT_FOUND`); a conflict-only helper
   would need a near-identical sibling *within this same slice*, which is the
   exact duplication the extraction exists to remove. The `code` parameter is
   generic (`<TCode extends string>`) rather than the pre-designed `code: string`,
   so each call site keeps its own union narrowed at zero cost.

2. **It touches `community`.** The proposal fences
   `apps/api/src/modules/community/**` as untouched by design. Migrating only
   two of three callers would leave a "shared" helper with a stale identical
   private copy next door — the state the prior design called *"worse than two
   honest copies."* Reported as a finding per the `community-minimal-ui`
   precedent (*"any needed change is a finding to report"*), and confined to a
   **standalone mechanical PR** that deletes two private methods and changes
   their call sites, with no behavioural diff.

**The convention is therefore amended, not replaced:**

> **Coded-error convention (API).** A module that needs machine-readable error
> causes declares `modules/{domain}/presentation/{domain}-error-code.ts`
> exporting a literal union; controllers build responses with the shared
> `buildCodedError(status, message, code)`; **only a status with more than one
> reachable cause on the same call gets a code**; every code is asserted in
> that module's e2e spec; the web mirror is a literal union in
> `apps/web/src/api/{domain}.ts`.
>
> *Next extraction trigger*: none pending. The unions stay per-module until a
> consumer outside `apps/api` + `apps/web` needs them (e.g. a second client or
> a public API contract), at which point the hoist target is a new
> `@sf-manager/api-contract` package, **not** `@sf-manager/validation`.

```ts
// apps/api/src/shared/presentation/http/coded-error.ts
export function buildCodedError<TCode extends string>(
  status: HttpStatus,
  message: string,
  code: TCode,
): HttpException {
  return new HttpException(
    { statusCode: status, error: STATUS_TEXT[status], message, code },
    status,
  );
}
```

`STATUS_TEXT` reproduces the `error` field Nest's `HttpException.createBody`
emits by default (`'Conflict'`, `'Bad Request'`) — the same
already-verified-at-apply-time behaviour both existing private builders rely
on, so the body shape stays byte-identical and the change stays non-breaking.

### Decision 2: `taxId` partial unique index — the index is the **only** enforcement

```sql
CREATE UNIQUE INDEX "MaintenanceCompany_taxId_active_key"
  ON "MaintenanceCompany"("taxId") WHERE "deletedAt" IS NULL;
```

Exact precedent:
`20260825120000_add_community_and_assignments/migration.sql:61`
(`CommunityRepresentative_one_active_per_community`) for the partial index and
its warning block, and lines 63–80 of the same file for the hand-written FK
style this project uses because Prisma models carry no `@relation` (ADR-013).

| Option | Tradeoff | Verdict |
|---|---|---|
| Read-check `findActiveByTaxId()` in the use case, then insert | Nice error message, but TOCTOU: two concurrent creates both read "free", one gets a raw `P2002` → **500**. A check that is wrong under exactly the condition it exists for | **Rejected** |
| Partial unique index only; adapter maps `P2002` → `TaxIdAlreadyInUseError` | Atomic and race-free by construction. Identical in shape to `PrismaUserRepository.create`'s `P2002` → `EmailAlreadyInUseError` (`prisma-user.repository.ts:91-105`) | **Chosen** |
| Plain `@@unique([taxId])` in `schema.prisma` | Prisma-visible, but reserves a soft-deleted company's tax id forever — contradicts the settled product decision that a re-onboarded company reuses its CIF | **Rejected** |

**Migration** — `apps/api/prisma/migrations/<ts>_add_maintenance_company/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "MaintenanceCompany" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceCompany_pkey" PRIMARY KEY ("id")
);

-- AlterTable: nullable, so it cannot fail on a non-empty User table
-- (proposal Risks, "pre-existing maintenance-role users"). No @default —
-- same reasoning as the Role column (schema.prisma:14-16).
ALTER TABLE "User" ADD COLUMN "maintenanceCompanyId" UUID;

-- CreateIndex: Prisma-VISIBLE (@@index in schema.prisma). Postgres does not
-- auto-index FK-referencing columns, and countActiveByMaintenanceCompany
-- (Decision 4) filters on exactly this column on every delete attempt.
CREATE INDEX "User_maintenanceCompanyId_idx" ON "User"("maintenanceCompanyId");

-- Hand-edited migration: Prisma's schema DSL has no `WHERE` clause on
-- `@@unique`, so this partial unique index cannot be expressed in
-- schema.prisma and is therefore INVISIBLE to Prisma's migration diffing.
-- Precedent: 20260825120000_add_community_and_assignments/migration.sql.
--
-- WARNING: do NOT let `prisma migrate dev`/`migrate reset` regenerate this
-- file or diff schema.prisma against the database in a way that could DROP
-- this index — Prisma has no knowledge of it. Guarded by an integration test
-- asserting its continued presence in `pg_indexes`.
--
-- `WHERE "deletedAt" IS NULL` is the whole point (proposal, Settled product
-- decisions): a soft-deleted company frees its taxId for a re-onboarded
-- instance of the same legal entity, while two ACTIVE companies can never
-- share one. This index is the SOLE enforcement — there is no read-check.
CREATE UNIQUE INDEX "MaintenanceCompany_taxId_active_key"
  ON "MaintenanceCompany"("taxId") WHERE "deletedAt" IS NULL;

-- Hand-edited migration: schema.prisma has no `@relation` field here
-- (ADR-013, mirroring the community assignment tables), so this FK is also
-- INVISIBLE to Prisma's migration diffing — same WARNING as above.
--
-- `ON DELETE RESTRICT` (the default) is correct and, by design, never fires:
-- MaintenanceCompany rows are never hard-deleted (ADR-010 soft delete). It
-- matches the invariant rather than enforcing it — which is exactly why the
-- has-active-users rule needs a domain policy (Decision 4), not this FK.
ALTER TABLE "User" ADD CONSTRAINT "User_maintenanceCompanyId_fkey"
  FOREIGN KEY ("maintenanceCompanyId") REFERENCES "MaintenanceCompany"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Gotcha — do not branch on `error.meta.target`.** Prisma surfaces any
Postgres `23505` as `P2002`, but for a hand-written index it does not know
about, `meta.target` is unreliable. The adapter therefore maps `P2002`
unconditionally to `TaxIdAlreadyInUseError`, which is sound because
`MaintenanceCompany` has exactly two unique constraints: this index and the
UUIDv7 primary key (ADR-009 — a collision there is not a real failure mode).
`PrismaUserRepository.create` already relies on the identical argument for
`email`. Both `create()` and `updateById()` need the `catch`; a `PATCH` that
moves a company onto an in-use tax id is the same violation.

**`schema.prisma`** carries `@@index([maintenanceCompanyId])` on `User` and a
comment block on `MaintenanceCompany` pointing at the invisible index and FK,
mirroring the comment on `CommunityRepresentative` (`schema.prisma:85-89`).

### Decision 3: `name`, `taxId` and `contactInfo` are all plain fields — no Value Objects

The `users` precedent is precise and `community` design.md Decision 5 already
applied it: a field becomes a Value Object when it carries **behaviour beyond
validation**. `PlainPassword` is this codebase's only VO, and only because of
`toString()` redaction over a `#raw` field. `email` — which has a real format
rule *and* a normalization rule *and* a uniqueness constraint — stayed a plain
`string`, because Zod expresses the rule and the shared package makes it
available to both sides (ADR-015).

Per CLAUDE.md, the conclusion is re-derived per field rather than copied:

| Field | Invariant | Behaviour beyond validation? | Verdict |
|---|---|---|---|
| `name` | non-empty, trimmed | None. Never parsed, compared or formatted | Plain `string` — same as `Community.name` |
| `contactInfo` | non-empty, trimmed free text | None **and knowably temporary**: the confirmed direction is a shared `ContactInfo` **entity** (Engram #132), a different construct at a different layer. A VO built now is scaffolding that must be deleted or moved when that lands | Plain `string` — same as `Community.address` |
| `taxId` | non-empty, trimmed, **unique among active companies** | Uniqueness is *not* an intrinsic property of the value — it is a property of the set, and a VO structurally cannot see other rows. Format/checksum behaviour, the one thing a `TaxId` VO could legitimately own, was explicitly deferred by the proposal | Plain `string` |

`taxId` is the genuinely different field and it still lands on "plain", but it
forces a decision the others do not: **canonicalization**. A unique index on
the raw column means `"B12345678"`, `"b12345678"` and `" B12345678 "` are three
different tax ids, and the uniqueness guarantee is worth very little. `email`
solved exactly this with `.trim().toLowerCase()` in the shared schema
(`create-user.schema.ts:28`), stored normalized. Same solution, same place:

```ts
// packages/validation/src/maintenance-company/maintenance-company.schema.ts
export const taxIdSchema = z.string().trim().toUpperCase().min(1);
```

Uppercase rather than lowercase because Spanish CIF/NIF are conventionally
uppercase; the value is case-insensitive alphanumeric either way.

**Accepted exposure**: normalization lives in the schema, not the column, so a
writer that bypasses the schema (seed, raw SQL) could insert a non-canonical
duplicate. This is the *same* exposure `email` already carries in production
(`schema.prisma:27` — "stored lowercase-normalized"), so it is symmetric with
the shipped precedent, not a new class of risk.

*Revisit trigger*: when CIF/NIF checksum validation lands, it is a Zod
`.refine()` first — following `email`'s path, not `PlainPassword`'s.
`taxId` becomes a VO only if it grows real behaviour (e.g. `region()`,
formatted display), not merely a stricter format rule.

### Decision 4: the delete block — pure policy, counted through `UserRepository`, and the DI cycle broken without `forwardRef()`

**The policy** mirrors `last-admin.policy.ts` exactly: a pure function, no
ports, no I/O, no repository reference. The use case owns the read; the policy
owns only the invariant.

```ts
// modules/maintenance-company/domain/maintenance-company-deletion.policy.ts
export function assertNoActiveUsersAttached(activeUserCount: number): void {
  if (activeUserCount > 0) {
    throw new MaintenanceCompanyHasActiveUsersError(activeUserCount);
  }
}
```

The count is carried on the error so the 409 message can say *how many* users
must be reassigned first — the actionable half of the success criterion.

**The port method** goes on the existing `users` port, mirroring
`countActiveByRole` (`user.repository.port.ts:50`) one-for-one:

```ts
// modules/users/application/ports/user.repository.port.ts (added)
countActiveByMaintenanceCompany(maintenanceCompanyId: string): Promise<number>;
```

Adapter: `this.prisma.user.count({ where: this.withDefaultFilter({ maintenanceCompanyId }) })`.
`withDefaultFilter` supplies `deletedAt: null` by construction (ADR-010), so
*"soft-deleted users do not block a company's deletion"* is satisfied for free
— no extra predicate, nothing to forget.

**Call site and ordering** — `SoftDeleteMaintenanceCompanyUseCase`:
`findById` (404) → `countActiveByMaintenanceCompany` → `assertNoActiveUsersAttached`
→ `softDeleteById`. The check precedes the write, which is the opposite of
`SoftDeleteCommunityUseCase` (`soft-delete-community.use-case.ts:39-59`, which
deletes first and *then* cascades). The inversion is required, not stylistic:
community's side effect always succeeds, so ordering is free; here the check
can **refuse**, and *"no user is modified by the attempt"* also implies no
company is modified. Delete-first-then-undo would need a transaction to roll
back and would briefly make the company disappear from `GET`.

**The DI cycle, and why `forwardRef()` is not the answer.** Two dependencies
point in opposite directions:

- `maintenance-company → users` — the delete block needs a user count.
- `users → maintenance-company` — user create/update needs a company liveness
  check (Decision 5).

| Option | Tradeoff | Verdict |
|---|---|---|
| `forwardRef()` on both modules | Nest supports it, but it is a known bootstrap-fragility smell and this repo has already been bitten by DI-bootstrap crashes (CLAUDE.md, Git & PR Conventions). It also *encodes* the cycle instead of removing it | **Rejected** |
| Both modules read the other's table from their own infrastructure | Symmetric and cycle-free, but doubles the boundary crossings and discards the `CommunityModule` precedent of consuming `USER_REPOSITORY` | **Rejected** |
| Hoist a `MaintenanceCompanyLookup` port into `shared/application/ports/` | `shared` would own a module-specific read contract. `permission.ts` carries module-specific *strings*, which is a much lighter coupling than a repository-shaped port | **Rejected** |
| **One precedented direction + one narrow, `users`-owned lookup** (below) | One new boundary crossing, no cycle, no `forwardRef`, no `shared` inversion | **Chosen** |

- `MaintenanceCompanyModule` **imports `UsersModule`** and injects
  `USER_REPOSITORY` — verbatim the `CommunityModule` pattern
  (`community.module.ts:42` and its comment at lines 31-36).
- `UsersModule` imports **nothing** from `maintenance-company`. It declares its
  own narrow read contract and its own adapter:

```ts
// modules/users/application/ports/maintenance-company-lookup.port.ts
export interface MaintenanceCompanyLookup {
  // True only for a company that exists AND is not soft-deleted (ADR-010).
  existsActive(id: string): Promise<boolean>;
}
export const MAINTENANCE_COMPANY_LOOKUP = Symbol('MAINTENANCE_COMPANY_LOOKUP');
```

Adapter `PrismaMaintenanceCompanyLookup` lives in
`users/infrastructure/persistence/` and is a ~15-line existence probe
(`findFirst({ where: { id, deletedAt: null }, select: { id: true } })`).
`PrismaModule` is `@Global()` (`shared/infrastructure/persistence/prisma.module.ts:4`),
so it resolves `PrismaService` with no module import at all.

**Why this is a lookup and not a repository**: `users` does not own
`MaintenanceCompany` and never writes it. It owns one question — *"is this
company id live?"* — and Clean Architecture says the consumer owns the contract
it needs. Injecting `MAINTENANCE_COMPANY_REPOSITORY` instead would couple
`users`' application layer to another module's full port *and* re-create the
cycle. Two adapters touching one table is the smaller price, and it is a
read-only single-column probe, not shared ownership. *Rule-of-three note*: if
a second cross-module liveness lookup appears, revisit with a
`shared/application/ports/entity-liveness.port.ts` generalization — not
before.

### Decision 5: the conditional requirement — shared Zod for shape, domain policy for authority, and **only what the request supplies** is judged

Three violation shapes, three answers:

| # | Violation | Status | Code | Where it is caught |
|---|---|---|---|---|
| 1 | Maintenance role, **no** `maintenanceCompanyId` | **400** | none | `createUserSchema` refinement (web form *and* `ZodValidationPipe`); domain policy as backstop |
| 2 | Non-maintenance role, `maintenanceCompanyId` **present** | **400** | none | same |
| 3 | `maintenanceCompanyId` references a missing **or soft-deleted** company | **400** | `MAINTENANCE_COMPANY_NOT_FOUND` | `CreateUserUseCase` / `UpdateUserUseCase` via `MaintenanceCompanyLookup.existsActive` |

**Shapes 1 and 2 follow the `password` precedent, not the `email` one** —
enforced in *both* layers, deliberately:

- **Shared Zod** (`packages/validation`): a `.superRefine` on
  `createUserSchema` / `updateUserSchema` keyed off an exported
  `isMaintenanceRole(role)` predicate. This gives `UserCreatePage` /
  `UserEditPage` the identical rule client-side for free, and gives the API a
  real 400 through the pipe. `users/domain/password.ts` already establishes
  that a domain file may import from `@sf-manager/validation` ("one source of
  truth, both layers validate it").
- **Domain policy** — `users/domain/maintenance-company-assignment.policy.ts`,
  pure, mirroring `last-admin.policy.ts`:
  `assertCompanyMatchesRole(role, maintenanceCompanyId): void` throwing
  `InvalidMaintenanceCompanyAssignmentError`. This is the authority for
  writers that never pass through the pipe (`prisma/seed.ts` uses
  `save()`), and it is what makes proposal choice 4 ("the server is the only
  place that decides") structurally true rather than aspirational.

**Where the policy is called — and where it deliberately is NOT.**

> **Not in the `User` constructor.** `UserMapper.toDomain` reconstitutes every
> row read from the database. A grandfathered pre-existing maintenance-role
> user with `maintenanceCompanyId = NULL` (proposal Risks, Open Question 2)
> would then throw **on read**, turning `GET /users` into a 500. The invariant
> is a *write* rule; putting it in the constructor would silently convert it
> into a read rule. This is the single most dangerous shortcut available in
> this slice and it is ruled out explicitly.

- `CreateUserUseCase`: `assertCompanyMatchesRole(input.role, input.maintenanceCompanyId)`
  before any hashing or persistence, then — only if a company was supplied —
  `existsActive` (shape 3).
- `UpdateUserUseCase`: judged **only when `maintenanceCompanyId` is present in
  the request body**, against the role that will be in effect
  (`changes.role ?? existing.role`). When the field is absent, **no check at
  all runs**.

That last rule is not an optimization — it is what keeps settled decision 3
true. Validating the *resulting pair* instead would reject a bare
technician→`MANAGER` demotion (stale company still set = shape 2), directly
contradicting *"left untouched; no auto-clear, no rejection."* Restated
precisely: **the invariant constrains the payload's own coherence, never the
post-state.** A regression e2e asserting the demotion succeeds *and* leaves
`maintenanceCompanyId` unchanged locks this in.

> **Handoff to `sdd-spec` (Open Question 2).** This call site accommodates the
> proposal's "grandfather, leave alone" direction as designed. If `sdd-spec`
> chooses the stricter *"any edit must supply a company"*, the only change is
> one added condition at the `UpdateUserUseCase` call site — the policy
> function, the port, the errors and the schemas are unaffected either way.

**Why shape 3 is a 400 with a code, and not a 404** — the one place this
design departs from `community`:

| Option | Tradeoff | Verdict |
|---|---|---|
| **404**, mirroring `POST /communities/:id/representatives` → `UserNotFoundError` | In `community` the body's `userId` is *half the addressed resource*: `(communityId, userId)` is the assignment's identity. Here the company is an **attribute value** of the user being written. Worse, `PATCH /users/:id` already 404s for "user not found" — a second cause would make that status ambiguous with no way for the UI to tell them apart | **Rejected** |
| **409** | Not a state conflict; the request is simply referencing something that is not there | **Rejected** |
| **400 + `MAINTENANCE_COMPANY_NOT_FOUND`** | Keeps 404 on `/users/:id` single-cause. The code is *earned*: shapes 1 and 2 are caught client-side by the shared schema, so in practice a 400 from `/users` means either a schema-drift bug or exactly this stale-company case — and "check your input" is actively misleading when the real cause is "the company you picked was deleted in another tab." One union member, one controller branch | **Chosen** |

`apps/web/src/api/client.ts` already parses `code` from **any** non-OK body
(`client.ts:45-54`), so a coded 400 needs zero client changes — only the stale
comment at `client.ts:9-11` ("today that is exclusively 409 responses") must
be corrected.

Resulting unions:

```ts
// apps/api/src/modules/users/presentation/user-error-code.ts (extended)
export type UserErrorCode =
  | 'EMAIL_ALREADY_IN_USE'          // 409
  | 'LAST_SYSTEM_ADMIN'             // 409
  | 'TRANSACTION_CONFLICT'          // 409
  | 'MAINTENANCE_COMPANY_NOT_FOUND' // 400 — new
;

// apps/api/src/modules/maintenance-company/presentation/maintenance-company-error-code.ts
export type MaintenanceCompanyErrorCode =
  | 'TAX_ID_ALREADY_IN_USE'               // 409
  | 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS' // 409
;
```

`InvalidMaintenanceCompanyAssignmentError` (shapes 1/2) maps to a **plain**
400 with no code: it is unreachable through the HTTP path (the pipe rejects
first), so a code would be dead weight, and 400-without-code is already the
established bucket for schema failures.

### Decision 6: **no** `transactional()` / `SERIALIZABLE` in this slice — and the honest reason why

The proposal flagged the race: T1 soft-deletes company C (count = 0, proceed)
while T2 concurrently creates or PATCHes a user pointing at C (`existsActive` =
true). Both commit. Result: an active user referencing a soft-deleted company.

The default move is to reach for the `users` seam. It is the wrong move here,
for a structural reason and a proportionality reason.

**Structural — the existing seam physically cannot see this write skew.**
`PrismaUserRepository.transactional()` (`prisma-user.repository.ts:140-165`)
hands the callback a repository bound to the tx client: `work(new PrismaUserRepository(tx))`.
`transactional()` on the company port would do the same for *its* type. The
two ports do not compose — there is no way to run
`maintenanceCompanyRepo.softDeleteById` and `userRepo.countActive…` inside one
Postgres transaction without a **cross-module `UnitOfWork` seam that does not
exist in this codebase**. Wrapping each side in its own `SERIALIZABLE`
transaction would detect nothing at all (they are disjoint transactions), while
looking in the diff exactly like the last-admin protection. That is worse than
no mitigation: it is a false guarantee that a future reader will trust.

**Proportionality — the anomaly is not in the same class as the one the seam
was built for.**

| Invariant | Consequence if violated | Recovery | Mechanism |
|---|---|---|---|
| Last admin remains (`users`) | **Permanent lockout of every user** | DB surgery | `SERIALIZABLE` — justified |
| One active representative (`community`) | Core assignment model breaks; every read is ambiguous | Manual repair | `SERIALIZABLE` + partial index — justified |
| No active user on a deleted company (**here**) | One user row points at a dead company. That user is **functionally inert** — both maintenance roles keep `[]` permissions (settled decision). No security impact, no data loss, no cascade | Admin edits the user (must supply a live company) or deletes it — through the normal UI | Accepted anomaly |

**Traffic**: `SYSTEM_ADMIN`-only administrative CRUD. Hitting the window needs
two admins issuing conflicting mutations within the same few milliseconds.

**Decision**: accept the anomaly, minimize the window (count → soft-delete, one
round trip apart), and make the anomaly *harmless in the UI* rather than
merely rare — Decision 7's id→name map renders an unknown company id as a
neutral localized label, never a raw UUID or a crash. Also: `TRANSACTION_CONFLICT`
is **dropped** from `MaintenanceCompanyErrorCode` (the proposal listed it in
scope). With no `transactional()` in this module there is no `P2034` path, so
the code would be unreachable dead surface. Reported as a finding.

*Revisit trigger (concrete, not vague)*: the moment a **second** cross-aggregate
invariant needs atomicity, introduce a shared `UnitOfWork` seam in
`shared/application/ports/` and bring this rule under it in the same change.
One such rule does not justify the seam; two do.

Note the deliberate contrast with Decision 2, which is the same design question
with the opposite answer: where a DB constraint *can* express the invariant
(`taxId`), it is used and atomicity is free; where it cannot (cross-table +
soft-delete), the anomaly is named and accepted instead of faked.

### Decision 7: the users surfaces resolve the company **name** client-side

The success criterion forbids rendering a raw UUID.

| Option | Tradeoff | Verdict |
|---|---|---|
| `UserResponseDto` gains `maintenanceCompanyName` | Requires the `users` read path to join another module's table on every list — an N+1 or a batch read, plus a new reason for `users` to know company *attributes* rather than just liveness (Decision 4's boundary widens) | **Rejected** |
| Web fetches `GET /maintenance-companies` and builds an `id → name` map | Zero API change. The user **forms already need that exact call** for the selector, so the list page is the only added fetch. Reuses `users-minimal-ui` Decision 5's fetch-the-list-and-select shape | **Chosen** |

`UserResponseDto` therefore gains only `maintenanceCompanyId: string | null`.

An id missing from the map (soft-deleted company — including Decision 6's
accepted anomaly) renders the localized `maintenanceCompany.unknown` label. The
two decisions interlock: the residual race becomes a cosmetic, self-describing
state rather than a defect.

**Request sequencing** (the proposal's deferred item): `UserCreatePage` fetches
companies once on mount; `UserEditPage` and `UsersListPage` fetch companies in
parallel with the users list (`Promise.all`), never sequentially — neither
depends on the other's result.

## Where the settled policies live in code

| Policy (already decided) | Location |
|---|---|
| `taxId` unique among active companies | Partial unique index in `migration.sql`; `PrismaMaintenanceCompanyRepository.create`/`updateById` map `P2002` → `TaxIdAlreadyInUseError` → **409 `TAX_ID_ALREADY_IN_USE`**. No use-case read-check (Decision 2) |
| Soft-deleted company frees its `taxId` | Free consequence of `WHERE "deletedAt" IS NULL`. Proven by an e2e: create → delete → re-create with the same `taxId` → 201 |
| Soft-deleted companies invisible everywhere | **No new code.** `PrismaMaintenanceCompanyRepository extends SoftDeletableRepository`; `withDefaultFilter` (ADR-010) covers `findById`, `findAll`, and therefore the list page and the form selector alike |
| Delete blocked while users are attached | `domain/maintenance-company-deletion.policy.ts` → `assertNoActiveUsersAttached(count)`, called by `SoftDeleteMaintenanceCompanyUseCase` **before** `softDeleteById`. Throws `MaintenanceCompanyHasActiveUsersError` → **409 `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS`** (same class as `LastSystemAdminError`) |
| Soft-deleted users do not block deletion | **No new code.** `countActiveByMaintenanceCompany` uses `withDefaultFilter` (`deletedAt: null`) |
| Company required iff maintenance role | `users/domain/maintenance-company-assignment.policy.ts` → `assertCompanyMatchesRole(role, companyId)`, called by `CreateUserUseCase` and (payload-scoped) `UpdateUserUseCase`. Mirrored as a `.superRefine` in `@sf-manager/validation` so the web form enforces the same rule pre-flight. **Never in the `User` constructor** (Decision 5) |
| Company must be live | `MaintenanceCompanyLookup.existsActive(id)` (port owned by `users`) → `MaintenanceCompanyNotFoundError` → **400 `MAINTENANCE_COMPANY_NOT_FOUND`** |
| Bare role change leaves `maintenanceCompanyId` untouched | Enforced by **absence**: `UpdateUserUseCase` runs no company check when the field is absent from the body. Locked in by a regression e2e asserting the value survives a demotion |
| Roles stay inert | Enforced by absence: `role-permission.checker.ts` gains entries on the `SYSTEM_ADMIN` row **only**; the four other rows stay `[]`, asserted by e2e |

## Routes

| Method | Path | Permission | Result |
|---|---|---|---|
| `POST` | `/maintenance-companies` | `maintenanceCompany:create` | 201 · 409 `TAX_ID_ALREADY_IN_USE` |
| `GET` | `/maintenance-companies` | `maintenanceCompany:read` | 200 (active only) |
| `PATCH` | `/maintenance-companies/:id` | `maintenanceCompany:update` | 200 · 404 · 409 `TAX_ID_ALREADY_IN_USE` |
| `DELETE` | `/maintenance-companies/:id` | `maintenanceCompany:delete` | 204 · 404 · 409 `MAINTENANCE_COMPANY_HAS_ACTIVE_USERS` |

Four permissions rather than one, mirroring `community:*`'s granularity so a
future `MANAGER` + `managerCapabilities` slice (proposal Open Question 8) can
grant read without granting delete. All four go to `SYSTEM_ADMIN` only.

**Checked, not assumed**: no non-admin role needs `maintenanceCompany:read` for
the user forms, because `user:create`/`user:update` are already `SYSTEM_ADMIN`-only
— the set of callers who can reach the forms is a subset of the set who can
read companies.

## Data Flow — `POST /maintenance-companies`

    AuthenticatedGuard → PermissionsGuard('maintenanceCompany:create') → Controller
         │ ZodValidationPipe(createMaintenanceCompanySchema)
         │   └ name/taxId/contactInfo trimmed; taxId upper-cased (Decision 3)
         ▼
    CreateMaintenanceCompanyUseCase
         │ 1. idGenerator.generate()            → UUIDv7 (ADR-009)
         │ 2. new MaintenanceCompany({ ..., deletedAt: null })
         ▼ 3. repo.create(company)              ← NO read-check (Decision 2)
             ├ ok    → 201
             └ P2002 → TaxIdAlreadyInUseError   → 409 { code: TAX_ID_ALREADY_IN_USE }
                       (partial index is the sole, atomic enforcement)
         ▼
    MaintenanceCompanyResponseDto { id, name, taxId, contactInfo }
    (deletedAt is never returned — mirrors CommunityResponseDto)

## Data Flow — `DELETE /maintenance-companies/:id` (block, not cascade)

Deliberately the mirror image of `community`'s soft-delete cascade: same
lookup-then-count shape, opposite ordering, and it ends in a refusal instead of
a side effect.

    AuthenticatedGuard → PermissionsGuard('maintenanceCompany:delete') → Controller
         │ SoftDeleteMaintenanceCompanyUseCase
         ▼ 1. companyRepo.findById(id)          → 404 MaintenanceCompanyNotFoundError
         │                                        (missing OR already soft-deleted —
         │                                         identical outcome, ADR-010 filter)
         ▼ 2. userRepo.countActiveByMaintenanceCompany(id)
         │      └ withDefaultFilter ⇒ deletedAt: null
         │         ⇒ soft-deleted users are NOT counted, for free
         ▼ 3. assertNoActiveUsersAttached(count)          [pure domain policy]
             ├ count > 0 → MaintenanceCompanyHasActiveUsersError(count)
             │             → 409 { code: MAINTENANCE_COMPANY_HAS_ACTIVE_USERS }
             │             ✗ STOP — nothing is written. No user is touched,
             │                      and the company is NOT soft-deleted either
             └ count == 0 ↓
         ▼ 4. companyRepo.softDeleteById(id)     → 204
             (no cascade, no user is ever mutated by this use case)

**Why the check precedes the write** (the inversion vs.
`SoftDeleteCommunityUseCase`): community's post-delete cascade always succeeds,
so ordering there is free. Here step 3 can refuse, and "no user is modified by
the attempt" also implies "no company is modified." Deleting first would
require a transaction to undo, and would briefly remove the company from `GET`.

**Residual (Decision 6, accepted)**: a `POST`/`PATCH /users` committing between
steps 2 and 4 leaves one inert user pointing at a soft-deleted company. Not
closed in this slice — see Decision 6 for why the existing seam cannot close it.

## Data Flow — `POST /users` / `PATCH /users/:id` (new company-validation step)

    AuthenticatedGuard → PermissionsGuard('user:create'|'user:update') → Controller
         │ ZodValidationPipe(create|updateUserSchema)
         │   └ .superRefine cross-field rule (Decision 5, shapes 1 & 2)
         │        ├ maintenance role + no companyId → 400 (no code)
         │        └ other role + companyId present  → 400 (no code)
         ▼
    Create|UpdateUserUseCase
         │ [PATCH only] userRepo.findById(id)     → 404 UserNotFoundError
         │                                          (still the ONLY 404 cause)
         │
         ├─ is `maintenanceCompanyId` present in THIS request?
         │    ├ NO  → skip every company check entirely
         │    │       (a bare role change never touches it — settled decision 3)
         │    └ YES ↓
         │        1. assertCompanyMatchesRole(changes.role ?? existing.role, companyId)
         │             → InvalidMaintenanceCompanyAssignmentError → 400 (no code)
         │             [backstop; the pipe already rejected this on the HTTP path]
         │        2. companyLookup.existsActive(companyId)   [users-owned port]
         │             └ false (missing OR soft-deleted — indistinguishable)
         │                → MaintenanceCompanyNotFoundError
         │                → 400 { code: MAINTENANCE_COMPANY_NOT_FOUND }
         ▼
    userRepo.create(...) | updateById(...)
         ▼
    UserResponseDto { id, email, role, maintenanceCompanyId: string | null }
         (the web resolves id → name from its own company list — Decision 7)

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `MaintenanceCompany` model; `User.maintenanceCompanyId` + `@@index`; comment block flagging the Prisma-invisible index and FK |
| `apps/api/prisma/migrations/<ts>_add_maintenance_company/migration.sql` | Create | Table + column + **hand-written partial unique index and FK** (Decision 2) |
| `.../maintenance-company/domain/maintenance-company.entity.ts` | Create | Hand-written, zero Prisma (ADR-013); plain fields (Decision 3) |
| `.../maintenance-company/domain/maintenance-company-deletion.policy.ts` | Create | `assertNoActiveUsersAttached` — pure, mirroring `last-admin.policy.ts` |
| `.../maintenance-company/domain/errors/*.error.ts` | Create | `TaxIdAlreadyInUse`, `MaintenanceCompanyHasActiveUsers`, `MaintenanceCompanyNotFound`. **No** `TransactionConflictError` (Decision 6) |
| `.../maintenance-company/application/ports/maintenance-company.repository.port.ts` | Create | `Symbol` token; **no** `transactional()` |
| `.../maintenance-company/application/use-cases/**` | Create | create / list / update / soft-delete |
| `.../maintenance-company/application/use-cases/testing/in-memory-maintenance-company.repository.ts` | Create | Fake with invariant parity — must reproduce the *partial* uniqueness (active rows only) |
| `.../maintenance-company/infrastructure/persistence/**` | Create | Adapter (`extends SoftDeletableRepository`, `P2002` mapping) + mapper |
| `.../maintenance-company/presentation/**` | Create | Controller, DTOs, `maintenance-company-error-code.ts` (2 values) |
| `.../maintenance-company/maintenance-company.module.ts` | Create | Imports `UsersModule` for `USER_REPOSITORY` (Decision 4) |
| `apps/api/src/app.module.ts` | Modify | Register `MaintenanceCompanyModule` |
| `apps/api/src/shared/presentation/http/coded-error.ts` | Create | `buildCodedError(status, message, code)` — the n=3 extraction (Decision 1) |
| `.../users/presentation/users.controller.ts` | Modify | Delete private `buildConflictException`; use the shared helper; map the new 400 cause |
| `.../community/presentation/community.controller.ts` | **Modify (reported finding)** | Same mechanical migration — proposal fences this module as untouched (Decision 1, deviation 2) |
| `.../users/domain/maintenance-company-assignment.policy.ts` | Create | `assertCompanyMatchesRole` — pure |
| `.../users/domain/user.entity.ts` | Modify | `maintenanceCompanyId: string \| null` prop. **No constructor validation** (Decision 5) |
| `.../users/domain/errors/*.error.ts` | Create | `InvalidMaintenanceCompanyAssignmentError`, `MaintenanceCompanyNotFoundError` (users-side) |
| `.../users/application/ports/user.repository.port.ts` | Modify | `countActiveByMaintenanceCompany`; `updateById` changes gain the field |
| `.../users/application/ports/maintenance-company-lookup.port.ts` | Create | `existsActive` + `MAINTENANCE_COMPANY_LOOKUP` token (Decision 4) |
| `.../users/infrastructure/persistence/prisma-maintenance-company-lookup.repository.ts` | Create | ~15-line existence probe; `PrismaService` resolves via `@Global()` `PrismaModule` |
| `.../users/infrastructure/persistence/prisma-user.repository.ts` + `user.mapper.ts` | Modify | New column, new count method |
| `.../users/application/use-cases/{create,update}-user.use-case.ts` | Modify | Policy + liveness call sites (Decision 5) |
| `.../users/users.module.ts` | Modify | Bind `MAINTENANCE_COMPANY_LOOKUP`. **Imports nothing new** |
| `.../users/presentation/{user-error-code.ts,dto/**}` | Modify | `MAINTENANCE_COMPANY_NOT_FOUND`; `maintenanceCompanyId` on request/response DTOs |
| `apps/api/src/shared/application/authorization/permission.ts` | Modify | `maintenanceCompany:create\|read\|update\|delete` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `SYSTEM_ADMIN` row only; other four stay `[]` |
| `packages/validation/src/maintenance-company/maintenance-company.schema.ts` + `src/index.ts` | Create/Modify | `taxIdSchema`, create/update schemas |
| `packages/validation/src/users/{create,update}-user.schema.ts` | Modify | `maintenanceCompanyId` + `.superRefine`; export `isMaintenanceRole` |
| `apps/web/src/api/client.ts` | Modify | **Comment only** — `code` is no longer 409-exclusive (`client.ts:9-11`) |
| `apps/web/src/api/maintenance-company.ts` | Create | Typed calls + mirrored `MaintenanceCompanyErrorCode` |
| `apps/web/src/api/users.ts` | Modify | Mirrored `UserErrorCode` gains the new value |
| `apps/web/src/maintenance-company/error-messages.ts` | Create | `status`/`code`-only map, mirroring `community/error-messages.ts` |
| `apps/web/src/pages/MaintenanceCompan{iesListPage,yCreatePage,yEditPage}.tsx` | Create | Clone the `Community*Page` siblings |
| `apps/web/src/pages/User{sList,Create,Edit}Page.tsx` | Modify | Role-conditional selector; id → name map (Decision 7) |
| `apps/web/src/App.tsx` | Modify | 3 role-gated routes, static-before-dynamic ordering |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `maintenanceCompany.*` translations, incl. `maintenanceCompany.unknown` |
| `apps/api/test/maintenance-company.e2e-spec.ts` | Create | Full lifecycle + auth matrix |
| `apps/api/test/users.e2e-spec.ts` | Modify | Shapes 1–3, reassignment, demotion-drift regression |

## Interfaces

```ts
// modules/maintenance-company/application/ports/maintenance-company.repository.port.ts
export interface MaintenanceCompanyRepository {
  // Default deletedAt: null filter (ADR-010) — a soft-deleted company is
  // "not found" everywhere, including the user-form selector.
  findById(id: string): Promise<MaintenanceCompany | null>;
  findAll(): Promise<MaintenanceCompany[]>;

  // P2002 (partial unique index) -> TaxIdAlreadyInUseError. There is NO
  // findByTaxId: a read-check would be a TOCTOU race (Decision 2).
  create(company: MaintenanceCompany): Promise<void>;
  updateById(
    id: string,
    changes: { name?: string; taxId?: string; contactInfo?: string },
  ): Promise<void>;
  softDeleteById(id: string): Promise<void>;

  // No transactional(): this module has no multi-statement invariant that a
  // single-repository transaction could protect (Decision 6).
}
export const MAINTENANCE_COMPANY_REPOSITORY = Symbol('MAINTENANCE_COMPANY_REPOSITORY');
```

```ts
// modules/users/application/ports/user.repository.port.ts  (added member)
// Mirrors countActiveByRole. `withDefaultFilter` supplies deletedAt: null,
// so soft-deleted users are excluded by construction — which IS the
// "soft-deleted users don't block deletion" rule (Decision 4).
countActiveByMaintenanceCompany(maintenanceCompanyId: string): Promise<number>;
```

```ts
// modules/users/application/ports/maintenance-company-lookup.port.ts
// Owned by `users`, NOT imported from the maintenance-company module — this
// is what keeps the Nest module graph acyclic without forwardRef (Decision 4).
export interface MaintenanceCompanyLookup {
  existsActive(id: string): Promise<boolean>;
}
export const MAINTENANCE_COMPANY_LOOKUP = Symbol('MAINTENANCE_COMPANY_LOOKUP');
```

```ts
// packages/validation/src/users/create-user.schema.ts (added)
export const MAINTENANCE_ROLES = [
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
] as const satisfies readonly Role[];

export function isMaintenanceRole(role: Role): boolean {
  return (MAINTENANCE_ROLES as readonly string[]).includes(role);
}
// createUserSchema.superRefine: required iff isMaintenanceRole(role),
// forbidden otherwise — the same predicate drives the web form's show/hide.
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (domain) | `assertNoActiveUsersAttached` (0 / 1 / n); `assertCompanyMatchesRole` — all 5 roles × company present/absent | Pure, table-driven, like `last-admin.policy.spec.ts` |
| Unit (schema) | `.superRefine` shapes 1 & 2 per role; `taxId` trim + upper-case normalization | `packages/validation` tests |
| Unit (use case) | Delete blocked before any write (assert `softDeleteById` **never called**); delete allowed at 0; **PATCH with no `maintenanceCompanyId` runs no company check** | In-memory fakes; the fake must reproduce *partial* taxId uniqueness |
| Integration | `P2002` → `TaxIdAlreadyInUseError`; **the partial index exists in `pg_indexes`**; the FK exists; two active rows with the same `taxId` are rejected while an active + soft-deleted pair is accepted | Real Postgres, mirroring `prisma-user.repository.integration.spec.ts` |
| E2E | Full lifecycle; delete blocked → reassign → delete succeeds; soft-deleted user does not block; taxId reusable after soft-delete; all 3 conditional shapes; demotion leaves `maintenanceCompanyId` untouched; 401/403 on every route; non-admin rows still `[]`; **`body.code` asserted for each of the 3 new codes**; 404 on `PATCH /users/:id` still carries no `code` | `apps/api/test/maintenance-company.e2e-spec.ts` + users e2e additions |
| Regression (Decision 1) | Existing `users` and `community` e2e `body.code` assertions must pass **unchanged** after the builder extraction | No new tests — the guard already exists, which is why the migration is safe |
| Browser | Every UI success criterion, per CLAUDE.md "Verifying UI Changes" | `npm run dev` + `claude-in-chrome`; explicitly incl. the role-change show/hide and the blocked-delete message |

## Migration / Rollout

One additive migration: a new table, a nullable column, one Prisma-visible
index, one hand-written partial unique index, one hand-written FK. No existing
table is reshaped and **no data is backfilled** — the column's nullability is
what makes the migration safe against pre-existing maintenance-role users
(proposal Risks; `sdd-spec` owns the product rule for those rows, not the
schema).

Rollback = revert the branch, drop the FK, the column and the table. The
`coded-error.ts` extraction (Decision 1) reverts independently and carries no
schema state; if the chain is split, it should be its **own** PR precisely so
it can be reverted without touching the domain work.

## Open Questions

- [x] **Open Question 5 — error-code contract location.** Resolved by
      Decision 1: the pre-designed n=3 trigger fires on the **envelope
      builder** (extracted to `shared/presentation/http/coded-error.ts`, all
      three callers migrated); the per-module **unions stay local** for the
      third time on unchanged and now stronger evidence. Not a fourth
      deferral — the thing that was deferred twice has now been done.
- [ ] Confirm at apply time that `prisma migrate dev` does not emit a
      `DROP INDEX` for the hand-written partial index or a `DROP CONSTRAINT`
      for the FK; the `pg_indexes` integration test is the guard either way
      (same open item the `community` slice carried).
- [ ] **`contactInfo` nullability** is designed as `NOT NULL` / `min(1)`,
      mirroring `Community.address` and the success criterion's "create a
      company with `name`, `taxId` and `contactInfo`". If `sdd-spec` makes it
      optional, the delta is exactly: `TEXT` nullable, `.optional()` in the
      schema, `string | null` on the entity and DTO.
- [ ] **`sdd-spec` owns Open Question 2** (pre-existing maintenance-role users
      with no company). Decision 5's call site is designed for the proposal's
      "grandfather, leave alone" direction; the stricter answer costs one added
      condition in `UpdateUserUseCase` and nothing else.
- [ ] Confirm at apply time that Nest's `HttpException.createBody` emits an
      object body verbatim for **400** as it does for 409 (both existing
      builders verified this for `ConflictException` only). If it does not,
      `buildCodedError` sets the `error` field explicitly — which
      `STATUS_TEXT` already does — so the fallback is the same code path.
- [ ] **Accepted anomaly (Decision 6)**: a user created/updated concurrently
      with a company deletion can end up pointing at a soft-deleted company.
      Not closed here; revisit trigger is a **second** cross-aggregate
      invariant needing atomicity, at which point a shared `UnitOfWork` seam
      is introduced and this rule comes under it.

## Findings reported to the proposal

1. **`apps/api/src/modules/community/**` cannot stay untouched.** The n=3
   builder extraction requires migrating `CommunityController`'s private copy
   in the same PR, or the extraction produces exactly the state the prior
   design rejected. Zero behaviour change, guarded by existing e2e assertions.
   (Decision 1, deviation 2.)
2. **`TRANSACTION_CONFLICT` is dropped from `MaintenanceCompanyErrorCode`.**
   The proposal lists it in scope, but Decision 6 ships no `transactional()`
   seam in this module, so there is no `P2034` path and the code would be
   unreachable. `MaintenanceCompanyErrorCode` has two values, not three.
3. **A new coded 400 is added to `UserErrorCode`**
   (`MAINTENANCE_COMPANY_NOT_FOUND`). The proposal scoped codes to 409s only,
   following the two prior slices; Decision 5 explains why this one status is
   earned and why 404 was rejected.
