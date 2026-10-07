# Tasks: Rate limit on the login endpoint

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~480 (code ~66, tests ~365, docs ~50) plus openspec artifacts; PR 2 archive only (docs) |
| 400-line budget risk | High (PR 1 only, excess is tests/docs) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (API throttle + web message) then PR 2 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Decision needed: PR 1 exceeds 400 lines by ~80. Code is ~66 lines; the rest is tests/docs (CLAUDE.md size-exception rule). The user accepts it or splits web into its own PR.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Throttle on login, trust proxy, web 429 message, e2e, ADR-011 addendum, README | PR 1/2 | Base: main. Branch `login-rate-limit/01-login-throttle`. Title `feat(auth): PR 1/2 — rate limit on POST /auth/login` |
| 2 | Archive | PR 2/2 | Base: main (after PR 1 merges). Branch `login-rate-limit/02-archive`. Title `docs(openspec): PR 2/2 — archive login-rate-limit` |

Strict TDD (ADR-016): every behavior RED, GREEN, REFACTOR. Apply records a "TDD Cycle Evidence" table in apply-progress (RED command and failure; GREEN command and pass count). Every commit must compile: `npx tsc -b` in apps/web, API build and lint (Vitest does not type-check). PR must pass `ci`.

## Phase A: PR 1 (sdd-apply)

- [x] A.1 Add `@nestjs/throttler` exactly `6.4.0` (no caret) to `apps/api/package.json` and lockfile.
- [x] A.2 RED: `login-rate-limit.config.spec.ts`: unset and empty give 10/900000; explicit values parse; `0`, `-1`, `abc`, `1.5` throw naming the var. Spec: Default/Configured limits. RED: missing module.
- [x] A.3 GREEN: `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.ts`: `getLoginRateLimitConfig()` reading `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` and `LOGIN_RATE_LIMIT_WINDOW_SECONDS`.
- [x] A.4 RED: `trust-proxy.spec.ts`: unset, `''`, `'false'` give `false`; `'true'` gives `1`; `'yes'` throws. Spec: Client IP Resolution.
- [x] A.5 GREEN: `apps/api/src/shared/infrastructure/env/trust-proxy.ts`: `getTrustProxySetting`.
- [x] A.6 RED: `apps/api/test/login-rate-limit.e2e-spec.ts` with `createApp(env)` helper, `NestExpressApplication`, env save/restore, all apps closed. Defaults app: 10 logins with varying XFF return 200, 11th 429 with integer `Retry-After` in [1, 900], malformed body still 429, `/health` and `/auth/me` 200. Configured app (max 2, 1 s): 3rd 429 `Retry-After` 1, 200 after ~1.1 s. Trust-proxy app: XFF A exhausted, XFF B 200. Spec: all Rate Limiting and IP scenarios. RED: 200 instead of 429.
- [x] A.7 GREEN: `auth.module.ts` `ThrottlerModule.forRootAsync` (name `'default'`); `auth.controller.ts` `@UseGuards(ThrottlerGuard)` on `login()` plus `@ApiTooManyRequestsResponse`; `main.ts` typed `NestExpressApplication` with `app.set('trust proxy', getTrustProxySetting(process.env))`.
- [x] A.8 REFACTOR: tidy; run API lint, build, unit and `npm run test:e2e --workspace=apps/api` (full suite, confirm no existing suite hits the limit).
- [x] A.9 RED: `AuthProvider.test.tsx`: `login()` rejects with `ApiError` status 429 and 401. `LoginPage.test.tsx`: 429 shows rate-limited message, not `loginFailed`, no digits; later submit sends and shows its result. `locales.test.ts`: exact EN/ES/CA `auth.loginRateLimited`. Spec: Rate-limited message; Form usable; Localized.
- [x] A.10 GREEN: `AuthProvider.tsx` throw `new ApiError(response.status)` (update comment L85-88); `LoginPage.tsx` map 429 to `auth.loginRateLimited` (update header comment); add key to `en.json`, `es.json`, `ca.json`.
- [x] A.11 REFACTOR: run `npx tsc -b` in apps/web, web lint and `npm run test --workspace=apps/web`.
- [x] A.12 Docs (TDD N/A): ADR-011 addendum with the four open questions; `README.md` env vars `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `TRUST_PROXY`.
- [x] A.13 Check `git diff --stat` (~480). Commit by work unit: api config+helper, throttle wiring+e2e, web, docs.
- [x] A.14 Browser verification (orchestrator + user, not sdd-apply): API freshly restarted, dev server, claude-in-chrome; the user logs in themselves. Wrong password 10 times, 11th shows the message; form still usable. Restart the API afterwards. Report browser-verified or test-verified.
  - Browser-verified 2026-10-07 on a freshly started `npm run dev`. The user logged in successfully (attempt 1, `/auth/me` 200), then logged out. Wrong-password submissions through the login form returned 401 for attempts 2–10; attempt 11 onwards returned 429. The page showed "Too many login attempts. Please try again later." and the submit button stayed enabled. curl from `localhost` (::1) got 429 with `Retry-After: 888`; curl from `127.0.0.1` (a separate bucket) still got 401 "Invalid email or password"; `GET /health` returned 200. The dev server was stopped afterwards, which clears the in-memory counters.

## Gate (orchestrator)

- [ ] G.1 Fresh-context review before push and before merge; the user confirms push, PR and merge. PR passes `ci`.

## Phase B: Close

- [ ] B.1 `sdd-verify` against spec scenarios after PR 1 merges.
- [ ] B.2 `sdd-archive`: merge the authentication delta into `openspec/specs/authentication/spec.md`; archive via `login-rate-limit/02-archive` PR (orchestrator does `git mv` and commit).
