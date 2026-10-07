# Design: Rate limit on the login endpoint (revision 2, post fresh-review)

## Technical Approach

The API adds `@nestjs/throttler` to `AuthModule` through `forRootAsync`, configured by a small env factory that follows the `getAuthConfig()` pattern. Only the login handler gets `@UseGuards(ThrottlerGuard)`. A pure `getTrustProxySetting()` helper feeds `app.set('trust proxy', ...)` in `main.ts` and in the e2e app. On the web side, `AuthProvider.login` throws the existing `ApiError(status)`, and `LoginPage` maps a 429 to `auth.loginRateLimited`.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|----------|----------|-----------|
| D1 | `@nestjs/throttler` pinned to exactly `6.4.0` (no caret). Verified: 6.4.0 is the first 6.x whose peer range includes `@nestjs/common ^11`. | Hand-rolled middleware; a `^6.4.0` range | ADR-011 Decision 4 already names the library. Header and storage behaviour changed across 6.x minors, and the e2e pins that behaviour, so upgrades must be deliberate. |
| D2 | `ThrottlerModule.forRootAsync({ useFactory })` in `AuthModule.imports`. The factory returns `[{ name: 'default', ttl: windowMs, limit: maxAttempts }]`. | `forRoot(...)` | `forRootAsync` reads env when the factory is evaluated, at module initialisation, so each e2e app sees the env its `beforeAll` set. `forRoot` captures its options when the module file is evaluated, before that. This is consistent with `JwtModule.registerAsync` and `AUTH_CONFIG`. |
| D3 | The throttler is named `'default'`. | A named throttler such as `'login'` | v6 adds a `-{name}` suffix to headers for non-default names (`Retry-After-login`). Only `'default'` emits a plain `Retry-After`, in seconds. The e2e test pins this. |
| D4 | `@UseGuards(ThrottlerGuard)` on `login()` only, with no `@Throttle`, no `APP_GUARD`, and `@ApiTooManyRequestsResponse` added | `@Throttle({...})`; a global guard | `@Throttle` values are fixed at decoration time and would duplicate the config. `ThrottlerModule` is `@Global()` but registers NO `APP_GUARD`; it only provides `THROTTLER_OPTIONS` and the storage. Importing it therefore throttles nothing by itself, and a route-level guard means no other endpoint is throttled. The e2e still asserts other endpoints are unthrottled. |
| D5 | Env vars `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` (default 10) and `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (default 900). Unset or empty means the default. Any value that is not a positive integer throws at startup. | `LOGIN_RATE_LIMIT`/`TTL`; a `"15m"` duration string | A shared prefix groups the two vars, and putting the unit in the name removes ambiguity. Integers keep parsing trivial. `parseDurationMs` is private, and its error message is specific to JWT. Failing fast matches `getAuthConfig()`. |
| D6 | Order: global `AuthenticatedGuard` (`@Public` passes), then `PermissionsGuard`, then the route `ThrottlerGuard`, then `ZodValidationPipe`, then the handler | — | Nest runs global guards, then route guards, then pipes. A 429 therefore happens before validation and before credentials are checked. Malformed bodies also count, which is consistent with "every attempt counts". |
| D7 | `getTrustProxySetting(env): false \| 1` in `shared/infrastructure/env/trust-proxy.ts`. Unset, `''` or `'false'` give `false`. `'true'` gives `1`, meaning one trusted hop. Anything else throws. `main.ts` uses `NestFactory.create<NestExpressApplication>` and calls `app.set('trust proxy', getTrustProxySetting(process.env))`. | Express `true`; extracting the whole bootstrap | With `true`, Express trusts every hop, so `req.ip` becomes the leftmost `X-Forwarded-For` entry. A client controls that entry, so it could rotate buckets. One hop takes the address the proxy appended. Extracting the full bootstrap would touch all 12 e2e suites, so only this one setting is extracted. |
| D8 | In-memory storage (the default) and the default tracker (`req.ip`) | Redis; IP+email keying | ADR-001 runs a single instance, and the proposal keeps the scope to per-IP. |
| D9 | Web: `login()` throws `new ApiError(response.status)`, reused from `api/client.ts`. `LoginPage` catch: `err instanceof ApiError && err.status === 429` gives `auth.loginRateLimited`, and anything else gives `auth.loginFailed`. | A new error type; parsing the message | `ApiError` already carries `status`. The anti-enumeration rule is unchanged because 401 stays generic. A network failure in `login()` throws `TypeError` and still falls to `auth.loginFailed`; that is existing behaviour and out of scope. |
| D10 | A new e2e file, `test/login-rate-limit.e2e-spec.ts`, instead of extending `auth.e2e-spec.ts` | Adding cases to `auth.e2e` | `auth.e2e` already logs in 6 times in one app. Exhausting the bucket there would break its other cases, which depend on order. Storage is per `ThrottlerModule` instance, so each compiled `AppModule` (even several in one Jest process) has isolated counters. The busiest existing suite logs in 6 times, which is under 10, so the existing suites need no change. |

### Throttling semantics (6.4.0, fixed block)

Hits are counted per key on a timer lasting `ttl`. The `(limit+1)`th hit sets a block with `blockExpiresAt = now + blockDuration` (default `blockDuration = ttl`), so the lockout lasts a full window from the first rejected attempt, not from the first hit. `Retry-After = ceil(remaining ms / 1000)` seconds. Each hit schedules a non-`unref`'d `setTimeout(ttl)` that is cleared only in `onApplicationShutdown`, so every app must be closed or Jest will hang.

## Data Flow

    POST /auth/login -> AuthenticatedGuard(@Public: pass) -> PermissionsGuard
      -> ThrottlerGuard [key=req.ip; trust proxy decides socket vs XFF]
           | over limit / blocked -> 429 + Retry-After (body and credentials not evaluated)
           v
      ZodValidationPipe -> LoginUseCase -> 200 | 401

    web: login() !ok -> ApiError(status) -> LoginPage: 429 ? loginRateLimited : loginFailed

## File Changes

| File | Action | Est. lines |
|------|--------|-----------|
| `apps/api/package.json`, lockfile | Add `@nestjs/throttler` `6.4.0` (exact) | — |
| `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.ts` (+spec) | `getLoginRateLimitConfig(): { maxAttempts; windowMs }` | code ~25 / test ~60 |
| `apps/api/src/shared/infrastructure/env/trust-proxy.ts` (+spec) | `getTrustProxySetting` | code ~12 / test ~30 |
| `apps/api/src/modules/auth/auth.module.ts` | `ThrottlerModule.forRootAsync` | code ~10 |
| `apps/api/src/modules/auth/presentation/auth.controller.ts` | Guard and Swagger 429 | code ~4 |
| `apps/api/src/main.ts` | Typed `NestExpressApplication`, trust proxy | code ~4 |
| `apps/api/test/login-rate-limit.e2e-spec.ts` | Create | test ~190 |
| `apps/web/src/auth/AuthProvider.tsx` (+test) | Throw `ApiError(status)`; update comment L85-88 | code ~3 / test ~25 |
| `apps/web/src/pages/LoginPage.tsx` (+test) | 429 mapping; update header comment | code ~5 / test ~50 |
| `apps/web/src/i18n/locales/{en,es,ca}.json`, `locales.test.ts` | `auth.loginRateLimited` | code 3 / test ~10 |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`, `README.md` | Addendum (with open questions below) and env docs | docs ~50 |

`auth.loginRateLimited`:
- EN: "Too many login attempts. Please try again later."
- ES: "Demasiados intentos de inicio de sesión. Vuelve a intentarlo más tarde."
- CA: "Massa intents d'inici de sessió. Torna-ho a provar més tard."

## Testing Strategy (Strict TDD, RED first)

| Layer | Cases |
|-------|-------|
| Config unit | Unset gives 10/900000 ms. Empty gives the defaults. Explicit values are parsed. `0`, `-1`, `abc` and `1.5` throw with the var name in the message. |
| Trust proxy unit | Unset, `''` and `'false'` give `false`. `'true'` gives `1`. `'yes'` throws. |
| E2E setup | Apps are created with `createNestApplication<NestExpressApplication>()` so `app.set('trust proxy', ...)` type-checks. A `createApp(env)` helper sets env before compiling. `beforeAll` saves `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS` and `TRUST_PROXY` explicitly; `afterAll` closes all three apps and restores each var (deleting it if it was unset). |
| E2E cases | **Defaults app** (vars deleted, `TRUST_PROXY` off): 10 valid logins with varying `X-Forwarded-For` values all return 200, and the 11th returns 429 with `Retry-After` an integer in `[1, 900]` (not asserted equal to the window). This covers the default limit, successful attempts counting, and the off case sharing one counter. Still over the limit, a malformed body returns 429, not 400, proving validation and credentials are not evaluated. `GET /health` returns 200 and the agent's `GET /auth/me` returns 200. **Configured app** (max 2, window 1 s): the 3rd attempt returns 429 with `Retry-After` in `[1, 1]`. After waiting past the block (~1.1 s), the next attempt returns 200. **Trust-proxy app** (`TRUST_PROXY=true`, max 2): XFF A exhausts its bucket, and XFF B still gets 200. |
| Web unit | `AuthProvider.test`: `login()` rejects with `ApiError` and status 429/401. `LoginPage.test`: a 429 shows the rate-limited message, does not show `loginFailed`, and shows no digits. A later submit sends the attempt and shows its result. `locales.test`: exact EN/ES/CA strings. |

RED: the e2e first fails with 200 instead of 429. The unit tests fail on missing modules.

## Delivery

Use the stacked-to-main chain.
- **PR 1** is `login-rate-limit/01-login-throttle`, titled `feat(auth): PR 1/2 — rate limit on POST /auth/login`. It is about 66 lines of code, 365 of tests and 50 of docs, for roughly 480 in total. The excess over 400 is tests and docs, so the CLAUDE.md size-exception rule applies.
- **PR 2** is `02-archive`.

Browser check: with the API freshly restarted, a wrong password 10 times followed by an 11th attempt shows the message. Restart the API afterwards to clear the in-memory counter.

## Migration / Rollout

No migration is required. Revert the PR to roll back.

## Open Questions

Recorded in the ADR-011 addendum as open questions; NOT implemented in this slice (ADR-006).

- [ ] Deployment topology (proxy or not) decides the production `TRUST_PROXY` value. This does not block the change.
- [ ] CDN in front of a proxy (two hops): `TRUST_PROXY=true` (one hop) resolves the CDN address, so all clients share a bucket. A numeric hop count may be needed later. Conversely, `TRUST_PROXY=true` with no proxy at all lets a client spoof its key with a single `X-Forwarded-For`.
- [ ] IPv6 clients can rotate the low 64 bits to get fresh buckets; keying on the `/64` prefix may be needed later.
- [ ] In-memory counters reset on every restart or redeploy.
