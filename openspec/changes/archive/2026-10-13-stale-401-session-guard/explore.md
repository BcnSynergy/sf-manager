# Exploration: stale-401-session-guard (TD-25)

## Current State

- The access token is an httpOnly cookie, invisible to JS (`apps/web/src/auth/AuthProvider.tsx:36-38`). The web app holds no token string, so there is no existing session identity; the only proxy is `userRef` (`AuthProvider.tsx:46`), which only means "a user is set".
- `apiFetch` (`apps/web/src/api/client.ts:53-101`) sends `credentials: 'include'`; on any non-ok response it parses the body, then at `client.ts:86-88` calls the module-level `unauthorizedHandler?.()` and throws `ApiError`.
- `setUnauthorizedHandler` (`client.ts:45-49`) takes a zero-argument callback. `AuthProvider` registers it in a mount effect (`AuthProvider.tsx:65-74`): it returns if `userRef.current === null`, otherwise calls `updateUser(null)` and `setSessionEnded(true)`.
- Mount-time `/auth/me` (`AuthProvider.tsx:54`), `login` (`:77`) and `logout` (`:110`) use raw `fetch` and bypass the handler.
- Existing race guards: `logout()` nulls `userRef` before the request, so a 401 landing mid-logout is ignored (`:107`); `login()` clears `sessionEnded` then sets the user (`:93-94`). Neither guard is time-aware: a request issued under session A that returns 401 after session B starts sees `userRef` set and ends B. That is the bug.
- Consumers: `LoginPage.tsx:23,85-86` renders `data-testid="login-session-ended"` when `sessionEnded && !error`; `ProtectedRoute` redirects on `user === null`. No other code calls `setUnauthorizedHandler`.
- Tests: `apps/web/src/auth/AuthProvider.test.tsx:196-276` ("session ended on a mid-session 401": 401 while logged in, while logged out, two collapsed 401s, flag cleared on login, 401 during logout, handler cleanup on unmount); `apps/web/src/api/client.test.ts:208-260` (handler invocation, no handler, handler cleared).
- Specs (`openspec/specs/authentication/spec.md`): "Redirect When Unauthenticated (Web)" `:366-381` with scenario "Session ends mid-session" `:378`; "Session-Ended Notice (Web)" `:383-405` with scenario "Mid-session 401" `:391`. Both say any authenticated API call returning 401 ends the session, with no notion of which session issued the request.
- ADR-011 addendum 2026-10-06 item 6 (`docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:478-486`) records the open question, suggests an epoch captured at request start, and notes no single automated test covers "mid-session 401 followed by redirect to `/login`". TD-25 is at `docs/technical-debt.md:27`. The `auth-live-user-check` archive-report W-2 text was not located.

## Affected Areas

- `apps/web/src/api/client.ts`: capture the epoch at request start; compare before invoking the handler.
- `apps/web/src/auth/AuthProvider.tsx`: advance the epoch at session boundaries.
- `apps/web/src/api/client.test.ts`, `apps/web/src/auth/AuthProvider.test.tsx`: new tests.
- `openspec/specs/authentication/spec.md`: MODIFIED delta for the two requirements above, with new scenarios.
- `docs/technical-debt.md`: move TD-25 to Resolved; one-line note on ADR-011 item 6.
- Unaffected: the API, `LoginPage`, `ProtectedRoute`, i18n files.

## Approaches

1. **(a) Epoch counter owned by `client.ts`.** `client.ts` holds `let sessionEpoch = 0` and exports `advanceSessionEpoch()`. `apiFetch` captures the epoch before `fetch`; on 401 it calls the handler only if the epoch is unchanged. `AuthProvider` advances it right after a successful login response (before `updateUser`), at the start of `logout()` next to `userRef = null`, and inside the handler when it ends the session. Whether the mount `/auth/me` restore also advances is a design detail.
   - Pros: simplest; the handler stays `() => void`, so existing tests keep working; covers stale 401s while logged out, during login, and across logout plus login.
   - Cons: module-level mutable singleton (same pattern as `unauthorizedHandler`); tests must reset it.
   - Effort: Low.
2. **(b) Compare the token sent with the current token.** Not feasible: the token is an httpOnly cookie, so JS can neither read nor attach it.
3. **(c1) Epoch owned by `AuthProvider`, passed through the handler.** `apiFetch` calls a registered `getEpoch()` at start and `handler(epochAtStart)` on 401.
   - Pros: state lives next to `userRef`.
   - Cons: two registered callbacks or a changed handler signature (touches client tests); no getter before the provider mounts.
   - Effort: Low to Medium.
4. **(c2) Per-request `AbortController`, abort on session change.** Needs an in-flight registry and changes caller error semantics. Over-scoped for TD-25. Effort: High.

## Recommendation

Option (a): minimal, test-friendly, matches the ADR's own suggestion, keeps the handler contract.

Edge cases the design must cover:

- Stale 401 while logged out: already ignored by the null check; the epoch also makes it a no-op.
- Stale 401 during login: a request started before the login response advanced the epoch is stale; one started after is current.
- Concurrent 401s from the same epoch collapse via the epoch advance inside the handler.
- Logout then re-login with a 401 from a pre-logout request: the epoch advances at logout start and at login, so it is stale.
- The stale request's caller still receives `ApiError(401)`; only the session-ending side effect is suppressed.

Delta-spec shape (MODIFIED, `authentication`):

- "Session-Ended Notice (Web)": only an authenticated API call issued under the current session that returns 401 ends it. New scenario "Stale 401 after re-login does not end the new session": GIVEN a request issued under a previous session, WHEN the user signs in again and then that request returns 401, THEN the new session MUST remain active and no session-ended notice MUST be shown.
- "Redirect When Unauthenticated (Web)": same constraint on "Session ends mid-session".
- Possibly one "stale 401 across logout" scenario.

Tests (vitest + testing-library in `apps/web`):

- `client.test.ts`: handler not invoked when the epoch advances between request start and the 401; invoked when unchanged; reset in `beforeEach`.
- `AuthProvider.test.tsx` with deferred fetch promises: start a data call, log out and in again (or log in over a session), resolve with 401, assert `user` still set and `sessionEnded` false. Optionally the whole-flow test from ADR item 6.

ADR-006 scope: minimal and web-only; API unchanged; no new entity, VO or endpoint.

UI and browser verification: no visible UI change except the notice no longer appearing on a stale 401. CLAUDE.md requires a browser pass for `apps/web/**`. The race is hard to hit by hand (DevTools throttling or request blocking plus a re-login). Alternative: deterministic unit tests for the stale path, stated as test-verified only, plus a browser pass confirming the golden path and the mid-session notice are unregressed.

Size estimate: about 120-200 changed lines (client.ts ~8, AuthProvider.tsx ~10, tests ~80-120, spec/TD/ADR ~40-60). One PR plus an archive PR, well under 400.

## Decision Gaps for the User (not decided)

1. Should the stale request's caller still receive `ApiError(401)`? Recommended: yes (minimal; suppressing it changes the error contract).
2. Include a "stale across logout, then login" scenario, or only "re-login without logout"?
3. Browser pass: manual throttle-based exercise of the race, or golden-path regression only with the stale path stated as test-verified?
4. Add the whole-flow test from ADR item 6 (mid-session 401 then redirect to `/login`) in this slice? Related, but extra scope under ADR-006.
5. Should the mount-time `/auth/me` restore advance the epoch?

## Risks

- The epoch must advance before `updateUser(data)` on login and at the start of `logout()`; wrong ordering reopens the race, so tests must pin it.
- Module-level state must be reset in tests (vitest isolates modules per file).
- Low likelihood and low blast radius: keep source changes to about 20 lines.
- The W-2 archive-report text was not located; origin evidence relies on TD-25 and ADR item 6.

## Ready for Proposal

Yes, after the user answers gaps 1 and 3 at least. Per the project rule this is SDD (alters behavior `openspec/specs/authentication` describes). The slice has no new UI.

## Decision Gap Answers (2026-10-13)

1. A stale 401 still rejects the caller with `ApiError(401)`; it only skips the session-ended handler.
2. Yes: include a "stale 401 across logout" scenario (request sent before logout, 401 after it raises no notice).
3. Browser pass covers golden-path regression only (login, logout, mid-session notice, redirect); the stale path is reported as test-verified only.
4. Yes: add the ADR-011 item 6 whole-flow test (mid-session 401 followed by redirect to `/login`) in this slice.
5. No: the mount-time `/auth/me` restore does not advance the epoch (`userRef` is null while it is in flight, and a page load leaves no prior request in flight).
