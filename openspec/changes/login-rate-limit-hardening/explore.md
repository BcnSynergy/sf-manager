# Exploration: login-rate-limit-hardening (TD-28..TD-31)

## Current State

- Login throttle: route-level `@UseGuards(ThrottlerGuard)` on POST /auth/login (`apps/api/src/modules/auth/presentation/auth.controller.ts:54`). `@nestjs/throttler` 6.4.0 pinned, no APP_GUARD, in-memory default storage, single throttler named `'default'` (`auth.module.ts:49-54`). Tracker = default (`req.ip`); no custom `getTracker` anywhere.
- Config: `getLoginRateLimitConfig()` (`auth/infrastructure/config/login-rate-limit.config.ts:25-37`), defaults 10 attempts / 900 s, fail-fast on non-positive ints.
- TRUST_PROXY: `getTrustProxySetting()` (`shared/infrastructure/env/trust-proxy.ts:4-15`) accepts only unset/`''`/`'false'` -> false, `'true'` -> 1 (one hop), else throws. Applied in `main.ts:18` (`app.set('trust proxy', ...)`). Documented in `README.md:46`. Spec: `openspec/specs/authentication/spec.md:225-240` (Client IP Resolution: only off / on scenarios; "on" = forwarded client IP). Rate-limit spec ~lines 180-223.
- LoginUseCase (`login.use-case.ts:33-57`): findByEmail + argon2 verify, dummy-hash timing mitigation (user-enumeration protection, Decision 10). User model (`prisma/schema.prisma:25-59`) has no failed-attempt/lockout fields.
- Tests: `apps/api/test/login-rate-limit.e2e-spec.ts` (defaults, configured limits, TRUST_PROXY=true describes); `trust-proxy.spec.ts`; `e2e-env.setup.ts` raises limit to 1000 for other e2e suites.
- Web: login form already shows a generic localized 429 message (spec 242-279), no countdown.
- ADR-011 addendum 2026-10-07 (lines 488-511) lists open questions 1-4; the archive-report (`openspec/changes/archive/2026-10-07-login-rate-limit/archive-report.md`) lists 1-5. ADR-001: one instance/VPS/DB per company (single instance). ADR-003/012: Docker Compose is the deployment target, but `docker-compose.yml` only has `postgres:18-alpine` (dev DB). No Dockerfile, no prod compose, no proxy/CDN config, no Redis anywhere in the repo. => No known production topology in the repo (TD-28 premise unresolved by repo facts; TD-32 says deploy is out of CI scope).

## Per-TD Options

### TD-28 (topology)

- (a) Docs-only: document a decision table and per-topology value in README/ADR; zero code.
- (b) Code: allow a TRUST_PROXY numeric hop count (positive int) in `getTrustProxySetting` (keep true=1, false/unset=off, reject 0/negatives/garbage); ~10 lines + unit tests + README + spec scenario.
- (c) Startup warning/check (e.g. log when TRUST_PROXY=true and NODE_ENV=production; cannot detect actual topology at runtime).
- Express also accepts CIDR/subnet lists/names (`'loopback'`): more flexible but a bigger surface.
- Recommendation: (b) + docs. A hop count is topology-agnostic, cheap, and needs no production facts. The real production value remains a deployment decision (gap).

### TD-29 (IPv6)

- Custom ThrottlerGuard subclass overriding `getTracker` (or `generateKey`) to mask IPv6 to /64 (IPv4 unchanged; IPv4-mapped `::ffff:a.b.c.d` treated as IPv4; zone ids handled). ~30-40 lines + unit tests; no new library needed.
- Tradeoff: legitimate clients sharing a /64 share a bucket; acceptable and standard practice.
- Changes the spec "Limit isolated per IP". Fits the same guard subclass as TD-31, so natural to bundle. Prefix length (/64 vs /56) is a decision gap.

### TD-30 (restart reset)

- (a) Accept + document: single instance per ADR-001; restarts are rare; but redeploys reset counters.
- (b) Postgres-backed `ThrottlerStorage`: new Prisma model + migration + adapter implementing `increment`; atomic upsert; cleanup of expired rows; extra DB write per login attempt; ~100-150 LOC + integration tests. Fits the hexagonal port/adapter pattern and hermetic integration tests.
- (c) Redis: new infrastructure component, contradicts ADR-001 simplicity and ADR-003; not justified for a single instance.
- Recommendation: (a) unless durability is required; if so, (b). If (b) is combined with TD-31 lockout state, one persistence model could serve both.

### TD-31 (account/email keying)

- (a) Second throttler keyed by normalized email. Needs body access in `getTracker` (`req.body.email` lowercased); the guard runs BEFORE `ZodValidationPipe`, so the body is unvalidated and must be coerced defensively. The `'default'`-name constraint for a plain `Retry-After` header means a named email throttler would emit `Retry-After-<name>` headers or must be handled in a custom guard; ThrottlerGuard v6 with multiple throttlers requires all to pass.
  - Risk: DoS-on-victim (attacker temporarily locks out a real user by spamming their email); the per-IP limit still applies.
  - User enumeration: the counter must apply identically to existing and non-existing emails (key by the raw normalized email, same 429 regardless).
- (b) True lockout: persisted `failedAttempts`/`lockedUntil` columns on User + migration + domain logic + unlock/admin flow + success-resets-counter. Larger; enumeration handling for unknown emails needs a dummy counter; stronger DoS-on-victim; needs admin unlock UX/UI.
- (c) Defer both.
- Recommendation: if included, (a) with a generous limit (higher than per-IP) counting all attempts; defer true lockout (ADR-006: it needs an unlock flow, UI, notifications). Success-resets-counter is not in the current semantics (all attempts count).

## UI Impact

Purely backend for TD-28/29/30. A TD-31 per-email 429 reuses the existing generic web 429 message, so no new UI is required. True lockout would require an admin unlock UI and message (its own slice). The proposal must state explicitly that API-only is deliberate (backend security hardening, no new user-facing behavior), per the project rule.

## Size Estimate (changed lines, rough)

- TD-28 code + tests + docs: ~60-90
- TD-29: ~100-150 incl. tests
- TD-31 per-email throttle: ~120-200 incl. e2e
- TD-30 Postgres storage: ~300-450 (migration + adapter + integration tests); accept + document: ~20
- Bundle TD-28 + TD-29 + TD-31(a): ~300-450 total (likely 1-2 PRs, test-heavy). Adding TD-30(b) exceeds 400 -> separate PR in the chain.

## Affected Files

`auth.module.ts`, `auth.controller.ts` (swap guard), a new guard under `auth/presentation` or `shared/infrastructure`, `trust-proxy.ts` (+ spec), `main.ts` (only if hop semantics change), `login-rate-limit.config.ts` (new per-email env vars), `login-rate-limit.e2e-spec.ts`, `e2e-env.setup.ts` (raise the new per-email limit too), `README.md` env table, `openspec/specs/authentication/spec.md` (delta), ADR-011 addendum, `docs/technical-debt.md` (move TD-28..31 to Resolved or keep deferred with justification). Possibly `prisma/schema.prisma` + migration (TD-30b).

## Decision Gaps for the User (not decided)

1. Real production topology (none / one proxy / CDN + proxy): is it known yet? Decides the TRUST_PROXY value; if unknown, ship a numeric hop count + docs only.
2. TD-28 form: numeric hop count only, or also CIDR/named trust values?
3. TD-29: include? Prefix length /64 vs /56?
4. TD-30: accept + document, Postgres-backed storage, or Redis (new infra)?
5. TD-31: per-email throttle, true lockout, or keep deferred? If a throttle: limit/window defaults (own env vars?) and acceptance of the temporary DoS-on-victim risk.
6. Scope/chain: one change with several PRs vs. a split (e.g. TD-28 + TD-29 now, TD-30/31 later).
7. Confirm API-only is deliberate (no UI).

## Recommendation

Walking-skeleton minimum: TD-28 (numeric hop count + docs) and TD-29 (/64 masking) are small, topology-independent, and share a guard/tracker touchpoint: include them. TD-31: include the per-email throttle only if wanted now; defer true lockout. TD-30: explicitly defer (accept + document, single instance per ADR-001) with justification, unless durability is demanded. Keep TD entries for deferred items.

## Risks

- The guard runs before body validation: the per-email key comes from an unvalidated body (must coerce/normalize, handle missing/non-string).
- Multiple throttlers + the `'default'` naming constraint affect the `Retry-After` header.
- A per-email throttle enables a temporary targeted DoS on a victim account; enumeration leaks if behavior differs by account existence.
- IPv4-mapped IPv6 addresses and an undefined `req.ip` are edge cases for /64 masking.
- Other e2e suites log in more than 10 times; new limits must be raised in `e2e-env.setup.ts`.
- No production topology facts: any default hop count is a guess.

## Ready for Proposal

Yes, after the user answers decision gaps 1 and 3-5 (at least the scope of TD-30/TD-31).
