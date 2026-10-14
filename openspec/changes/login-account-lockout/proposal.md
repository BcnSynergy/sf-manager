# Proposal: Per-Email Login Failure Limiting (TD-31)

## Intent

Login attempts are limited per client key only (resolved client IP,
IPv6 grouped by /64), in `LoginThrottlerGuard`
(`apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`).
An attacker who spreads password guesses for one account across many IPs
is never limited: each IP stays under 10 attempts per 15 minutes while
the target account takes an unbounded number of guesses. `User` has no
failed-attempt or lock state.

This is TD-31 (`docs/technical-debt.md`, Open/Medium): "Account lockout
and per-email rate-limit keying are deferred, so a distributed attack on
one account is not limited" (`login-rate-limit` archive-report, open
question 5; deferred to its own slice on 2026-10-12). The ADR-011
hardening addendum lists it as out of scope, so the gap is known and
documented, not new.

Success: after 5 failed login attempts for one email within 15 minutes,
from any number of client keys, further attempts for that email get 429
with `Retry-After` until the window ends; a successful login resets the
count; the response for an unknown email is indistinguishable from the
response for an existing one.

## Scope

### In Scope
- A per-email failed-attempt limit on `POST /auth/login`, independent of
  the existing per-client-key limit (both apply).
- Email bucket key: SHA-256 of a fixed prefix plus the normalized email
  (`"login-email:" + trim().toLowerCase()`); non-string or missing emails
  map to one fixed bucket. The raw email is never stored or logged.
- Only failed credential checks count; a successful login resets the
  email counter. Requests rejected by either limit evaluate no
  credentials and add no email failure.
- Unknown and soft-deleted emails follow the identical path (count,
  block, response) as existing ones.
- Over the email limit: 429 with `Retry-After` and the existing generic
  body, credentials not evaluated. When both the client key and the email
  are blocked: 429 with the larger `Retry-After`.
- Block duration equal to the window; temporary only (no stored lock).
- Env vars `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` (default 5) and
  `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (default 900), positive
  integers validated at boot, reusing `parsePositiveInteger`.
- Storage on the existing `ThrottleCounter` table (atomic upsert, db
  clock, `expiresAt` trigger, existing cleanup), extended with what the
  library cannot do: record a failure, reset a key, and read a key's
  block state. Fail closed (500) on storage errors when reading the block
  state or recording a failure, consistent with the per-IP limit. A storage
  error on the reset after a valid login is logged as a warning and the
  login succeeds (the reset is a convenience, not a security control; user
  decision, 2026-10-13).
- One structured `warn` log when an email bucket becomes blocked, with
  the key hash only.
- Raise the email limit in `apps/api/test/e2e-env.setup.ts` (and
  `rate-limit-env.setup.ts` if needed) so existing suites that log in
  repeatedly do not trip it; dedicated tests set low limits explicitly.
- Unit, integration (Postgres) and e2e tests for the new behavior,
  including distributed attempts across client keys, reset on success,
  unknown-email parity, both-limits `Retry-After`, and fail-closed.
- Delta spec for `authentication` (see Capabilities).
- ADR-011 addendum recording the decision (Approach A, failures only,
  reset on success, no stored lock, SHA-256 with prefix, combined
  `Retry-After` rule).
- Registers in the delivering PR: TD-31 to Resolved; EN-6 extended to
  email keys; two new EN entries (see Registers).
- README env-var documentation for the two new variables.
- Commit the currently untracked `explore.md` with this change's
  artifacts in the first PR.

### Out of Scope
- A persistent lock on `User` (`failedLoginCount`, `lockedUntil`;
  explore Approach B) and any migration on `User`.
- Admin unlock action or screen (nothing to unlock under a temporary
  throttle); registered as an EN.
- Progressive delay / exponential backoff (explore Approach C).
- HMAC keying for throttle keys (stays EN-6, extended to email keys).
- A DB audit table of blocked logins; registered as an EN.
- CAPTCHA or any challenge flow.
- Notifying the account owner (email, in-app) about blocked attempts.
- Changing the per-client-key limit (stays 10 per 900 s, every attempt
  counts) or `TRUST_PROXY` resolution.
- Mapping storage failures to 503 (stays EN-12).
- Any web change (see UI).

## UI

No new web UI, and no change under `apps/web/**` is expected.

- CLAUDE.md "Every domain slice includes its own UI" applies to new
  domain slices. This change hardens an existing endpoint
  (`POST /auth/login`) inside the existing `authentication` capability;
  it introduces no new domain, entity or user flow.
- The only user-visible effect is a 429 on login, which the login page
  already handles: `LoginPage.tsx` maps `ApiError.status === 429` to
  `auth.loginRateLimited` (EN/ES/CA), with no countdown and the form
  left usable ("Login Form Validation (Web)", scenarios "Rate-limited
  message" and "Form usable after rate limit").
- Reusing that shared message is deliberate: the UI cannot reveal
  whether the email exists or which limit fired, which preserves the
  anti-enumeration guarantee of "Failed Login — Generic Error".
- The API returns the same 429 body for both limits, so the existing web
  tests already cover the email-level 429; the delta spec states the
  body is identical rather than adding a web scenario.
- Browser verification per CLAUDE.md "Verifying UI Changes" is required
  only if a PR ends up touching `apps/web/**`. Expected: none. If that
  expectation changes during design or apply, the PR runs the browser
  pass (golden path plus the rate-limited message).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `authentication`:
  - ADDED requirement "Login Failure Limiting per Email" (name final in
    `sdd-spec`): the per-email failed-attempt limit, key normalization
    and hashing, failures-only counting, reset on success, identical
    behavior for unknown and soft-deleted emails, 429 with `Retry-After`
    and the unchanged generic body, larger `Retry-After` when both limits
    apply, no credential evaluation and no failure count for a rejected
    request, env-var defaults and validation, persistence across restart
    and instances, concurrency, fail closed, hash-only logging.
  - MODIFIED requirement "Login Attempt Rate Limiting": narrow wording
    only. The isolation statements ("The counter for one client key MUST
    NOT affect any other client key"; scenario "Limit isolated per client
    key") hold for the per-client-key counter, but a different client key
    can now be rejected because of a blocked email. Qualify them as "by
    this limit" and cross-reference the new requirement. No change to the
    per-client-key rules, defaults, or "Successful attempts count".

  Recommendation: ADDED rather than folding everything into MODIFIED.
  The two limits have deliberately different rules (every attempt vs
  failures only; no reset vs reset on success; different key and
  defaults). One requirement mixing both would make each rule harder to
  read and to test against, and would rewrite a requirement that was
  just hardened. The small MODIFIED is still needed, because without it
  the existing isolation scenario would contradict the new behavior.
  "Client IP Resolution for Rate Limiting", "Failed Login — Generic
  Error" and "Login Form Validation (Web)" are unchanged.

## Approach

Explore Approach A, as settled by the binding decision answers
(2026-10-13):

- **Check before credentials.** The login guard (or a small
  `LoginAttemptPolicy` application port that it calls) normalizes the
  raw `req.body.email` with the same transform as `loginRequestSchema`
  (guards run before pipes), hashes it with the fixed prefix, and reads
  the email bucket. If blocked, it responds 429 with `Retry-After`
  without evaluating credentials. The per-client-key check keeps running
  first and keeps counting every attempt; when both are blocked, the
  response carries the larger `Retry-After`.
- **Count after credentials.** After the credential check, a failure
  increments the email bucket (atomic upsert, fixed window anchored on
  the first failure, block equal to the window, db clock) and a success
  resets it. The hook point (`LoginUseCase` through a port vs. the
  controller) is a design decision; the port keeps `LoginUseCase`
  framework-free and testable. Unknown emails take the same path
  (the use case already returns `InvalidCredentialsError` identically
  and equalizes timing with a dummy verify).
- **Storage.** Extend `PrismaThrottlerStorage` (or add a sibling adapter
  on the same table) with record-failure, reset and read-block
  operations. The prefixed SHA-256 key cannot collide with the library's
  hashed per-IP keys. Rows expire through the existing `expiresAt`
  trigger and bounded cleanup (TD-35). No schema migration is expected;
  design confirms.
- **Normalization drift.** Share one normalization function between the
  guard and the Zod schema so they cannot diverge.
- **Config.** `login-rate-limit.config.ts` gains the two env vars with
  boot-time validation; `auth.module.ts` wires them.
- **Logging.** A single `warn` when a bucket transitions to blocked,
  carrying the key hash, never the raw email.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts` | Modified | Email-bucket block check, combined `Retry-After` |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts` | Modified | Record failure, reset, read block state (or a sibling adapter) |
| `apps/api/src/modules/auth/application/` (new port) | New | `LoginAttemptPolicy`-style port for failure/reset (design decides) |
| `apps/api/src/modules/auth/application/use-cases/login.use-case.ts` or `presentation/auth.controller.ts` | Modified | Record failure / reset on success |
| `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.ts` | Modified | Two new env vars, validation |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Wiring |
| Login request schema (`loginRequestSchema`) | Modified | Shared email normalization |
| `apps/api/test/e2e-env.setup.ts`, `apps/api/test/test-database/rate-limit-env.setup.ts` | Modified | Raise the email limit for existing suites |
| Unit, integration and e2e specs under `apps/api` | New/Modified | Coverage listed in Scope |
| `openspec/changes/login-account-lockout/specs/authentication/spec.md` | New | Delta spec (ADDED + MODIFIED) |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modified | Addendum |
| `docs/technical-debt.md`, `docs/enhancements.md` | Modified | Registers |
| `README.md` | Modified | New env vars |

Unaffected: `apps/web/**`, i18n files, `prisma/schema.prisma` (expected),
`User` and the users module.

## Registers

- **TD-31**: moved to Resolved with the change name and PR numbers in
  the delivering PR.
- **EN-6**: extended to cover the email keys (SHA-256 with a fixed
  prefix is enumerable against a list of known emails; HMAC would close
  that).
- **New EN** (next free id, EN-23 as of this proposal): admin unlock
  action; relevant only if a persistent lock is ever introduced.
- **New EN** (EN-24 as of this proposal): DB audit table of blocked
  logins, beyond the `warn` log.
- Any non-blocking review or verify finding is added to the matching
  register in the PR that leaves it open (CLAUDE.md rule).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bounded DoS: an attacker who knows an email keeps it blocked by sending 5 failures per window | Med (accepted) | Temporary block only; no stored lock; per-IP limit bounds each source; recorded in the ADR addendum. Not eliminable without CAPTCHA or similar (out of scope) |
| Bucket pollution: random emails create attacker-driven rows | Med | Bounded by the per-IP limit; rows expire via the `expiresAt` trigger and bounded cleanup (TD-35, EN-22) |
| Normalization drift between the guard and the Zod schema lets a variant email bypass its bucket | Low | One shared normalization function; tests with case and whitespace variants |
| Existing e2e suites that log in repeatedly trip the new limit | Med | Raise the limit in the e2e env setup; dedicated suites set low limits explicitly |
| One more upsert per failed attempt and one read per attempt add DB load | Low | Single atomic statements on the indexed table; same order of cost as the per-IP counter |
| Anti-enumeration regression (different status, body, header or timing for unknown emails) | Low | Identical path; tests compare unknown vs existing email responses |
| A storage error returns 500 on login when reading the block state or recording a failure | Low | Fail closed by decision, consistent with the per-IP limit; EN-12 tracks 503. A failed reset after a valid login only logs a warning |
| Spec contradiction with the existing per-key isolation scenario | Low | MODIFIED wording in the same delta spec |

## Rollback Plan

Revert the implementation PR(s). No migration and no `User` change are
expected, so reverting restores per-IP-only limiting; leftover email
rows in `ThrottleCounter` are harmless and expire through the existing
trigger and cleanup. The two env vars become unused. If reverted after
archive, the same revert PR restores the main spec requirements, moves
TD-31 back to Open, and marks the ADR-011 addendum as reverted.

## Dependencies

- None external. Builds on the `login-rate-limit-hardening` and
  `td-35-throttle-db-load` storage (merged).

## Delivery

- Strategy: `ask-on-risk`; chain strategy default `stacked-to-main`.
- Estimated size: about 700-850 authored changed lines (source about
  200-250, tests about 350-450, spec/ADR/registers/README about 150).
  Over the 400-line budget, so a chain is used. The user accepted the
  design's 4-PR split on 2026-10-13 (see design.md "PR Slicing"):
  - PR 1/4 `login-account-lockout/01-email-failure-store`: change
    artifacts (including `explore.md`), shared email schema, config, port,
    Prisma adapter, in-memory fake, unit and adapter integration tests. Not
    wired into the login path.
  - PR 2/4 `login-account-lockout/02-email-login-limit`: domain error, use
    case, controller, module wiring, e2e overrides and env setup, unit, e2e
    and app-level integration tests.
  - PR 3/4 `login-account-lockout/03-combined-retry-after`: guard override,
    both-limits e2e, README, ADR-011 addendum, registers (TD-31 Resolved,
    EN-6, new ENs).
  - PR 4/4 `login-account-lockout/04-archive`: archive.
- Each branch from `main`; titles follow
  `type(scope): PR N/M — short description`. If a PR exceeds 400 lines
  only through tests, report the code vs test split for acceptance.
- `sdd-tasks` confirms the forecast and slice boundaries.

## Success Criteria

- [ ] 5 failed attempts for one email from 5 different client keys
      within the window cause the 6th attempt for that email, from any
      client key, to get 429 with `Retry-After`, without evaluating
      credentials (e2e).
- [ ] A successful login resets the email counter.
- [ ] Successful logins do not count toward the email limit.
- [ ] An unknown email and an existing email produce identical status,
      body and headers at each step, including the block.
- [ ] When both limits are blocked, the 429 carries the larger
      `Retry-After`; an IP-rejected request adds no email failure.
- [ ] The per-client-key limit behaves exactly as before (existing tests
      green).
- [ ] Defaults 5 / 900 apply when the env vars are unset; invalid values
      fail at boot.
- [ ] Counters persist across restart and instances, concurrent failures
      are all counted, and storage errors fail closed (integration).
- [ ] The block is logged once at `warn` with the hash; the raw email
      appears in no row or log.
- [ ] No change under `apps/web/**`; the existing rate-limited message
      covers the email-level 429.
- [ ] TD-31 is Resolved, EN-6 extended, two new ENs added, and the
      ADR-011 addendum present in the delivering PR.

## Open Questions

- Resolved 2026-10-13: a reset failure after a valid credential check is
  logged as a warning and the login succeeds; only the block check and the
  failure increment fail closed.
- Hook point for counting (use case port vs controller) and whether the
  storage extension lives in the existing adapter or a sibling: design
  decisions, not product decisions.
