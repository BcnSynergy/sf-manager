# Exploration: login-account-lockout (TD-31)

Date: 2026-10-13. Origin: TD-31 (`docs/technical-debt.md`): account lockout and per-email rate-limit keying were deferred, so a distributed attack on one account is not limited (`login-rate-limit` archive-report, open question 5). Deferred to its own slice on 2026-10-12.

## Current State

- **Per-IP throttle only.** `LoginThrottlerGuard` (`apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`) extends `ThrottlerGuard` and overrides only `getTracker`, which returns `toClientKey(req.ip)` (IPv6 keyed on the /64 prefix). One throttler, named `'default'` (it must stay `default`, or the header becomes `Retry-After-login`), wired in `auth.module.ts` through `ThrottlerModule.forRootAsync`.
- **Defaults.** 10 attempts per 900 s, from `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` and `LOGIN_RATE_LIMIT_WINDOW_SECONDS` (`login-rate-limit.config.ts`); both positive integers, failing fast at boot.
- **Every attempt counts**, successful ones included (spec scenario "Successful attempts count"). Over the limit: 429 with `Retry-After`, credentials not evaluated.
- **Storage.** `PrismaThrottlerStorage`: one atomic upsert on `ThrottleCounter(key, hits, windowEndsAt, blockedUntil, expiresAt)`. The key is the library's sha256 (no raw IP). Fixed window anchored on the first attempt; blocking on the db clock; `expiresAt` set by a trigger; bounded best-effort cleanup; fails closed (500) on storage errors. `throttlerName` is part of the hashed key, so per-throttler namespacing is free.
- **No account state.** `User` has no failed-count or lock fields. Emails are stored lowercase.
- **Login use case.** `LoginUseCase` returns `InvalidCredentialsError` identically for an unknown email, a soft-deleted user and a wrong password, and runs a dummy argon2 verify for unknown emails to equalize timing. This is the anti-enumeration boundary.
- **Email normalization.** `loginRequestSchema` does `trim().toLowerCase()` in the Zod pipe. Guards run before pipes, so a guard sees the raw `req.body.email`; a per-email guard must repeat the normalization and handle non-string or missing values.
- **Web.** `LoginPage.tsx` maps `ApiError.status === 429` to `auth.loginRateLimited` (EN/ES/CA): no countdown, no digits, the form stays usable.
- **Spec.** `openspec/specs/authentication/spec.md` "Login Attempt Rate Limiting" is per client key only. The ADR-011 hardening addendum lists per-email keying and lockout (TD-31) as out of scope.

## Affected Areas

- `login-throttler.guard.ts` (+ spec): add an email-keyed check.
- `prisma-throttler-storage.adapter.ts`: for failure-only counting, a "reset on success" operation, or a separate small port.
- `auth.module.ts`, `login-rate-limit.config.ts`: new env vars.
- `auth.controller.ts` or `LoginUseCase`: a hook to count failures and reset on success.
- `openspec/specs/authentication/spec.md`: MODIFIED or ADDED requirement. ADR-011: addendum. `docs/technical-debt.md`: TD-31 to Resolved.
- `apps/web/src/pages/LoginPage.tsx` and i18n: only if the message changes.
- `test/e2e-env.setup.ts`: may need the new limit raised for suites that log in repeatedly.
- `apps/api/prisma/schema.prisma`: only with Approach B.

## Approaches

**A. Per-email failed-attempt throttle on the existing `ThrottleCounter`.** Key `sha256("login-email:" + normalizedEmail)` (HMAC is EN-6). If the email bucket is blocked, 429 with `Retry-After`; after a failed credential check, increment; after a success, reset. The same path runs for unknown emails.
- Pros: no `User` migration; anti-enumeration holds; rows expire and the existing cleanup handles them; no raw PII; blocking is temporary, so an attacker cannot lock a victim out indefinitely; reuses the db clock, `Retry-After` semantics and the web 429 message.
- Cons: an attacker can keep a known victim blocked by re-triggering every window (bounded, temporary DoS); the library cannot count failures only, so storage needs a small extension; distinct unknown emails create rows (bounded by the per-IP limit and cleanup, but attacker-driven writes).
- Effort: Medium.

**A'. Second named throttler counting all attempts.** Smallest change, but a victim's own logins consume the budget, the header becomes `Retry-After-<name>` unless handled manually, and it cannot reset on success. Effort: Low. Not recommended.

**B. Lockout state on `User` (`failedLoginCount`, `lockedUntil`), auto-unlock plus optional admin unlock.**
- Pros: visible, auditable lock; admin unlock possible; well-understood model.
- Cons: migration and users-module changes; unknown and soft-deleted emails have no row, so identical behavior needs a parallel counter store anyway (B alone leaks account existence); persistent lock is a stronger DoS lever; needs an admin unlock screen (ADR-006 minimal UI); writes to `User` on every failure.
- Effort: High.

**C. Progressive delay / exponential backoff per account.** Gentle on legitimate users, but sleeping in the request ties up connections (DoS vector) and a growing `Retry-After` needs per-key "strikes" state; not cheaply testable; a new behavior class. Effort: High. Possible EN later.

## Recommendation

Approach A:
- The guard (or a small `LoginAttemptPolicy` port) normalizes the email as `String(email).trim().toLowerCase()`, maps non-strings to a fixed `invalid` bucket, and hashes it. The spec states which check wins when both IP and email apply.
- Count failures only, reset on success. The per-IP rule ("every attempt counts") and the per-email rule ("failures count") are deliberately different, and the spec says so.
- Proposed defaults: 5 failures per 15 minutes per email, block equal to the window. Env vars `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES`, `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS`, reusing `parsePositiveInteger`.
- Structured warn log when an email bucket blocks, with the hash only.
- Stored lock with admin unlock (B) and backoff (C) recorded as enhancement candidates.

## Decision Gaps for the User

1. Throttle or true lockout? Recommended: temporary throttle (A), 429 + `Retry-After`.
2. Limit and window. Recommended: 5 failures per 900 s, block equal to the window; per-IP stays at 10.
3. Does a success reset the counter? Recommended: yes.
4. Do successful logins count toward the email limit? Recommended: no, failures only.
5. User-visible message. Recommended: reuse `auth.loginRateLimited`, so the UI cannot reveal whether the email exists or which limit fired; no countdown.
6. Admin unlock. Recommended: no (nothing to unlock under A); defer to an EN.
7. Hash for the email key. Recommended: sha256 with a fixed prefix; HMAC stays EN-6.
8. Audit/logging. Recommended: warn log with the hash on block; no audit table.
9. Which check responds when both IP and email are blocked? Recommended: 429 either way; `Retry-After` is the larger of the two.

## UI per CLAUDE.md

This is auth hardening on an existing endpoint, not a new domain slice. Under Approach A with the shared message, the existing 429 handling covers the user-visible effect, so no new UI is required; the proposal must state this explicitly. A spec scenario and a test that the login page shows the rate-limited message for an email-level 429 are enough. Browser verification is still advisable. Approach B would need a minimal "Unlock" action on the users list.

## Risks

- Bucket pollution with random emails (bounded by the per-IP limit and cleanup; see TD-35, EN-22).
- Bounded DoS on a known account (about 5 attempts per window); not eliminable without CAPTCHA or similar.
- Normalization drift between the guard and the Zod schema; reuse the same transform.
- One more upsert per failed attempt.
- Spec change plus ADR-011 addendum.
- Existing e2e suites that log in repeatedly may trip the new limit (`test/e2e-env.setup.ts`).
- Fail-closed consistency: a storage error on the new check returns 500.

## Ready for Proposal

Yes, after the decision gaps are answered; 1, 3 and 4 are load-bearing.

## Decision Gap Answers (2026-10-13)

1. Temporary throttle (Approach A): 429 with `Retry-After`; no stored lock on `User`.
2. 5 failed attempts per 900 s per email, block equal to the window; the per-IP limit stays at 10 per 900 s. Both configurable by env var.
3. A successful login resets the email counter.
4. Only failed attempts count toward the email limit (deliberately different from the per-IP rule).
5. Reuse the existing `auth.loginRateLimited` message; no countdown; no web change.
6. No admin unlock; register it as an enhancement (relevant only if a persistent lock is ever introduced).
7. SHA-256 with a fixed prefix for the email key; extend EN-6 (HMAC) to cover email keys.
8. Warn log with the email hash (never the raw email) when an email bucket becomes blocked; register a DB audit table as an enhancement.
9. When both the IP and the email are blocked, respond 429 with the larger `Retry-After`. A request rejected by the IP limit never evaluates credentials, so it adds no email failure.
