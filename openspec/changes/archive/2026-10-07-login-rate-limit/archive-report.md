# Archive Report: login-rate-limit

**Change**: login-rate-limit - per-IP rate limit on the login endpoint (tech-debt #4)
**Archived**: 2026-10-07
**Archived to**: `openspec/changes/archive/2026-10-07-login-rate-limit/`
**Mode**: hybrid (filesystem merge plus Engram report)
**Verdict carried from sdd-verify**: PASS WITH WARNINGS - 0 CRITICAL, 1 WARNING, 3 SUGGESTION. The WARNING was fixed before archive; see below.
**Engram traceability**: proposal, spec, design, tasks, apply-progress and verify-report under `sdd/login-rate-limit/*`; this report is `sdd/login-rate-limit/archive-report`.

## Summary

`POST /auth/login` was public with no attempt limit, so passwords could be brute-forced. The login route now carries a route-level `ThrottlerGuard` (`@nestjs/throttler` pinned at exactly 6.4.0, no global `APP_GUARD`, in-memory storage). By default it allows 10 attempts per client IP per 15 minutes, configurable with `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` and `LOGIN_RATE_LIMIT_WINDOW_SECONDS`. Every attempt counts, successful ones included, and the over-limit answer is 429 with `Retry-After`. `TRUST_PROXY` (off by default; `true` means exactly one trusted hop) decides whether the client IP comes from the socket or from `X-Forwarded-For`. On the web, the login page shows a generic, localized rate-limited message (EN, ES and CA) on a 429, distinct from the invalid-credentials message, and the form stays usable.

## Task Completion Gate

A.1-A.14 were `[x]` before the archive. At archive the orchestrator-owned boxes were ticked with evidence: G.1 (two fresh reviews, PR #196 merged at a35f225, CI green on `main` run 37657858109), B.1 (verify) and B.2 (this archive). All tasks are complete.

## Preconditions confirmed

- Verify verdict PASS WITH WARNINGS with 0 CRITICAL: archive allowed.
- The implementation PR is merged; CI is green on the PR run and on the push to `main`.
- A.14 browser verification done (2026-10-07), so the web part is browser-verified, not only test-verified.

## Specs Synced

| Capability | Action | Requirements |
|---|---|---|
| `authentication` | Updated (delta merged into the existing main spec) | 2 ADDED, 1 MODIFIED, 0 REMOVED |

- **ADDED**: Login Attempt Rate Limiting; Client IP Resolution for Rate Limiting.
- **MODIFIED**: Login Form Validation (Web), which gains the rate-limited message, form-usable and localized-message scenarios.

## Verify findings disposition

- **WARNING (fixed)**: the README `TRUST_PROXY` row now states that any value other than `true`, `false` or empty makes the app throw at boot. Shipped in this archive PR.
- **SUGGESTION (actioned)**: `tasks.md` checkboxes updated, and the ADR-011 open questions carried forward below.
- **SUGGESTION (not actioned)**: a broader e2e proving that an arbitrary protected write endpoint is unthrottled. Currently `/health` and `/auth/me` are proven, which is adequate because the guard is route-level only.
- **SUGGESTION (not actioned)**: the TDD Cycle Evidence table lacks the template's Triangulate and Safety Net columns. Format only.

## Open questions carried forward (ADR-011, not implemented per ADR-006)

1. The deployment and proxy topology decides the production `TRUST_PROXY` value.
2. With a CDN in front of a reverse proxy (two hops), `TRUST_PROXY=true` (one hop) resolves the CDN address, so all clients share one bucket; a numeric hop count may be needed. Conversely, `TRUST_PROXY=true` with no proxy lets clients spoof their key through `X-Forwarded-For`.
3. IPv6 clients can rotate the low 64 bits to get fresh buckets; keying on the /64 prefix may be needed.
4. In-memory counters reset on every restart or redeploy.
5. Account lockout and per-email keying are deferred.

## Learned

- `ThrottlerModule` is `@Global` but registers no `APP_GUARD`, so a route-level `@UseGuards(ThrottlerGuard)` throttles only login.
- The throttler must be named `'default'` to emit a plain `Retry-After` header.
- Design D10's claim that the existing e2e suites needed no change was wrong: several log in more than 10 times per app. `test/e2e-env.setup.ts` (Jest `setupFiles` in `jest-e2e.json`) raises the limit to 1000 for them. Run e2e with `npm run test:e2e`, not bare `jest test/`, or the setup file is skipped.
