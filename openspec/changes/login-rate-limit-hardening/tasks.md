# Tasks: Login rate-limit hardening (TD-28, TD-29, TD-30)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~310 (code ~90, tests+docs ~220); PR 2 ~310 (code ~110, tests ~200); PR 3 ~250 (code ~20, tests+docs ~230); PR 4 docs only (~120) |
| 400-line budget risk | Medium (each PR forecast under 400; PR 1 and PR 2 within ~90 lines of the budget; combined TD-30 would be ~560) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (TD-28 + TD-29) -> PR 2 (storage, not wired) -> PR 3 (wiring + e2e overrides + restart/multi-instance tests) -> PR 4 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Decision needed: confirm the 4-PR split (this revises the proposal's 3-PR hint, per design "PR Slicing"). The alternative is one TD-30 PR (PR 2 + PR 3, ~560 lines) under the size-exception rule, but its excess is e2e wiring rather than fixtures, so the exception does not apply cleanly. If any PR exceeds 400 lines, report the code vs test split and let the user accept it (project rule).

UI: none of the four PRs touches `apps/web/**`. API-only is deliberate and was confirmed by the user (proposal, Out of Scope). The browser-verification gate is therefore NOT applicable. State "not browser-verified, no UI change" in each PR description.

### Suggested Work Units

All PRs base on `main` (stacked-to-main, each merges in order). PR 2 and PR 3 do not depend on PR 1's code paths; PR 3 depends on PR 2 being merged (it wires the adapter).

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | TD-28 hop-count `TRUST_PROXY` + TD-29 `/64` client key and guard; README topology table; ADR-011 addendum (open questions 2 and 3) | PR 1/4. Branch `login-rate-limit-hardening/01-trust-proxy-hops-ipv6-key`. Title `feat(auth): PR 1/4 — trust-proxy hop count and IPv6 /64 login throttle key` | `npx jest --config apps/api/package.json trust-proxy client-key login-throttler` (run from repo root, adjust to the API workspace runner) then `npm run test:e2e --workspace=apps/api -- login-rate-limit` | `login-rate-limit.e2e-spec.ts`: `TRUST_PROXY=2` hop, spoofed prefix, IPv6 /64, mapped IPv4 over HTTP (supertest) | Revert PR. No schema/data change. Reset numeric `TRUST_PROXY` to `true` or unset before deploying the revert |
| 2 | TD-30 storage: `ThrottleCounter` model, migration, `PrismaThrottlerStorage` adapter and integration spec (NOT wired) | PR 2/4. Branch `login-rate-limit-hardening/02-prisma-throttler-storage`. Title `feat(auth): PR 2/4 — Postgres throttler storage adapter` | `npm run test:integration --workspace=apps/api -- prisma-throttler-storage` | Adapter integration spec against the hermetic per-run Postgres (concurrency, expiry, cleanup); `prisma migrate` applies cleanly | Revert code; additive table may stay or be dropped by a follow-up migration. No runtime change since it is not wired |
| 3 | Wire adapter into `ThrottlerModule.forRootAsync`; in-memory `ThrottlerStorage` override in all 12 e2e suites; restart/multi-instance/concurrent integration spec; integration env setup; README and ADR (question 4, ADR-001 note) | PR 3/4. Branch `login-rate-limit-hardening/03-wire-persistent-throttle`. Title `feat(auth): PR 3/4 — persist login throttle counters in Postgres` | `npm run test:integration --workspace=apps/api -- login-rate-limit` | `login-rate-limit.integration.spec.ts` with real `AppModule`: restart, two instances, concurrent. Full `npm run test:e2e --workspace=apps/api` and full `npm run test:integration --workspace=apps/api` | Revert PR. Module returns to in-memory default; counters reset once; table can stay |
| 4 | Archive: merge delta spec, register moves, ADR/README finish | PR 4/4. Branch `login-rate-limit-hardening/04-archive`. Title `docs(openspec): PR 4/4 — archive login-rate-limit-hardening` | N/A (docs only). Check with `git diff --stat` and a link/ID grep | N/A: documentation only, no runtime behavior | Revert PR; main spec and registers return to the pre-archive state |

Strict TDD (ADR-016): every behavior is RED, GREEN, REFACTOR. Apply records a "TDD Cycle Evidence" table in apply-progress (RED command and failure; GREEN command and pass count). Every commit must compile: API `npm run build` and `npm run lint` (Jest with ts-jest type-checks, but run build anyway before each commit). Each PR must pass `ci` (ADR-017). Threat Matrix is N/A in design; the security-relevant inputs (`X-Forwarded-For`, `TRUST_PROXY`) are covered by the tests below.

## Phase A: PR 1 — TD-28 + TD-29 (branch `login-rate-limit-hardening/01-trust-proxy-hops-ipv6-key`)

### TD-28: TRUST_PROXY hop count

- [x] A.1 RED: extend `apps/api/src/shared/infrastructure/env/trust-proxy.spec.ts` with `it.each` tables. Accepted: unset, `''`, `'false'` give `false`; `'true'` and `'1'` give `1`; `'2'` gives `2`; `'10'` gives `10`. Rejected, each throws `/TRUST_PROXY/` naming the raw value: `'0'`, `'-1'`, `'1.5'`, `'01'`, `' 2'`, `'2 '`, `'TRUE'`, `'loopback'`, `'10.0.0.0/8'`, `'1,2'`, `'9007199254740993'`. Spec: TRUST_PROXY with a hop count; TRUST_PROXY empty or false; Invalid TRUST_PROXY value rejected at startup. Expected RED: numeric and rejection cases fail against the current one-hop implementation.
- [x] A.2 GREEN: `apps/api/src/shared/infrastructure/env/trust-proxy.ts`: return `false | number`; exact-match `/^[1-9]\d*$/` plus `Number.isSafeInteger`; `'true'` maps to `1`; everything else throws an `Error` naming `TRUST_PROXY` and the raw value (Decision 1).
- [x] A.3 Update the comment only in `apps/api/src/main.ts` (N hops; call `app.set('trust proxy', getTrustProxySetting(process.env))` unchanged). Run API build to confirm the `false | number` type flows through.

### TD-29: IPv6 /64 client key

- [x] A.4 RED: create `apps/api/src/modules/auth/presentation/guards/client-key.spec.ts`, a table test of `toClientKey` (Decision 3): IPv4 passthrough; `2001:db8::1` and `2001:0DB8:0:0:ffff::2` both give `2001:db8:0:0::/64`; different /64 values differ; `::ffff:198.51.100.7` and `::ffff:c633:6407` and `::FFFF:c633:6407` give `198.51.100.7`; `fe80::1%eth0` gives `fe80:0:0:0::/64`; `::1`; `::`; non-mapped dotted tail `64:ff9b::1.2.3.4` gives its /64; `undefined`, `''`, `42`, `'not-an-ip'` give `'unresolved'`; never throws. Spec: IPv6 same /64 shares; different /64 isolated; IPv4 unchanged; IPv4-mapped; Client IP cannot be determined. RED: missing module.
- [x] A.5 GREEN: create `apps/api/src/modules/auth/presentation/guards/client-key.ts` exporting `toClientKey(ip: unknown): string` and `UNRESOLVED_CLIENT_KEY = 'unresolved'`, using `isIP` from `node:net` only, no new library.
- [x] A.6 RED: create `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts`: construct the guard with a fake storage and options array; `getTracker({})` resolves `'unresolved'`; `getTracker({ ip: '2001:db8::5' })` resolves the /64 key; `canActivate` with a stub `ExecutionContext` and no `req.ip` does not throw and the fake storage receives a key (request is counted, not exempt). Spec: Client IP cannot be determined. RED: missing module.
- [x] A.7 GREEN: create `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`: `@Injectable() LoginThrottlerGuard extends ThrottlerGuard`, override `protected getTracker(req)` returning `Promise.resolve(toClientKey(req.ip))`, no constructor (Decision 2).
- [x] A.8 Modify `apps/api/src/modules/auth/presentation/auth.controller.ts`: replace `@UseGuards(ThrottlerGuard)` on `login()` with `@UseGuards(LoginThrottlerGuard)`; change the `@ApiTooManyRequestsResponse` description from "this IP" to "this client". Provider registration: confirm the guard resolves under `ThrottlerModule` (global exports); add to `apps/api/src/modules/auth/auth.module.ts` providers only if Nest requires it (note in apply-progress).

### E2E (PR 1, in-memory storage still the default)

- [x] A.9 RED: extend `apps/api/test/login-rate-limit.e2e-spec.ts` (existing `createApp(env)` helper, env save/restore, all apps closed): (a) `TRUST_PROXY=2`, `X-Forwarded-For: client, proxy` keys on `client`, and two clients behind the same two proxies get separate counters; (b) `TRUST_PROXY=2`, spoofed prefix `spoof, client, proxy` still keys on `client` (Hop count ignores client-supplied extra entries); (c) IPv6 addresses in the same /64 (via `TRUST_PROXY=true` and XFF) return 429 on rotation of the low 64 bits; different /64 returns 200; (d) `::ffff:198.51.100.7` shares the counter with `198.51.100.7` (`TRUST_PROXY=true`). Startup failure for invalid values stays at unit level (A.1) because e2e does not exercise `main.ts`. RED: hop-count and /64 cases fail before A.2/A.7/A.8 land.
- [x] A.10 REFACTOR and full-suite check: API lint, build, unit tests, and `npm run test:e2e --workspace=apps/api` (full suite; confirm no other suite regresses).

### Docs (TDD N/A)

- [x] A.11 `README.md`: document `TRUST_PROXY` accepted values (unset/`''`/`false` off, `true` one hop, positive integer N) and the topology-to-value table: no proxy; one reverse proxy; CDN plus reverse proxy; PaaS such as Vercel (row instructs the operator to confirm the platform's documented forwarding hops, asserts no value). State that invalid values abort boot and off is the default.
- [x] A.12 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: add a new dated addendum answering open questions 2 and 3 of the 2026-10-07 addendum (TRUST_PROXY hop count, IPv6 /64), with the topology table. Leave question 4 and the ADR-001/serverless note for PR 3 (A-series stays self-consistent). Add the fixed-window note (up to ~2x limit around a window boundary) here if the addendum text is natural to complete now; otherwise it is done in PR 3 or PR 4 (C.4 / D.4) — record where in apply-progress.
- [x] A.13 (diff stat checked: ~361 lines, code ~106 / tests ~204 / docs ~50; commits left to the orchestrator) Check `git diff --stat` (~310 expected; report code vs test split). Commit by work unit: trust-proxy (A.1-A.3), client-key and guard (A.4-A.8), e2e (A.9), docs (A.11-A.12). Conventional Commits.

## Gate PR 1 (orchestrator)

- [x] G.1 Fresh-context independent review (sub-agent with no prior context) before push; the user confirms push, PR creation and merge. PR passes `ci`. No UI change: browser gate not applicable, state explicitly. Done: fresh review APPROVE WITH NITS (nits go to the PR 4 registers), PR #206 merged at d7c3379, CI green.

## Phase B: PR 2 — Postgres storage, not wired (branch `login-rate-limit-hardening/02-prisma-throttler-storage`)

Branch from `main` after PR 1 merges (or independently; no code dependency on PR 1).

- [x] B.1 Schema first: add `ThrottleCounter` to `apps/api/prisma/schema.prisma` (Decision 4: `key String @id`, `hits Int`, `windowEndsAt DateTime @db.Timestamptz(3)`, `blockedUntil DateTime? @db.Timestamptz(3)`, `@@index([windowEndsAt])`, with the design comment). Generate the migration `apps/api/prisma/migrations/<timestamp>_add_throttle_counter/migration.sql`: purely additive `CREATE TABLE "ThrottleCounter"` plus index, no existing-data changes. Verify the migration applies on the hermetic test DB. (Schema change is the prerequisite for RED tests that use `prisma.throttleCounter`.)
- [x] B.2 RED: create `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts` (`new PrismaThrottlerStorage(new PrismaService())`, `randomUUID()` keys, same pattern as the token-denylist integration spec). Cases:
  - (1) first hit returns `{ totalHits: 1, timeToExpire ~ ttl seconds, isBlocked: false, timeToBlockExpire: 0 }`;
  - (2) `limit + 1` hits: the last is `isBlocked` with `timeToBlockExpire >= 1` (Attempt over the limit);
  - (3) hits while blocked are not counted (row `hits` unchanged);
  - (4) window expiry with ttl 1000 ms, wait ~1.2 s, `totalHits` is 1 (Window elapsed);
  - (5) block expiry resets to 1, not blocked;
  - (6) concurrency: 50 parallel `increment` calls with limit 1000 return exactly the set {1..50} and the row has `hits = 50` (Concurrent attempts are all counted);
  - (7) concurrent `limit + 5` with limit 10 gives exactly 10 unblocked results;
  - (8) cleanup: seed expired rows and one live row via `prisma.throttleCounter.createMany` with past and future dates; incrementing a new key removes expired rows (at most 100 per call) and leaves the live row intact;
  - (9) a 64-char hashed key is stored verbatim; no raw-IP column exists.
  RED: missing adapter module.
- [x] B.3 GREEN: create `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`: `PrismaThrottlerStorage implements ThrottlerStorage`, `constructor(prisma: PrismaService)`, `increment()` as the single `$queryRaw` `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` (Decision 5), using the DB clock; map the returned row to `ThrottlerStorageRecord`; ignore `throttlerName`; errors propagate (fail closed). Confirm exact casts and parameter types under `@prisma/adapter-pg` using the RED tests; note P2010 handling as in `prisma-review-template.repository.ts`.
- [x] B.4 GREEN (cleanup): in the same adapter, when the returned `totalHits === 1`, run the awaited bounded `DELETE ... WHERE "key" IN (SELECT ... LIMIT 100 FOR UPDATE SKIP LOCKED)` inside `try/catch` that swallows errors (Decision 6). Makes B.2 case (8) pass.
- [x] B.5 REFACTOR: tidy the SQL and mapping; confirm the adapter is NOT referenced from `auth.module.ts` (no runtime change in this PR). Run API lint, build, unit tests and `npm run test:integration --workspace=apps/api` (full integration suite, confirm migration does not disturb other specs).
- [x] B.6 Check `git diff --stat` (~310 expected; report code vs test split). Commit by work unit: schema + migration (B.1), adapter + integration spec (B.2-B.4). Conventional Commits. Done: code 166 (adapter 135, schema 14, migration 17), tests ~317 (integration 260, unit 57); ~483 total, over the ~310 forecast and the 400 budget because review fixes added tests (size exception: excess is tests, user to accept). Commits dd467ee, d509797, ba90176 plus the cleanup-test follow-up.

## Gate PR 2 (orchestrator)

- [x] G.2 Fresh-context independent review before push (focus: SQL atomicity and semantics vs the in-memory reference store, migration additivity, cleanup race reasoning); the user confirms push, PR creation and merge. PR passes `ci`. No UI change: browser gate not applicable. Done: fresh review APPROVE WITH NITS (MINOR: no ttl != blockDuration test, registered for PR 4), size exception accepted (~481 lines, excess is tests), PR #207 merged at a79d3a8, CI green.

## Phase C: PR 3 — wiring, e2e overrides, persistence tests (branch `login-rate-limit-hardening/03-wire-persistent-throttle`)

Branch from `main` after PR 2 merges.

- [x] C.1 RED (integration setup): create `apps/api/test/test-database/rate-limit-env.setup.ts` setting `LOGIN_RATE_LIMIT_MAX_ATTEMPTS=1000` (mirrors `apps/api/test/e2e-env.setup.ts`) and register it in `setupFiles` of `apps/api/test/jest-integration.json`. Purpose: cumulative `127.0.0.1` logins from other integration specs (e.g. `review-schedule.integration.spec.ts`) can never reach 429 once the real store is wired. Verify: before C.4, grep integration specs that call `/auth/login` and confirm they still pass after wiring.
- [x] C.2 RED: create `apps/api/test/login-rate-limit.integration.spec.ts` with the real `AppModule` against the hermetic DB, `trust proxy` 1, a unique documentation-range address per test in `X-Forwarded-For` (own IPv6 /64 in `2001:db8::/32` built from `randomUUID()` bytes, or an IPv4 in `203.0.113.0/24` for IPv4 cases; never `127.0.0.1`), limit 3 set and restored explicitly by the spec. Failed logins (unknown email, 401) count, so no user seeding is needed. Cases: (a) Restart: app A exhausts the key, `close()`, app B on the same DB returns 429 (Counters survive an API restart); (b) Two instances: A gets 2 attempts, B gets 1, next attempt on either returns 429 (Counters shared across instances); (c) Concurrent: 3 parallel attempts none 429, the 4th 429 (Concurrent attempts are all counted). RED: counters are in memory, so (a) and (b) fail before wiring.
- [x] C.3 RED: in each e2e suite below, add the override (listed explicitly; all 12 suites in `apps/api/test/` build the full `AppModule` and therefore reach the Prisma storage once wired and the `PrismaService` mock only answers `$queryRaw -> [{ '?column?': 1 }]`). Before wiring (C.4), run the e2e suites to confirm the pre-wiring state is green, then after C.4 without overrides observe the RED failures (login hits the mock). Override form in each `Test.createTestingModule(...)` chain: `.overrideProvider(ThrottlerStorage).useFactory({ factory: () => new ThrottlerStorageService() })` with both names imported from `@nestjs/throttler`. The factory form gives each compiled app a fresh store (preserves per-app isolation of `login-rate-limit.e2e-spec.ts`, its D10 comment) and Nest calls `onApplicationShutdown` on it, so `app.close()` clears timers and Jest does not hang. Suites:
  - [x] C.3.1 `apps/api/test/auth.e2e-spec.ts`
  - [x] C.3.2 `apps/api/test/checklist-question.e2e-spec.ts`
  - [x] C.3.3 `apps/api/test/community.e2e-spec.ts`
  - [x] C.3.4 `apps/api/test/inspectable-element.e2e-spec.ts`
  - [x] C.3.5 `apps/api/test/login-rate-limit.e2e-spec.ts` (every `createApp(env)` app gets a fresh store; keep all PR 1 cases passing)
  - [x] C.3.6 `apps/api/test/maintenance-company.e2e-spec.ts`
  - [x] C.3.7 `apps/api/test/organization-profile.e2e-spec.ts`
  - [x] C.3.8 `apps/api/test/review-history.e2e-spec.ts`
  - [x] C.3.9 `apps/api/test/review-schedule.e2e-spec.ts`
  - [x] C.3.10 `apps/api/test/review-session.e2e-spec.ts`
  - [x] C.3.11 `apps/api/test/review-template.e2e-spec.ts`
  - [x] C.3.12 `apps/api/test/users.e2e-spec.ts`
  - [x] C.3.13 (done: 12 e2e suites confirmed, 13 override sites because review-template has two chains; integration specs app.integration.spec.ts and review-schedule.integration.spec.ts also build AppModule and now use the real storage on the hermetic DB, covered by C.1) Re-grep `apps/api/test/**/*.e2e-spec.ts` for `AppModule` / `auth/login` to confirm none is missed (expected count is 12, per the grep at planning time; update this list if a new suite has appeared).
- [x] C.4 GREEN: modify `apps/api/src/modules/auth/auth.module.ts`: switch to `ThrottlerModule.forRootAsync({ inject: [PrismaService], useFactory: (prisma) => ({ throttlers: [{ name: 'default', ttl: windowMs, limit: maxAttempts }], storage: new PrismaThrottlerStorage(prisma) }) })` using `getLoginRateLimitConfig()` (Decision 7). Keep the throttler named `'default'`. No env switch to select the memory store (rejected in design). Makes C.2 pass and keeps all e2e suites green via C.3.
- [x] C.5 REFACTOR and full verification: API lint, build, unit tests, full `npm run test:e2e --workspace=apps/api`, full `npm run test:integration --workspace=apps/api`. Confirm `app.close()` leaves no open handles in e2e (no Jest hang).
- [x] C.6 Docs (TDD N/A): `README.md` note that login counters are persisted in Postgres (one extra DB write per login attempt, shared across instances). `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: extend the addendum with open question 4 (Postgres storage; fixed-window note: up to ~2x limit around a window boundary, matches the spec's "fixed time window"), the ADR-001/serverless revisit as an open question, and open question 1 (production topology) as still open. Do not revisit ADR-001 here.
- [x] C.7 (diff stat checked: ~244 lines, code 16 / tests 168 / docs 60; commits left to the orchestrator) Check `git diff --stat` (~250 expected; report code vs test split). Commit by work unit: integration setup + app spec (C.1-C.2), wiring + e2e overrides (C.3-C.4), docs (C.6). Conventional Commits.

## Gate PR 3 (orchestrator)

- [ ] G.3 Fresh-context independent review before push (focus: no e2e suite missed, no open handles, integration isolation by key, 127.0.0.1 not used by new specs); the user confirms push, PR creation and merge. PR passes `ci`. No UI change: browser gate not applicable.

## Phase D: PR 4 — archive (branch `login-rate-limit-hardening/04-archive`)

Docs only; branch from `main` after PR 3 merges. Run `sdd-verify` against the spec scenarios before archiving. `sdd-archive` has no Bash access: the orchestrator does `git mv`/delete of the source folder and the commit itself.

- [ ] D.1 `sdd-verify` against every scenario in `specs/authentication/spec.md` after PR 3 merges; fix or register findings.
- [ ] D.2 Merge the delta in `openspec/changes/login-rate-limit-hardening/specs/authentication/spec.md` into `openspec/specs/authentication/spec.md` (MODIFIED: Login Attempt Rate Limiting; Client IP Resolution for Rate Limiting). Archive the change folder under `openspec/changes/archive/`.
- [ ] D.3 `docs/technical-debt.md`: move TD-28, TD-29 and TD-30 to the Resolved section with change name `login-rate-limit-hardening` and PR numbers (PR 1/4, 2/4, 3/4 actual numbers). TD-31 stays open (per-email keying and lockout; deferred). IDs never reused or renumbered.
- [ ] D.4 `docs/enhancements.md`: add an `EN-<n>` entry for HMAC-keyed (secret-salted) throttle key hashing, since the library's unsalted SHA-256 of an IPv4 address is enumerable (pseudonymized, not anonymized, at rest). Add entries for any other non-blocking findings left by reviews or `sdd-verify`, and add `TD-<n>` entries for non-blocking defects, per the project registers rule. Say in the PR which items were added.
- [ ] D.5 Ensure the ADR-011 addendum and `README.md` are complete (fixed-window note, topology table, ADR-001/serverless open question, persisted counters); fix any gap not done in PR 1 or PR 3.
- [ ] D.6 Fresh-context review of the archive PR; the user confirms push, PR and merge. Title `docs(openspec): PR 4/4 — archive login-rate-limit-hardening`. No UI change: browser gate not applicable.
