# Apply Progress: login-rate-limit

Branch: `login-rate-limit/01-login-throttle`. Batch 1: A.1-A.13 done. A.14 (browser verification) and G.1 (review gate) remain with the orchestrator.

## TDD Cycle Evidence

| Task | Test file | RED evidence | GREEN evidence | REFACTOR notes |
|------|-----------|--------------|----------------|----------------|
| A.2/A.3 login rate limit config | `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.spec.ts` | `Cannot find module './login-rate-limit.config'` | `npx jest` on the spec: 12 tests pass (with A.4/A.5: 2 suites, 16 tests) | Single `parsePositiveInteger` helper shared by both vars |
| A.4/A.5 trust proxy | `apps/api/src/shared/infrastructure/env/trust-proxy.spec.ts` | `Cannot find module './trust-proxy'` | 4 tests pass | None needed |
| A.6/A.7 throttle wiring | `apps/api/test/login-rate-limit.e2e-spec.ts` | `expected 429 "Too Many Requests", got 200 "OK"` in all 3 tests (defaults, configured, TRUST_PROXY) | `npm run test:e2e -- login-rate-limit`: 3/3 pass | Full suites exposed two regressions, see deviations; fixed and re-run |
| A.8 full API regression | all API suites | unit: 5 failures in `auth.controller.spec.ts` (`Nest can't resolve dependencies of the ThrottlerGuard`); e2e: 118 failures in 6 suites (`expected 200, got 429`) | unit 140 suites / 1369 tests pass; e2e 12 suites / 465 tests pass | Guard overridden in controller spec; shared e2e setup file |
| A.9/A.10 web | `AuthProvider.test.tsx`, `LoginPage.test.tsx`, `locales.test.ts` | 7 failing: ApiError status 429/401 not thrown, rate-limited message not shown (`Expected element to have text content`), `expected undefined to be 'Too many login attempts...'` x3 | web: 62 files / 1065 tests pass | A.11: `npx tsc -b` and web eslint clean |
| A.12 docs | n/a (TDD N/A) | n/a | n/a | n/a |

## Commits

1. `docs(openspec): add login-rate-limit change artifacts`
2. `feat(auth): add login rate limit config and trust proxy helper` (includes the `@nestjs/throttler` 6.4.0 pin and lockfile)
3. `feat(auth): rate limit POST /auth/login per client IP`
4. `feat(web): show a rate-limited message on login 429`
5. `docs(auth): document login rate limit env vars and ADR-011 addendum`

## Deviations from design

1. **D10 claim "existing suites need no change" was wrong.** Six existing e2e suites (community, review-history, review-schedule, review-template, inspectable-element, checklist-question) log in once per seeded user inside one app and exceeded 10 attempts (118 failures with 429). Fix: `apps/api/test/e2e-env.setup.ts` (wired via `setupFiles` in `test/jest-e2e.json`) sets `LOGIN_RATE_LIMIT_MAX_ATTEMPTS=1000` for every e2e suite. `login-rate-limit.e2e-spec.ts` deletes the variable in `createApp` and restores it in `afterAll`, so it still exercises the real defaults.
2. **`auth.controller.spec.ts` changed** (not in the design's file list): `@UseGuards(ThrottlerGuard)` made its `Test.createTestingModule` fail to resolve `THROTTLER:MODULE_OPTIONS`. The spec now uses `.overrideGuard(ThrottlerGuard)`; throttling is covered by the e2e.
3. **`/auth/me` check in the defaults app**: the session cookie is captured from the first successful login (attempt 1) and reused for `GET /auth/me` (200) after the bucket is exhausted, since a login at that point would be 429.

All throttler v6 claims in the design (named `'default'` emits plain `Retry-After`, `forRootAsync` reads env at compile, `ThrottlerModule` registers no APP_GUARD, malformed body still 429, 1 s block recovers after ~1.1 s) held when the e2e ran.

## Verification

- API unit: 140 suites, 1369 tests pass. E2E: 12 suites, 465 pass. Integration: 29 suites, 207 pass (hermetic DB; Postgres container `sf-manager-postgres-1` was down and was started with `docker compose up -d`).
- Web: 62 files, 1065 tests pass. `npx tsc -b` (web) clean. `npm run lint`: 0 errors, 4 pre-existing warnings in `auth.controller.spec.ts`. API build OK.

## Remaining

- A.14 browser verification (orchestrator + user).
- G.1 fresh-context review.
