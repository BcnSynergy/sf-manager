# Apply Progress: auth-live-user-check

## Batch 1: Phase A (PR 1, API guard) - COMPLETE (A.1-A.11)

**Mode**: Strict TDD (ADR-016). **Branch**: `auth-live-user-check/01-guard-live-user-check` (from `main` at 1b1e581).
**Delivery**: `ask-on-risk`, `stacked-to-main`, PR 1 of 2. **size:exception ACCEPTED by the user** (excess is tests/docs, see split below).
Phase B (web), G.1 and Phase C are NOT started.

### Commits (work units)

| SHA | Message | Unit |
|-----|---------|------|
| 0d310c4 | fix(auth): re-read the user on every authenticated request | guard + unit spec (A.1-A.3) |
| 979c821 | test(auth): cover the live user check across e2e suites | e2e suites (A.4-A.8) |
| 29e400b | docs(auth): record the live user check in ADR-011 and fix stale comments | docs + comments (A.9-A.10) |
| (next) | docs(openspec): add auth-live-user-check change artifacts and apply-progress | openspec change folder |

### Task detail

- [x] A.1 RED: `authenticated.guard.spec.ts` got a shared `userRepository` mock (5th ctor arg) built in `beforeEach`, a `findById` stub on the happy path, and new cases (stored role/email exact `toEqual` and no `passwordHash`; email differs from token; no stray `iat`; `null` -> 401; lookup rejection -> bare 401; denylisted -> no lookup; invalid token -> no lookup; `@Public()` -> no lookup; `findById` called with `payload.sub`).
- [x] A.2 GREEN: `authenticated.guard.ts`: `@Inject(USER_REPOSITORY)` 5th arg; verify -> `isRevoked` -> `findById(payload.sub)` inside the existing try/catch; `null` throws 401; `request.user = { sub, email, role, jti, exp }` built field by field.
- [x] A.3 REFACTOR: typed the local `user` as `VerifiedAccessToken`, comments tightened; `AuthModule` already imports `UsersModule` (exports `USER_REPOSITORY`), DI resolves (all e2e suites boot `AppModule`). Full api unit suite green.
- [x] A.4 RED/GREEN: `auth.e2e-spec.ts`: local fake removed, shared `InMemoryUserRepository` used; added soft-delete -> 401, role change -> `/auth/me` new role, email change -> `/auth/me` new email.
- [x] A.5 GREEN: auth e2e suite 10/10 with the new guard.
- [x] A.6 RED/GREEN: `users.e2e-spec.ts`: two admins; A PATCHes B to MANAGER -> B gets 403 on `GET /users`; A DELETEs B -> B gets 401 on `/auth/me`. IDs `...000901/902`.
- [x] A.7 RED/GREEN: `review-history.e2e-spec.ts` soft-deleted MANAGER case rewritten: both reused-session calls expect 401; comment updated. `user-manager-capability.checker.spec.ts` L62 kept untouched.
- [x] A.8 Scan: see "A.8 findings".
- [x] A.9 ADR-011 addendum (2026-10-06) added before "Alternatives Considered"; supersedes item 1 of the 2026-08-22 addendum and the item-5 staleness note of the 2026-09-09 addendum. `docs/adr/INDEX.md` lists ADRs only (not addenda): no change.
- [x] A.10 Comment-only fixes in `token-issuer.port.ts`, `get-current-user.use-case.ts`, `login.use-case.ts`, `permissions.guard.ts`, `presentation/types.ts`, `user-manager-capability.checker.ts` ("defense in depth"). The `AuthProvider` comment belongs to PR 2.
- [x] A.11 `npm run lint`: 0 errors (4 pre-existing warnings in untouched `auth.controller.spec.ts`). API unit 138 suites / 1353 tests green. API e2e 11 suites / 462 tests green. Integration (Docker Postgres was up): 29 suites / 207 tests green.

### A.8 findings

The first full e2e run after the guard change failed exactly 4 tests in 3 suites:
1. `auth.e2e-spec.ts` x2: the local fake's `findById` threw; fixed by moving to the shared fake (A.4).
2. `review-history.e2e-spec.ts` soft-deleted MANAGER: known case (A.7).
3. **NEW FIND, not in the design's list**: `review-schedule.e2e-spec.ts` "a soft-deleted granted MANAGER gets 200 [] and the reader is never called" (~L413). It reused the manager's session after the admin deleted that manager. Rewritten to expect 401 on the reused session with `reader.calls` still `[]`; comment updated. RED against the old guard confirmed (200 returned).

The other candidate sites from the design (community ~L867/L903, maintenance-company ~L609/L644, users ~L521, review-history ~L1887/L2333) pass unchanged: the affected user is never the logged-in caller. The full e2e suite is green, which is the evidence.

### TDD Cycle Evidence

| Task | Behavior | RED (command, exact failure) | GREEN (command, result) | REFACTOR |
|------|----------|------------------------------|--------------------------|----------|
| A.1/A.2 | Guard lookup, DB role/email, `null`/throw -> 401, no lookup for denylisted/invalid/public | `npx jest authenticated.guard` (apps/api): 6 failed, 9 passed of 15. ts-jest did not raise a compile error for the extra ctor arg, so the failure was behavioral: lookup never called, `request.user` equal to the token payload, `null` and rejected lookups resolved `true` | `npx jest authenticated.guard`: 15/15 pass; then `npm run test --workspace=apps/api`: 1353/1353 | A.3: `user` typed `VerifiedAccessToken`, `tsc --noEmit` clean, prettier clean |
| A.4/A.5 | Auth e2e: soft-delete 401, role change, email change | `npx jest --config test/jest-e2e.json test/auth.e2e` with the OLD guard temporarily restored from 1b1e581: 3 failed, 7 passed (200 with token claims instead of 401 / new role / new email) | same command, new guard: 10/10 | none needed |
| A.6 | Users e2e: demoted admin 403, deleted admin 401 | `... test/users.e2e` with the OLD guard: 2 failed, 48 passed (both calls returned 200) | new guard: 50/50 | none needed |
| A.7 | review-history soft-deleted MANAGER -> 401 x2 | `... test/review-history test/review-schedule` with the OLD guard: 2 failed, 113 passed (200 `[]` and 404 / 200 `[]`) | new guard: 115/115 | comment rewritten |
| A.8 | review-schedule soft-deleted MANAGER -> 401 (new find) | Same run as A.7 (old guard): fails with 200 | same run: passes | comment rewritten |
| A.9 | ADR-011 addendum | N/A (docs). Verified: `git diff --stat` shows 29 insertions only, line endings consistent (repo blob is LF), cross-references to the 2026-08-22 and 2026-09-09 addenda checked by reading the text | N/A | N/A |
| A.10 | Comment fixes | N/A (comments only). Verified: `prettier --check --end-of-line auto` clean, unit 1353/1353 and e2e 462/462 unchanged | N/A | N/A |

The old guard was restored temporarily via `git show 1b1e581:<guard path>` and then put back; `git status` confirmed the guard file was clean afterward.

### Files changed (excluding openspec artifacts)

| File | Action |
|------|--------|
| `apps/api/src/modules/auth/presentation/guards/authenticated.guard.ts` | Modified (lookup, rebuilt `request.user`) |
| `apps/api/src/modules/auth/presentation/guards/authenticated.guard.spec.ts` | Modified (5th dep, new and updated cases) |
| `apps/api/test/auth.e2e-spec.ts` | Modified (shared fake, 3 new cases) |
| `apps/api/test/users.e2e-spec.ts` | Modified (2 new cases) |
| `apps/api/test/review-history.e2e-spec.ts` | Modified (soft-deleted manager -> 401) |
| `apps/api/test/review-schedule.e2e-spec.ts` | Modified (soft-deleted manager -> 401, A.8 find) |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modified (addendum) |
| 6 API files | Comment-only fixes (A.10) |

### Size / split (`git diff --numstat main..HEAD`, before the openspec commit)

13 files, +391 / -126.
- Code (guard): +31 / -7.
- Comment-only: +22 / -21.
- Tests: +309 / -98 (guard spec +158/-7, auth e2e +83/-67, users e2e +51/-0, review-history e2e +11/-18, review-schedule e2e +6/-6).
- Docs (ADR-011): +29 / -0.
- Net of deletions: +265. The excess over the ~70 code/comment lines is tests and docs. Accepted as `size:exception`.
- Not counted above: the openspec change folder artifacts.

### Deviations / issues

- Deviation: one extra file changed beyond the design list, `review-schedule.e2e-spec.ts` (A.8 scan find; same fix pattern).
- The guard spec adds a "no stray `iat`" case that the design did not list explicitly (it pins D2's field-by-field build).
- ts-jest does not type-check, so RED for the 5th ctor arg was behavioral rather than a compile failure (`tsc --noEmit` is the type check).
- A wide prettier check shows 25 pre-existing warnings in untouched files (line endings); the files changed here pass `--end-of-line auto`.

### Remaining

- Phase B (PR 2, web): blocked until PR 1 merges.
- G.1 fresh-context review before push (orchestrator).
- Phase C (verify, archive).

---

## Batch 2: Phase B (PR 2, web notice) - COMPLETE (B.1-B.8)

**Mode**: Strict TDD (ADR-016). **Branch**: `auth-live-user-check/02-web-session-ended` (from `main` at d1a44b3, PR 1 merged).
**Delivery**: `ask-on-risk`, `stacked-to-main`, PR 2 of 2. Not pushed, no PR opened. B.9 browser-verified by the orchestrator and user; G.1 and Phase C are NOT done.

### Commits (work units)

| SHA | Message | Unit |
|-----|---------|------|
| 8288cc6 | feat(web): report a 401 from apiFetch to a registered handler | client hook + tests (B.1-B.2) |
| 5aec182 | feat(web): end the session in AuthProvider when a data call gets a 401 | AuthProvider flag, ref, handler + tests, useAuth mock updates (B.3-B.4) |
| 4ddc8c8 | feat(web): show a localized session-ended notice on the login page | LoginPage, locales, locale tests (B.5-B.7) |
| 5f8cf73 | docs(auth): reword role comments now that the guard reads it from the database | 5 API comments |
| (this commit) | docs(openspec): record auth-live-user-check phase B apply-progress | tasks + apply-progress |

### Task detail

- [x] B.1 RED `client.test.ts`: new describe for the handler (401 invokes it and still throws `ApiError(401)`; 403/500 do not; no handler is fine; cleared with `null` stops calling); `afterEach(() => setUnauthorizedHandler(null))`.
- [x] B.2 GREEN `client.ts`: `setUnauthorizedHandler(fn | null)`; handler called on 401 before the throw.
- [x] B.3 RED `AuthProvider.test.tsx`: 401 while logged in -> user null and `sessionEnded`; logged out -> no flag; two concurrent 401s -> one transition; `login()` clears the flag; 401 during an in-flight `logout()` -> no notice; unmount clears the handler (via a `vi.mock` wrapper around the real `setUnauthorizedHandler`).
- [x] B.4 GREEN `AuthProvider.tsx`: `sessionEnded` state, `userRef` through an `updateUser` helper used at every `setUser` site, handler registered in a `useEffect` with cleanup, synchronous ref and flag reset at the top of `logout()` and again in `finally`, `clearSessionEnded()` on the context. The stale comment (L10-14) was rewritten.
- [x] B.5/B.6 `LoginPage`: `data-testid="login-session-ended"` notice when `sessionEnded && !error`; `clearSessionEnded()` on submit. Tests drive the flag the real way (`/auth/me` logged in, then `apiFetch` 401).
- [x] B.7 `auth.sessionEnded` in en/es/ca with exact-wording `it.each` in `locales.test.ts`.
- [x] B.8 REFACTOR/verification: see results.
- Extra: 5 API comments reworded ("is read from the database", assignment-community-scope, user-company-scope, user-manager-capability, list-review-schedule, review-history-access).
- Extra: `useAuth` mocks in `ProtectedRoute.test.tsx`, `OrganizationProfilePage.test.tsx`, `UserEditPage.test.tsx`, `UsersListPage.test.tsx` got `sessionEnded: false, clearSessionEnded: vi.fn()` because `tsc -b` (the build) rejected the widened `AuthContextValue`. Vitest does not type-check, so only the build caught it.

### TDD Cycle Evidence

| Task | Behavior | RED (command, failure) | GREEN (command, result) | REFACTOR |
|------|----------|------------------------|--------------------------|----------|
| B.1/B.2 | apiFetch 401 hook | `npm run test --workspace=apps/web -- client.test`: 14 failed of 14 (`TypeError: setUnauthorizedHandler is not a function`; the `afterEach` hook also failed every pre-existing case) | same command: 14/14 pass | none needed |
| B.3/B.4 | Session ended in AuthProvider | `-- AuthProvider.test`: 6 failed, 3 passed (`sessionEnded` absent: `toHaveTextContent` mismatch; unmount case `expected undefined to be type of 'function'`) | same command: 9/9 pass | `updateUser` helper keeps ref and state in lockstep |
| B.7 | Exact i18n wording | `-- locales.test`: 3 failed, 406 passed (`expected undefined to be 'Your session has ended...'` for en/es/ca) | same command: 409/409 pass | none needed |
| B.5/B.6 | Login notice | `-- LoginPage.test`: 2 failed, 5 passed (`Unable to find an element by: [data-testid="login-session-ended"]`). The two vacuous-by-nature cases (no notice on fresh visit / failed login) pass before and after, as expected | same command: 7/7 pass. Mutation check: commenting out `clearSessionEnded()` in `handleSubmit` makes "keeps it hidden after the error clears" fail (1 failed, 6 passed), then restored | none needed |

Ordering note: B.7 was done before B.5/B.6 so the B.5 RED failed on the missing element rather than on missing copy.

### Verification results

- `npm run test --workspace=apps/web`: 62 files / 1058 tests green.
- `npm run test --workspace=apps/api` (comments only touched): 138 suites / 1353 tests green.
- `npm run lint`: 0 errors (the same 4 pre-existing warnings in `auth.controller.spec.ts`).
- `npm run build --workspace=apps/web` (`tsc -b && vite build`): succeeds (only the pre-existing chunk-size notice).
- Prettier on the changed API files: clean.

### Size / split (`git diff --numstat main...HEAD`, before the openspec commit)

18 files, about +369 / -19 in the web and API files.
- Code: client +14, AuthProvider +60/-10, LoginPage +9/-1, 3 locale lines, 5 API comment lines (+5/-5): about 92 added.
- Tests: client.test +61/-2, AuthProvider.test +172, LoginPage.test +82/-1, locales.test +9, 4 `useAuth` mock files +40: about 364 added.
- Docs: none besides the openspec artifacts.
- Over the 400-line budget, excess is tests (see forecast ~292; the extra comes from the mock-typing fixes and fuller AuthProvider/LoginPage cases). Needs the user's size-exception OK.

### Deviations / issues

- Extra test files touched beyond the design list (4 `useAuth` mocks) because of the type widening.
- The `useAuth` mock fixes first landed one commit late, so the AuthProvider commit alone failed `tsc -b`. The orchestrator moved them into that commit before push (tree identical; `tsc -b` verified at 5aec182).
- Fixed in the LoginPage "stays hidden" test: it uses a hanging login so the error is cleared while no flag reset would make the notice reappear.

### B.9 Browser verification (2026-10-07, orchestrator + user)

Dev server via `npm run dev`; the user logged in, the orchestrator drove the page through claude-in-chrome. Result: browser-verified.

| Case | Result |
|------|--------|
| Explicit logout in tab 2 | `/login`, no notice |
| Data call in tab 1 after that logout (Users, then Communities) | 401, `/login` with "Your session has ended. Please sign in again." |
| Failed login while the notice shows | "Invalid email or password." only; notice hidden |
| Reload with the notice showing | notice gone |
| Admin soft-deletes QA user `qa_test@sf-manager.example` (MANAGER) while it is logged in from an incognito window; `deletedAt` confirmed in the dev DB | its next nav click lands on `/login` with the notice (observed by the user; the extension cannot reach incognito) |

No console errors. Checks read the DOM (screenshots timed out). ES/CA wording is covered by locale tests only (web i18n is hardcoded to `en`). The QA user stays soft-deleted in the dev DB.

### Remaining

- G.1 fresh review, Phase C (verify, archive).
