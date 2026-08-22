# Proposal: User Management + Roles (SYSTEM_ADMIN slice)

## Intent

`auth-minimal-skeleton` answered "is this request authenticated?" and
explicitly deferred roles/RBAC and user CRUD. Today the only way a `User`
exists is `prisma/seed.ts` — zero endpoints, zero role column, zero
authorization. Every authenticated user is equally privileged. This slice
closes both gaps together, because CRUD without authorization would be a
security regression: an admin can create, list, edit and deactivate users,
and only `SYSTEM_ADMIN` may do so. It introduces ADR-011's `PermissionChecker`
seam with one operational role, not the full 5-role model.

Context: `[[sdd/user-management-roles/explore]]` (Approach 2),
`[[sdd/user-management-roles/state]]` (closed product decisions).

## Scope

### In Scope

- Prisma `Role` enum declaring all 5 ADR-011 values; `User.role` column +
  migration; seed sets `SYSTEM_ADMIN`.
- `users` module gains `application/use-cases/` + `presentation/`: create,
  list, update, deactivate (soft delete, ADR-010). Repository port gains
  `findById`, `findAll`, update-by-id, soft delete.
- Admin sets the initial password at creation (argon2id, reuse
  `PasswordHasher`). No invite/email flow.
- `PermissionChecker` port + role-based guard/decorator, composed with the
  existing `AuthenticatedGuard`; rule table has one row: `SYSTEM_ADMIN → user:*`.
- Invariant: deactivating or role-changing the **last active `SYSTEM_ADMIN`**
  MUST be rejected.
- `role` added to the JWT payload and to `GET /auth/me`; `AuthUser` in
  `apps/web` updated to match.
- Zod schemas in `packages/validation`, Swagger, API + web tests.

### Out of Scope

- The 4 non-admin roles: declared in the enum, **no** operational
  authorization logic (`MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
  `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`).
- `managerCapabilities`, `maintenanceCompanyId`, `communityId` — meaningless
  without `Community`/`MaintenanceCompany` (FR-001/FR-002, unbuilt, ADR-006).
- Email invitation / activation, password reset, self-service profile or
  password change.
- User-management screen in `apps/web` — later frontend slice.
- List pagination/filtering; audit logging; rate limiting.

## Capabilities

### New Capabilities

- `user-management`: admin-only create/list/update/deactivate of users,
  including role assignment and the last-admin invariant.
- `authorization`: role-based permission checks over authenticated requests
  (`PermissionChecker` port + permission-named guard).

### Modified Capabilities

- `authentication`: **breaking** — `GET /auth/me` body changes from
  `{ id, email }` to `{ id, email, role }`; the access token payload carries
  `role`. Requires a delta over the frozen
  `openspec/specs/authentication/spec.md` ("Session Introspection") and a
  coordinated `apps/web` update. All other authentication scenarios stay
  unchanged.

## Approach

Exploration Approach 2 — schema-complete enum, one operational role. Role is
embedded in the JWT at sign time (stateless verify, matches the existing
`VerifiedAccessToken` shape) rather than a per-request DB lookup; the
staleness window is bounded by token lifetime and accepted for this slice
(see Risks). The `PermissionChecker` port is introduced now so later slices
add rule-table rows and scope fields without reshaping the seam.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `Role` enum + `User.role` |
| `apps/api/prisma/seed.ts` | Modified | Seeded admin gets `SYSTEM_ADMIN` |
| `apps/api/src/modules/users/domain/user.entity.ts`, `infrastructure/.../user.mapper.ts` | Modified | New `role` field |
| `apps/api/src/modules/users/application/ports/user.repository.port.ts` | Modified | `findById`, `findAll`, update-by-id, soft delete |
| `apps/api/src/modules/users/{application/use-cases,presentation}/**` | New | 4 use cases, controller, DTOs |
| `apps/api/src/modules/users/users.module.ts` | Modified | Controller + use-case providers |
| `apps/api/src/modules/auth/**` (`permission-checker.port.ts`, guard/decorator) | New | Authorization seam |
| `apps/api/src/modules/auth/**` (`token-issuer.port.ts`, `login.use-case.ts`, `jwt-token.issuer.ts`, `get-current-user.use-case.ts`, `auth-user-response.dto.ts`) | Modified | Carry/expose `role` |
| `openspec/specs/authentication/spec.md` | Modified | Delta for `/auth/me` shape |
| `apps/web/src/auth/AuthProvider.tsx` | Modified | `AuthUser` gains `role` |
| `packages/validation/src/users/**` | New | Create/update schemas |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Role staleness in JWT — a demoted/deactivated user keeps privileges until token expiry (no refresh/revocation beyond logout deny-list) | Med | Documented, bounded by the 2h lifetime; deactivation already blocks re-login. Revisit when refresh tokens land. Optionally extend the existing `TokenDenylist` on role change — decide in `sdd-design` |
| `/auth/me` contract break drifts web and API | Med | Single coordinated slice: delta spec + `AuthUser` + tests in the same PR |
| Last-admin lockout | High if unguarded | Explicit application-layer check on update/deactivate; e2e test asserting rejection |
| Enum declares 4 inert roles — looks like dead code, invites premature use | Med | `sdd-design` must state "declared, not operational"; guard rejects any non-`SYSTEM_ADMIN` actor |
| Repository shifts from upsert-by-email to update-by-id; seed idempotency depends on the old path | Low | Keep `save` upsert for the seed; add a distinct update-by-id method |
| Password policy is unspecified (only `min(1)` in seed) | Med | Define a minimum-strength rule in `sdd-spec` |

## Rollback Plan

Revert the branch and roll back the single migration (`prisma migrate reset`
in dev) to drop `Role`/`User.role`. The authorization guard is additive
wiring — removing it restores authenticated-only behavior. Reverting also
restores the `{ id, email }` `/auth/me` contract and the web `AuthUser` type
in the same commit, so no cross-service skew. No data migration of existing
rows beyond backfilling the seeded admin's role.

## Dependencies

- None new. Reuses `PasswordHasher` (argon2id), `IdGenerator` (UUIDv7,
  ADR-009), the existing `AuthenticatedGuard`/`APP_GUARD` wiring.
- Reachable PostgreSQL for the migration + reseed.

## Open Questions for `sdd-design`

- Composition of the new permission guard with the global `AuthenticatedGuard`
  (second `APP_GUARD` vs per-controller vs one composed guard).
- Whether a role change should revoke the user's active token via the existing
  `TokenDenylist`.
- Where the last-admin invariant lives (domain service vs application use case)
  and how it stays race-safe under concurrent deactivations.
- Whether `role` is a Value Object or a plain enum on the entity (ADR-006
  addendum — decide per slice).

## Success Criteria

- [ ] `User.role` exists, migration applies, seeded admin is `SYSTEM_ADMIN`.
- [ ] `SYSTEM_ADMIN` can create, list, update and deactivate users via the API.
- [ ] A non-`SYSTEM_ADMIN` authenticated user is rejected (403) on every
      `/users` endpoint; an unauthenticated request still gets 401.
- [ ] Deactivating or demoting the last active `SYSTEM_ADMIN` is rejected.
- [ ] A deactivated user cannot log in (existing soft-delete scenario still passes).
- [ ] `GET /auth/me` returns `{ id, email, role }`; the `authentication` delta
      spec and `apps/web` `AuthUser` are updated in the same change.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] API and web suites pass (`npm run test --workspace=apps/api`,
      `--workspace=apps/web`).
