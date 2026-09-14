# Design: Manager Review-History Capability (`VIEW_ALL_REVIEWS`)

## Technical Approach

FR-008's fifth and final role-based visibility scope, at the same three seams
the prior slices built — one `ROLE_PERMISSIONS` entry, one role branch in
`ReviewHistoryAccessService`, two web role-list widenings — plus **one
genuinely new primitive**: the app's first *capability*, a grant that is
neither a permission (Layer 1, static table) nor a data-shaped scope (Layer 2,
resolves to an id or a list of ids), but a boolean privilege resolved per
request from the database.

This slice implements ADR-011 Decision 2's already-accepted signature
(`User.managerCapabilities: ManagerCapability[]`). Nothing here re-decides
that; what follows decides only *how*.

The whole design is shaped by one property: **an ungranted `MANAGER` must stay
byte-for-byte as inert as it is today**, and "no capability" must be
impossible to confuse with "forgot to check the capability". Every decision
below picks the shape whose failure direction is closed, not the shape that is
prettiest.

The slice's rules, each in exactly one place:

| Rule | Where it is enforced | How it is auditable |
|---|---|---|
| Caller holds `reviewSession:read` | `PermissionsGuard` + `@RequirePermission` (Layer 1) | `ROLE_PERMISSIONS.MANAGER` gains exactly one entry (Decision 4) |
| A `MANAGER` reads all history **iff** granted | `ManagerCapabilityChecker.hasManagerCapability`, fresh DB read, fail-closed (Decision 2) | One adapter, table-driven over all 5 roles × {granted, ungranted, soft-deleted} |
| An ungranted `MANAGER` reaches no query | The branch returns `[]`/`null` **before** any repository call (Decision 3) | Unit test asserts the repository mock is never touched |
| Capabilities are meaningful only for `MANAGER` | `manager-capability.policy.ts`, against the **resulting** state (Decision 5) | One pure module, both directions, no I/O |
| A revoke is never swallowed by PATCH semantics | Absent ⇒ unchanged, `[]` ⇒ revoke; the form always submits the array while the role is `MANAGER` (Decision 6) | E2E revoke → next request returns `[]` |
| The other four scopes are byte-unchanged | Their branches and their six methods are untouched | E2E five-role matrix, no sampling |
| No second unscoped read | `findCompleted{,ById}AcrossInstallation` reused verbatim (Decision 3) | The shipped call-site guard's file allowlist does **not** grow |

**Verified on `main` before designing, not assumed**: `ROLE_PERMISSIONS.MANAGER`
is `[]`; `ReviewHistoryAccessService` already gives `MANAGER` its **own**
`case` in both switches (returning `[]`/`null`), so this slice replaces a
branch rather than splitting a fallthrough. `User` has no capability column;
its only index is `@@index([maintenanceCompanyId])`; `Role` carries a standing
*"no silent `@default`"* comment. `UserCompanyScopeChecker` resolves through
`USER_REPOSITORY.findById`, which applies ADR-010's `deletedAt: null` filter
for free, inside an exhaustive `switch` with a runtime `satisfies never`
backstop. `UsersModule` binds **and exports** `COMPANY_SCOPE_CHECKER` and
imports nothing from any module; `ReviewSessionModule` already imports
`UsersModule`, so the new checker needs **no new module wiring direction**.
`PrismaUserRepository.updateById` passes `changes` straight into
`prisma.user.update({ data })` — an absent key is a genuine no-op and `[]` is
a genuine write, which is what makes Decision 6 work with no adapter logic.
`updateUserSchema`'s `.superRefine` fires **only when `role` is present in the
payload**. `MaintenanceCompanyZodValidationPipe` recognizes coded schema
issues via `params.maintenanceCompanyCode`. There is no `GET /users/:id`;
`UserResponseDto` is shared by create/list/update.

## Architecture Decisions

### Decision 1 — one enum member, an `@default([])` column, and no index (OQ5)

**Choice**: a Prisma enum with exactly one member, and a `NOT NULL` array
column defaulting to empty:

```prisma
// ADR-011 Decision 2's literal signature, with exactly ONE member declared
// (proposal non-goal: the other five capability names stay undeclared until
// their own slices, ADR-006). An array, not a boolean — the second
// capability must be an additive enum member, never a breaking rename.
enum ManagerCapability {
  VIEW_ALL_REVIEWS
}

model User {
  // ...
  // review-history-manager-capability/design.md Decision 1: `@default([])`
  // IS deliberate here, and does not contradict `Role`'s standing "no
  // silent @default" note above — that note exists because a default would
  // silently decide a PRIVILEGE-BEARING value for every future insert. This
  // default is the ZERO-privilege value, the only one that can never grant
  // anything, and it is the correct value for every existing row and every
  // future insert (a capability is always a deliberate second act, never a
  // creation-time field — POST /users cannot express it at all). NOT NULL
  // from the start: a Prisma scalar list cannot be null, and the default
  // covers every pre-existing row, so there is NO backfill and no
  // `SET NOT NULL` closing step. NOT indexed: this column is only ever read
  // through findById by primary key (Decision 2), never filtered on.
  managerCapabilities ManagerCapability[] @default([])
}
```

Hand-written migration
`20260914…_add_user_manager_capabilities/migration.sql`, following this
schema's convention (written directly, applied with `prisma migrate deploy`,
carrying the standing warning about `migrate dev` dropping the hand-written
FKs and partial indexes it cannot see):

```sql
CREATE TYPE "ManagerCapability" AS ENUM ('VIEW_ALL_REVIEWS');

ALTER TABLE "User" ADD COLUMN "managerCapabilities" "ManagerCapability"[]
  NOT NULL DEFAULT ARRAY[]::"ManagerCapability"[];
```

**Alternatives considered**: a nullable column with no default (rejected — a
Prisma scalar list cannot be null, and it would manufacture a three-valued
"null vs `[]` vs granted" distinction with no meaning); `Boolean canViewAllReviews`
(rejected by settled decision); a `UserCapability` join table (rejected by
ADR-011 itself); declaring all six ADR-011 member names (explicit non-goal —
five flags no code reads and no UI can act on).

**Domain type**: `users/domain/manager-capability.ts` declares a hand-written
`export type ManagerCapability = 'VIEW_ALL_REVIEWS';`, mirroring
`domain/role.ts` exactly (ADR-013 — the domain layer has zero Prisma
dependency; Prisma's generated `$Enums.ManagerCapability` is structurally
assignable, so `UserMapper` needs no cast). `UserProps.managerCapabilities`
is **optional** and the class field defaults to `[]`, mirroring
`maintenanceCompanyId`'s shipped precedent so no existing `new User({…})`
call site (seed, fixtures, use cases) breaks. **No constructor validation** —
same reason as `maintenanceCompanyId`: `UserMapper.toDomain` reconstitutes
every row, and validating here would turn `GET /users` into a 500.

### Decision 2 — the checker answers a **boolean**, but takes the capability as a parameter (OQ3 — the slice's biggest decision)

**Choice**: a Layer 2 port, sibling of `company-scope.checker.port.ts`:

```ts
// shared/application/authorization/manager-capability.checker.port.ts
export interface ManagerCapabilityChecker {
  // Does this actor CURRENTLY hold this manager capability? MANAGER is the
  // ONLY role that can ever answer true — the capability column is
  // meaningless for every other role by domain policy
  // (users/domain/manager-capability.policy.ts), and a stale value left on a
  // non-MANAGER row therefore grants nothing here either.
  //
  // Returns a BOOLEAN, not the capability list, DELIBERATELY (design.md
  // Decision 2): an empty array is TRUTHY, so a caller who writes
  // `if (caps)` instead of `if (caps.includes(X))` would fail OPEN — and
  // "an ungranted MANAGER gains access anyway" is this slice's top risk.
  // `false` cannot be truthy-mistaken. ADR-011's array SHAPE is honoured by
  // the `capability` PARAMETER, not by the return type: each future
  // capability is a new enum member and a new argument, with NO signature
  // change and no second checker.
  //
  // Same no-cache contract as CompanyScopeChecker and CommunityScopeChecker:
  // re-read on every call, so a SYSTEM_ADMIN unticking the toggle revokes
  // access on the caller's very next request, with no re-login. The
  // capability is NEVER in the JWT (ADR-011 2026-09-09 addendum) and `Actor`
  // stays `{userId, role}`.
  hasManagerCapability(
    userId: string,
    role: Role,
    capability: ManagerCapability,
  ): Promise<boolean>;
}

export const MANAGER_CAPABILITY_CHECKER = Symbol('MANAGER_CAPABILITY_CHECKER');
```

Adapter `users/infrastructure/authorization/user-manager-capability.checker.ts`,
a literal sibling of `user-company-scope.checker.ts`: exhaustive `switch` on
`Role` with the runtime `satisfies never` backstop, `MANAGER` resolving
through `USER_REPOSITORY.findById` (so a soft-deleted manager answers `false`
for free, with no extra check in the class), every other role returning
`false`. Bound **and exported** by `UsersModule` alongside
`COMPANY_SCOPE_CHECKER`; `ReviewSessionModule` already imports `UsersModule`,
so the DI graph stays acyclic with nothing new to reason about.

**The `MANAGER` branch does not trust its own `role` parameter.** The
`switch` dispatches on the `role` argument the caller passes (the
JWT-carried `actor.role`, stale for up to ADR-011's accepted ~2h token
lifetime), but even inside the `MANAGER` case the adapter MUST re-check
`user.role === 'MANAGER'` against the **freshly-read persisted row** from
`findById` before consulting `user.managerCapabilities`. This is
deliberately redundant with the caller's `role` argument: a user demoted
out of `MANAGER` mid-token-lifetime (whose JWT still claims
`role: 'MANAGER'`) MUST NOT keep effective `VIEW_ALL_REVIEWS` access merely
because a stale `managerCapabilities` array survived on their row. Decision
5's transactional requirement below aims to prevent that row-state from
ever existing, but this second, structural check on the persisted role
closes the same failure mode even if it does — it is checked, not assumed.
Concretely: `if (user.role !== 'MANAGER') return false;` runs **before**
the capability-array check, sourced from the row `findById` just read,
never from the `role` parameter.

**No try/catch around the `findById` call, mirroring `UserCompanyScopeChecker`
exactly.** The spec's fail-closed guarantee (*The Capability Is Resolved
Fresh Per Request and Fails Closed*) is "no review-session data MUST be
returned", satisfied by an empty/not-found result **or** by an error
response — not "must never throw". A genuine infrastructure fault (a
database connection error, for example) propagates as an error response,
same as it would for any other unhandled repository fault in this
codebase; the adapter does not catch and hide it to manufacture an empty
result. Only the domain outcomes — no row, a soft-deleted row, a
non-`MANAGER` role, an empty/missing capability list — resolve to `false`.

**Alternatives considered**: (a) `listManagerCapabilities(userId, role): Promise<ManagerCapability[]>`
— more faithful to ADR-011's literal shape, and rejected for the truthiness
trap quoted above; the faithfulness is recovered by the parameter at zero
risk. (b) a third branch on `CompanyScopeChecker` — rejected: that port
answers "which company", one question, and grafting a boolean onto it
corrupts it exactly as the company-scope design refused to graft company
scope onto `CommunityScopeChecker`. (c) a `review-session`-module-local port —
rejected: ADR-011 Decision 2 names five more capabilities, every one of which
will be consumed by a *different* module, so the next consumer of "does this
manager hold X" is already named in an accepted ADR; `users` owns the column
and must own the answer.

### Decision 3 — the `MANAGER` branch resolves the capability, then reuses the `SYSTEM_ADMIN` read verbatim

**Choice**: both switches in `ReviewHistoryAccessService` replace their
`MANAGER` case; nothing else in the service moves.

```ts
// NEW (review-history-manager-capability/design.md Decision 2/3): the role
// is no longer inert, but the ROLE alone still grants nothing — the
// capability is the scope predicate (ADR-011 Decision 2, first
// implementation). Fail closed BEFORE any repository call: an ungranted
// MANAGER reaches no query at all, observably identical to the `[]` this
// branch returned before this slice. A granted MANAGER gets the
// SYSTEM_ADMIN read VERBATIM — literally everything, including sessions of
// deactivated/soft-deleted communities and companies — because
// VIEW_ALL_REVIEWS means exactly that (proposal "The read is SYSTEM_ADMIN's
// read, verbatim"). NO new repository method: a parallel unscoped method
// would be a duplicate with a different name and a second chance to drift.
case 'MANAGER': {
  const granted = await this.capabilityChecker.hasManagerCapability(
    actor.userId,
    actor.role,
    'VIEW_ALL_REVIEWS',
  );
  if (!granted) {
    return [];
  }
  return this.repository.findCompletedAcrossInstallation();
}
```

`loadByRole` changes identically, to `return null` and
`findCompletedByIdAcrossInstallation(sessionId)`. The exhaustive `switch` and
its `satisfies never` backstop stay; the single
`if (!session) throw new ReviewSessionNotFoundError()` site in
`loadCompletedForActor` is untouched, so an ungranted manager, a draft, a
nonexistent id and a soft-deleted manager all still collapse to one
indistinguishable `404 REVIEW_SESSION_NOT_FOUND`.

**The easy-to-miss part, called out so `sdd-tasks` budgets for it**: the
admin-scope slice shipped a **call-site guard** source-scan test asserting the
two `…AcrossInstallation` names appear in production code only in the port,
both adapters and `review-history-access.service.ts`. That **file allowlist
does not grow** — both new call sites are in the same file, which is precisely
why reusing the pair is safe. But the guard test's intent comment **and** the
port's own intent comment currently read *"callable from exactly ONE place:
ReviewHistoryAccessService's SYSTEM_ADMIN branch"*, which this slice makes
false. Both must be amended to *"exactly two branches of that one service:
`SYSTEM_ADMIN` unconditionally, and `MANAGER` holding `VIEW_ALL_REVIEWS`"* —
still one method pair, still two enumerable call sites. Leaving the comment
stale would be worse than a failing test: it would tell the next slice that a
second caller is forbidden when the code already has two.

### Decision 4 — one permission, stated plainly

`ROLE_PERMISSIONS.MANAGER` becomes `['reviewSession:read']` — **one line**,
the role's first permission ever, ending the 2026-08-22 addendum's
four-inert-roles era — with a comment mirroring the two shipped ones: holding
this grants **nothing** on its own; *which* sessions it reaches is decided by
`ReviewHistoryAccessService` and the capability checker, never by this table.
No other permission of any family, no `/review-sessions*` **write** route
widened, and **no `user:grantCapability` permission** (settled decision —
granting reuses the existing `user:update` gate on `PATCH /users/:id`).

**Accepted, named consequence: two `/review-sessions*` GET routes widen
too.** `reviewSession:read` is checked by `@RequirePermission` on
`review-session.controller.ts`'s `GET /review-sessions` (the draft-resume
list) and `GET /review-sessions/:sessionId` (the performer-scoped read) —
routes owned by `review-session-management`, not `review-history`. Neither
route consults `ManagerCapabilityChecker`, because neither has ever needed
to consult any Layer-2 scope resolver for `MANAGER` before this slice. The
unconditional Layer-1 grant therefore moves **both** routes from 403 to
`200 []`/404 for `MANAGER`, granted or ungranted alike — this is a genuine,
new read-access change this slice makes, not covered by the
"observably indistinguishable" guarantee, which applies to the
review-history surface only. It is accepted as the necessary shape of an
unconditional permission grant (Decision 4's own "grants nothing on its
own" framing describes the *history* scope specifically, not every route
gated by the permission) rather than redesigned to avoid it — see the
`authorization` delta's *The Manager Becomes Operational…* requirement for
the binding statement and `review-session-management`'s own delta for the
route-level acknowledgement.

### Decision 5 — a domain policy module that both **asserts** and **resolves** (OQ4)

**Choice**: `users/domain/manager-capability.policy.ts`, a pure module with no
ports and no I/O, mirroring `maintenance-company-assignment.policy.ts`'s
placement and testability — but carrying **two** functions, because this
slice's two rules have different kinds:

```ts
// The NOT_ALLOWED direction — a REJECTION, mirroring assertCompanyMatchesRole.
// Throws InvalidManagerCapabilityAssignmentError when a request would leave a
// non-MANAGER user holding a capability it explicitly asked for.
export function assertCapabilitiesAllowedForRole(
  role: Role,
  managerCapabilities: readonly ManagerCapability[],
): void;

// The clear-on-role-change direction — a RESOLUTION, not an assertion, and
// that asymmetry is the point (settled decision 3: capabilities are CLEARED
// on a demotion, not rejected). Returns what updateById should WRITE:
//   resulting role MANAGER, prior role MANAGER, requested supplied
//     -> requested
//   resulting role MANAGER, prior role MANAGER, requested absent
//     -> undefined (unchanged)
//   resulting role MANAGER, prior role NOT MANAGER (a promotion INTO
//   MANAGER), requested supplied
//     -> requested
//   resulting role MANAGER, prior role NOT MANAGER (a promotion INTO
//   MANAGER), requested absent
//     -> []       (reset — a stale array MUST NOT silently re-grant on
//                  promotion; only an explicit, same-payload value carries
//                  a capability across a promotion)
//   resulting role NOT MANAGER + existing empty  -> undefined (nothing to do)
//   resulting role NOT MANAGER + existing set    -> []        (the clear)
// `undefined` preserves updateById's shipped "absent means not part of this
// PATCH" contract, so an unrelated edit never writes this column. `priorRole`
// is read from the SAME transactionally-fresh `existing` record as
// `resultingRole` is computed against (Decision 5's transactional
// requirement above) — never from a value read outside the transaction.
export function resolveManagerCapabilities(
  resultingRole: Role,
  priorRole: Role,
  requested: readonly ManagerCapability[] | undefined,
  existing: readonly ManagerCapability[],
): ManagerCapability[] | undefined;
```

**Trigger point**: `UpdateUserUseCase.execute`, immediately after
`resultingRole` is computed and beside the existing maintenance-company
block — `assertCapabilitiesAllowedForRole(resultingRole, changes.managerCapabilities ?? [])`
first, then `resolveManagerCapabilities(...)`, whose result is merged into the
`changes` object passed to `updateById`. `UpdateUserResult` gains
`managerCapabilities: ManagerCapability[]` computed as
`resolved ?? existing.managerCapabilities` (the **resulting** state, never
the raw resolution output — a plain email-only PATCH resolves `undefined`,
and reporting that literally would serialize the field as absent on the
one payload shape most likely to hit it), so the response always reports
the resulting truth.

**Every `updateById` call that can touch `role` and/or
`managerCapabilities` now runs inside the same `SERIALIZABLE`
transactional pattern already shipped for the demote-a-`SYSTEM_ADMIN`
path — not only that one path.** The reason is a race the demote-only
transaction does not close: two near-simultaneous admin PATCHes against
the same user — one changing `role` away from `MANAGER`, one granting
`managerCapabilities` — can each read a stale pre-race `existing` snapshot
outside a lock and commit in an order that leaves `role !== 'MANAGER'`
**and** a populated `managerCapabilities` on the same row, violating the
"cleared server-side regardless of payload shape" invariant (`specs/user-management/spec.md`'s
*Manager Capabilities Are Meaningful Only for a Manager*). The fix is
structural, not a narrower special case: `UpdateUserUseCase.execute` opens
a `SERIALIZABLE` transaction whenever the payload can affect `role` or
`managerCapabilities` (i.e. essentially always, since almost every PATCH
can), re-reads `existing` **inside** that transaction, computes
`resultingRole`, runs `assertCapabilitiesAllowedForRole` and
`resolveManagerCapabilities` against that freshly-read `existing`, and
writes `updateById` before committing — exactly the shape the
demote-a-`SYSTEM_ADMIN` path already uses, generalized to every write that
can touch either field. A losing transaction retries or surfaces the
existing concurrency-conflict error, never a silent lost update.

**A role transition *into* `MANAGER` always resets `managerCapabilities`
to `[]`, unless the same payload explicitly supplies a value.** This closes
the promotion side of the round-trip risk Decision 5's "deliberate
divergence" note below already names: without this rule, a
`MANAGER → SYSTEM_ADMIN → MANAGER` round trip that never wrote `[]` in
between (for instance the first, demotion PATCH clearing correctly, but a
**later, unrelated** promotion PATCH racing ahead of a still-in-flight
grant, or a data-repair PATCH that sets `role` alone) could leave a stale
array on the row and re-grant installation-wide read the moment the role
becomes `MANAGER` again with no explicit grant ever issued for *this*
promotion. `resolveManagerCapabilities`'s resulting-role-is-`MANAGER`
branch therefore reads: requested supplied ⇒ requested; requested absent
**and** the row's prior role was already `MANAGER` ⇒ unchanged; requested
absent **and** the row's prior role was not `MANAGER` (i.e. this write is
itself the promotion) ⇒ `[]`. The four-row table above is amended
accordingly.
**`CreateUserUseCase` is not guarded** and needs no policy call: `POST /users`
and `createUserSchema` are untouched, so the create path cannot *express* a
capability — the entity defaults to `[]` and a newly created `MANAGER` is
inert by construction.

**Alternatives considered**: inline `if`s in `UpdateUserUseCase` (rejected —
the guarantee that *"a non-`MANAGER` can never end a PATCH holding a
capability"* is this slice's Med-likelihood silent-privilege risk, and it
deserves a named, pure, table-testable home, not three conditionals buried in
a 70-line method); enforcing it in the web form only (rejected outright by
the proposal's Approach choice 4 — the form's clearing is an affordance, the
guarantee is server-side and payload-shape-independent).

**The deliberate divergence from `maintenanceCompanyId`, stated so nobody
"harmonizes" the two later**: a bare role change away from a maintenance role
deliberately **leaves** a stale `maintenanceCompanyId` untouched. A role
change away from `MANAGER` **clears** `managerCapabilities`. Both stale values
grant nothing while the user holds the other role — but a company id is an
identity fact the role *requires*, re-validated for liveness on any
re-promotion, whereas a capability is a privilege nobody re-consented to; a
`MANAGER → SYSTEM_ADMIN → MANAGER` round trip would silently re-grant
installation-wide read on the largest data set in the system.

### Decision 6 — PATCH semantics: absent ⇒ unchanged, `[]` ⇒ revoke, and the form always submits (OQ2)

**Choice**, stated explicitly because the silent failure mode is *a revoke
that does nothing*:

| Payload | Resulting role | Outcome |
|---|---|---|
| field absent | `MANAGER` | **unchanged** (shipped partial-PATCH contract) |
| `[]` | `MANAGER` | **explicit revoke** |
| `['VIEW_ALL_REVIEWS']` | `MANAGER` | grant |
| `['VIEW_ALL_REVIEWS']` | not `MANAGER` | **rejected**, `400 MANAGER_CAPABILITIES_NOT_ALLOWED` |
| field absent or `[]` | not `MANAGER` | cleared server-side (Decision 5), no error |

`updateUserSchema` gains
`managerCapabilities: z.array(managerCapabilitySchema).optional()` plus a
payload-decidable NOT_ALLOWED refinement shaped after
`applyMaintenanceCompanyNotAllowedRefinement`, with **one deliberate
difference, not a mechanical copy**: the new refinement (and
`assertCapabilitiesAllowedForRole` in Decision 5) MUST fire only when the
supplied array is **non-empty** (`managerCapabilities !== undefined &&
managerCapabilities.length > 0`), never merely on `!== undefined`. A bare
`!== undefined` check would incorrectly reject
`PATCH {role:'SYSTEM_ADMIN', managerCapabilities: []}` — but `[]` always
means "explicit revoke, always allowed" per the semantics table below and
the `user-management` delta's clear-on-role-change rule, regardless of the
resulting role. `managerCapabilitySchema`
(`z.enum(['VIEW_ALL_REVIEWS'])`) lives in a **new**
`packages/validation/src/users/manager-capability.schema.ts` rather than
joining `roleSchema` in `create-user.schema.ts` — which this rename does
touch (the File Changes table's `create-user.schema.ts` row), but only for
the tag-key rename's comment and occurrences; the proposal's actual
constraint, which this file change keeps, is that `createUserSchema`'s
**parse behaviour** must stay unchanged, not that the file itself is never
edited. `apps/web` imports the type from it, mirroring how it imports
`Role` (ADR-015 — one source of truth, zod stays inside the package).

**Two gates, one code, because one of them cannot see enough**: the schema's
`.superRefine` fires only when `role` is present in the payload, so
`PATCH {managerCapabilities:['VIEW_ALL_REVIEWS']}` against a current
`SYSTEM_ADMIN` is **not** payload-decidable — exactly the asymmetry
`updateUserSchema`'s header comment already documents for the REQUIRED
direction. The resulting-state check in `UpdateUserUseCase` (Decision 5) is
the sole authority for that case. Both surfaces raise the same
`MANAGER_CAPABILITIES_NOT_ALLOWED` code so the client needs one mapping, not
two.

**One small generalization, flagged rather than smuggled**:
`MaintenanceCompanyZodValidationPipe` tags coded schema issues via
`params.maintenanceCompanyCode`. Reusing that key for a capability error
would make the tag name a lie. Rename the tag to `userErrorCode` and the pipe
to `UserCodedZodValidationPipe` (same folder, same behaviour, two call sites
in `UsersController`, plus its spec and the two refinement helpers) — a purely
mechanical rename, justified now that the mechanism has its second consumer.
Rejected alternative: a second parallel pipe, which would mean two pipes
racing to tag one payload.

**Precedence when a payload violates both tagged refinements at once.**
The pipe returns the **first** tagged issue found in `.superRefine`'s
issue array, so with two refinements now sharing the `userErrorCode` tag
mechanism, a payload that is simultaneously rejectable by the
maintenance-company refinement and the new capability refinement has an
otherwise-unspecified winner depending on `superRefine` call order.
Fixed order, stated explicitly: the maintenance-company refinement runs
**first** in `updateUserSchema`'s `.superRefine` chain, so it wins
whenever both fire — this MUST be pinned by a unit test on
`updateUserSchema` asserting the code returned for a payload crafted to
violate both simultaneously.

### Decision 7 — web: one conditional checkbox, and the route gate stays role-only

**`UserEditPage.tsx`** gains the exact structural shape `showCompanySelector`
/ `handleRoleChange` already uses:

- state `const [canViewAllReviews, setCanViewAllReviews] = useState(false)` —
  a **boolean**, not an array, because the UI is one checkbox; the array is a
  submit-time projection. Prefilled from
  `(found.managerCapabilities ?? []).includes('VIEW_ALL_REVIEWS')` in the
  existing `listUsers()` effect (OQ1 — no new fetch, no `GET /users/:id`).
  The `?? []` guard is deliberate, not defensive filler: `apiFetch`'s
  response is not runtime-validated, so a version-skewed API response (a
  rolling deploy, a stale fixture, mixed dev/prod) could omit the field,
  and an unguarded `.includes()` on `undefined` would throw inside the
  effect — every other optional field on this page (`maintenanceCompanyId`,
  for instance) is read with an equivalent defensive default.
- `handleRoleChange` sets it to `false` when `nextRole !== 'MANAGER'`, beside
  the existing `setCompanyId('')`. **Consequence, chosen deliberately, not
  accidental**: if the admin changes the role away from `MANAGER` and back
  to `MANAGER` within the same unsaved form session, the toggle resets to
  unchecked (it does not remember the pre-change value), so saving from
  that state submits `[]` — silently revoking a grant the admin never
  explicitly touched. This mirrors the server-side clear-on-role-change
  rule (Decision 5) applied at form-session granularity rather than
  request granularity, and is accepted as the simpler, safer default
  (never re-showing a stale toggle state) over remembering and
  re-offering a value across an intermediate role change.
- `const showCapabilityToggle = role === 'MANAGER'`, gating a
  `<input type="checkbox" data-testid="user-edit-view-all-reviews">` with an
  i18n label.
- submit: `managerCapabilities: showCapabilityToggle ? (canViewAllReviews ? ['VIEW_ALL_REVIEWS'] : []) : undefined`
  — **always** submits the array while the role is `MANAGER`, which is what
  makes the revoke arrive as `[]` rather than as an absent field (Decision 6),
  and never carries a stale value across a role change.

**Route gating stays `role === 'MANAGER'` only**, per the settled decision:
`MANAGER` is added to both `/review-history*` `ProtectedRoute allowedRoles`
(4 → 5) and to `HealthPage.tsx`'s `REVIEW_HISTORY_ROLES`, gated on the role
alone — **not** on the capability. `/auth/me` is **not** extended, no
capability reaches any client-side authorization decision, and an ungranted
manager reaches the page and sees the already-shipped empty state. The server
stays the sole authority. `ReviewHistoryPage` / `ReviewHistoryDetailPage` and
`UserCreatePage.tsx` are untouched.

**New i18n keys** (real `en`/`es`/`ca`, parity test-enforced):
`users.edit.capabilitiesLabel`, `users.edit.viewAllReviewsLabel`,
`users.error.managerCapabilitiesNotAllowed`.

## Data Flow

    GET /review-history       (AuthenticatedGuard -> PermissionsGuard: reviewSession:read)
      -> ReviewHistoryAccessService.listForActor(actor)
           switch(role)  [exhaustive, `satisfies never`, scope resolved INSIDE each branch]
             MAINTENANCE_TECHNICIAN      -> findCompletedForPerformer(userId)          [unchanged]
             COMMUNITY_REPRESENTATIVE    -> listAssignedCommunityIds -> [] ==> []      [unchanged]
             MAINTENANCE_COMPANY_MANAGER -> resolveCompanyScope -> null ==> []         [unchanged]
             SYSTEM_ADMIN                -> findCompletedAcrossInstallation()          [unchanged]
             MANAGER                     -> hasManagerCapability(id, role,
                                              'VIEW_ALL_REVIEWS')    [NEW, fresh DB read]
                                              false ==> []            (no query at all)
                                              true  ==> findCompletedAcrossInstallation()
                                                        (the SAME method, 2nd call site)
      -> communityRepository.findById   once per distinct community in the RESULT
      -> userDirectory.findEmailsByIds  ONE query for all distinct performers
      -> rows, completedAt DESC, id DESC

    PATCH /users/:id          (AuthenticatedGuard -> PermissionsGuard: user:update)
      -> UserCodedZodValidationPipe(updateUserSchema)
           role present + non-MANAGER + capabilities set ==> 400 MANAGER_CAPABILITIES_NOT_ALLOWED
      -> UpdateUserUseCase
           resultingRole = changes.role ?? existing.role
           assertCapabilitiesAllowedForRole(resultingRole, changes.managerCapabilities ?? [])
             ==> 400 MANAGER_CAPABILITIES_NOT_ALLOWED   (the non-payload-decidable case)
           resolveManagerCapabilities(resultingRole, existing.role,
                                      changes.managerCapabilities,
                                      existing.managerCapabilities)
             undefined ==> key omitted from updateById   (column untouched)
             []        ==> explicit revoke / clear-on-demotion / reset-on-promotion
      -> updateById  ->  UserResponseDto { …, managerCapabilities }

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `ManagerCapability` enum (one member) + `User.managerCapabilities … @default([])` (Decision 1); **no index** |
| `apps/api/prisma/migrations/20260914…_add_user_manager_capabilities/migration.sql` | Create | `CREATE TYPE` + additive `NOT NULL DEFAULT ARRAY[]` column; **no backfill** |
| `.../users/domain/manager-capability.ts` | Create | Hand-written `ManagerCapability` union (ADR-013), mirroring `domain/role.ts` |
| `.../users/domain/manager-capability.policy.ts` | Create | `assertCapabilitiesAllowedForRole` + `resolveManagerCapabilities` (Decision 5) |
| `.../users/domain/errors/invalid-manager-capability-assignment.error.ts` | Create | One cause, NOT_ALLOWED only |
| `.../users/domain/user.entity.ts` | Modify | Optional prop, field defaults to `[]`, **no constructor validation** |
| `.../users/infrastructure/persistence/user.mapper.ts` | Modify | Map both directions; no cast needed |
| `.../users/application/ports/user.repository.port.ts` | Modify | `updateById` changes gains `managerCapabilities?: ManagerCapability[]` (absent = not part of this PATCH) |
| `.../users/infrastructure/persistence/prisma-user.repository.ts` | **Unchanged** | `updateById` already spreads `changes` into `data` — type-only widening |
| `.../users/application/use-cases/testing/in-memory-user.repository.ts` | Modify | Fake parity for the new field |
| `apps/api/src/shared/application/authorization/manager-capability.checker.port.ts` | Create | Layer 2 port + `MANAGER_CAPABILITY_CHECKER` (Decision 2) |
| `.../users/infrastructure/authorization/user-manager-capability.checker.ts` | Create | Exhaustive fail-closed adapter, sibling of `user-company-scope.checker.ts` |
| `.../users/users.module.ts` | Modify | Bind **and export** `MANAGER_CAPABILITY_CHECKER` |
| `.../users/application/use-cases/update-user.use-case.ts` | Modify | Policy call + `changes` merge + `managerCapabilities` on the result, computed as `resolved ?? existing.managerCapabilities`; the `SERIALIZABLE` transactional pattern (previously demote-`SYSTEM_ADMIN`-only) now wraps **every** write that can touch `role` and/or `managerCapabilities`, re-reading `existing` inside the transaction (Decision 5) |
| `.../users/application/use-cases/{create,list}-user.use-case.ts` | Modify | Carry the entity's value into `UserResponseDto` (`[]` by construction on create) |
| `.../users/presentation/dto/user-response.dto.ts` | Modify | `managerCapabilities!: ManagerCapability[]` (OQ1 — shared by list/create/update) |
| `.../users/presentation/users.controller.ts` | Modify | `@ApiBody` property + 400 description; pipe rename call sites; new `mapMutationError` branch (sibling of the existing `mapMaintenanceCompanyError` pattern) mapping `InvalidManagerCapabilityAssignmentError` to `400 MANAGER_CAPABILITIES_NOT_ALLOWED` — without it, the non-payload-decidable case (capability set with no `role` in the payload, resulting role non-`MANAGER`) would surface as an unmapped `500` |
| `.../users/presentation/pipes/user-coded-zod-validation.pipe.ts` | Rename | From `maintenance-company-zod-validation.pipe.ts`; tag key `userErrorCode` (Decision 6) |
| `.../users/presentation/pipes/user-coded-zod-validation.pipe.spec.ts` | Rename | From `maintenance-company-zod-validation.pipe.spec.ts`, following the pipe file's rename |
| `apps/api/src/shared/presentation/pipes/zod-validation.pipe.ts` | Modify | **Comment only**: the base pipe's docblock names the old `MaintenanceCompanyZodValidationPipe` subclass; updated to `UserCodedZodValidationPipe` |
| `.../users/presentation/user-error-code.ts` | Modify | `+ 'MANAGER_CAPABILITIES_NOT_ALLOWED'` |
| `packages/validation/src/users/manager-capability.schema.ts` | Create | `managerCapabilitySchema` + `applyManagerCapabilitiesNotAllowedRefinement` |
| `packages/validation/src/index.ts` | Modify | Re-export the new schema module — an explicit-export barrel, not a glob; without this row the new schema is not importable from `apps/web` or `apps/api` |
| `packages/validation/src/users/update-user.schema.ts` | Modify | Optional field + the refinement |
| `packages/validation/src/users/create-user.schema.ts` | Modify | Not tag-key-only: **two** `params.maintenanceCompanyCode`-tag occurrences rename to `userErrorCode`, plus a prose comment naming `MaintenanceCompanyZodValidationPipe` updates to `UserCodedZodValidationPipe`; `createUserSchema`'s parse behaviour itself **unchanged** |
| `apps/api/test/users.e2e-spec.ts:592-593` | Modify | **Comment only**: names both the old `MaintenanceCompanyZodValidationPipe` class and the old tag key `params.maintenanceCompanyCode` — updated alongside the rename |
| `.../review-session/application/services/review-history-access.service.ts` | Modify | `MANAGER` branch in both switches (Decision 3) |
| `.../review-session/application/ports/review-session.repository.port.ts` | Modify | **Comment only**: the `…AcrossInstallation` pair's "exactly ONE call site" note becomes two (Decision 3) |
| `.../review-session/application/services/session-access.service.ts` | **Unchanged** | Write-path gate, byte-untouched |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `MANAGER: ['reviewSession:read']` — one line, nothing else (Decision 4) |
| `.../auth/infrastructure/authorization/role-permission.checker.spec.ts` | Modify | **Structural, not one line**: `INERT_NON_ADMIN_ROLES: Role[] = ['MANAGER']` — emptying this array makes its `it.each(...)` error (`jest-each` errors on an empty table, it does not skip), so the array and its `it.each` block must be removed or restructured, not left empty; the `NON_ADMIN_ROLES`-driven matrix's `denies MANAGER on reviewSession:read` case now asserts the opposite of the truth and must be inverted; and the comment citing the now-obsolete "MANAGER stays mapped to no permissions" framing must be updated |
| `apps/web/src/api/users.ts` | Modify | `managerCapabilities` on `User`/`UpdateUserPayload`; new error code |
| `apps/web/src/users/error-messages.ts` | Modify | Code → i18n key row |
| `apps/web/src/pages/UserEditPage.tsx` (+ test) | Modify | Role-conditional capability checkbox (Decision 7) |
| `apps/web/src/pages/UserCreatePage.tsx` | **Unchanged** | Settled decision — granting is edit-only |
| `apps/web/src/App.tsx`, `auth/ProtectedRoute.test.tsx` | Modify | `/review-history*` `allowedRoles` 4 → 5; `/review-sessions*` untouched |
| `apps/web/src/pages/HealthPage.tsx` (+ test) | Modify | `MANAGER` added to `REVIEW_HISTORY_ROLES` |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Three new keys, real translations |
| `.../users/infrastructure/persistence/prisma-user.repository.integration.spec.ts` | Modify | Column round-trip + default-empty assertions |
| `apps/api/test/{users,review-history}.e2e-spec.ts` | Modify | Grant/revoke round trip; five-role matrix |
| `openspec/specs/{review-history,review-history-ui,authorization,user-management,user-admin-ui,review-session-management}/spec.md` | Modify | Delta specs (owned by `sdd-spec`) |
| `docs/adr/ADR-011-*.md`, `docs/requirements/functional-requirements.md` | Modify | Addendum + FR-008 status |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (api) | `UserManagerCapabilityChecker` | Table-driven over all 5 roles × {no capability, `VIEW_ALL_REVIEWS`, soft-deleted user}: only `MANAGER` + granted + live is `true`; a capability left on a non-`MANAGER` row is `false`; `findById` mock asserted called on **every** invocation (no cache); a `MANAGER`-shaped `role` argument with a persisted row whose `role` is no longer `MANAGER` resolves `false` (the structural stale-JWT-role guard) |
| Unit (api) | `role-permission.checker.spec.ts` (existing suite, restructured — not a one-line diff) | `INERT_NON_ADMIN_ROLES` array and its `it.each` block removed/restructured (an emptied array would make `jest-each` error, not skip); the `NON_ADMIN_ROLES` matrix's `denies MANAGER on reviewSession:read` case inverted to assert the grant; the stale "MANAGER stays mapped to no permissions" comment updated |
| Unit (api) | `manager-capability.policy` | `assertCapabilitiesAllowedForRole`: throws for every non-`MANAGER` role with a non-empty array, never for `[]`. `resolveManagerCapabilities`: all four rows of Decision 5's table, including the `undefined` no-op cases |
| Unit (api) | `ReviewHistoryAccessService` `MANAGER` dispatch | Ungranted ⇒ `[]`/`null` **and** the repository mock asserted `not.toHaveBeenCalled()`; granted ⇒ reaches `findCompleted{,ById}AcrossInstallation`; neither scope checker is ever touched for this role |
| Unit (api) | The other four branches | Byte-identical behaviour assertions re-run unchanged after the branch replacement |
| Unit (api) | `UpdateUserUseCase` | Grant, revoke via `[]`, absent-field no-op, clear on `MANAGER` → other role, reject capability for a non-`MANAGER` **resulting** role with no `role` in the payload, and the `MANAGER → other → MANAGER` round trip ending with `[]` |
| Unit (api) | `updateUserSchema` | Accepts `[]` and `['VIEW_ALL_REVIEWS']`; rejects an unknown member; NOT_ALLOWED refinement fires only when `role` is present and non-`MANAGER`; `createUserSchema` parse results **unchanged** |
| Unit (api) | In-memory fake parity | `updateById` with the key absent leaves the value; with `[]` clears it |
| Integration (api) | Migration, real Postgres | `ManagerCapability` type exists with **exactly one** label; column is `NOT NULL` with an empty-array default; every pre-existing row reads `[]`; `User_maintenanceCompanyId_idx` and every hand-written FK/partial index elsewhere in the schema intact; pre-migration state simulated via `ALTER TABLE "User" DROP COLUMN "managerCapabilities"` inside a transaction, per the `review-session` migration-spec precedent (`review-session-migration.integration.spec.ts`) — this repo has no `down.sql` convention and Prisma Migrate has no down step |
| Integration (api) | `PrismaUserRepository`, real Postgres | Round-trips `[]` ⇄ `['VIEW_ALL_REVIEWS']`; a `findById` on a soft-deleted granted manager returns `null` |
| Integration (api) | Call-site guard (shipped test) | The `…AcrossInstallation` file allowlist is **unchanged** — the second call site is in the already-allowed service; the stale "exactly ONE call site" comments are updated (Decision 3) |
| E2E (api) | Grant → visible | `SYSTEM_ADMIN` PATCHes the capability; the manager's very next `GET /review-history` returns **every** seeded completed session across ≥2 companies and ≥2 communities, including one whose community and one whose company is deactivated/soft-deleted; drill-in by id succeeds; a draft and a nonexistent id still `404 REVIEW_SESSION_NOT_FOUND` |
| E2E (api) | Revoke → invisible, **no re-login** | PATCH `managerCapabilities: []`, then reuse the **same** session/cookie: the next list returns `[]` and every by-id returns 404 |
| E2E (api) | Role-change clears | `MANAGER` (granted) → `SYSTEM_ADMIN` → `MANAGER`: the final `GET /review-history` returns `[]` and the response DTO reports `[]`; a PATCH setting the capability for a non-`MANAGER` resulting role returns `400` with `code: MANAGER_CAPABILITIES_NOT_ALLOWED` |
| E2E (api) | **Five-role regression matrix, no sampling** | The ungranted `MANAGER` gets `[]` and 404 on every route; the other four scopes byte-unchanged (technician own-only surviving assignment deactivation, representative active-communities only, company manager own-company only and fail-closed on a null company, admin everything); a soft-deleted granted manager sees nothing |
| E2E (api) | **Two shipped guards must be INVERTED, not left alone** | `apps/api/test/review-history.e2e-spec.ts:1004`'s `'MANAGER gets 403 on both the list and the detail route'` must become `'a granted MANAGER gets 200 []/2xx and an ungranted MANAGER gets 200 []/404'`-shaped (still asserting the ungranted case, but no longer asserting a blanket 403 for the role — fail-closed means `[]`/404, never 403); and `apps/api/test/review-history.e2e-spec.ts:1762`'s `'a caller with a set company but no reviewSession:read gets 403 on every history endpoint (MANAGER variant)'` has no substitute role once all five roles hold `reviewSession:read` and MUST be removed/replaced by the unit-level structural assertion in `specs/authorization/spec.md`'s re-expressed scenario, not patched to use a different role |
| E2E (api) | Scope guards | `MANAGER` holds `reviewSession:read` and **no** other permission of any family; 403 on every `/review-sessions*` write route; the enum has exactly one member and none of ADR-011's other five names appears in `apps/**` or `packages/**`; `managerCapabilities` in no JWT/token payload; no filter/sort/page parameter accepted; a newly created `MANAGER` holds `[]` and `POST /users` rejects the field |
| Unit (web) | `UserEditPage` | Toggle renders **only** for `role === 'MANAGER'`; prefilled from the fetched row; disappears and is not submitted after a role change away; submits `['VIEW_ALL_REVIEWS']` when ticked and `[]` when unticked (the revoke path, asserted on the request body); the NOT_ALLOWED code maps to its i18n key |
| Unit (web) | `UserCreatePage` | Existing tests pass **unmodified** — no toggle, no field |
| Unit (web) | Routes / `HealthPage` | `ProtectedRoute` family: all five roles reach `/review-history*`, `MANAGER` still blocked from `/review-sessions*`. **Note for `sdd-tasks`**: the existing manager and admin link-enumeration tests (`HealthPage.test.tsx:137-153`, `155-170`) stay **passing and unmodified**; add a `MANAGER` **sibling** asserting `hrefs` equals exactly `['/review-history']` — rendered for the **ungranted** manager too, since the gate is role-only |
| Unit (web) | i18n | `locales.test.ts` parity for the three new keys |
| Browser | CLAUDE.md | Real dev server, **both** manager states: grant via the edit page → reload persists → installation-wide list + drill-in incl. a deactivated-community session; untick → next request empty with **no** re-login; a second, never-granted `MANAGER` logs in, follows the link from `/`, and sees the normal empty state; regression pass for the other four roles |

## Migration / Rollout

One additive migration (Decision 1), applied with `prisma migrate deploy`, no
backfill and no downtime; no code reads the column until the checker ships.
Delivery follows the proposal's `stacked-to-main` sketch (CLAUDE.md), branches
`review-history-manager-capability/<NN>-<slug>`, titles
`feat(review-history-manager-capability): PR N/M — …`. The proposal's
**4-PR** estimate is the right shape and this design does not shrink it — the
pipe rename and the DTO/use-case fan-out land in PRs 1 and 3. `sdd-tasks` owns
the final split and the binding 400-line forecast; chained PRs are clearly
needed.

## Rollback

`git revert` the branch. **Recommended default: revert the code, keep the
column** — once the checker and the `ROLE_PERMISSIONS` entry are gone a
populated `managerCapabilities` grants nothing, and the grants are re-creatable
in seconds through the UI with no derived history to lose (the defining
difference from the company-scope slice's lossy backfill). Dropping the column
additionally requires dropping the `ManagerCapability` type. Spec amendments,
the ADR-011 addendum and the FR-008 status must revert **with** the code, or
the specs will claim a grant the code no longer honours and — worse — will
have deleted the guards that keep `MANAGER` inert. Each PR reverts
independently.

## Open Questions

- [x] **OQ1 — how the edit form prefills the toggle**: resolved, Decision 7 +
      `UserResponseDto` (Decision 6 file list). `managerCapabilities` joins
      `maintenanceCompanyId` on the shared response DTO, always an array,
      `[]` for every non-manager; the page reads it from the existing
      `listUsers()` call. No `GET /users/:id`, no `/auth/me` change.
- [x] **OQ2 — absent field vs. empty array on PATCH**: resolved, Decision 6.
      Absent ⇒ unchanged; `[]` ⇒ explicit revoke; the web form always submits
      the array while the role is `MANAGER`; and the clear-on-demotion path
      (Decision 5) does not depend on the payload at all, so a revoke cannot
      be swallowed by any client's shape.
- [x] **OQ3 — where the checker lives and what it returns**: resolved,
      Decision 2. Port in `shared/application/authorization/`, adapter in
      `users/infrastructure/authorization/`, and it returns a **boolean**
      parameterized by the capability — the list's ADR-011 faithfulness moves
      to the parameter, and the truthy-empty-array fail-open trap disappears.
- [x] **OQ4 — domain policy vs. use-case logic**: resolved, Decision 5. A
      policy module, with the noted departure from
      `maintenance-company-assignment.policy.ts`'s assert-only shape: it also
      **resolves** the value to write, because the settled rule is "clear",
      not "reject".
- [x] **OQ5 — migration default for the enum-array column**: resolved,
      Decision 1. Explicit `@default([])` + `NOT NULL DEFAULT ARRAY[]::"ManagerCapability"[]`,
      stated rather than left to Prisma's generated SQL, with the reason the
      `Role` "no silent `@default`" note does not apply (this default is the
      zero-privilege value).
- [ ] **Watch item, not a blocker — a second per-request authorization read
      on the same endpoint.** A granted `MANAGER`'s `/review-history` request
      now costs one indexed primary-key lookup **plus** the installation-wide
      read that the admin-scope slice already flagged as the largest,
      unfiltered list in the app. The lookup is trivial; the list is the
      known issue, and the app-wide filtering initiative remains the named
      remedy. Measure it during browser verification at realistic seeded
      volume rather than assuming it. Nothing to build in this slice.
- [ ] **Watch item, not a blocker — the second capability will force a UI
      decision this slice does not make.** `UserEditPage`'s single checkbox is
      the right shape for one member (ADR-006); the next `ManagerCapability`
      slice must decide whether that becomes a checkbox group driven by
      `managerCapabilitySchema.options`. Named here so it is a deliberate
      choice then, not an accidental copy-paste.
