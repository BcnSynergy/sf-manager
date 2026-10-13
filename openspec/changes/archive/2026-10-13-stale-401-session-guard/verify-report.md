# Verify Report: stale-401-session-guard

Date: 2026-10-13. Branch: `stale-401-session-guard/02-archive` (from main at 668c167, after PR #210). Mode: Strict TDD, artifact store hybrid.

## Verdict

PASS. 0 CRITICAL, 0 WARNING, 0 new SUGGESTION. The known non-blocking items listed below are already queued for the enhancements register.

## Commands Run

| Check | Command | Result |
|---|---|---|
| API untouched | `git diff bd490a2..668c167 --stat -- apps/api` | empty output (no API change) |
| Lint | `npm run lint` (repo root) | exit 0; 5/5 tasks; 0 errors; 4 pre-existing API warnings (`no-unsafe-argument`), web lint clean |
| Build | `npm run build` (repo root) | exit 0; 4/4 tasks; only the existing Vite chunk-size warning |
| Unit | `npm run test` (repo root) | web 66 files, 1113 tests passed; validation 4 files, 50 tests passed; 5/5 tasks |
| Integration / e2e | not run | API-side only and the API is unchanged; skipped to avoid touching the database |

Coverage tooling was not run.

## Task Completeness

Phases A-F are done. Gate G.1-G.4 and Phase H were pending or in progress at verify time, as expected for the archive branch.

## Spec Scenario Coverage

Paths relative to `apps/web/src`. CL = `api/client.test.ts`, AP = `auth/AuthProvider.test.tsx`, FL = `auth/session-ended-flow.test.tsx`, LP = `pages/LoginPage.test.tsx`.

### Requirement: Redirect When Unauthenticated (Web)

| Scenario | Covering test | Verification |
|---|---|---|
| Unauthenticated visit redirected | `auth/ProtectedRoute.test.tsx:51`, `:334`; `App.test.tsx:283` | test |
| Session ends mid-session | AP:208; FL:14 | test + browser (F.4) |
| Current-session 401 ends the session and redirects | FL:14; AP:208 | test + browser (F.4) |
| Stale 401 after re-login keeps the new session | AP:287; CL:263 (caller still gets `ApiError(401)`) | test only |

### Requirement: Session-Ended Notice (Web)

| Scenario | Covering test | Verification |
|---|---|---|
| Mid-session 401 | FL:14; LP:170 | test + browser (F.4, CA) |
| Failed login shows no notice | LP:176, LP:187 | test |
| Localized notice | `i18n/locales.test.ts:910` (EN/ES/CA wording) | test + browser (CA) |
| Stale 401 after re-login does not end the new session | AP:287; CL:263 | test only |
| Stale 401 across logout raises no notice | AP:312 | test only |
| Stale 401 across logout and new login keeps the new session | AP:335 | test only |
| Current-session 401 still shows the notice | FL:14; AP:208; CL:219, CL:286 | test + browser (F.4) |

Count: 11 of 11 scenarios covered (4 + 7, including 2 near-duplicates). The stale-401 race (4 scenarios) is test-verified only, as tasks.md F.4 states.

## Strict TDD Compliance

Behavior tasks B and C have RED/GREEN evidence recorded in apply-progress. C.4, C.5, C.6 and D.1 are characterization or defensive tasks with mutation checks or an explicit "no observable RED" note, as the tasks specify. Triangulation exists in CL:263 versus CL:286 (epoch captured at start, not "ever changed").

## Design vs Code Consistency

Consistent. `client.ts` captures the epoch first in `apiFetch`, guards only the handler call, and still throws `ApiError`. `AuthProvider.tsx` advances at login, logout and session end; the mount restore does not advance.

## Findings

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

None new.

## Known Non-Blocking Items

Already queued for the enhancements register (not re-raised): the logout-only stale test passes without the fix; the defensive logout and handler advances are untested; login advance ordering is not pinned; the stale-test scaffold is duplicated; `session-ended-flow.test.tsx` lacks `afterEach(vi.unstubAllGlobals)`; stale design.md open questions; near-duplicate spec scenarios; ambiguous stale-logout test title; misplaced comment at `AuthProvider.test.tsx:173`.
