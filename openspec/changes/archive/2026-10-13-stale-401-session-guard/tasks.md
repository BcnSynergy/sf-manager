# Tasks: Stale 401 session guard (TD-25)

## Review Workload Forecast

| Field                   | Value                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | PR 1 ~190 (code ~20, tests ~110, spec/registers/ADR/artifacts ~60 excluding the already-written proposal/design/explore text); PR 2 docs only (~60 plus the spec merge) |
| 400-line budget risk    | Low                                                                                                                                                                     |
| Chained PRs recommended | Yes (2 PRs: implementation, archive)                                                                                                                                    |
| Suggested split         | PR 1 (guard + tests + delta spec + registers + ADR note + artifacts incl. explore.md) -> PR 2 (archive)                                                                 |
| Delivery strategy       | ask-on-risk                                                                                                                                                             |
| Chain strategy          | stacked-to-main                                                                                                                                                         |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

Binding user-accepted deviations from the proposal: (1) no test reset hook for the epoch (design Decision 2; the comparison is relative); (2) the ADR-011 item 6 whole-flow test lives in the new `apps/web/src/auth/session-ended-flow.test.tsx` (design Decision 5), not in `AuthProvider.test.tsx`.

UI: no new UI. The change touches `apps/web/**`, so a browser pass is required, limited to golden-path regression (login, logout, mid-session session-ended notice, redirect to `/login`). The stale path is test-verified only; state this explicitly in the PR.

### Suggested Work Units

| Unit | Goal                                                                                                                                                                | Likely PR                                                                                                                           | Focused test command                                             | Runtime harness                                                                                                             | Rollback boundary                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | Session epoch in `client.ts`, three advance points in `AuthProvider.tsx`, tests, whole-flow test, delta spec, TD-25 Resolved, ADR-011 item 6 note, change artifacts | PR 1/2. Branch `stale-401-session-guard/01-session-epoch-guard`. Title `fix(web): PR 1/2 — ignore stale 401s from earlier sessions` | `npx vitest run src/api/client.test.ts src/auth` from `apps/web` | Deferred-fetch provider tests; whole-flow test with real `AuthProvider` + router + `LoginPage`; browser pass for regression | Revert PR. Web-only, no migration or persisted state                                      |
| 2    | Archive: merge delta spec, finish registers/ADR                                                                                                                     | PR 2/2. Branch `stale-401-session-guard/02-archive`. Title `docs(openspec): PR 2/2 — archive stale-401-session-guard`               | N/A (docs only)                                                  | N/A                                                                                                                         | Revert PR; if reverted after archive, move TD-25 back to Open and remove the ADR-011 note |

Strict TDD (vitest + Testing Library in `apps/web`, runner `npm run test --workspace=apps/web`): each behavior task is RED (failing test observed), GREEN, REFACTOR. Apply records a "TDD Cycle Evidence" table (RED command and failure; GREEN command and pass count). Tasks marked "characterization" cover behavior the existing null-check guard already satisfies, so no RED is observable; they are verified by a temporary mutation instead (remove the line, confirm the stated outcome, restore it). Every commit must pass web lint and compile.

## Phase A: Branch and baseline (PR 1)

- [x] A.1 Create branch `stale-401-session-guard/01-session-epoch-guard` from `main` (the untracked change folder, including `explore.md`, travels with it).
- [x] A.2 Baseline: from the repo root run `npm run lint --workspace=apps/web`, `npm run test --workspace=apps/web`; confirm green before any edit (existing tests "session ended on a mid-session 401" and the client "unauthorized handler" cases are the regression net).
- [x] A.3 Commit the change artifacts as `docs(openspec): add stale-401-session-guard exploration, proposal, spec, design and tasks` (explore.md, proposal.md, design.md, specs/authentication/spec.md, tasks.md).

## Phase B: Epoch in the API client (spec: Redirect When Unauthenticated; Session-Ended Notice)

- [x] B.1 RED: in `apps/web/src/api/client.test.ts` ("unauthorized handler" describe) add: (a) a `fetch` stub returns a deferred promise; call `apiFetch`, call `advanceSessionEpoch()`, resolve with 401; assert the handler is not called and the call rejects with `ApiError` status 401 (Stale 401 keeps caller error). (b) `advanceSessionEpoch()` first, then `apiFetch` with an immediate 401; assert the handler is called once (triangulates "captured at start", not "ever changed"). No reset hook (Decision 2). RED: `advanceSessionEpoch` is not exported.
- [x] B.2 GREEN: `apps/web/src/api/client.ts`: add module-level `let sessionEpoch = 0`, export `advanceSessionEpoch()`, capture `const epochAtStart = sessionEpoch;` as the first statement of `apiFetch`, and guard the 401 branch with `epochAtStart === sessionEpoch`; `ApiError` is still thrown in every case (Decisions 1 and 4). Add a comment referencing the design.
- [x] B.3 REFACTOR and check: existing client cases (invoke, 403, 500, no handler, cleared handler) still green; web lint. Commit `fix(web): skip the unauthorized handler for requests from an earlier session epoch`.

## Phase C: Epoch advance points in AuthProvider (spec: stale 401 after re-login; across logout)

- [x] C.1 Test helper: extend `sessionFetch` in `apps/web/src/auth/AuthProvider.test.tsx` with an optional `data?: () => Promise<Response>` so a test can hold a data response open (mirrors the existing `logout` option). Existing tests unchanged in intent.
- [x] C.2 RED: add "stale 401 after re-login keeps the new session": logged in via `/auth/me`; start `apiFetch('/users')` with a deferred 401; click login and wait for the user; resolve the 401; assert user still set, `probe-ended` false, and the call rejected with `ApiError(401)`. Expected RED: the new session is ended.
- [x] C.3 GREEN: `apps/web/src/auth/AuthProvider.tsx` `login()`: call `advanceSessionEpoch()` immediately after the `!response.ok` check, before `await response.json()`, `setSessionEnded(false)` and `updateUser(data)`, with an ordering comment (Decision 3).
- [x] C.4 Characterization: add "stale 401 across logout raises no notice and keeps the new session": logged in; start a deferred data call; logout, then login; resolve the 401; assert user set and `probe-ended` false. It passes after C.3 (the login advance covers it). Verify with a mutation: remove the C.3 advance and confirm both C.2 and C.4 fail, then restore.
- [x] C.5 GREEN (defensive, no observable RED): `logout()`: call `advanceSessionEpoch()` as the first statement next to `userRef.current = null`, before `await fetch('/auth/logout')`. Keeps "every session boundary advances the epoch" true on its own. Note in apply-progress that no test can fail without it, because the `userRef` null check already covers a 401 landing between logout and the next login.
- [x] C.6 GREEN (defensive, no observable RED): in the unauthorized handler, call `advanceSessionEpoch()` after the `userRef.current === null` early return and before `updateUser(null)` / `setSessionEnded(true)`, so concurrent 401s from the same epoch collapse. Existing "two collapsed 401s" and "401 during logout" tests must stay green. The mount-time `/auth/me` restore does NOT advance the epoch (gap answer 5).
- [x] C.7 REFACTOR and check: all `AuthProvider.test.tsx` cases green, web lint. Commit `fix(web): advance the session epoch at login, logout and session end`.

## Phase D: Whole-flow test (ADR-011 addendum item 6)

- [x] D.1 Create `apps/web/src/auth/session-ended-flow.test.tsx` (`import '../i18n'` as `LoginPage.test.tsx` does): real `AuthProvider`, `MemoryRouter` at `/`, `Routes` with a `ProtectedRoute`-wrapped probe at `/` and the real `LoginPage` at `/login`; fetch stubbed so `/auth/me` returns a user and any data call returns 401. Flow: wait for the protected probe; `apiFetch` returns 401; assert the probe is gone, `LoginPage` is rendered and `login-session-ended` is shown. This is a characterization test (current behavior already satisfies it; it closes the coverage gap).
- [x] D.2 Mutation check: temporarily make the handler a no-op (or drop `updateUser(null)`) and confirm D.1 fails; restore. Run web lint and the new file. Commit `test(web): cover the mid-session 401 redirect and session-ended notice end to end`.

## Phase E: Spec and registers (docs, TDD N/A)

- [x] E.1 Re-read `specs/authentication/spec.md` (delta, two MODIFIED requirements) against the implemented behavior; fix any wording drift. Every scenario maps to a test: Current-session 401 -> D.1 and the existing mid-session tests; Stale 401 after re-login -> C.2; Stale 401 across logout and new login -> C.4; Stale 401 across logout (no notice) -> C.4; caller still gets 401 -> B.1 and C.2.
- [x] E.2 `docs/technical-debt.md`: move TD-25 to the Resolved section with change name `stale-401-session-guard` and PR 1/2 (PR number added once known). IDs are never reused or renumbered.
- [x] E.3 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: add a resolution note to addendum 2026-10-06 item 6 (epoch guard in `client.ts`, advance points, whole-flow test in `session-ended-flow.test.tsx`).
- [x] E.4 Commit `docs: resolve TD-25 and note the ADR-011 item 6 resolution`.

## Phase F: Verification (PR 1)

- [x] F.1 `npm run lint --workspace=apps/web` and `npm run build --workspace=apps/web` (`tsc -b && vite build`) pass.
- [x] F.2 `npm run test --workspace=apps/web` passes in full; record the pass count and the RED/GREEN evidence per behavior task.
- [x] F.3 Repo root scripts (turbo): `npm run lint`, `npm run build`, `npm run test`. The API is untouched; confirm `git diff --stat main -- apps/api` is empty.
- [x] F.4 Browser pass (claude-in-chrome; `npm run dev` from the repo root; the user logs in, since Claude cannot type passwords). Golden-path regression only: login, logout, a mid-session 401 showing the session-ended notice, redirect to `/login`. Optionally verify the notice in ES/CA. The stale-401 race is NOT browser-verified; report it as test-verified only. Done 2026-10-13 (CA locale): login OK; a server-side logout outside the app followed by opening /users produced four 401s (/users and /maintenance-companies, twice each) collapsed into one redirect to `/login` with "La teva sessió ha acabat. Torna a iniciar la sessió."; logout via the nav button redirected to `/login` with no notice. The stale-401 race is test-verified only.
- [x] F.5 Check `git diff --stat main` (expected ~190 changed lines; report the code vs test vs docs split).

## Gate PR 1 (orchestrator)

- [ ] G.1 Fresh-context independent review (sub-agent with no prior context) before push; focus: advance ordering in `login()`, no advance in the mount restore, caller still receives `ApiError(401)`, no test-only production export, delta spec vs tests. Fix findings or register them in `docs/technical-debt.md` / `docs/enhancements.md` in this PR.
- [ ] G.2 Ask the user before push.
- [ ] G.3 Ask the user before creating the PR. Title `fix(web): PR 1/2 — ignore stale 401s from earlier sessions`. Description states "browser-verified: golden path only; stale path test-verified only".
- [ ] G.4 PR passes `ci`; ask the user before merge.

## Phase H: PR 2 — archive (branch `stale-401-session-guard/02-archive`) — placeholder

Docs only; branch from `main` after PR 1 merges. Details are refined at archive time.

- [ ] H.1 `sdd-verify` against the delta spec scenarios; fix or register findings in the registers.
- [ ] H.2 `sdd-archive`: merge the delta into `openspec/specs/authentication/spec.md` and archive the change folder; confirm TD-25 Resolved carries the PR numbers. Ask the user before push, PR and merge. Title `docs(openspec): PR 2/2 — archive stale-401-session-guard`.
