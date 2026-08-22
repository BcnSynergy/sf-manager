# Verification Report

**Change**: auth-minimal-skeleton
**Version**: N/A (single spec revision)
**Mode**: Strict TDD

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 39 (Phases 0-10) |
| Tasks complete | 39 |
| Tasks incomplete | 0 |

## Build and Tests Execution

**Unit**: `npm run test --workspace=apps/api` -> 15 suites, 53 tests passed
**Integration**: `npm run test:integration --workspace=apps/api` -> 2 suites, 4 tests passed
**E2E**: `npm run test:e2e --workspace=apps/api` -> 2 suites, 8 tests passed
**Web**: `npm run test --workspace=apps/web` -> 3 files, 10 tests passed
**Lint** (`npm run lint --workspace=apps/api`): 0 errors, 4 warnings (all `@typescript-eslint/no-unsafe-argument` in `auth.controller.spec.ts` mock typing -- SUGGESTION only)
**no-restricted-imports** (`@prisma/client` outside `infrastructure/persistence/**`): verified clean -- grep hits are only in allowed persistence files plus one comment in a domain spec file.

## Spec Compliance Matrix (12 requirements)

1. Successful Login -- VERIFIED -- `LoginUseCase.execute` + `AuthController.login` (sets httpOnly cookie, returns id/email only) -- covered by `login.use-case.spec.ts` + `auth.e2e-spec.ts`.
2. Failed Login, Generic Error, incl. timing mitigation -- VERIFIED -- `LoginUseCase.execute` runs `verifyAgainstDummy` on unknown email (`argon2-password.hasher.ts`, same argon2id params as real hash) before throwing `InvalidCredentialsError`; `auth.controller.ts` maps to a single generic 401. Covered by `login.use-case.spec.ts` and `auth.e2e-spec.ts`.
3. Protected Endpoint Access Control -- VERIFIED -- `AuthenticatedGuard.canActivate` (fail-closed on missing/invalid/tampered/expired token) registered as global `APP_GUARD` in `auth.module.ts`; covered by `authenticated.guard.spec.ts` + `auth.e2e-spec.ts`.
4. Session Introspection (GET /auth/me) -- VERIFIED -- `AuthController.getMe` calls `GetCurrentUserUseCase.execute`, returns exactly id/email; `get-current-user.use-case.spec.ts` + e2e.
5. Logout incl. reused-cookie-401 via deny-list -- VERIFIED end-to-end -- `LogoutUseCase.execute` revokes jti via `TokenDenylist.revoke` (`PrismaTokenDenylistAdapter.revoke` = Prisma upsert), `AuthenticatedGuard` checks `TokenDenylist.isRevoked(jti)` on every request. The e2e test reuses the pre-logout cookie via a persistent supertest agent and asserts 401 -- genuinely exercises the deny-list, not just cookie clearing.
6. Public Endpoint Opt-Out -- VERIFIED -- `@Public()` on `health.controller.ts` and `AuthController.login`; e2e confirms /health stays reachable without a session.
7. CORS Configuration -- VERIFIED -- `main.ts` enableCors with origin/credentials sourced from AuthConfig; e2e CORS test asserts both Allow-Origin and Allow-Credentials headers on /health. Note: only tested against the public /health endpoint, not a protected one -- CORS middleware runs ahead of the guard so this is not a functional gap, just a narrower test surface (INFO, not a blocker).
8. Soft-Deleted User Login Rejected -- VERIFIED -- `PrismaUserRepository.findByEmail` uses `SoftDeletableRepository.withDefaultFilter` (deletedAt null), so LoginUseCase sees null and takes the identical dummy-hash/401 path as unknown email; unit-tested in `login.use-case.spec.ts` and repository behavior in `prisma-user.repository.integration.spec.ts`.
9. Login Form Validation (Web) -- VERIFIED -- `LoginPage.handleSubmit` blocks empty fields client-side and runs `loginRequestSchema.safeParse` before any network call; server 401 always shows one generic message. Covered by `LoginPage.test.tsx`.
10. Redirect When Unauthenticated (Web) -- VERIFIED -- `ProtectedRoute` renders a redirect to /login when there is no user (post-loading). Covered by `ProtectedRoute.test.tsx`.
11. Logout Flow (Web) -- VERIFIED -- `HealthPage.handleLogout` calls logout then navigates to /login; `AuthProvider.logout` clears local state even if the network call fails. Covered by `HealthPage.test.tsx`.
12. Login Page Branding -- VERIFIED -- `LoginPage` renders the logo image; `apps/web/public/logo.svg` exists (placeholder SVG wordmark). Covered by `LoginPage.test.tsx`.

Compliance summary: 12/12 requirements VERIFIED with a passing covering test.

## Architecture Decisions (design.md, 10 total) -- all confirmed as implemented, no drift

1. Module split users + auth -- confirmed (`users.module.ts`, `auth.module.ts` imports `UsersModule`).
2. `@nestjs/jwt` only, no Passport -- confirmed (package.json has `@nestjs/jwt@^11`, no `passport-jwt`/`@nestjs/passport` deps; `jwt-token.issuer.ts` uses `JwtService` directly).
3. UUIDv7 via `uuid` v11 for entity ids -- confirmed (package.json `uuid@^11.1.1`); jti deliberately uses `uuid` v4() in `jwt-token.issuer.ts`, NOT `IdGenerator` -- matches Decision 9 exactly.
4. Global APP_GUARD + `@Public()` -- confirmed (`auth.module.ts` registers AuthenticatedGuard as APP_GUARD; `@Public()` lives in shared/presentation/decorators).
5. Expiry/cookie/CORS config -- confirmed (`auth.config.ts`: JWT_EXPIRES_IN default 2h, cookie name sf_access_token, httpOnly, path root, dev secure false/sameSite lax, prod secure true/sameSite strict keyed off NODE_ENV; CORS_ORIGIN required, throws if missing -- fail-fast confirmed).
6. Login identifier email -- confirmed (User.email unique, loginRequestSchema uses email).
7. Soft-deleted rejected via default filter -- confirmed (see Requirement 8 above).
8. Logo asset at apps/web/public/logo.svg, rendered via img tag -- confirmed.
9. Logout revocation via RevokedToken deny-list, idempotent upsert keyed on jti, jti via uuid v4() not IdGenerator -- confirmed (`prisma-token-denylist.adapter.ts` uses prisma.revokedToken.upsert; schema has RevokedToken with jti id, expiresAt, and an index on expiresAt); opportunistic deleteExpired() is called only after successful login and after logout, never on failed login -- confirmed in code and comments.
10. Dummy-hash timing params -- confirmed (`argon2-password.hasher.ts` derives the dummy hash lazily from the SAME ARGON2ID_OPTIONS constant used for real hashing, so it cannot drift out of sync -- a slight improvement over the design doc literal "stored as a constant" wording, since it is derived-and-cached rather than a hardcoded string; this satisfies the "kept in sync" requirement more robustly).

No drift found between design.md and the live code.

## Proposal Success Criteria (10 checkboxes) -- all genuinely true

- Seed script creates one admin user with an argon2id-hashed password -- VERIFIED (`seed.ts` + `Argon2PasswordHasher.hash`).
- Valid credentials return 2xx and set an httpOnly cookie; invalid credentials return 401 without leaking which field failed -- VERIFIED (e2e).
- A protected endpoint returns 401 without the cookie and 2xx with it -- VERIFIED (e2e /auth/me).
- A cookie reused on a protected endpoint after logout returns 401 (the deny-list guarantee) -- VERIFIED (e2e, see Requirement 5).
- GET /auth/me returns id/email when authenticated and 401 otherwise -- VERIFIED.
- Cross-origin requests carry the expected CORS response headers -- VERIFIED (on /health; not separately re-asserted on a protected endpoint, INFO-level note above).
- /health remains reachable unauthenticated -- VERIFIED.
- Web login/redirect/logout flow -- VERIFIED (LoginPage, ProtectedRoute, HealthPage tests).
- no-restricted-imports still passes -- VERIFIED (0 lint errors; @prisma/client confined to infrastructure/persistence).
- API and web test suites pass -- VERIFIED (53+4+8 API, 10 web, all green).

## Scope Discipline (Out-of-Scope check)

Grepped apps/api/src/modules and apps/web/src for register/signup/password-reset/rbac/role/throttle/rate-limit. All 3 raw hits were false positives (JwtModule.registerAsync, a code comment "registered as APP_GUARD"). No registration endpoint, no password-reset flow, no roles/RBAC beyond the single authenticated-yes/no guard, no rate limiting exists anywhere in the auth/users modules or web auth code. Confirmed clean.

## Task Completion Spot-Check

Cross-referenced tasks.md's 39 checked boxes against apply-progress PR-by-PR breakdown (6 PRs, 53 unit + 4 integration + 8 e2e + 10 web tests) and live code/test file inventory -- file counts and test counts match. Migration 20260821202334_add_user_and_revoked_token exists on disk, confirming task 2.2 was actually run, not just checked off.

## Issues Found

CRITICAL: None

WARNING: None

SUGGESTION:
- 4 lint warnings (no-unsafe-argument) in auth.controller.spec.ts mock typing -- cosmetic, no runtime risk, safe to leave or clean up in a follow-up.
- CORS e2e coverage only asserts headers on the public /health endpoint, not a protected one -- functionally equivalent (Nest CORS middleware runs before the guard) but a slightly narrower test than the spec wording "applies to any endpoint" implies. Not blocking.

## Verdict

PASS -- all 12 spec requirements verified with passing tests, all 10 design decisions implemented as decided with zero drift, all 39 tasks complete and spot-checked against live code, all 4 test suites green (75 total tests), scope discipline confirmed (no out-of-scope features leaked in). Ready to archive.
