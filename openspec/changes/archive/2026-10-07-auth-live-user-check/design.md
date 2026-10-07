# Design: Live user check on every authenticated request

## Technical Approach

The API side reuses `USER_REPOSITORY.findById` inside `AuthenticatedGuard` (explore approach 1). The web side gets one 401 hook in `apiFetch`, which `AuthProvider` registers to. Both follow existing patterns, and no new ports, modules or dependencies are needed.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|----------|----------|-----------|
| D1 | The guard runs `verify` -> `isRevoked` -> `findById(payload.sub)`, all inside the existing try/catch. A `null` result throws 401, and any thrown error becomes 401. | Parallel denylist and lookup; a cache | Sequential order means a revoked token never costs a user query (spec "Revoked token needs no lookup"). Fail-closed reuses the existing catch. A cache would bring the staleness back. |
| D2 | `request.user = { sub, jti, exp }` from the payload plus `{ email, role }` from the entity, built field by field | `{ ...payload, ...}`; storing the `User` | Building it field by field means the entity and `passwordHash` cannot leak, and stray claims such as `iat` do not ride along. `VerifiedAccessToken` stays unchanged, so no controller, decorator or use case changes. |
| D3 | DI uses `@Inject(USER_REPOSITORY)` as a 5th constructor argument | A new `ActiveUserLookup` port | `AuthModule` already imports `UsersModule`, which exports `USER_REPOSITORY`, and `LoginUseCase` already injects it. APP_GUARD resolves in the `AuthModule` injector. `UsersModule` imports no other module, so the graph stays acyclic. All e2e suites already override `USER_REPOSITORY` with a fake. |
| D4 | `client.ts` exposes `setUnauthorizedHandler(fn \| null)`. `apiFetch` calls the handler on status 401, then throws `ApiError(401)` as before. `AuthProvider` registers it in a `useEffect` that returns `() => setUnauthorizedHandler(null)`. | An interceptor inside `AuthProvider`; a global event bus; registering during render | `apiFetch` is the only data-call seam. Login, logout and the mount-time `/auth/me` use raw `fetch` in `AuthProvider`, so they are excluded by construction. That makes the "not logged in at mount" case and a failed login unable to show the notice. Existing callers are unchanged. `main.tsx` uses StrictMode (effects run, clean up, run again), so the cleanup keeps exactly one live handler and none after unmount. |
| D5 | `AuthProvider` holds a `sessionEnded` flag in memory. The handler acts only when `userRef.current !== null`: it calls `setUser(null)` and `setSessionEnded(true)`. `userRef.current` is assigned wherever `setUser` is called, never in an effect. A successful `login()` resets the flag. `logout()` sets `userRef.current = null` and `setSessionEnded(false)` synchronously before its fetch, and again in `finally` alongside `setUser(null)`. | Router `location.state`; a `?reason=` query param; syncing the ref in an effect | Both rejected options survive a manual reload (history state persists, and the URL does too). In-memory state resets on reload, which gives a clean `/login`. The handler is idempotent, so several concurrent 401s collapse into one transition. Clearing the ref before the logout fetch closes the race where a concurrent `apiFetch` 401 lands mid-logout and shows the notice after an explicit logout. An effect-synced ref would lag one render and reopen that window. The web has no React Query, so there is no cache to invalidate. |
| D6 | `LoginPage` renders the notice when `sessionEnded && !error`, and clears `sessionEnded` when a login attempt is submitted | A separate dismiss API | The handler never fires for a login call. Hiding the notice once a login error shows keeps the "failed login shows no notice" rule simple. Clearing on submit stops the notice from reappearing when a failed login's error is later cleared. |

## Data Flow

    cookie -> verify -> isRevoked? -401-> 
                 |no
                 v
           findById(sub) -null/throw-> 401
                 | user
                 v
     request.user {sub,jti,exp,email,role} -> PermissionsGuard (live role)

    web: apiFetch 401 -> handler -> setUser(null), sessionEnded=true
         -> ProtectedRoute <Navigate /login> -> LoginPage shows notice

## File Changes

| File | Action | Est. lines |
|------|--------|-----------|
| `apps/api/src/modules/auth/presentation/guards/authenticated.guard.ts` | Lookup and rebuilt user | code ~25 |
| `.../guards/authenticated.guard.spec.ts` | 5th dependency as a shared `userRepository` mock built in `beforeEach` (the guard is constructed there with 4 args today, ~L55-60); every existing happy-path case gets a `findById` stub; new cases | test ~140 |
| `apps/api/test/review-history.e2e-spec.ts` | Rewrite "a soft-deleted granted MANAGER sees nothing, even reusing the same session" (~L1152-1193): both reused-session calls now expect 401, and the comment (L1152-1159) explains the guard rejects before the capability checker. Checker fail-closed stays pinned by the existing unit case `user-manager-capability.checker.spec.ts` L62 (keep it). | test ~25 |
| Comments: `token-issuer.port.ts` (L16-19), `get-current-user.use-case.ts` (L11-16), `login.use-case.ts` (L73-74), `permissions.guard.ts` (L18-22), `presentation/types.ts` (L5-6), `users/infrastructure/authorization/user-manager-capability.checker.ts` (L33-37, now "defense in depth") | Comments only | code ~30 |
| `apps/api/test/auth.e2e-spec.ts` | Drop the local fake, use the shared `InMemoryUserRepository` (real `findById`/`updateById`/`softDeleteById`), add new cases | test ~110 |
| `apps/api/test/users.e2e-spec.ts` | Real demotion and deletion via the API | test ~60 |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Addendum | docs ~45 |
| `apps/web/src/api/client.ts` (+test) | Handler hook; tests use `afterEach(() => setUnauthorizedHandler(null))` | code ~12 / test ~45 |
| `apps/web/src/auth/AuthProvider.tsx` (+test) | Flag, ref, effect registration with cleanup, synchronous logout reset, `clearSessionEnded()` on the context; fix comment L10-14 | code ~38 / test ~120 |
| `apps/web/src/pages/LoginPage.tsx` (+test) | Notice; clear the flag on submit | code ~7 / test ~55 |
| `apps/web/src/i18n/locales/{en,es,ca}.json`, `locales.test.ts` | `auth.sessionEnded` | code 3 / test ~12 |

i18n key `auth.sessionEnded`:
- EN "Your session has ended. Please sign in again."
- ES "Tu sesión ha terminado. Vuelve a iniciar sesión."
- CA "La teva sessió ha acabat. Torna a iniciar la sessió."

These follow the existing tú/tu style ("Introduce", "Introdueix").

## Testing Strategy (Strict TDD, RED first)

| Layer | Cases | RED mechanism |
|-------|-------|---------------|
| Guard unit | User found: `request.user` holds the DB role and email, not the token's, and has no `passwordHash` key (exact `toEqual`). Token email differs from stored email: `request.user.email` is the stored one. `null`: 401. Lookup rejects: 401. Denylisted: `findById` not called. `@Public()`: no lookup. Invalid token: no lookup. `findById` is called with `payload.sub`. | First a compile failure (the 5th constructor arg does not exist yet), then behavioral failures once the arg is added without the lookup |
| E2E `auth.e2e-spec.ts` | Second seeded user: log in, `softDeleteById`, then `/auth/me` returns 401. Log in, `updateById` role to `MAINTENANCE_TECHNICIAN`, then `/auth/me` returns the new role. Email change: `/auth/me` returns the new email. Existing cases stay green. | Today these return 200 with token claims, so the new assertions fail non-vacuously |
| E2E `users.e2e-spec.ts` | Two admins, with B logged in. A `PATCH`es B to `MANAGER`, then B gets 403 on `GET /users` (`user:read`). A `DELETE`s B, then B gets 401 on `/auth/me`. This is the real write path. | Today both calls return 200 |
| E2E `review-history.e2e-spec.ts` | Rewritten soft-deleted MANAGER case: both reused-session calls return 401 | Today 200 `[]` and 404 |
| Web unit | `client.test`: a 401 invokes the handler and still throws `ApiError(401)`. A 403 or 500 does not invoke it. Nothing breaks with no handler. `AuthProvider.test`: a 401 while logged in makes `user` null and `sessionEnded` true. A 401 while logged out sets no flag. Two 401s give a single transition. `login()` clears the flag. A 401 during `logout()` does not show the notice. Unmounting `AuthProvider` clears the handler (a later 401 calls nothing). `LoginPage.test`: the notice shows when the flag is set, does not show on a failed login, hides once an error shows, and stays hidden after submit even when the error is later cleared. `locales.test`: exact ES/CA/EN wording via `it.each`. | Missing export / missing key fails first, then behavior |
| Integration | None. `findById` against Prisma is already covered by `prisma-user.repository.integration.spec.ts`. | — |

Apply-time scan: `review-history.e2e-spec.ts` ~L1160 is the one known suite that reuses a session after deleting its own caller (rewritten above). Other suites that delete or re-role users are unaffected because the affected user is never the logged-in caller: community ~L867/L903, maintenance-company ~L609/L644, users ~L521; review-history ~L1887 `PATCH` changes only `maintenanceCompanyId`. Apply must re-scan all suites for any test that reuses a session after deleting or re-roling its own caller.

## ADR-011 Addendum Outline (2026-10-06)

- It supersedes item 1 of the 2026-08-22 addendum, and the staleness note in the 2026-09-09 addendum (~L345).
- The guard re-reads the user on every request. Existence and `role`/`email` are now live. The JWT `role`/`email` claims become advisory.
- Rationale: the guard already does a DB read per request (the denylist), so one more PK read is marginal.
- Residual: a request already in flight when the user is deleted still completes. A deleted user's logout returns 401.
- Deferred: the epoch and refresh tokens (#5), a cache, deduping the checker reads, dropping the claims, and live UI role refresh.

## Delivery

Chain: stacked-to-main. Both PRs must pass `ci` (ADR-017).

- **PR 1**: `auth-live-user-check/01-guard-live-user-check`. Title: `fix(auth): PR 1/2 — live user check in AuthenticatedGuard`. Contents: API, ADR, and the openspec change folder. About 55 lines of code, 335 of tests (guard spec ~140, auth e2e ~110, users e2e ~60, review-history e2e ~25), and 45 of docs (plus the openspec artifacts): ~435 total. It likely exceeds the 400-line budget, with the excess entirely tests/docs (code is ~55). That fits the CLAUDE.md size-exception rule; the user decides at tasks.
- **PR 2**: `auth-live-user-check/02-web-session-ended`. Title: `feat(web): PR 2/2 — session-ended notice on mid-session 401`. About 60 lines of code and 232 of tests (~292 total).

The split holds: PR 1 is a self-contained security fix. Archiving follows the recent `NN-archive` precedent.

## Browser Verification (PR 2)

1. **Mid-session 401 with no data change.** Log in as `technician@` and open a list page. In a second tab, log out (same cookie jar). In the first tab, trigger any data call. Expect `/login` with the notice. Reloading must clear the notice.
2. **Failed login.** A failed login shows only the generic error.
3. **Soft-delete path, with the user's OK.** An admin in an incognito window creates a QA user and deletes it while that user is logged in elsewhere. No seeded rows are touched.

## Migration / Rollout

No migration required. Rollback means reverting the PRs.

## Open Questions

- [ ] None blocking. Live nav refresh after a role change stays out of scope.
