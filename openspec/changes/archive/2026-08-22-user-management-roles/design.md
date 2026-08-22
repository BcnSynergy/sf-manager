# Design: User Management + Roles (SYSTEM_ADMIN slice)

## Technical Approach

`users` grows the layers it deliberately skipped in `auth-minimal-skeleton`
(use cases + presentation); `auth` grows an authorization seam. Authentication
stays untouched: a second global guard (`PermissionsGuard`) runs after the
existing `AuthenticatedGuard` and consults a `PermissionChecker` port backed by
a static `Record<Role, Permission[]>` table. `role` is signed into the JWT, so
the guard needs no DB read. Module dependency direction stays `auth → users`;
the new decorator lives in `shared/presentation` exactly like `@Public()`, so
`users` never imports `auth`.

## Architecture Decisions

| # | Question | Decision | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Guard composition (proposal Q1) | Second `APP_GUARD` (`PermissionsGuard`) declared in `AuthModule.providers` **immediately after** `AuthenticatedGuard`; no-op when the handler carries no `@RequirePermission`; throws 401 if `request.user` is absent | One composed authn+authz guard; per-controller `@UseGuards`; deny-by-default global | Keeps SRP — the tested `AuthenticatedGuard` is not reopened. Both guards sit in one `providers` array, so Nest's registration-order execution is explicit and reviewable rather than spread across modules; the `request.user` check makes it fail **closed** even if that order ever changes. Per-controller wiring must be remembered by every future controller. Deny-by-default would force a permission on `/auth/me` and `/auth/logout` for no gain. |
| 2 | Revoke token on role change (proposal Q2) | **No.** Accept staleness bounded by the 2h token lifetime; document in the ADR-011 addendum | Reusing `TokenDenylist` | `TokenDenylist` is keyed by `jti` with **no** `userId` column and no user→jti index — it holds only tokens a user explicitly logged out. Revoking by user needs either a session table (which Decision 9 of the previous slice explicitly refused to build) or a new per-user invalidation epoch (`User.sessionsValidFrom`, checked by `AuthenticatedGuard`). Neither is a reuse; both are a new mechanism. For one operational role and a handful of admins, a ≤2h window is a smaller cost than a session store built on speculation. A deactivated user still cannot renew (login already rejects soft-deleted rows). Follow-up: add the epoch alongside refresh tokens. |
| 3 | Last-admin invariant (proposal Q3) | Rule as a **pure domain function** `assertSystemAdminRemains(activeAdminCount)` in `users/domain/`; the use case supplies the count and owns the transaction. Race safety: the mutation and the re-count run inside `UserRepository.transactional(...)`, whose port contract requires an isolation level that prevents write skew (adapter: Prisma `$transaction({ isolationLevel: 'Serializable' })`). Prisma `P2034` → `409 Conflict` | Domain service holding a repository port; plain application check; `SELECT … FOR UPDATE` via `$queryRaw`; a DB constraint | A plain re-check does **not** close the race: two transactions demoting two different admin rows never block each other under READ COMMITTED, so each sees one admin left and both commit → zero admins. Postgres SSI detects that read-write conflict and aborts one. No raw SQL, no schema change, isolation stays an infrastructure detail behind the port (ADR-013). "At least one row exists" is not expressible as a DB constraint. A pure function keeps the rule unit-testable with no ports; only the count query is I/O, which belongs in the application layer. No automatic retry — the client resubmits. |
| 4 | `role` — VO or plain enum (proposal Q4) | Plain string-literal union `Role` in `users/domain/role.ts` (hand-written, **not** the Prisma-generated enum — ADR-013). No `user.isAdmin()` | A `Role` value object; importing `$Enums.Role` | Per the ADR-006 addendum a VO earns its place when it protects an invariant. `Role`'s only rule is set membership, already enforced by Zod at the boundary and by the Postgres enum at the column; a wrapper would add unwrapping noise and zero safety. Role-comparison behavior deliberately does **not** live on the entity — ADR-011 §3 forbids scattered `user.role === X`; the rule table owns it. |
| 5 | The 4 inert roles | `ROLE_PERMISSIONS: Record<Role, Permission[]>` declares **all five** keys; the four non-admin roles map to `[]` with an inline "declared per ADR-011, not operational in this slice" comment | Omitting them from the table | The exhaustive `Record` makes inertness explicit and type-enforced: a role is visibly *intentionally empty*, not forgotten, and adding a 6th role or a new `Permission` fails the build until every role is considered. A unit test asserts every non-admin role is denied on every `user:*` permission. |
| 6 | `Password` mechanism (spec owns the number) | Value object `PlainPassword` in `users/domain/password.ts`: private constructor + `static create(raw): PlainPassword` throwing `WeakPasswordError`, `toString()` → `'[REDACTED]'`. The strength predicate itself lives in `packages/validation` (`passwordPolicy`, `isStrongPassword`, `passwordSchema`) and is imported by the VO; the concrete rule is **the rule that `sdd-spec` defines** | Duplicating the rule in domain and Zod; a bare `string` | Contrast with Decision 4: this VO *does* carry an invariant (strength) plus a safety behavior (redaction, so plaintext can't leak into a log or error dump) — that is what earns VO status. The predicate lives in the shared package so the web form and the API enforce one rule (ADR-015); the dependency direction (app → package) is correct and the package is pure TS/Zod, no framework, no Prisma. Accepted tradeoff: the domain layer takes one non-domain import to avoid two sources of truth. |
| 7 | `PasswordHasher` location | **Move** `PasswordHasher` port + `Argon2PasswordHasher` to `shared/application/ports/` + `shared/infrastructure/hashing/`, exposed by a `@Global() HashingModule` | `forwardRef` between modules; duplicating the adapter | `CreateUserUseCase` lives in `users` while `PASSWORD_HASHER` is provided by `auth`, which already imports `UsersModule` — wiring it the other way is a module cycle. Mirrors the existing `@Global() IdGeneratorModule` precedent. Mechanical move: the injection token is unchanged, so `auth` call sites only change an import path. |
| 8 | Create vs the existing upsert `save` | Add a distinct `create(user)` that performs a plain insert; unique-violation → `EmailAlreadyInUseError` → **409**. `save` stays an upsert **for the seed only** | Reusing `save` for `POST /users` | `save` upserts by email — reusing it would make "create a user with an existing email" silently **overwrite** that user (including their role and password hash) instead of failing. That is a privilege-escalation-shaped bug, not a UX detail. |
| 9 | Migration backfill | Hand-edited migration: `ADD COLUMN "role"` nullable → `UPDATE … SET "role" = 'MANAGER'` → `SET NOT NULL`. No Prisma `@default`. `seed.ts` then upserts the seeded admin to `SYSTEM_ADMIN` | `@default(SYSTEM_ADMIN)`; `@default(MANAGER)` | A required column cannot be added to a non-empty table without a value, and a schema-level default would silently decide the role of every future insert. Backfilling to `MANAGER` (zero permissions, Decision 5) is fail-closed: no existing row gains privilege, and only the explicitly seeded admin is promoted. |
| 10 | Soft-deleted rows in `findAll` (spec: *"Soft-deleted users MAY be excluded by default — deferred to `sdd-design`"*) | **Excluded by default.** `findAll` reuses the existing `SoftDeletableRepository.withDefaultFilter(...)` in `PrismaUserRepository` exactly as `findByEmail` already does, i.e. `findMany({ where: this.withDefaultFilter({}) })`. **No** `includeDeleted` flag, options object, or second method in this slice | An `includeDeleted?: boolean` parameter; a separate `findAllIncludingDeleted`; filtering in the use case or the controller | ADR-010 already settled this project-wide: soft-deleted rows are invisible by construction, and the base class exists precisely so each repository does not re-decide (or forget) the filter. Exposing a flag would (a) contradict the "no pagination/filtering" scope boundary, (b) add an unused branch and its test matrix, and (c) leak a persistence concern into the port for a caller that does not exist yet. Filtering above infrastructure would fetch deleted rows into the application layer only to drop them — the opposite of the ADR-010 seam. Consistency also matters behaviorally: `DELETE /users/:id` soft-deletes, and a user who disappears from `GET /users` right after is the only non-astonishing result. If an "archived users" view is ever required, it arrives as its own slice with its own permission. |

## Data Flow

    POST /users ─→ AuthenticatedGuard (cookie → req.user{sub,email,role,jti})
                └→ PermissionsGuard: @RequirePermission('user:create')?
                     │  no metadata ─→ pass through
                     │  no req.user ─→ 401 (fail-closed)
                     └→ PermissionChecker.can(req.user.role, perm)? ── no ─→ 403
                └→ UsersController ─→ CreateUserUseCase
                       PlainPassword.create(raw)        → WeakPasswordError → 400
                       PasswordHasher.hash(pw)          (argon2id, shared)
                       IdGenerator.next()               (UUIDv7, ADR-009)
                       UserRepository.create(user)      → EmailAlreadyInUse → 409

    PATCH /users/:id  (role/email)          DELETE /users/:id (soft delete)
      └→ UserRepository.transactional(async repo => {   // SERIALIZABLE
             await repo.updateById(id, changes)   // or repo.softDeleteById(id)
             const admins = await repo.countActiveByRole('SYSTEM_ADMIN')
             assertSystemAdminRemains(admins)  // pure domain → throws → ROLLBACK
         })                                    // P2034 serialization abort → 409

    POST /auth/login → TokenIssuer.sign({sub,email,role})   // role now in payload
    GET  /auth/me    → GetCurrentUserUseCase → { id, email, role }   // breaking

## File Changes

| Path | Action |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/*_add_user_role/` | Modify / Create — `Role` enum (5 values), `User.role`, hand-edited 3-step backfill (Decision 9) |
| `prisma/seed.ts` | Modify — seeded admin gets `SYSTEM_ADMIN` |
| `shared/application/ports/password-hasher.port.ts`, `shared/infrastructure/hashing/{argon2-password.hasher.ts,hashing.module.ts}` | Move / Create — `@Global()`, mirrors `IdGeneratorModule` (Decision 7) |
| `shared/application/authorization/permission.ts` | Create — `Permission` union (`user:create|read|update|delete`) |
| `shared/presentation/decorators/require-permission.decorator.ts` | Create — `@RequirePermission`, `PERMISSION_KEY`; lives in `shared` so `users` never imports `auth` |
| `modules/users/domain/{role.ts,password.ts,last-admin.policy.ts,user.entity.ts}` | Create / Modify — `Role`, `PlainPassword`, `assertSystemAdminRemains`, entity gains `role` |
| `modules/users/domain/errors/{weak-password,email-already-in-use,last-system-admin}.error.ts` | Create |
| `modules/users/application/ports/user.repository.port.ts` | Modify — `findById`, `findAll`, `create`, `updateById`, `softDeleteById`, `countActiveByRole`, `transactional`; `save` kept for the seed |
| `modules/users/application/use-cases/{create,list,update,deactivate}-user.use-case.ts` | Create |
| `modules/users/presentation/{users.controller.ts,dto/**}` | Create — `POST/GET/PATCH/DELETE /users`, Swagger via explicit `@ApiBody` schemas (ADR-015) |
| `modules/users/infrastructure/persistence/{prisma-user.repository.ts,user.mapper.ts}` | Modify — new methods, `$transaction` w/ `Serializable`, `P2034` mapping, role mapping |
| `modules/users/users.module.ts` | Modify — controller + 4 use-case providers |
| `modules/auth/application/ports/permission-checker.port.ts` | Create — `PermissionChecker` + `PERMISSION_CHECKER` |
| `modules/auth/infrastructure/authorization/role-permission.checker.ts` | Create — `ROLE_PERMISSIONS` table (Decision 5) |
| `modules/auth/presentation/guards/permissions.guard.ts` | Create |
| `modules/auth/auth.module.ts` | Modify — second `APP_GUARD` after `AuthenticatedGuard`; `PERMISSION_CHECKER`; drop the moved hasher providers |
| `modules/auth/**` (`token-issuer.port.ts`, `jwt-token.issuer.ts`, `login.use-case.ts`, `get-current-user.use-case.ts`, `dto/auth-user-response.dto.ts`) | Modify — carry/expose `role` |
| `packages/validation/src/users/{password.schema.ts,create-user.schema.ts,update-user.schema.ts}` | Create |
| `apps/web/src/auth/AuthProvider.tsx` | Modify — `AuthUser` gains `role` |
| `openspec/specs/authentication/spec.md` | Modify — `/auth/me` delta |
| `docs/adr/ADR-011-*.md` | Modify — addendum: role staleness accepted (Decision 2), 4 roles declared-not-operational |

## Interfaces / Contracts

```ts
// shared/application/authorization/permission.ts
export type Permission = 'user:create' | 'user:read' | 'user:update' | 'user:delete';

// auth/infrastructure/authorization — exhaustive by construction (Decision 5)
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SYSTEM_ADMIN: ['user:create', 'user:read', 'user:update', 'user:delete'],
  // Declared per ADR-011, NOT operational in this slice — intentionally empty,
  // not forgotten. The exhaustive Record forces future slices to fill these in.
  MANAGER: [], MAINTENANCE_COMPANY_MANAGER: [],
  MAINTENANCE_TECHNICIAN: [], COMMUNITY_REPRESENTATIVE: [],
};
export interface PermissionChecker { can(role: Role, permission: Permission): boolean }

// users/application/ports — additions
export interface UserRepository {
  create(user: User): Promise<void>;          // plain insert; unique email violation surfaces
  findById(id: string): Promise<User | null>;
  // Soft-deleted users are EXCLUDED — no flag, no options arg (Decision 10).
  // Adapter: findMany({ where: this.withDefaultFilter({}) }), like findByEmail.
  findAll(): Promise<User[]>;
  updateById(id: string, changes: { email?: string; role?: Role }): Promise<void>;
  softDeleteById(id: string): Promise<void>;  // sets deletedAt (ADR-010)
  countActiveByRole(role: Role): Promise<number>;
  // MUST run at an isolation level that prevents write skew (adapter: SERIALIZABLE).
  // A rejected `work` MUST roll back. Concurrency aborts surface as a conflict error.
  transactional<T>(work: (repo: UserRepository) => Promise<T>): Promise<T>;
}

type AccessTokenPayload = { sub: string; email: string; role: Role }; // + jti/iat/exp
type AuthUserResponse = { id: string; email: string; role: Role };    // breaking change
```

`PATCH /users/:id` accepts `email` and `role` only — password reset stays out of
scope (proposal). Password strength is **the rule `sdd-spec` defines**; this
design only fixes where it lives (Decision 6).

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `assertSystemAdminRemains` — pure, count 0 throws / ≥1 passes | Jest, no doubles |
| Unit | `PlainPassword.create` accepts/rejects per policy; `toString()` redacts | Jest |
| Unit | `RolePermissionChecker` — `SYSTEM_ADMIN` allowed on all four; **every** other role denied on **every** permission (table-driven over `Role`) | Jest |
| Unit | `PermissionsGuard` — no metadata passes; missing `req.user` → 401; wrong role → 403 | Mocked `ExecutionContext` |
| Unit | 4 use cases incl. duplicate-email → `EmailAlreadyInUseError`, last-admin demote/deactivate rejected | In-memory fake repo whose `transactional` runs the callback inline |
| Integration | `PrismaUserRepository`: `create` rejects a duplicate email (does **not** upsert); `updateById`/`softDeleteById`; `countActiveByRole` excludes soft-deleted; **two concurrent transactions each demoting one of the last two admins → exactly one commits** | Real test Postgres, `migrate deploy` |
| Integration | `findAll` **excludes soft-deleted users** (Decision 10): seed two users, soft-delete one, assert the result contains only the surviving id — mirrors the existing `findByEmail` ADR-010 default-filter test | Real test Postgres, `migrate deploy` |
| E2E | admin CRUD happy paths; non-admin → 403 on all `/users`; anonymous → 401; last-admin deactivate → rejected; **`DELETE /users/:id` then `GET /users` no longer lists that user**; `/auth/me` returns `role` | supertest, in-memory `USER_REPOSITORY`/`TOKEN_DENYLIST` |
| Web | `AuthUser.role` flows through `AuthProvider` | Vitest, `fetch` mocked |

Strict TDD is enabled (`openspec/config.yaml`) — tests first, per unit.

## Migration / Rollout

One migration, hand-edited per Decision 9, plus a reseed. No live deployment
exists (ADR-001, walking skeleton), so the backfill only ever touches dev/test
rows. Rollback per the proposal: revert the branch and `prisma migrate reset`;
removing the second `APP_GUARD` restores authenticated-only behavior, and the
`/auth/me` contract plus the web `AuthUser` revert in the same commit.

## Open Questions

None blocking. Deferred by decision, tracked in the ADR-011 addendum:

- [ ] Per-user token-invalidation epoch (`User.sessionsValidFrom`) to close the
      ≤2h role-staleness window — revisit with refresh tokens (Decision 2).
- [ ] Automatic retry on a `P2034` serialization abort instead of a bare 409
      (Decision 3).
