# Proposal: Stale 401 Session Guard (TD-25)

## Intent

The web app ends the local session on any authenticated API call that
returns 401 while a user is set (`apps/web/src/api/client.ts:86-88`,
handler in `apps/web/src/auth/AuthProvider.tsx:65-74`). The handler has
no notion of which session issued the request. A request sent under
session A that only returns 401 after session B has started (re-login,
or logout followed by login) therefore ends the new, valid session B and
shows the "Your session has ended" notice without cause.

This is TD-25 (`docs/technical-debt.md:27`) and ADR-011 addendum
2026-10-06 item 6 (`docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:478-486`).
The same ADR item notes that no single automated test covers the whole
"mid-session 401 followed by redirect to `/login`" flow; this slice
closes that gap as well.

Success: a 401 from a request issued under a previous session never ends
the current session, while a 401 from a request issued under the current
session still ends it exactly as today.

## Scope

### In Scope
- A session epoch in the web API client: captured when each `apiFetch`
  request starts; on 401 the unauthorized handler runs only if the epoch
  is unchanged.
- `AuthProvider` advances the epoch at session boundaries: after a
  successful login response (before `updateUser`), at the start of
  `logout()`, and inside the unauthorized handler when it ends the
  session.
- The stale request's caller still receives `ApiError(401)`; only the
  session-ending side effect is suppressed (user decision 1).
- Unit tests in `apps/web/src/api/client.test.ts` (handler skipped when
  the epoch advanced, invoked when unchanged, epoch reset per test).
- Provider tests in `apps/web/src/auth/AuthProvider.test.tsx` with
  deferred fetches: stale 401 after re-login, and stale 401 across logout
  (user decision 2).
- The ADR-011 item 6 whole-flow test: mid-session 401 followed by the
  redirect to `/login` with the session-ended notice (user decision 4).
- Delta spec for `authentication` (two MODIFIED requirements, see below).
- Register updates in the delivering PR: TD-25 moves to Resolved; a
  resolution note is added to ADR-011 addendum item 6.
- Commit the currently untracked `explore.md` with this change's
  artifacts in the first PR.

### Out of Scope
- Any API change. The access token stays an httpOnly cookie; the server
  contract is unchanged.
- Advancing the epoch on the mount-time `/auth/me` restore (user
  decision 5: `userRef` is null while it is in flight, and a page load
  leaves no prior request in flight).
- Aborting in-flight requests on session change (`AbortController`
  registry, exploration option c2); over-scoped for TD-25.
- Changing the unauthorized handler signature or moving epoch ownership
  into `AuthProvider` (exploration option c1).
- Manual browser reproduction of the race (user decision 3).
- New UI. This is a fix of existing web behavior, not a new domain
  slice, so the CLAUDE.md "every domain slice includes its own minimal
  UI" rule does not require UI work. The only visible effect is that the
  existing notice no longer appears on a stale 401.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `authentication`:
  - "Redirect When Unauthenticated (Web)": the "Session ends mid-session"
    behavior applies only to a 401 from a call issued under the current
    session; add a scenario where a stale 401 does not clear the session
    or redirect.
  - "Session-Ended Notice (Web)": only a 401 from a call issued under the
    current session ends it and shows the notice. Add scenarios "Stale
    401 after re-login does not end the new session" and "Stale 401
    across logout raises no notice".

## Approach

Exploration option (a), matching the ADR-011 item 6 suggestion:

- `apps/web/src/api/client.ts` holds a module-level `sessionEpoch`
  counter (same pattern as the existing `unauthorizedHandler`) and
  exports `advanceSessionEpoch()`. `apiFetch` captures the epoch before
  `fetch`; on a 401 it invokes the handler only when the epoch still
  equals the captured value, then throws `ApiError` in every case.
- `AuthProvider.tsx` calls `advanceSessionEpoch()` after a successful
  login response and before `updateUser`, at the start of `logout()`
  next to the existing `userRef` reset, and inside the handler when it
  ends the session (which also collapses concurrent 401s from one
  session).
- The handler contract stays `() => void`, so existing client and
  provider tests keep working.
- Ordering is pinned by tests, since advancing after `updateUser` on
  login would reopen the race.

Verification: unit/provider tests are the evidence for the stale path,
reported as test-verified only. Because the PR touches `apps/web/**`, a
browser pass confirms golden-path regression only: login, logout, the
mid-session notice, and the redirect to `/login`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/api/client.ts` | Modified | Epoch counter, `advanceSessionEpoch()`, epoch check before invoking the handler |
| `apps/web/src/auth/AuthProvider.tsx` | Modified | Advance the epoch at login success, logout start, and session end in the handler |
| `apps/web/src/api/client.test.ts` | Modified | Epoch-aware handler tests; reset in `beforeEach` |
| `apps/web/src/auth/AuthProvider.test.tsx` | Modified | Stale 401 after re-login, stale 401 across logout, whole-flow redirect test |
| `openspec/changes/stale-401-session-guard/specs/authentication/spec.md` | New | Delta spec (MODIFIED requirements) |
| `docs/technical-debt.md` | Modified | TD-25 moved to Resolved |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modified | Resolution note on addendum item 6 |

Unaffected: the API, `LoginPage`, `ProtectedRoute`, i18n files.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrong ordering of the epoch advance (after `updateUser`, or late in `logout()`) reopens the race | Low | Tests with deferred fetches pin the ordering |
| Module-level epoch leaks between tests | Low | Reset in `beforeEach`; vitest isolates modules per file |
| A legitimate current-session 401 is wrongly treated as stale | Low | Existing "session ended on a mid-session 401" tests stay green; whole-flow test added |
| The stale path is not browser-verified | Medium (accepted) | Deterministic tests; stated explicitly as test-verified only (user decision 3) |
| The `auth-live-user-check` archive-report W-2 text was not located | Low | Origin evidence relies on TD-25 and ADR-011 item 6 |

## Rollback Plan

Revert the implementation PR. The change is web-only, adds no
migration, endpoint, or persisted state, so reverting restores the
previous handler behavior (any 401 while a user is set ends the
session). If reverted after archive, TD-25 is moved back to Open and the
ADR-011 item 6 note is removed in the same revert PR.

## Dependencies

- None. No API, schema, or dependency changes.

## Delivery

- Strategy: `ask-on-risk`; chain strategy default `stacked-to-main`.
- Estimated size: about 150-200 authored changed lines (source about 20,
  tests about 80-120, spec/registers/ADR about 40-60), under the
  400-line budget.
- PR 1/2: implementation, tests, delta spec, register and ADR updates,
  plus the change artifacts including `explore.md`. Branch
  `stale-401-session-guard/01-<slug>` from `main`.
- PR 2/2: archive. Branch `stale-401-session-guard/02-archive` from
  `main`.
- PR titles follow `type(scope): PR N/M — short description`.

## Success Criteria

- [ ] A 401 from a request issued before a re-login does not clear the
      new session and shows no session-ended notice (provider test).
- [ ] A 401 from a request issued before logout, returning after logout
      and a new login, raises no notice and keeps the new session
      (provider test).
- [ ] A 401 from a current-session request still ends the session,
      redirects to `/login`, and shows the notice; covered by one
      whole-flow automated test (ADR-011 item 6).
- [ ] The caller of a stale request still receives `ApiError(401)`.
- [ ] Existing client and `AuthProvider` tests pass unchanged in intent.
- [ ] Browser pass confirms golden-path regression (login, logout,
      mid-session notice, redirect); stale path reported as test-verified
      only.
- [ ] TD-25 is in Resolved and ADR-011 item 6 carries a resolution note
      in the delivering PR.
- [ ] API code and contract are unchanged.
