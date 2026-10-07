## Verification Report

**Change**: auth-live-user-check
**Mode**: Strict TDD, hybrid artifact store
**Verified at**: `main` @ 96856a8 (PR #193 merge d1a44b3, PR #194 merge 96856a8)
**Verdict**: PASS WITH WARNINGS

### Completeness

| Item | Status |
|------|--------|
| Phase A tasks A.1-A.11 | 11/11 checked |
| Phase B tasks B.1-B.9 | 9/9 checked |
| G.1 fresh review | Not a checkbox in the code. Done per the orchestrator: both PRs approved and CI green. |
| C.1 verify | This run. |
| C.2 archive | Pending, next phase. |

`tasks.md` still shows G.1, C.1 and C.2 unchecked. Update them at archive (SUGGESTION).

### Execution evidence (real runs)

| Command | Result |
|---------|--------|
| `npm run test --workspace=apps/api` | 138 suites, 1353 tests, all pass |
| `npm run test:e2e --workspace=apps/api` | 11 suites, 462 tests, all pass |
| `npm run test:integration --workspace=apps/api` | 29 suites, 207 tests, all pass |
| `npm run test --workspace=apps/web` | 62 files, 1058 tests, all pass |
| `npm run lint` | 0 errors, 4 pre-existing warnings in `auth.controller.spec.ts` |
| `npm run build` | Succeeded: web chunk-size notice and turbo "no output files" notice for `api-contracts` only. |
| Port conflicts | None. |

The e2e log printed a stack trace. The suite still passed 462/462, so it is treated as expected error-path logging.

Coverage tooling was not run. Coverage is informational under strict TDD and no coverage command is configured in the runners given.

CI: PR runs 37516717748 (#193) and 37583375940 (#194) green; push-to-main run 37588733570 for 96856a8 green.

### Spec compliance matrix

| Requirement / Scenario | Implementation | Covering test (passed) | Status |
|---|---|---|---|
| **Live User Check** / Soft-deleted user's token | `authenticated.guard.ts` L75-78 (`findById` null throws 401) | guard spec "rejects when the user no longer exists (null from findById)"; `auth.e2e-spec` "rejects a still-valid session once the user is soft-deleted"; `users.e2e-spec` "a soft-deleted admin is rejected with 401 on their still-valid session". Prisma `findById` excludes soft-deleted rows (default `deletedAt: null` filter; `prisma-user.repository.integration.spec`). | COMPLIANT |
| Demoted user acts with current role | Guard L81-87 uses `storedUser.role` | `users.e2e-spec` "a demoted admin is refused on GET /users ... (403, not 200)"; guard spec "attaches the stored role, not the stale token role ..." | COMPLIANT |
| User lookup fails | try/catch rethrows a bare `UnauthorizedException` | guard spec "rejects (fail-closed) when the user lookup itself rejects, with a bare 401" | COMPLIANT |
| Revoked token needs no lookup | `isRevoked` runs before `findById` | guard spec "does not look the user up for a denylisted token" and "rejects a valid signature whose jti is denylisted" | COMPLIANT |
| Public endpoints unaffected | `@Public()` returns before any lookup | guard spec "does not look the user up for a @Public() route" and "lets a @Public() route through ...". The e2e suites that log in and hit `/health` pass. | COMPLIANT (unit level) |
| **Session-Ended Notice (Web)** / Mid-session 401 | `client.ts` handler; `AuthProvider.tsx` L65-74; `LoginPage` notice | `client.test` "invokes the registered handler on a 401 and still throws ApiError(401)"; `AuthProvider.test` "clears the user and raises sessionEnded on a 401 while logged in"; `LoginPage.test` "shows the notice when the session ended". The notice copy does not state a reason. | COMPLIANT |
| Failed login shows no session-ended notice | `login()` uses a raw `fetch`, so the handler is never invoked on a login 401. The notice is rendered only when `sessionEnded && !error`. | `LoginPage.test` "shows no notice on a fresh visit or after a failed login"; "hides the notice while a login error is shown, and keeps it hidden after the error clears"; `AuthProvider.test` "raises no flag on a 401 while logged out" | COMPLIANT |
| Localized notice | `auth.sessionEnded` in en/es/ca | `locales.test` `it.each` "%s defines the exact auth.sessionEnded wording" (EN, ES, CA exact strings) | COMPLIANT |
| **Protected Endpoint Access Control (MOD)** / Valid session, missing or invalid session | Guard | guard spec "passes through for a valid, non-revoked session whose user still exists", "rejects when there is no access-token cookie", "rejects an expired or tampered token" | COMPLIANT |
| Valid token, user missing or soft-deleted | Guard | Same tests as the soft-deleted scenario above, plus the review-history and review-schedule e2e rewrites (reused session now 401) | COMPLIANT |
| **Session Introspection (MOD)** / Valid session, no or invalid session, access token carries role | `/auth/me` use case (unchanged logic) | Existing `auth.e2e-spec` and `auth.controller` tests, pass | COMPLIANT |
| Role changed after login | Guard attaches the stored role | `auth.e2e-spec` "reports the current role after a role change, not the token role" | COMPLIANT |
| Soft-deleted user on `/auth/me` | Guard | `auth.e2e-spec` soft-delete case; `users.e2e-spec` `/auth/me` 401 | COMPLIANT |
| (email part of the MOD requirement) | Guard attaches the stored email | `auth.e2e-spec` "reports the current email after an email change ..."; guard spec "attaches the stored email when it differs from the token email" | COMPLIANT |
| **Redirect When Unauthenticated (MOD)** / Unauthenticated visit redirected | `ProtectedRoute` (unchanged) | `ProtectedRoute.test` redirect cases, pass | COMPLIANT |
| Session ends mid-session | `AuthProvider` clears the user (`user` becomes null), so `ProtectedRoute` redirects | `AuthProvider.test` covers the user-cleared half and `ProtectedRoute.test` covers the redirect, each separately. There is no single integrated automated test. B.9 browser-verified the full flow (2026-10-07). | COMPLIANT (see WARNING 1) |

### TDD compliance (strict-tdd-verify)

| Check | Result | Details |
|-------|--------|---------|
| TDD Cycle Evidence tables present | Yes | Both batches. Apply-progress has A.* and B.* tables with the RED command plus exact failure, and the GREEN command plus counts. |
| Tests exist for every code task | Yes | `authenticated.guard.spec.ts`, `auth`/`users`/`review-history`/`review-schedule` e2e, `client.test.ts`, `AuthProvider.test.tsx`, `LoginPage.test.tsx`, `locales.test.ts` all exist. |
| GREEN confirmed now | Yes | All referenced files pass in the full runs above. |
| RED credibility | Good | Old-guard restore from 1b1e581 (A.4-A.7). Batch B records failure counts (14/14, 6/9, 3 in locales, 2 in LoginPage). A mutation check on `clearSessionEnded()` was recorded. |
| Triangulation | Good | `it.each` for 403/500; EN/ES/CA; two admins; several guard variants. |
| Safety net | Not itemized | Template column is absent. The full suites were run before and after (A.3, A.11, B.8). Informational only. |

**Assertion quality audit** (changed test files, sampled):
- No tautologies and no ghost loops found.
- Guard spec uses `toEqual` on `request.user`, and asserts `findById` is not called in three cases.
- Orphan-empty assertions exist only in the review-history and review-schedule rewrites, which assert `reader.calls` is `[]` together with the 401, and a companion 200 case exists in the same suite.
- Mock-heavy: the guard spec and `AuthProvider.test` use mocks by design. A collaborator spy ("no lookup") is the spec assertion itself, so it is treated as legitimate.
- Result: 0 CRITICAL, 0 WARNING.

**Test layers**: unit (guard spec, web unit and component tests), e2e HTTP (supertest in-memory), integration (hermetic Postgres, unchanged by this change). Real browser: B.9.

### Design coherence

| Decision | Followed? |
|----------|-----------|
| Order: verify, isRevoked, findById inside the same try/catch, fail-closed | Yes |
| `request.user` built field by field (no entity, no `passwordHash`, no stray `iat`) | Yes |
| `@Inject(USER_REPOSITORY)` as 5th ctor arg; `AuthModule` imports `UsersModule` | Yes (e2e boots `AppModule`) |
| Web: `setUnauthorizedHandler`, `userRef` mirror, `sessionEnded` flag, logout reset, `clearSessionEnded` on submit | Yes |
| ADR-011 addendum (2026-10-06) | Present |
| Deviations | `review-schedule.e2e-spec` (an A.8 find) and 4 `useAuth` mock files were touched beyond the design list. Both are documented and justified. |

### Issues

**CRITICAL**: none.

**WARNING**
1. There is no single automated test of the mid-session 401 followed by the redirect to `/login`. The halves are tested separately (flag in `AuthProvider.test`, redirect in `ProtectedRoute.test`) and the whole flow was browser-verified (B.9). Acceptable, but a router-level integration test would close the gap.
2. Known deferred item, non-blocking. A stale in-flight request that returns 401 right after a re-login would end the new session, because the handler acts whenever `userRef` is non-null. Likelihood is low. Record it as an ADR-011 open question at archive.

**SUGGESTION**
1. "Public endpoints unaffected" is proven at guard unit level only. Add an e2e test that hits `/health` or login with a lookup spy if it is wanted at the HTTP level.
2. The TDD Cycle Evidence tables use a custom RED/GREEN/REFACTOR shape without the Triangulate and Safety Net columns of the template. The content is adequate, so only the format differs.
3. Update the G.1, C.1 and C.2 checkboxes in `tasks.md` at archive. Also note that the QA user `qa_test@sf-manager.example` stays soft-deleted in the dev DB, per apply-progress.

### Verdict

PASS WITH WARNINGS. There are no CRITICAL issues and the change is archive-ready. The 2 WARNINGs are non-blocking.
