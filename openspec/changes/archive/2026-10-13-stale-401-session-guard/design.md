# Design: Stale 401 Session Guard (TD-25)

## Technical Approach

Exploration option (a), as fixed by the proposal and the "Decision Gap
Answers (2026-10-13)" in `explore.md`:

1. `apps/web/src/api/client.ts` gains a module-level `sessionEpoch` counter,
   next to the existing module-level `unauthorizedHandler`, and exports
   `advanceSessionEpoch()`.
2. `apiFetch` captures the epoch synchronously at entry, before `fetch`. On a
   401 it invokes the handler only if the epoch still equals the captured
   value. It throws `ApiError(401, code, extra)` in every case (gap answer 1).
3. `AuthProvider` advances the epoch at the three session boundaries: a
   successful login response, the start of `logout()`, and inside the
   unauthorized handler when it ends the session. The mount-time
   `/auth/me` restore does not advance it (gap answer 5).

The handler contract stays `() => void`. No API, cookie, or server change.
The delta spec (`specs/authentication/spec.md`, written by `sdd-spec`)
narrows "Redirect When Unauthenticated (Web)" and "Session-Ended Notice
(Web)" to 401s from calls issued under the current session.

## Architecture Decisions

### Decision 1: The epoch lives in `client.ts`, compared by value

**Choice**:

```ts
// stale-401-session-guard design.md Decision 1
let sessionEpoch = 0;

export function advanceSessionEpoch(): void {
  sessionEpoch += 1;
}
```

In `apiFetch`, `const epochAtStart = sessionEpoch;` is the first statement,
and the 401 branch becomes:

```ts
if (response.status === HTTP_UNAUTHORIZED && epochAtStart === sessionEpoch) {
  unauthorizedHandler?.();
}
throw new ApiError(response.status, code, extra);
```

The comparison and the handler call are in one synchronous segment, with no
`await` between them, so a handler that advances the epoch (Decision 3)
reliably makes every later 401 check from the same epoch fail.

**Alternatives considered**:

- (b) Compare the token sent with the current token. Not feasible: the
  access token is an httpOnly cookie, invisible to JS
  (`AuthProvider.tsx:36-38`).
- (c1) Epoch owned by `AuthProvider`, read through a registered getter and
  passed to the handler as `handler(epochAtStart)`. It needs a second
  registered callback or a changed handler signature (touching every
  existing client and provider handler test), and there is no getter before
  the provider mounts. Rejected in the proposal's Out of Scope.
- (c2) Per-request `AbortController` registry, aborting in-flight requests
  on session change. It changes caller error semantics (an abort is
  currently `ApiError(0)`, not 401) and needs an in-flight registry.
  Over-scoped for TD-25.

**Rationale**: about 6 source lines; follows the module-singleton pattern
`unauthorizedHandler` already uses; keeps the handler contract, so existing
tests stay valid; matches the fix ADR-011 addendum item 6 suggests.

### Decision 2: No test reset hook

**Choice**: export only `advanceSessionEpoch()`. No `resetSessionEpoch()` or
other test-only export.

**Alternatives considered**: a reset function called in `beforeEach`, as
the proposal's Risks row suggests.

**Rationale**: `apiFetch` compares the epoch relative to its own captured
value; the absolute number never matters. A value carried over from an
earlier test cannot change any outcome, because no request is in flight
across tests (each test awaits its calls). vitest also isolates module state
per file. The proposal's "epoch reset per test" concern is therefore met
without a production export that exists only for tests. If a later test
needs absolute values, adding a reset is a one-line change.

### Decision 3: Advance points and their ordering (pinned)

| Where                | Exact position                                                                                                              | Purpose                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `login()`            | Immediately after the `!response.ok` check, before `await response.json()`, `setSessionEnded(false)` and `updateUser(data)` | Requests issued under the previous session (or while logged out) become stale                            |
| `logout()`           | First statement, next to `userRef.current = null`, before `await fetch('/auth/logout')`                                     | Requests issued before logout become stale                                                               |
| Unauthorized handler | After the `userRef.current === null` early return, before `updateUser(null)` and `setSessionEnded(true)`                    | The session it ends is over; concurrent 401s from the same epoch collapse                                |
| Mount `/auth/me`     | Not advanced                                                                                                                | `userRef` is null while it is in flight and a page load leaves no prior request in flight (gap answer 5) |

**Why ordering matters**: the guard only works if the epoch advances no
later than the new session becomes visible to the handler, which happens
when `updateUser(data)` sets `userRef`. If the advance were placed after
`updateUser` with any `await` in between (for example after a later async
step in `login()`), a 401 from a session-A request resolving in that gap
would find `userRef` set to session B and an unchanged epoch, end session B,
and show the notice. That is exactly the TD-25 race. Advancing right after
`response.ok` closes the gap entirely: the browser applies the new
`Set-Cookie` when the response headers arrive, so that is the true session
boundary, and every request issued before it is stale. A body-parse failure
after the advance leaves no user set, which is harmless: it only marks older
requests stale.

In `logout()`, the advance sits beside the existing `userRef.current = null`
reset so both "session over" signals change in the same synchronous step,
before the logout request. Strictly, the login advance alone already covers
"pre-logout request, 401 after a new login". The logout advance keeps the
rule "every session boundary advances the epoch" true on its own and covers
a 401 that lands after logout but before the next login, without relying on
the `userRef` null check.

In the handler, the advance comes before `updateUser(null)`, so any other
401 from the same epoch that is checked afterwards skips the handler. The
existing `userRef` null check stays as a second guard.

**Alternatives considered**: advancing in `updateUser` (it is also called by
the mount restore and by logout's `finally`, which would advance at the
wrong times and contradict gap answer 5); advancing in logout's `finally`
(too late: the window during the logout request would rely only on the null
check).

### Decision 4: The stale caller still gets `ApiError(401)`

**Choice**: only the session-ending side effect is suppressed. The caller's
promise rejects exactly as today (gap answer 1).

**Rationale**: the error contract of `apiFetch` stays unchanged. Callers
already handle a rejected data call; the component that issued a stale
request is usually unmounted or about to re-fetch under the new session.

### Decision 5: Whole-flow test in a dedicated file

**Choice**: the ADR-011 item 6 whole-flow test lives in a new
`apps/web/src/auth/session-ended-flow.test.tsx`. It renders the real
`AuthProvider`, a `MemoryRouter` at `/`, a `Routes` tree with a
`ProtectedRoute`-wrapped probe at `/` and the real `LoginPage` at `/login`,
and imports `../i18n` as `LoginPage.test.tsx` does. Fetch is stubbed:
`/auth/me` returns a user, any data call returns 401.

**Alternatives considered**:

- `AuthProvider.test.tsx`, as listed in the proposal's Affected Areas. That
  file is a provider unit test with a probe component and a
  `setUnauthorizedHandler` mock wrapper; adding the router, `LoginPage` and
  i18n there mixes levels.
- Rendering `AppRoutes` from `App.tsx`. It pulls in `AppLayout` and every
  authenticated route; far more than the flow needs.

**Rationale**: the test covers the composition that no single test covers
today (handler, then `ProtectedRoute` redirect, then the `LoginPage`
notice), with the smallest real tree. This is a small deviation from the
proposal's file list, not from its scope.

## Data Flow

```
apiFetch(path)
  epochAtStart = sessionEpoch ─────────────┐
  await fetch(...)                          │   meanwhile AuthProvider may call
  response 401                              │   advanceSessionEpoch():
  parse body                                │     login() after response.ok
  epochAtStart === sessionEpoch ?  ◄────────┘     logout() first statement
     yes ──→ unauthorizedHandler()                handler, when ending a session
               userRef null? → return
               advanceSessionEpoch()
               updateUser(null); setSessionEnded(true)
               → ProtectedRoute: user null → <Navigate to="/login">
               → LoginPage: sessionEnded && !error → notice
     no  ──→ (skip handler: stale request)
  throw ApiError(401)   (both branches)
```

Timeline of the fixed race (re-login):

```
epoch 0  GET /users issued under A ............................ 401 arrives
epoch 1           POST /auth/login ok → advance → updateUser(B)    0 ≠ 1 → skip
```

## File Changes

| File                                                                    | Action            | Description                                                                                                    |
| ----------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/api/client.ts`                                            | Modify            | `sessionEpoch`, `advanceSessionEpoch()`, capture at entry, epoch check on 401; comment referencing this design |
| `apps/web/src/auth/AuthProvider.tsx`                                    | Modify            | Three `advanceSessionEpoch()` calls (Decision 3) with ordering comments                                        |
| `apps/web/src/api/client.test.ts`                                       | Modify            | Epoch tests in the "unauthorized handler" describe                                                             |
| `apps/web/src/auth/AuthProvider.test.tsx`                               | Modify            | Deferred data response option in `sessionFetch`; stale-after-relogin and stale-across-logout tests             |
| `apps/web/src/auth/session-ended-flow.test.tsx`                         | Create            | Whole-flow test (Decision 5)                                                                                   |
| `openspec/changes/stale-401-session-guard/specs/authentication/spec.md` | Create (sdd-spec) | Delta spec                                                                                                     |
| `docs/technical-debt.md`                                                | Modify            | TD-25 to Resolved with change name and PR number                                                               |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`              | Modify            | Resolution note on addendum 2026-10-06 item 6 (epoch guard and whole-flow test)                                |

Unaffected: the API, `LoginPage.tsx`, `ProtectedRoute.tsx`, i18n files.

## Interfaces / Contracts

```ts
// apps/web/src/api/client.ts (new export)
export function advanceSessionEpoch(): void;

// unchanged
export function setUnauthorizedHandler(handler: (() => void) | null): void;
export async function apiFetch<T = undefined>(path: string, init?: RequestInit): Promise<T>;
```

`AuthContextValue` is unchanged. HTTP contract unchanged.

## Testing Strategy

Strict TDD: each test below is written and observed RED before the
production line it covers. Runner: vitest + Testing Library in `apps/web`
(`npm run test --workspace=apps/web`).

| Layer                                | What to Test                                                                                                 | Approach                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`client.test.ts`)              | Handler skipped when the epoch advances between request start and the 401; caller still gets `ApiError(401)` | `fetch` stub returns a deferred promise; call `apiFetch`, call `advanceSessionEpoch()`, resolve with 401; assert handler not called and error status 401                                                             |
| Unit (`client.test.ts`)              | Handler invoked when the epoch advanced before the request started                                           | `advanceSessionEpoch()` then `apiFetch` with an immediate 401; handler called once (triangulates "captured at start", not "never changed")                                                                           |
| Unit (`client.test.ts`)              | Existing invoke / 403 / 500 / no handler / cleared handler cases                                             | Unchanged, must stay green                                                                                                                                                                                           |
| Provider (`AuthProvider.test.tsx`)   | Stale 401 after re-login does not end the new session                                                        | Logged in via `/auth/me`; start `apiFetch('/users')` with a deferred 401; click login and wait for the user; resolve the 401; assert user still set, `probe-ended` false, and the call rejected with `ApiError(401)` |
| Provider (`AuthProvider.test.tsx`)   | Stale 401 across logout raises no notice                                                                     | Logged in; start a deferred data call; logout, then login; resolve the 401; assert user set and `probe-ended` false                                                                                                  |
| Provider (`AuthProvider.test.tsx`)   | Current-session 401, collapse of two 401s, 401 during logout, flag cleared on login                          | Existing tests, unchanged; they now pass through the epoch path as well                                                                                                                                              |
| Flow (`session-ended-flow.test.tsx`) | Mid-session 401 → redirect to `/login` → notice (ADR-011 item 6)                                             | Real `AuthProvider` + `MemoryRouter` + `ProtectedRoute` + `LoginPage`; wait for the protected probe; `apiFetch` returns 401; assert the probe is gone, `LoginPage` is rendered and `login-session-ended` is shown    |

`sessionFetch` gets an optional `data?: () => Promise<Response>` so a test can
hold the data response open, mirroring the existing `logout` option. The
ordering in Decision 3 is pinned by the two provider tests: removing either
the login advance or advancing only after a later `await` makes them fail.
The sub-tick order between the advance and `updateUser` inside one
synchronous segment is not observable and is documented by code comments.

Browser verification (CLAUDE.md, gap answer 3): golden-path regression only
(login, logout, a mid-session 401 showing the notice, redirect to `/login`).
The stale path is reported as test-verified only.

## Threat Matrix

N/A: there is no routing, shell, subprocess, VCS or PR automation,
executable-file classification, or process-integration boundary. The change
is client-side session state; the auth contract and cookie handling are
unchanged.

## Migration / Rollout

No migration required. Web-only, no persisted state, no API change. One
implementation PR (`stale-401-session-guard/01-<slug>`, about 150-200
lines, mostly tests) and one archive PR. Rollback: revert the
implementation PR; if reverted after archive, move TD-25 back to Open and
remove the ADR-011 note in the same revert PR.

## Open Questions

- [ ] Non-blocking: the proposal lists `AuthProvider.test.tsx` for the
      whole-flow test; this design places it in a new
      `session-ended-flow.test.tsx` (Decision 5). Confirm in `sdd-tasks` or
      keep the proposal's location.
- [ ] Non-blocking: the proposal's Risks row mentions resetting the epoch
      in `beforeEach`; Decision 2 drops the reset hook as unnecessary.
