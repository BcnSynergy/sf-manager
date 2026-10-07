## Verification Report

**Change**: login-rate-limit
**Mode**: Strict TDD, hybrid artifact store
**Verified at**: `main` @ a35f225 (PR #196 merge, branch `login-rate-limit/01-login-throttle`)
**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 3 SUGGESTION)

### Completeness

| Item | Status |
|------|--------|
| Phase A tasks A.1-A.14 | 14/14 checked (A.14 browser-verified 2026-10-07, recorded in `tasks.md` and `apply-progress.md`) |
| G.1 fresh review | Done: PR 1 approved by two fresh reviews and merged (#196). The box is unchecked in `tasks.md`. |
| B.1 verify | This run. |
| B.2 archive | Pending, next phase. |

### Execution evidence (real runs)

| Command | Result |
|---------|--------|
| `npm run test --workspace=apps/api` | 140 suites, 1369 tests, all pass |
| `npm run test:e2e --workspace=apps/api` | 12 suites, 465 tests, all pass |
| `npm run test:integration --workspace=apps/api` | 29 suites, 207 tests, all pass (hermetic DB) |
| `npm run test --workspace=apps/web` | 62 files, 1065 tests, all pass |
| `npm run lint` | 0 errors, 4 pre-existing warnings in `auth.controller.spec.ts` (`no-unsafe-argument`) |

These counts match `apply-progress.md` exactly. The working tree was clean. Coverage tooling was not run: it is informational under strict TDD and no coverage command is configured.

### Spec compliance matrix

| Requirement / Scenario | Implementation | Covering test (passed) | Status |
|---|---|---|---|
| **Login Attempt Rate Limiting** / Attempt over the limit | `@UseGuards(ThrottlerGuard)` on `login()`, `ThrottlerModule.forRootAsync` in `auth.module.ts` | `login-rate-limit.e2e-spec` defaults: 11th attempt is 429 with `Retry-After` matching `^\d+$` and in [1, 900] | COMPLIANT |
| Successful attempts count | Same guard, counts every hit | Same e2e: 10 valid logins return 200 (varying XFF), then 429 | COMPLIANT |
| Limit isolated per IP | Default tracker is `req.ip` | Trust-proxy e2e: XFF A exhausted, XFF B still gets 200 | COMPLIANT |
| Other endpoints unaffected | Route-level guard only, no `APP_GUARD` | Defaults e2e: `GET /health` is 200 and the agent's `GET /auth/me` is 200 while login is exhausted. The `/auth/me` call reuses the cookie captured from attempt 1. | COMPLIANT |
| Default limits | `getLoginRateLimitConfig()` returns 10 / 900000 ms | Config spec (unset and empty give defaults). E2E defaults app deletes the vars: 10th is 200, 11th is 429. | COMPLIANT |
| Configured limits | Env vars parsed as positive integers; invalid values throw naming the var | Config spec (explicit values; `0`, `-1`, `abc`, `1.5` throw). E2E configured app (max 2, 1 s): 3rd is 429. | COMPLIANT |
| Window elapsed | In-memory storage, block expires after the window | E2E configured app: `Retry-After` is `'1'`, and an attempt after the 1 s window returns 200 | COMPLIANT |
| **Client IP Resolution** / TRUST_PROXY off | `getTrustProxySetting` returns `false`, so `req.ip` is the socket address | Trust-proxy spec (unset, `''`, `'false'` give `false`). E2E defaults: varying XFF values share one counter. | COMPLIANT |
| TRUST_PROXY on | `'true'` gives `1` (one hop); `main.ts` sets `app.set('trust proxy', ...)` | Trust-proxy spec (`'true'` gives `1`, `'yes'` throws). E2E TRUST_PROXY app: per-XFF counters. | COMPLIANT |
| **Login Form Validation (Web) (MOD)** / Empty fields blocked | Unchanged | Existing `LoginPage.test` cases, pass | COMPLIANT |
| Server error shown generically | `LoginPage` maps non-429 to `auth.loginFailed` | `LoginPage.test` existing 401 case, plus `AuthProvider.test` "rejects with an ApiError carrying status 401" | COMPLIANT |
| Rate-limited message | `AuthProvider.login` throws `ApiError(status)`; `LoginPage` maps 429 to `auth.loginRateLimited` | `LoginPage.test` "shows the rate-limited message, not the invalid-credentials one, on a 429" (exact text, no digits). `AuthProvider.test` 429 case. | COMPLIANT |
| Form usable after rate limit | Submit is not disabled by the error | `LoginPage.test` "stays usable after a 429: a later submit is sent and shows its own result" | COMPLIANT |
| Localized rate-limited message | `auth.loginRateLimited` in en/es/ca | `locales.test` `it.each` exact EN, ES and CA strings | COMPLIANT |

Browser check (A.14), recorded in `apply-progress.md`: the real flow showed the 429 message after 10 attempts. The submit button stayed enabled, and `localhost` and `127.0.0.1` kept separate buckets.

### TDD compliance (strict-tdd-verify)

| Check | Result | Details |
|-------|--------|---------|
| TDD Cycle Evidence table present | Yes | One row per task group with a RED failure message and GREEN counts. |
| Tests exist for every code task | Yes | The config spec, the trust-proxy spec, `login-rate-limit.e2e-spec.ts`, `AuthProvider.test.tsx`, `LoginPage.test.tsx` and `locales.test.ts` all exist. A.12 (docs) is correctly marked N/A. |
| GREEN confirmed now | Yes | All referenced files pass in the full runs above. |
| RED credibility | Good | Missing-module errors for the unit specs. The e2e RED was `expected 429, got 200` in 3/3. Web RED was 7 failures with concrete messages. A.8 recorded real regressions (5 controller-spec failures, 118 e2e failures with 429) and their fixes. |
| Triangulation | Good | Config: 12 cases (defaults, empty, explicit, 4 invalid inputs). Trust-proxy: 4 cases. Web: `it.each([429, 401])`, EN/ES/CA, and a post-429 resubmit. |
| Safety net | Not itemized | The template column is absent. Full suites were run in A.8 and A.11 before and after. Informational only. |

**Assertion quality audit** (changed test files, sampled):
- No tautologies and no ghost loops found. The e2e loop over 10 logins asserts `.expect(200)` on a fixed range that cannot be empty.
- The e2e asserts concrete values: `Retry-After` matches `^\d+$`, lies in [1, 900], and equals `'1'` in the configured app.
- The guard override in `auth.controller.spec.ts` is mock-based by design. Throttling is covered by the e2e, as documented in deviation 2.
- Result: 0 CRITICAL, 0 WARNING.

**Test layers**: unit (config, trust-proxy, controller spec, web unit and component tests), e2e HTTP (supertest, 3 apps in one file), integration (unchanged by this change), real browser (A.14).

### Design coherence

| Decision | Followed? |
|----------|-----------|
| D1 `@nestjs/throttler` exact `6.4.0` | Yes (`apps/api/package.json`, no caret) |
| D2 `forRootAsync` in `AuthModule` | Yes |
| D3 throttler named `'default'` | Yes, with an explanatory comment. The e2e pins plain `Retry-After`. |
| D4 `@UseGuards(ThrottlerGuard)` on `login()` only, no `@Throttle`, no `APP_GUARD` | Yes |
| D5 env vars, defaults and fail-fast parsing | Yes |
| D6 guard order puts 429 before validation | Yes. A malformed body returns 429 in the e2e. |
| D7 `getTrustProxySetting` returns `false \| 1`, set in `main.ts` | Yes |
| D8 in-memory storage and default tracker | Yes |
| D9 web `ApiError(status)` and the 429 mapping | Yes |
| D10 separate e2e file | Yes. The "no change to existing suites" claim was superseded by `test/e2e-env.setup.ts` (max 1000 via `setupFiles` in `jest-e2e.json`). This is recorded in `design.md` and `apply-progress.md`. |
| ADR-011 addendum with open questions | Present (2026-10-07) |
| README env docs | Present |
| Deviations | `auth.controller.spec.ts` and the shared e2e env setup were touched beyond the design file list. Both are documented and justified. |

### Issues

**CRITICAL**: none.

**WARNING**
1. Deferred NIT in the README `TRUST_PROXY` row. It describes `true` and `false` or unset, but not that the app throws at boot for any other value, as `getTrustProxySetting` does for `'yes'`. The two `LOGIN_RATE_LIMIT_*` rows do state it. To be fixed in the archive PR.

**SUGGESTION**
1. "Other endpoints unaffected" is proven for `/health` and `/auth/me` only, not for an arbitrary protected write endpoint. This is adequate because the guard is route-level only, but a broader e2e is optional.
2. The TDD Cycle Evidence table uses a custom shape without the Triangulate and Safety Net columns of the template. The content is adequate, so only the format differs.
3. Update the G.1, B.1 and B.2 checkboxes in `tasks.md` at archive. Also carry the ADR-011 open questions (proxy topology, two-hop CDN, IPv6 /64 rotation, in-memory reset on restart) into the archive record.

### Verdict

PASS WITH WARNINGS. There are no CRITICAL issues and the change is archive-ready. The single WARNING is a deferred documentation NIT that is scheduled for the archive PR.
