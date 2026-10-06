# Proposal: Live user check on every authenticated request

## Intent

`AuthenticatedGuard` trusts the JWT claims for up to 2h. It checks the signature and the denylist, but it never re-reads the user. The result is a security gap (tech-debt #3):

- A **soft-deleted** user keeps full access with an existing cookie until the token expires.
- A **demoted** user keeps acting with the old `role` until the token expires, because `PermissionsGuard`, the review controllers and `/auth/me` all read `role` from the token.

ADR-011 Decision 1 explicitly accepted this staleness. This change reverses that decision: existence and `role` become live on every request.

## Scope

### In Scope
- `AuthenticatedGuard` re-reads the user through the existing `USER_REPOSITORY.findById` (ADR-010 filter). The checks run in order: signature, then denylist, then user lookup.
  - A missing or soft-deleted user gets 401, identical to an invalid token.
  - A DB error gets 401 (fail-closed).
  - `request.user` takes `role` and `email` from the DB, and `sub`, `jti` and `exp` from the token. The entity and `passwordHash` are never retained.
  - No cache.
- Minimal web UI:
  - A 401 on a non-login authenticated API call clears the `AuthProvider` session, and `ProtectedRoute` redirects to `/login`.
  - The login page then shows "Your session has ended. Please sign in again." with EN, ES and CA strings. No reason is disclosed.
- Docs: an ADR-011 addendum that supersedes the staleness acceptance (Decision 1, ~line 164), and corrections to stale code comments.

### Out of Scope
- Refresh tokens or rotation, and a per-user epoch (tech-debt #5).
- Caching.
- Deduplicating the scope and capability checkers' user reads.
- Dropping the `role` and `email` claims from the JWT.
- Live UI role refresh without a reload. The API enforces the new role immediately; the nav updates on reload or re-login.
- Returning to the previous page after re-login.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `authentication`:
  - Protected Endpoint Access Control and Session Introspection change: a valid token for a missing or soft-deleted user MUST be denied with 401, and `/auth/me` MUST return the current DB `role` and `email`.
  - The web requirements (Redirect When Unauthenticated, Login page) gain the mid-session 401 handling and the notice. The web login and session UI lives in this spec; `app-navigation` is unaffected.

## Approach

Explore approach 1 (reuse `findById`). `AuthModule` already imports `UsersModule`, following the `LoginUseCase` precedent. The `VerifiedAccessToken` type is kept, so no controller or use-case changes are needed. The web change detects 401 centrally (`apiFetch` or `AuthProvider`) and excludes the login call. Strict TDD (ADR-016) applies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/auth/presentation/guards/authenticated.guard.ts` (+ `.spec.ts`) | Modified | Lookup and rebuilt `request.user` |
| `apps/api/test/auth.e2e-spec.ts` | Modified | Implement fake `findById`; new cases |
| `permissions.guard.ts`, `types.ts`, `get-current-user.use-case.ts`, `token-issuer.port.ts` | Modified | Comments only |
| `apps/web/src/api/client.ts`, `AuthProvider.tsx`, login page, locales | Modified | 401 handling, notice, EN/ES/CA strings |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modified | Addendum |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| One extra PK query per authenticated request | High (accepted) | Indexed PK; the denylist is checked first |
| Two user reads on manager requests | High (accepted) | Dedupe deferred |
| The `auth.e2e` fake `findById` throws today | Certain | Implement it first |
| An e2e suite authenticates a user missing from its fake | Low | Scan all suites during apply |
| A deleted user's logout now returns 401 | Certain | Harmless: the web clears local state and the token is rejected anyway |
| A web 401 loop on the login call | Low | Exclude the login call; add a test |

## Rollback Plan

Revert the PR(s). There is no data migration or config change.

## Dependencies

- Each PR must pass the `ci` check (ADR-017).

## Success Criteria

- [ ] E2E: a soft-deleted user's existing cookie gets 401 on `/auth/me`.
- [ ] E2E: after a demotion, the user's next request gets 403 on a permissioned route, and `/auth/me` shows the new role.
- [ ] Guard unit tests:
  - a denylisted `jti` causes no lookup;
  - a repository error gives 401;
  - `@Public()` routes cause no lookup.
- [ ] Web: a mid-session 401 lands on `/login` with the notice. This is verified in the browser, and the ES/CA strings by locale tests.

## Size

About 450-550 changed lines, roughly half of them tests. Suggested chain (stacked-to-main):
1. API guard, tests and ADR (~300 lines).
2. Web 401 handling and notice (~200 lines).
