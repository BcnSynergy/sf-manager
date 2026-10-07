## Exploration: auth-live-user-check

### Current State
- **Guard flow.** `AuthenticatedGuard` is the global APP_GUARD. It reads cookie `sf_access_token`, calls `tokenIssuer.verify`, then calls `tokenDenylist.isRevoked(jti)`. Any failure throws 401, including a DB error (fail-closed). It then sets `request.user = payload`, typed `VerifiedAccessToken` (`sub, email, role, jti, exp`). It never re-reads the user.
- **Consumers of `request.user`.** All of them read only `sub` and/or `role`. None read `email`, `maintenanceCompanyId` or `managerCapabilities`.
  - `PermissionsGuard` reads `request.user.role` only (checked against `permissionChecker.can`).
  - `review-session.controller.ts`, `review-history.controller.ts` and `review-schedule.controller.ts` pass `user.sub` and `user.role` into use cases via `@CurrentUser()`.
  - `GET /auth/me` goes through `GetCurrentUserUseCase`, which maps `sub, email, role` straight from the token with no DB read.
  - `LogoutUseCase` re-verifies the raw cookie itself and does not use `request.user`.
- **Existing DB re-reads of the acting user.** `UserCompanyScopeChecker.resolveCompanyScope` (for `maintenanceCompanyId`) and `UserManagerCapabilityChecker` (re-checks role and capability) each call `userRepository.findById(userId)` per request. Company and capability data are therefore already live. Only `role`, `email` and existence are stale today.
- **User repository.** `UserRepository` (`users/application/ports/user.repository.port.ts`) has `findById(id): Promise<User | null>`. It applies the ADR-010 `deletedAt: null` filter, so a soft-deleted user resolves to null. The adapter is `PrismaUserRepository`, a `findFirst` on PK plus the filter.
  - `User` entity: `id, email, passwordHash, role, createdAt, updatedAt, deletedAt, maintenanceCompanyId, managerCapabilities`.
  - The Prisma `User` model has only `deletedAt` as an off-state. There is no `active` or `disabled` flag (`deactivatedAt` exists on assignment tables, not on User).
- **Module wiring.** `AuthModule` already imports `UsersModule`, which exports `USER_REPOSITORY`, and `LoginUseCase` already injects it. The auth-to-users direction is an established precedent (one-directional, acyclic).
- **Web.**
  - `AuthProvider` calls `GET /auth/me` once at mount and never again.
  - `apiFetch` (`apps/web/src/api/client.ts`) throws `ApiError(status)` with no special 401 handling: no interceptor, redirect or auth-state clearing.
  - A mid-session 401 therefore surfaces as per-page errors, and the user stays "logged in" in React state until reload.
  - The nav and role in `AuthProvider` refresh only on reload or login, so a changed role takes effect in the UI after a reload. The API enforces the new role immediately regardless.

### Affected Areas
- `apps/api/src/modules/auth/presentation/guards/authenticated.guard.ts`: inject `USER_REPOSITORY`, add the lookup, rebuild `request.user`.
- `apps/api/src/modules/auth/presentation/guards/authenticated.guard.spec.ts`: the constructor gains a 5th dependency; new cases.
- `apps/api/test/auth.e2e-spec.ts`: its local `InMemoryUserRepository.findById()` currently throws "Not used" and must be implemented (lookup by id). New e2e cases go here.
- Other e2e suites need no change. They override `USER_REPOSITORY` with the shared `InMemoryUserRepository` (which has a real `findById`) and obtain tokens via login for seeded users. Worth a quick check during apply: any suite that mints a token for a user not in the repo would now 401.
- `apps/api/src/modules/auth/presentation/types.ts`, `permissions.guard.ts`, `get-current-user.use-case.ts`, `token-issuer.port.ts`, `AuthProvider.tsx`: only comments to correct ("role comes straight off the verified token, no DB read", "accepted staleness").
- `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: addendum superseding the staleness acceptance in Decision 1 (~line 164).
- `openspec/specs/authentication/spec.md`: "Session Introspection" and protected-route requirements need a delta: a valid token for a missing or soft-deleted user is denied.
- Web (conditional, see UI flag): `apps/web/src/api/client.ts` and/or `AuthProvider.tsx`.

### Approaches
1. **Reuse `USER_REPOSITORY.findById` in the guard (recommended)**
   - Pros: zero new ports, adapters or modules; the ADR-010 filter is built in; matches the `LoginUseCase` precedent; every e2e suite already provides an in-memory fake, so no new overrides are needed.
   - Cons: returns the full `User`, including `passwordHash`, so the guard must copy only `sub, email, role` into `request.user` and never retain the entity. `GET /auth/me` for a manager and the scope checkers issue duplicate `findById` calls (accepted).
   - Effort: Low.
2. **New narrow port `ActiveUserLookup` (auth application layer)**
   - Pros: returns a minimal shape with no password hash; explicit intent.
   - Cons: needs a new Prisma adapter and provider. Every e2e suite that stubs `PrismaService` would need a new override; if one is missed, the lookup hits the stub and breaks the suite. Wide blast radius for little benefit. Duplicates `findById`. Over-engineering under ADR-006.
   - Effort: Medium.
3. **Per-user epoch / refresh-token rotation**: rejected by the user; belongs to tech-debt #5. Same per-request read with more moving parts.

### Recommendation
Approach 1.

- **Guard sequence:** `verify(token)`, then `isRevoked(jti)`, then `userRepository.findById(payload.sub)`. If the result is null, throw 401. Otherwise set `request.user = { ...payload, email: user.email, role: user.role }`.
- **Keep the `VerifiedAccessToken` type.** `jti` and `exp` still come from the token and `sub` is equal, so no controller, decorator or use case changes. `/auth/me` then returns the DB `role` and `email` for free.
- **Only 401 on soft-delete.** There is no other state flag, so a missing or soft-deleted user is the sole denial case.
- **Fail-closed.** Keep the existing try/catch. A DB error on the user lookup becomes 401, indistinguishable from an invalid token.
- **Ordering.** Sequential, denylist first, so a revoked token never costs a user query.
- **No cache** (ADR-006 default). A cache would reintroduce staleness.
- **Login flow is untouched.** `LoginUseCase` still signs claims. The `role` and `email` claims become advisory and could be dropped later (deferred).
- **Web / UI scope.** This change creates a new 401-mid-session path the web does not handle. Recommended minimal UI: treat a 401 on a non-login authenticated call as session loss, clear the `AuthProvider` user so `ProtectedRoute` redirects to login, with a test. If deferred, the proposal must record it as a deliberate API-only exception (CLAUDE.md).
- **Tests.**
  - Guard unit: user found, so `request.user` carries the DB role and email, not the token's; null user, so 401; repository throws, so 401; denylisted jti, so `findById` is not called; `@Public()` route, so no lookup.
  - E2E (`auth.e2e-spec.ts`): log in, soft-delete the user in the fake, then `/auth/me` returns 401; log in, change the role in the fake, then `/auth/me` returns the new role.
  - One test that a role change is enforced by `PermissionsGuard` (403 after a demotion), reusing an existing permissioned route.
  - Integration against real Prisma is optional, since `findById` is already covered.
  - Web: a test for the 401 handling if the UI is included.

### Risks
- **Performance.** One extra PK query per authenticated request, on top of the denylist query. Acceptable at this scale.
- **Duplicate reads.** For a `MANAGER` or `MAINTENANCE_COMPANY_MANAGER` request, the scope and capability checkers also read the user (2 user reads per request). Dedupe is deferred.
- **Auth-e2e fake.** `InMemoryUserRepository.findById` in `auth.e2e-spec.ts` throws today; a missed implementation fails every authenticated e2e in that file.
- **Other e2e suites.** A suite that authenticates a user not present in its fake repository would start returning 401. Scan during apply.
- **Email change.** Using the DB email in `request.user` fixes the stale token email. A cookie issued before the change still works, which is fine because identity is `sub`.
- **Race.** A user deleted mid-request still completes that request; the next request gets 401.
- **Logout.** A soft-deleted user's `POST /auth/logout` now returns 401 at the guard, so the cookie is not cleared server-side. The web `logout()` swallows errors and clears local state, and the token is rejected anyway, so this is harmless.
- **Spec drift.** The authentication spec and ADR-011 document the accepted staleness; both must be updated in the same change.
- **Out of scope.** Refresh tokens and rotation (#5), a per-user epoch, caching, deduping the checker reads, dropping `role` and `email` from the JWT claims, a `/auth/me` polling or refetch strategy in the web client.

### Ready for Proposal
Yes, after the user decides whether the minimal web 401 handling is in this slice.
