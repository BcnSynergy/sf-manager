# Design: Community + Representative/Technician Assignments

## Technical Approach

Mirror `apps/api/src/modules/users/**` layer-for-layer under
`apps/api/src/modules/community/**` (proposal, Approach). The slice adds one
aggregate root (`Community`) and **two** sibling assignment concepts kept
physically separate, because their only real difference — the
one-active-representative-per-community invariant — is exactly what a shared
table would blur. Concurrency reuses the `users` seam
(`transactional()` + Postgres `SERIALIZABLE` + `TransactionConflictError`,
see `prisma-user.repository.ts:140-165`), hardened with a partial unique
index.

## Architecture Decisions

### Decision 1: Two tables, not one discriminated table

| Option | Tradeoff | Verdict |
|---|---|---|
| `CommunityRepresentative` + `CommunityTechnician` | ~40 lines of near-duplicate mapper/adapter | **Chosen** |
| One `CommunityAssignment` + `type` discriminator | One adapter, but the exclusivity index becomes `WHERE type='REPRESENTATIVE' AND ...` — a constraint that silently guards half the table; every query needs a `type` predicate that is easy to forget; the port threads `type` through every method as a runtime branch | Rejected |

**Rationale**: the proposal already settled the domain language as "two
distinct concepts, not one generic membership", and its own risk table warns
that a premature generic abstraction *hides the exclusivity asymmetry*. The
asymmetry is structural, not incidental: only the representative port needs
`transactional()` at all. Two tables let the type system carry that
difference instead of a discriminator string. Duplication is data shape, not
behaviour; revisit only on a third assignment concept (rule of three,
ADR-006).

### Decision 2: Transactional seam **and** a DB partial unique index

Both, not either.

- **Primary**: `CommunityRepresentativeRepository.transactional()` wrapping
  read-incumbent → deactivate-incumbent → activate-target at `SERIALIZABLE`.
  Prisma `P2034` → `TransactionConflictError` → HTTP 409, copied verbatim
  from `PrismaUserRepository.transactional`.
- **Backstop**: `CREATE UNIQUE INDEX "CommunityRepresentative_one_active_per_community"
  ON "CommunityRepresentative"("communityId") WHERE "deactivatedAt" IS NULL;`

**Rationale**: `SERIALIZABLE` only protects callers that go *through* the
seam. The index also covers seeds, raw SQL, and a future use case that
forgets to wrap. Under normal operation it never fires, so `P2002` on that
index name maps to the same `TransactionConflictError`/409 rather than a new
error type.

**Gotcha**: Prisma's schema DSL has no `where` argument on `@@unique`, so the
index is hand-written into the migration SQL (precedent: the hand-edited
`20260822100000_add_user_role/migration.sql`). It is therefore invisible to
`schema.prisma`, and a later `prisma migrate dev` could generate a `DROP
INDEX`. Mitigation: a comment in the migration **plus** an integration test
asserting the index still exists in `pg_indexes`.

**Errors**: `community/domain/errors/` declares its own
`TransactionConflictError`. Each module owns its errors (as `users` does);
this avoids a cross-module domain import and a new `shared/domain/` layer for
five lines.

### Decision 3: `deactivatedAt: DateTime?`, and **no** `deletedAt` on assignments

ADR-010 explicitly separates domain state ("this rep stopped serving") from
administrative correction ("this record shouldn't exist"), and rejects
conflating the two. Deactivation is domain state, so it cannot reuse
`deletedAt` — that would hide the row behind
`SoftDeletableRepository.withDefaultFilter`, while the proposal requires
deactivated rows to stay listable and reactivatable.

Timestamp over boolean: ADR-010's own "the *when* for free", and `IS NULL` is
the predicate the partial index needs. Reactivation is `deactivatedAt = NULL`,
overwriting the prior timestamp — accepted, since assignment history is an
explicit non-goal.

The assignment tables get **no** `deletedAt` and their adapters do **not**
extend `SoftDeletableRepository`: this slice exposes no assignment-delete
endpoint, so the column would be unused scaffolding (ADR-006). `deletedAt`
lives on `Community` only.

### Decision 4: Routes — sub-resources keyed by `userId`

| Method | Path | Result |
|---|---|---|
| `POST`/`GET` | `/communities` | 201 / 200 |
| `PATCH`/`DELETE` | `/communities/:id` | 200 / 204 (soft delete) |
| `GET` | `/communities/:id/representatives` | active **and** deactivated |
| `POST` | `/communities/:id/representatives` | body `{ userId }` → 201, auto-deactivates incumbent, may carry `warning` |
| `DELETE` | `/communities/:id/representatives/:userId` | 204 — deactivate |
| `POST` | `/communities/:id/representatives/:userId/reactivate` | 200, re-applies exclusivity, may carry `warning` |
| — | same four shapes under `/communities/:id/technicians` | no warning, no exclusivity |

`(communityId, userId)` is the caller-facing identity — one row per pair
(`@@unique([communityId, userId])`), so the surrogate id never leaves the
adapter. `POST` to a collection where the pair already exists (active *or*
deactivated) → 409 `AssignmentAlreadyExistsError` pointing at the reactivate
route. `DELETE` = deactivate mirrors `DELETE /users/:id` = soft delete.
Rejected: `PATCH .../:userId { active }` — hides the exclusivity side effect
behind a boolean and forces one payload shape onto two different outcomes.

### Decision 5: `locale` and `address` are plain fields, not Value Objects

The `users` precedent is precise: `email` stayed a plain `string` on
`User` even though it has a real format rule, because the rule is fully
expressible in Zod and shared with the web (ADR-015). Only `PlainPassword`
became a VO, and only because it carries *behaviour* beyond validation
(`toString()` redaction over a `#raw` field). Neither `locale` (closed enum,
ADR-007; its i18n behaviour is out of scope) nor `address` (free text this
slice never parses) has behaviour. ADR-006's addendum: a field becomes a VO
when the slice needs it — this one does not.

`locale` becomes a Prisma `enum Locale { en es ca }`, following `Role`'s
closed-set precedent; `communitySchema` in `packages/validation` is the
shared source of truth.

## Where the settled policies live in code

| Policy (already decided) | Location |
|---|---|
| Eligibility gate | `domain/assignment-eligibility.policy.ts` → `assertEligibleFor(role, kind)`, mirroring `last-admin.policy.ts`. Called by all four add/reactivate use cases after `UserRepository.findById(userId)` (via the already-exported `USER_REPOSITORY`). Throws `IneligibleRoleError` → **409** (well-formed request, conflicting target state — same class as `LastSystemAdminError`) |
| Reject reactivation for a soft-deleted user | **No new code.** `UserRepository.findById` applies the ADR-010 `deletedAt: null` default filter, so a soft-deleted user returns `null` → `UserNotFoundError` → 404 |
| Accepted eligibility drift | Enforced by *absence*: `UpdateUserUseCase` is untouched and nothing in `users` calls into `community`. Locked in by an E2E asserting the assignment survives a role change |
| Multi-community warning | `ActivateRepresentativeUseCase`, inside the same transaction, after the write: `countActiveByUser(userId) > 1` → `warning: { code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES', communityCount }` on the 201/200 body |
| Representative deactivation on community soft-delete | `SoftDeleteCommunityUseCase` (application layer), after the community is soft-deleted: `representativeRepo.findActiveByCommunity(id)` → if none, done. Else `countActiveByUser(userId) > 1` (same query the multi-community warning already uses) → if true, no-op (still active elsewhere); if false, `setDeactivatedAt(communityId, userId, now)` — the same deactivation call `DELETE .../representatives/:userId` already makes. No new port method. Technicians are never queried or touched by this use case |

## Data Flow — Community Soft-Delete Cascade to Representative

    AuthenticatedGuard → PermissionsGuard('community:delete') → Controller
         │ SoftDeleteCommunityUseCase
         ▼ 1. communityRepo.softDelete(id)                     → 404 CommunityNotFoundError if missing
         ▼ 2. representativeRepo.findActiveByCommunity(id)
             ├ null → done, no representative side effect
             └ found { userId } →
                 3. representativeRepo.countActiveByUser(userId)
                     ├ > 1 (active elsewhere)  → no-op, assignment left active
                     └ == 1 (active only here) → representativeRepo.setDeactivatedAt(id, userId, now)
         (technician repositories are never called by this use case)

**Rationale**: `countActiveByUser` already exists on
`CommunityRepresentativeRepository` for the multi-community warning
(see table above and the `POST` data flow) and counts the user's
active representative rows across all communities, including the one
being soft-deleted while it is still active. That makes it exactly
the right predicate here — reused as-is, not duplicated — because at
the moment of the check the target community's own assignment is
still active and counted: a result of `1` means "only here", `>1`
means "active elsewhere too". No new repository method, no new
persistence field, and no new domain error: this is a conditional,
silent side effect of the soft-delete use case, not a validation
failure.

## Data Flow — `POST /communities/:id/representatives`

    AuthenticatedGuard → PermissionsGuard('community:assign') → Controller
         │ ZodValidationPipe(addRepresentativeSchema)
         ▼
    ActivateRepresentativeUseCase
         │ 1. communityRepo.findById(:id)        → 404 CommunityNotFoundError
         │ 2. userRepo.findById(userId)          → 404 UserNotFoundError (covers soft-deleted)
         │ 3. assertEligibleFor(user.role, REP)  → 409 IneligibleRoleError
         ▼ representativeRepo.transactional(SERIALIZABLE)
             ├ findActiveByCommunity → deactivate incumbent (deactivatedAt = now)
             ├ create/activate target        ┐ partial unique index = backstop
             └ countActiveByUser(userId)     ┘ → warning?
         ▼
    AssignmentResponseDto { communityId, userId, deactivatedAt: null, warning? }
    (P2034 | P2002-on-index → TransactionConflictError → 409)

## File Changes

| File | Action |
|---|---|
| `apps/api/prisma/schema.prisma` | Modify — `Community`, `enum Locale`, `CommunityRepresentative`, `CommunityTechnician` |
| `apps/api/prisma/migrations/<ts>_add_community_and_assignments/migration.sql` | Create — tables + **hand-written partial unique index** |
| `.../community/domain/community.entity.ts`, `community-representative.entity.ts`, `community-technician.entity.ts` | Create — hand-written, zero Prisma (ADR-013) |
| `.../community/domain/assignment-eligibility.policy.ts` | Create — the eligibility invariant |
| `.../community/domain/errors/*.error.ts` | Create — `CommunityNotFound`, `AssignmentNotFound`, `AssignmentAlreadyExists`, `IneligibleRole`, `TransactionConflict` |
| `.../community/application/ports/{community,community-representative,community-technician}.repository.port.ts` | Create — 3 `Symbol` tokens; `transactional()` only on the representative port |
| `.../community/application/use-cases/**` | Create — 4 community CRUD + 6 assignment use cases |
| `.../community/application/use-cases/testing/in-memory-*.repository.ts` | Create — fakes with invariant parity (incl. snapshot/rollback `transactional`) |
| `.../community/infrastructure/persistence/**` | Create — 3 adapters + 3 mappers; only the community adapter extends `SoftDeletableRepository` |
| `.../community/presentation/community.controller.ts` + `dto/**` | Create — routes above, Swagger, domain-error → HTTP mapping |
| `.../community/community.module.ts` | Create — imports `UsersModule` for `USER_REPOSITORY` |
| `apps/api/src/app.module.ts` | Modify — register `CommunityModule` |
| `apps/api/src/shared/application/authorization/permission.ts` | Modify — `community:create|read|update|delete|assign` |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify — `SYSTEM_ADMIN` row only; other four stay `[]` |
| `packages/validation/src/community/*.schema.ts` + `src/index.ts` | Create/Modify |
| `apps/api/test/community.e2e-spec.ts` | Create |

`community:assign` is separate from `community:update` so a future slice can
grant assignment without granting attribute edits or deletion.

## Interfaces

```ts
export interface CommunityRepresentativeRepository {
  findByCommunityAndUser(communityId: string, userId: string): Promise<CommunityRepresentative | null>;
  findActiveByCommunity(communityId: string): Promise<CommunityRepresentative | null>;
  listByCommunity(communityId: string): Promise<CommunityRepresentative[]>; // active + deactivated
  countActiveByUser(userId: string): Promise<number>;                       // multi-community warning
  create(assignment: CommunityRepresentative): Promise<void>;
  setDeactivatedAt(communityId: string, userId: string, at: Date | null): Promise<void>;
  transactional<T>(work: (repo: CommunityRepresentativeRepository) => Promise<T>): Promise<T>;
}
// CommunityTechnicianRepository = the same minus findActiveByCommunity,
// countActiveByUser and transactional — the asymmetry, made structural.
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (domain) | `assertEligibleFor` per role × kind | Pure, table-driven, like `last-admin.policy.spec.ts` |
| Unit (use case) | Exclusivity swap, reactivation, warning emitted/absent, drift accepted | In-memory fakes; `transactional` snapshot-rolls-back on throw |
| Integration | `SERIALIZABLE` conflict → `TransactionConflictError`; **partial index exists in `pg_indexes`**; concurrent double activation leaves exactly one active | Real Postgres, mirroring `prisma-user.repository.integration.spec.ts` |
| E2E | Full lifecycle; 401 unauth / 403 non-admin on every route; `ROLE_PERMISSIONS` non-admin rows still `[]` | `apps/api/test/community.e2e-spec.ts`, mirroring `users.e2e-spec.ts` |

## Migration / Rollout

One additive migration; no existing table is reshaped and no data is
backfilled. Rollback = revert the branch and drop the three tables plus
`enum Locale`. The partial index ships in the same migration file.

## Open Questions

- [ ] Confirm at apply time that `prisma migrate dev` does not emit a
      `DROP INDEX` for the hand-written partial index; the `pg_indexes`
      integration test is the guard either way.
