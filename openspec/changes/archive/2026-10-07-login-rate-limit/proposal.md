# Proposal: Rate limit on the login endpoint

## Intent

`POST /auth/login` is public and has no attempt limit, so passwords can be brute-forced without restriction (tech-debt #4). ADR-011 Decision 4 targets `@nestjs/throttler`, but the 2026-08-21 addendum (item 3) deferred it as time-boxed exposure. This change closes that gap with a per-IP throttle and a clear message on the login page.

## Scope

### In Scope
- API: `@nestjs/throttler`, applied at route level to `POST /auth/login` only (no global `APP_GUARD`).
  - Per-IP keying, in-memory storage (single instance per ADR-001).
  - Default 10 attempts per 15 minutes per IP, set by env vars through a small config factory. Tests can lower the limits.
  - Every attempt counts, successful logins included.
  - Over the limit, the API returns 429 with `Retry-After`.
- `TRUST_PROXY` env var, read in `main.ts`, off by default.
- Minimal web UI: on a 429, the login page shows "Too many login attempts. Please try again later." in EN, ES and CA. This message is distinct from the invalid-credentials error and has no countdown.
- Docs: an ADR-011 addendum marking item 3 as addressed and recording account lockout and deployment topology as open questions. The new env vars go in `README.md`.

### Out of Scope
- Account lockout and per-email keying.
- Distributed or shared throttle storage.
- Limiting any other endpoint.
- A `Retry-After` countdown in the UI.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `authentication`:
  - New requirement: login attempt rate limiting (429 + `Retry-After`, per IP, configurable).
  - "Login Form Validation (Web)" gains the rate-limited message scenario.

## Approach

This follows the approach recommended by the exploration.
- API: `ThrottlerModule.forRootAsync` in `AuthModule`, configured from env. `@UseGuards(ThrottlerGuard)` and `@Throttle` go on the login handler.
- Web: `AuthProvider.login` throws a typed error that carries the HTTP status. `LoginPage` maps a 429 to `auth.loginRateLimited`.
- Strict TDD (ADR-016) applies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/package.json` | Modified | Add `@nestjs/throttler` |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Register the throttler |
| `apps/api/src/modules/auth/infrastructure/config/` | New/Modified | Throttle config factory |
| `apps/api/src/modules/auth/presentation/auth.controller.ts` | Modified | Guard on login |
| `apps/api/src/main.ts` | Modified | `TRUST_PROXY` |
| `apps/api/test/auth.e2e-spec.ts` | Modified | 429 cases |
| `apps/web/src/auth/AuthProvider.tsx`, `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Typed error, message, strings |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`, `README.md` | Modified | Addendum, env docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Behind a proxy with `TRUST_PROXY` off, every client shares one IP bucket, so one attacker locks out everyone | Med | Document it in the README and ADR. Topology is an open question. |
| `TRUST_PROXY` on without a proxy lets clients spoof `X-Forwarded-For` | Low | Off by default; document it |
| Counters are per process, so scaling out multiplies the effective limit | Low | ADR-001 is single-instance. Shared storage is deferred. |
| A future public auth endpoint (reset, refresh) ships without the guard | Med | Record it in the spec and ADR addendum |
| E2E suites that log in repeatedly hit the limit | Med | Env-configurable limits; each suite builds its own app |
| Shared NAT (office) users get throttled together | Low | 10/15 min is generous; lockout and per-email keying deferred |

## Rollback Plan

Revert the PR. There is no data migration. The new env vars are optional and safe to leave set.

## Dependencies

- `@nestjs/throttler` v6.x (Nest 11 compatible).
- The PR must pass the `ci` check (ADR-017).

## Success Criteria

- [ ] E2E: the 11th login attempt from one IP within the window gets 429 with `Retry-After`. Successful attempts count toward the limit.
- [ ] E2E: other endpoints are not throttled.
- [ ] The limits come from env vars, with the defaults applied when the vars are unset.
- [ ] Web: a 429 shows the rate-limited message, not the invalid-credentials one. This is verified in the browser, and the ES/CA strings by locale tests.

## Open Questions

- Deployment topology: is there a reverse proxy in front of the API? This decides the production `TRUST_PROXY` value.
- Account lockout or per-email keying, to be recorded in ADR-011.

## Size

About 60-90 code lines and 200-300 test lines in one PR, plus an archive PR.
