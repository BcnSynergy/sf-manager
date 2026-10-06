# Tasks: Live user check on every authenticated request

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~435 (code ~55, tests ~335, docs ~45) plus openspec artifacts; PR 2 ~292 (code ~60, tests ~232) |
| 400-line budget risk | High (PR 1 only, excess is tests/docs) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (API guard) then PR 2 (web notice) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Decision needed: PR 1 likely exceeds 400 lines. Code is ~55 lines; the rest is tests/docs, which fits the CLAUDE.md size-exception rule. The user decides whether to accept it or split the e2e tests into a third PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Guard live user check, e2e, ADR-011 addendum, comment fixes | PR 1/2 | Base: main. Branch `auth-live-user-check/01-guard-live-user-check`. Title `fix(auth): PR 1/2 — live user check in AuthenticatedGuard` |
| 2 | Web 401 hook, session-ended notice, i18n | PR 2/2 | Base: main (after PR 1 merges). Branch `auth-live-user-check/02-web-session-ended`. Title `feat(web): PR 2/2 — session-ended notice on mid-session 401` |

Strict TDD (ADR-016): every behavior goes RED, GREEN, REFACTOR. Each apply batch records a "TDD Cycle Evidence" table in apply-progress (RED command and how it failed; GREEN command and pass count). Each PR must pass `ci` (ADR-017).

## Phase A: PR 1, API guard (sdd-apply)

- [x] A.1 RED: `authenticated.guard.spec.ts`: add a shared `userRepository` mock in `beforeEach` (5th ctor arg), a `findById` stub on every existing happy-path case, and the new cases (found: DB role/email, exact `toEqual`, no `passwordHash`; token email differs; `null` gives 401; rejection gives 401; denylisted gives no `findById`; `@Public()` and invalid token give no lookup; called with `payload.sub`). Spec: Live User Check (all five scenarios). RED: `npx jest authenticated.guard` fails to compile first (no 5th arg), then fails behaviorally once the arg is added without the lookup.
- [x] A.2 GREEN: `authenticated.guard.ts`: `@Inject(USER_REPOSITORY)` 5th arg; order verify, `isRevoked`, `findById(payload.sub)` inside the existing try/catch; `null` throws 401; build `request.user = { sub, jti, exp, email, role }` field by field. GREEN: guard spec passes.
- [x] A.3 REFACTOR: tidy the guard and spec; confirm the module DI resolves (`AuthModule` imports `UsersModule`). Run `npm run test --workspace=apps/api`.
- [x] A.4 RED: `auth.e2e-spec.ts`: drop the local fake, use the shared `InMemoryUserRepository`; add a login then `softDeleteById` then `/auth/me` 401 case, a role-change `updateById` case, and an email-change case. Spec: Soft-deleted user; Role changed after login; Valid token, user missing. RED: against the old guard these return 200 with token claims.
- [x] A.5 GREEN: run `npm run test:e2e --workspace=apps/api` (auth suite) and confirm the new cases pass with A.2.
- [x] A.6 RED: `users.e2e-spec.ts`: two admins; A `PATCH`es B to `MANAGER` then B gets 403 on `GET /users`; A `DELETE`s B then B gets 401 on `/auth/me`. Spec: Demoted user acts with current role; Soft-deleted user. RED: both calls return 200 on the old guard. GREEN: passes with A.2.
- [x] A.7 RED then GREEN: rewrite `review-history.e2e-spec.ts` (~L1152-1193) so both reused-session calls expect 401 and the comment explains that the guard rejects before the capability checker. Keep `user-manager-capability.checker.spec.ts` L62. RED: today it returns 200 `[]` and 404.
- [x] A.8 Apply-time scan: re-scan ALL e2e suites for any test that reuses a session after deleting or re-roling its own caller. Only `review-history` ~L1160 is known; community ~L867/L903, maintenance-company ~L609/L644, users ~L521 and review-history ~L1887 were judged unaffected. Fix any new find test-first. Run the full e2e suite.
- [x] A.9 Docs: ADR-011 addendum (2026-10-06) per the design outline; it supersedes item 1 of the 2026-08-22 addendum and the staleness note (~L345) of the 2026-09-09 one. Add an INDEX row only if INDEX lists addenda. TDD: N/A.
- [x] A.10 Comment fixes (comments only): `token-issuer.port.ts` L16-19, `get-current-user.use-case.ts` L11-16, `login.use-case.ts` L73-74, `permissions.guard.ts` L18-22, `presentation/types.ts` L5-6, `user-manager-capability.checker.ts` L33-37 ("defense in depth"). TDD: N/A.
- [x] A.11 Run `npm run lint`, unit and e2e suites, then check `git diff --stat` (~435 lines). Commit by work unit: guard+spec, e2e suites, docs and comments.

## Phase B: PR 2, web notice (sdd-apply, after PR 1 merges)

- [ ] B.1 RED: `client.test.ts`: 401 invokes the handler and still throws `ApiError(401)`; 403 and 500 do not; no handler is fine; `afterEach(() => setUnauthorizedHandler(null))`. Spec: Session-Ended Notice. RED: missing export.
- [ ] B.2 GREEN: `client.ts`: add `setUnauthorizedHandler(fn | null)` and call it on 401 before throwing.
- [ ] B.3 RED: `AuthProvider.test.tsx`: a 401 while logged in sets `user` null and `sessionEnded` true; a 401 while logged out sets no flag; two 401s give one transition; `login()` clears the flag; a 401 during `logout()` shows no notice; unmount clears the handler. Spec: Mid-session 401; Session ends mid-session. RED: the flag does not exist.
- [ ] B.4 GREEN: `AuthProvider.tsx`: `sessionEnded` state, `userRef` assigned wherever `setUser` is called, handler registered in a `useEffect` with cleanup, synchronous reset in `logout()` (before the fetch and in `finally`), `clearSessionEnded()` on the context. Fix the comment at L10-14.
- [ ] B.5 RED: `LoginPage.test.tsx`: the notice shows when the flag is set; no notice on a failed login; hidden once an error shows; stays hidden after submit even when the error is later cleared. Spec: Failed login shows no notice. RED: no notice element.
- [ ] B.6 GREEN: `LoginPage.tsx`: render the notice when `sessionEnded && !error`; call `clearSessionEnded()` on submit.
- [ ] B.7 RED then GREEN: `locales.test.ts` `it.each` exact wording for EN, ES, CA; add `auth.sessionEnded` to `en.json`, `es.json` and `ca.json`. Spec: Localized notice. RED: missing key.
- [ ] B.8 REFACTOR: tidy; run `npm run lint`, `npm run test --workspace=apps/web` and the build; check `git diff --stat` (~292 lines).
- [ ] B.9 Browser verification (orchestrator + user, not sdd-apply). The user logs in. (1) Log in as `technician@`, log out in a second tab, trigger a data call in the first: expect `/login` with the notice, and a reload clears it. (2) A failed login shows only the generic error. (3) With the user's OK, delete a QA user created by an admin while it is logged in elsewhere. Report as browser-verified or test-verified only.

## Gate (orchestrator, not an apply task)

- [ ] G.1 Fresh-context review before push and before merge for each PR; the user confirms push, PR and merge. Each PR passes `ci` (ADR-017).

## Phase C: Close

- [ ] C.1 `sdd-verify` against the spec scenarios, after both PRs are merged.
- [ ] C.2 `sdd-archive`: merge the authentication delta into `openspec/specs/authentication/spec.md`; archive as an `auth-live-user-check/03-archive` PR (orchestrator commits the move).
