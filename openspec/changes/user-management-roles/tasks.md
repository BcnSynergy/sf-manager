# Tasks: User Management + Roles (SYSTEM_ADMIN slice)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1900-2500 (migration, `shared` move, new authorization seam, full `users` CRUD across 4 layers, breaking `/auth/me` change, web + docs — all with Strict TDD tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR9 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema/migration + seed + `Role` domain type | PR 1 | No behavior change; unblocks 2 & 3 |
| 2 | Shared infra: move `PasswordHasher`, add `Permission` + `@RequirePermission` | PR 2 | Depends on PR 1; mechanical move + small additions |
| 3 | Authorization: `PermissionChecker`, `RolePermissionChecker`, `PermissionsGuard` | PR 3 | Depends on PR 2; second `APP_GUARD` wiring |
| 4 | Users domain: `PlainPassword`, last-admin policy, errors, entity `role` | PR 4 | Depends on PR 1; ~150-200 lines |
| 5 | Users application: repo port + 4 use cases | PR 5 | Depends on PR 4; largest single unit, watch budget |
| 6 | Users infra + presentation: Prisma repo, controller, DTOs, module wiring | PR 6 | Depends on PR 3 (guard) + PR 5 |
| 7 | Auth wiring: `role` in JWT/login/`/auth/me` + delta spec + auth e2e | PR 7 | Depends on PR 1 only; can land in parallel with 4-6 |
| 8 | Users E2E incl. in-memory fake repo soft-delete parity | PR 8 | Depends on PR 3, 6, 7 |
| 9 | Web `AuthUser.role` + ADR-011 addendum | PR 9 | Depends on PR 7 |

## Phase 1: Database & Role Foundation

- [x] 1.1 `prisma/schema.prisma` — add `Role` enum (5 values), `User.role`.
- [x] 1.2 Hand-edited migration (Decision 9): `ADD COLUMN role` nullable -> backfill `MANAGER` -> `SET NOT NULL`. No `@default`.
- [x] 1.3 `prisma/seed.ts` — seeded admin upserts `role: 'SYSTEM_ADMIN'`.
- [x] 1.4 `modules/users/domain/role.ts` — hand-written string-literal union `Role` (Decision 4, not `$Enums.Role`).
- [x] 1.5 RED/GREEN `user.entity.ts`/`.spec.ts` — add `role` field.
- [x] 1.6 RED/GREEN `user.mapper.ts`/`.spec.ts` — map `role` Prisma <-> domain.

## Phase 2: Shared Infra Move + Authorization Primitives

- [x] 2.1 Move `password-hasher.port.ts` -> `shared/application/ports/password-hasher.port.ts` (token unchanged).
- [x] 2.2 Move `argon2-password.hasher.ts` + spec -> `shared/infrastructure/hashing/`.
- [x] 2.3 `shared/infrastructure/hashing/hashing.module.ts` — `@Global()`, mirrors `IdGeneratorModule`.
- [x] 2.4 `auth.module.ts` — drop moved hasher providers, import `HashingModule`; fix import paths in `login.use-case.ts`/`.spec.ts`.
- [x] 2.5 `shared/application/authorization/permission.ts` — `Permission` union (`user:create|read|update|delete`).
- [x] 2.6 `shared/presentation/decorators/require-permission.decorator.ts` — `@RequirePermission`, `PERMISSION_KEY`.

## Phase 3: Authorization — Checker & Guard

- [x] 3.1 `auth/application/ports/permission-checker.port.ts` — `PermissionChecker` + `PERMISSION_CHECKER` token.
- [x] 3.2 RED/GREEN `role-permission.checker.ts` — table-driven test: `SYSTEM_ADMIN` allowed all 4 perms, every other role denied on every perm (Decision 5, exhaustive `Record`).
- [x] 3.3 RED/GREEN `permissions.guard.ts` — no `@RequirePermission` metadata passes through; missing `req.user` -> 401 (fail-closed); wrong role -> 403 (mocked `ExecutionContext`).
- [x] 3.4 `auth.module.ts` — register `PermissionsGuard` as second `APP_GUARD`, immediately after `AuthenticatedGuard`; provide `PERMISSION_CHECKER`.

## Phase 4: Users Domain

- [x] 4.1 `packages/validation/src/users/password.schema.ts` — `passwordSchema`: min 10 chars, >=1 letter, >=1 digit; export from `packages/validation/src/index.ts`.
- [x] 4.2 RED/GREEN `users/domain/password.ts` — `PlainPassword` VO: private ctor + `static create(raw)` throws `WeakPasswordError`; `toString()` returns `'[REDACTED]'`.
- [x] 4.3 RED/GREEN `users/domain/last-admin.policy.ts` — pure `assertSystemAdminRemains(activeAdminCount)`: 0 throws, >=1 passes.
- [x] 4.4 `users/domain/errors/{weak-password,email-already-in-use,last-system-admin}.error.ts`.

## Phase 5: Users Application (Use Cases)

- [x] 5.1 `user.repository.port.ts` — add `create`, `findById`, `findAll`, `updateById`, `softDeleteById`, `countActiveByRole`, `transactional`; keep `save` for the seed.
- [x] 5.2 RED/GREEN `create-user.use-case.ts` — `PlainPassword.create` -> hash -> `IdGenerator.next()` -> `repo.create`; duplicate email -> `EmailAlreadyInUseError`.
- [x] 5.3 RED/GREEN `list-users.use-case.ts` — returns `repo.findAll()`, no password hash in output.
- [x] 5.4 RED/GREEN `update-user.use-case.ts` — `transactional`: `updateById` + `countActiveByRole` + `assertSystemAdminRemains` when demoting away from `SYSTEM_ADMIN`.
- [x] 5.5 RED/GREEN `deactivate-user.use-case.ts` — `transactional`: `softDeleteById` + last-admin check.
- [x] 5.6 Unit tests use an in-memory fake repo whose `transactional` runs the callback inline.

## Phase 6: Users Infrastructure & Presentation

- [x] 6.1 `prisma-user.repository.ts` — implement `create` (unique-violation -> `EmailAlreadyInUseError`), `findById`, `findAll` (`withDefaultFilter`, Decision 10), `updateById`, `softDeleteById`, `countActiveByRole`, `transactional` (`$transaction({ isolationLevel: 'Serializable' })`, `P2034` -> 409).
- [x] 6.2 Integration test (real test Postgres): `create` rejects duplicate email without upserting.
- [x] 6.3 Integration test: `countActiveByRole` excludes soft-deleted; two concurrent transactions each demoting one of the last two admins -> exactly one commits.
- [x] 6.4 Integration test: `findAll` excludes soft-deleted users (seed two, soft-delete one, assert only surviving id returned).
- [x] 6.5 `packages/validation/src/users/{create-user.schema.ts,update-user.schema.ts}`.
- [x] 6.6 `presentation/dto/**` + `presentation/users.controller.ts` — `POST/GET/PATCH/DELETE /users`, `@RequirePermission('user:*')` per route, explicit `@ApiBody` schemas (ADR-015).
- [x] 6.7 `users.module.ts` — register controller + 4 use-case providers.

## Phase 7: Auth Wiring — Role in JWT & /auth/me (breaking)

- [x] 7.1 `auth/application/ports/token-issuer.port.ts` — payload gains `role`.
- [x] 7.2 RED/GREEN `jwt-token.issuer.ts`/`.spec.ts` — signs `{sub,email,role,jti}`.
- [x] 7.3 RED/GREEN `login.use-case.ts`/`.spec.ts` — passes `role` to `TokenIssuer.sign`.
- [x] 7.4 RED/GREEN `get-current-user.use-case.ts`/`.spec.ts` — maps `req.user` to `{id,email,role}`.
- [x] 7.5 `dto/auth-user-response.dto.ts` — add `role`.
- [ ] 7.6 Apply `openspec/changes/user-management-roles/specs/authentication/spec.md` delta onto `openspec/specs/authentication/spec.md` ("Session Introspection"). **Deferred to `sdd-archive`** per explicit orchestrator instruction for this PR — the delta already lives in the changes-scoped spec file; do not merge it into the archived spec here.
- [x] 7.7 `test/auth.e2e-spec.ts` — `GET /auth/me` returns `{id,email,role}`; decoded access token carries `role`.

## Phase 8: Users E2E

- [x] 8.1 `test/users.e2e-spec.ts` — in-memory fake `UserRepository` implementing the full port (incl. `transactional`). Reuses the shared `InMemoryUserRepository` from `application/use-cases/testing/` (already fully implements the port) instead of hand-rolling a second fake.
- [x] 8.2 Fake `findAll` MUST replicate the `deletedAt: null` exclusion filter by hand (Decision 10 puts this filter only in `PrismaUserRepository`/`SoftDeletableRepository` — a fake that returns all rows would make the "soft-deleted excluded" e2e scenario pass even if the real filter broke). Write a unit test on the fake asserting `findAll` excludes a soft-deleted seed row. **Verified**: `in-memory-user.repository.spec.ts` (new) confirms the shared fake already correctly filters — 2/2 tests passing (exclusion + triangulation case).
- [x] 8.3 E2E: admin CRUD happy paths (create/list/update/deactivate), no password hash in any response.
- [x] 8.4 E2E: non-admin authenticated caller -> 403 on every `/users` route; anonymous -> 401 (guard order per authorization spec).
- [x] 8.5 E2E: deactivating/demoting the last active `SYSTEM_ADMIN` -> rejected, state unchanged; deactivating one of two admins -> 2xx.
- [x] 8.6 E2E: `DELETE /users/:id` then `GET /users` no longer lists that user.

## Phase 9: Web & Docs

- [x] 9.1 `apps/web/src/auth/AuthProvider.tsx` — `AuthUser` gains `role`.
- [x] 9.2 RED/GREEN web test — `role` flows through `AuthProvider` (Vitest, `fetch` mocked).
- [x] 9.3 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` — addendum: role staleness accepted (Decision 2), 4 roles declared-not-operational (Decision 5).
