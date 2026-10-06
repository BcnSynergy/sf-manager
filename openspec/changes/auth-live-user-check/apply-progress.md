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
