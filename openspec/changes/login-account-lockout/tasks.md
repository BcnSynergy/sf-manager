# Tasks: Per-email login failure limiting (TD-31)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~450 (code ~190, tests ~260; planning artifacts not counted); PR 2 ~410 (code ~110, tests ~300); PR 3 ~250 (code ~40, tests ~100, docs ~110); PR 4 docs only (~60 plus the spec merge) |
| 400-line budget risk | Medium (PR 1 and PR 2 forecast at or slightly over 400, with the excess in tests; PR 3 well under) |
| Chained PRs recommended | Yes (4 PRs) |
| Suggested split | PR 1 (email failure store, not wired) -> PR 2 (email login limit wired) -> PR 3 (combined Retry-After + docs + registers) -> PR 4 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Binding decisions: the user accepted the design's 4-PR chain with `stacked-to-main` on 2026-10-13 (design "PR Slicing", Open Questions). If PR 1 or PR 2 exceeds 400 lines, report the code vs test split and let the user accept it (project rule: excess in tests is acceptable; never trim coverage).

UI: none of the four PRs is expected to touch `apps/web/**` (proposal "UI"). The existing `auth.loginRateLimited` message covers the new 429. Task F.3 confirms this. If any PR does touch `apps/web/**`, a browser pass becomes mandatory (CLAUDE.md "Verifying UI Changes"). Otherwise each PR description states "not browser-verified, no UI change".

Dev DB: no Prisma schema change and no migration (design "Migration / Rollout"). Email rows reuse `ThrottleCounter` (trigger, index and cleanup already exist). No `migrate reset` and no dev-DB edits are needed. If a task ever needs a schema change, stop and ask.

### Suggested Work Units

All PRs branch from `main` (stacked-to-main, each merges in order). PR 1 changes no runtime behavior. PR 2 depends on PR 1 being merged (it wires the port and adapter). PR 3 depends on PR 2 (it extends the guard to read the email block through the port).

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Shared `loginEmailSchema`, email config, `LoginFailureLimiter` port, `PrismaLoginFailureLimiter`, `InMemoryLoginFailureLimiter`, tests, change artifacts incl. `explore.md` (not wired) | PR 1/4. Branch `login-account-lockout/01-email-failure-store`. Title `feat(auth): PR 1/4 — per-email login failure store` | `npm run test --workspace=packages/validation` and `npm run test:integration --workspace=apps/api -- prisma-login-failure-limiter` | Adapter integration spec against the hermetic per-run Postgres (concurrency, window and block expiry, hashing, cleanup) | Revert PR. Nothing is wired, so no runtime change; no schema or data change |
| 2 | `LoginBlockedError`, `LoginUseCase` check/record/reset, controller 429 mapping, module wiring, 12 e2e suite overrides, env setups, e2e and app-level integration tests | PR 2/4. Branch `login-account-lockout/02-email-login-limit`. Title `feat(auth): PR 2/4 — limit failed logins per email` | `npm run test --workspace=apps/api -- login.use-case auth.controller`, then `npm run test:e2e --workspace=apps/api -- login-email-limit`, then `npm run test:integration --workspace=apps/api -- login-email-limit` | `login-email-limit.integration.spec.ts` with real `AppModule` + Postgres (distributed client keys, reset, parity, restart, two instances, concurrency, fail closed); full e2e and full integration suites | Revert PR (and PR 3 if merged). Counters start empty; leftover email rows expire through the trigger and cleanup; env vars become unused |
| 3 | Guard `throwThrottlingException` override (larger `Retry-After`), both-limits e2e, README env vars, ADR-011 addendum, registers (TD-31 Resolved, EN-6 extended, EN-23, EN-24) | PR 3/4. Branch `login-account-lockout/03-combined-retry-after`. Title `feat(auth): PR 3/4 — combined Retry-After and TD-31 docs` | `npm run test --workspace=apps/api -- login-throttler.guard` then `npm run test:e2e --workspace=apps/api -- login-email-limit` | `login-email-limit.e2e-spec.ts` both-limits case over HTTP (supertest); optional integration check for the larger `Retry-After` | Revert PR. The email limit keeps working with the client key's `Retry-After` on doubly blocked requests; registers and ADR return to the prior state |
| 4 | Archive: `sdd-verify`, merge delta spec into `openspec/specs/authentication/spec.md`, archive the change | PR 4/4. Branch `login-account-lockout/04-archive`. Title `docs(openspec): PR 4/4 — archive login-account-lockout` | N/A (docs only) | N/A: documentation only, no runtime behavior | Revert PR; if reverted after archive, move TD-31 back to Open and mark the ADR-011 addendum as reverted |

Strict TDD (Jest in `apps/api`; Vitest in `packages/validation`; ADR-016): each behavior task is RED (failing test observed), GREEN, REFACTOR. Apply records a "TDD Cycle Evidence" table (RED command and failure; GREEN command and pass count). Runners: unit `npm run test --workspace=apps/api`; integration `npm run test:integration --workspace=apps/api` (hermetic per-run DB; safe to run in full); e2e `npm run test:e2e --workspace=apps/api`; validation `npm run test --workspace=packages/validation`. Note: `apps/api` consumes `@sf-manager/validation` through `dist` (`main: dist/index.js`), so after changing the package run `npm run build --workspace=packages/validation` before API tests or builds. Tasks marked "characterization" cover behavior that existing code already satisfies, so no honest RED exists; they are verified by a temporary mutation instead (change the production line, confirm the named test fails, restore). Every commit must pass API `npm run lint` and `npm run build`. Each PR must pass `ci`. Threat Matrix is N/A in design; the attack surface is covered by the tests below. Advisory heuristic: about 400 authored changed lines per task is a planning guide only, not a cap.

## Phase A: PR 1 — email failure store (branch `login-account-lockout/01-email-failure-store`)

### Setup

- [x] A.1 Create branch `login-account-lockout/01-email-failure-store` from `main` (the untracked change folder, including `explore.md`, travels with it).
- [x] A.2 Baseline: from the repo root run `npm run lint`, `npm run test --workspace=packages/validation`, `npm run test --workspace=apps/api`; confirm green before any edit.
- [x] A.3 Commit the change artifacts as `docs(openspec): add login-account-lockout exploration, proposal, spec, design and tasks` (`explore.md`, `proposal.md`, `design.md`, `specs/authentication/spec.md`, `tasks.md`).

### Shared email schema (spec: Email variants share one counter; Invalid email is rejected before the limit)

- [x] A.4 RED: create `packages/validation/src/auth/login.schema.spec.ts` (Vitest): `loginEmailSchema.parse('  Admin@Example.COM ')` gives `'admin@example.com'`; `42`, `undefined`, `''`, `'not-an-email'` fail `safeParse`; `loginRequestSchema.parse({ email: ' User@Example.com ', password: 'x' }).email` equals `loginEmailSchema.parse(' User@Example.com ')` (single source of truth); an empty password still fails. RED: `loginEmailSchema` is not exported.
- [x] A.5 GREEN: `packages/validation/src/auth/login.schema.ts`: export `loginEmailSchema = z.string().trim().toLowerCase().pipe(z.email())` and use it for `loginRequestSchema.email` (Decision 2). Export it from the package index if `loginRequestSchema` is. Run `npm run build --workspace=packages/validation`.
- [x] A.6 REFACTOR and check: `npm run test --workspace=packages/validation`, validation lint; confirm existing web and API login tests still pass (`npm run test --workspace=apps/web -- LoginPage`, `npm run test --workspace=apps/api -- auth`). Characterization note: the schema output for already-lowercase valid input is unchanged, so web behavior is unchanged. Commit `feat(validation): share a normalized login email schema`.

### Email config (spec: Default limits; Configured limits; Invalid configuration rejected at startup)

- [x] A.7 RED: extend `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.spec.ts` with `getLoginEmailRateLimitConfig`: unset and empty values give `{ maxFailures: 5, windowMs: 900000 }`; `'3'` and `'60'` accepted (`windowMs` 60000); each of `'0'`, `'-1'`, `'1.5'`, `'abc'`, `' 2'` throws an error naming the variable (`LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` or `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS`) and the raw value. Existing cases untouched. RED: function missing.
- [x] A.8 GREEN: `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.ts`: add `LoginEmailRateLimitConfig` and `getLoginEmailRateLimitConfig()` reusing `parsePositiveInteger` (Decision 8).
- [x] A.9 REFACTOR and check: config spec green, API lint and build. Commit `feat(auth): add login email rate-limit configuration`.

### Port and in-memory fake (spec: Concurrent failures are all counted, as the e2e seam)

- [x] A.10 Create `apps/api/src/modules/auth/application/ports/login-failure-limiter.port.ts`: `LoginBlock`, `LoginFailureLimiter` (`getBlock`, `recordFailure`, `reset`) and `LOGIN_FAILURE_LIMITER` (Interfaces / Contracts). Type-only plus a token, so no RED test applies; covered by A.11 to A.16.
- [x] A.11 RED: create `apps/api/src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter.spec.ts`: fresh email not blocked; `maxFailures - 1` failures not blocked, the next blocks with `retryAfterSeconds` in `[1, window]`; failures while blocked do not count or extend the block; after the window elapses (fake timers or injected clock) the count restarts at 1; `reset` clears a block and resolves for a missing email; distinct emails are isolated. RED: module missing.
- [x] A.12 GREEN: create `apps/api/src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter.ts` implementing the port with the same rules as Decision 4 (fixed window from the first failure, block on reaching the limit, failures during a block ignored), using `Date.now()` and a `LoginEmailRateLimitConfig` constructor argument (Decision 9).

### Postgres adapter (spec: counters persist/shared, Concurrent failures, Raw email not stored or logged, Block is logged once, fail closed)

- [x] A.13 RED: create `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.integration.spec.ts` (`new PrismaLoginFailureLimiter(new PrismaService(), config)`, `randomUUID()` emails, small config, same pattern as `prisma-throttler-storage.adapter.integration.spec.ts`). Cases from design Testing Strategy: (1) fresh email not blocked; (2) `maxFailures - 1` failures not blocked, the next blocks with `retryAfterSeconds` in `[1, window]`; (3) failures while blocked leave `hits` and `blockedUntil` unchanged (no rewrite); (4) window expiry (window 3 s, wait ~3.3 s; widened from 1 s by EN-26 to avoid a CI race) restarts the count at 1; (5) block expiry unblocks and the next failure opens a new window; (6) `reset` deletes the row and resolves for a missing key; (7) concurrency: 50 parallel `recordFailure` with max 1000 gives `hits = 50`; (8) `maxFailures + 5` parallel failures block, with exactly one transition `warn` (spy on `Logger.prototype.warn`); (9) the stored key equals `sha256("login-email:" + email)` hex (64 chars), no column holds the email, and the warn message contains the hash and not the email; (10) `expiresAt` is set by the trigger and an expired email row is removed by `PrismaThrottlerStorage`'s bounded cleanup (increment a new client key); (11) the email key does not equal the per-client-key key for the same text (prefix separation). RED: module missing.
- [x] A.14 GREEN: create `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`: `PrismaLoginFailureLimiter implements LoginFailureLimiter`, constructor `(prisma: PrismaService, config: LoginEmailRateLimitConfig)`, `keyFor` with prefix `login-email:`, `getBlock` (single `SELECT` on the db clock, `CEIL(EXTRACT(EPOCH ...))`), `recordFailure` (single `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING` per Decision 4; `date_trunc('milliseconds', now())`; no `expiresAt` write; log once via its own `Logger` when the statement returns `blocked = true`, message with the key hash only), `reset` (`DELETE` by key). Errors propagate (fail closed). Confirm casts and parameter types under `@prisma/adapter-pg` with the RED tests.
- [x] A.15 Mutation check (concurrency honesty): temporarily change the `ON CONFLICT` increment to a read-then-write or drop the `WHERE` guard and confirm cases (3), (7) and (8) fail; restore. Record in apply-progress.
- [x] A.16 REFACTOR: tidy SQL and constants; confirm the adapter, port and fake are NOT referenced from `auth.module.ts` or any use case (no runtime change in this PR). Run API lint, build, `npm run test --workspace=apps/api`, and `npm run test:integration --workspace=apps/api` in full.
- [x] A.17 Commit by work unit: port + fake (A.10-A.12), adapter + integration spec (A.13-A.16). Conventional Commits, for example `feat(auth): add the login failure limiter port and in-memory fake` and `feat(auth): add the Postgres login failure limiter`.

### Verification (PR 1)

- [x] A.18 Full checks: repo root `npm run lint`, `npm run build`, `npm run test`; `npm run test:integration --workspace=apps/api` (full). Record RED/GREEN evidence per behavior task.
- [x] A.19 `git diff --stat main`: expected ~450 lines excluding planning artifacts; report the code vs test split (excess is tests; user accepts). Confirm `git diff --stat main -- apps/web apps/api/prisma` is empty (no UI and no schema change).

## Gate PR 1 (orchestrator)

- [x] G.1 Fresh-context independent review (sub-agent with no prior context) before push; focus: SQL atomicity and semantics vs the in-memory fake, raw email never reaching SQL, rows or logs, block-on-reaching-limit (`>=`), blocked rows not rewritten, normalization shared through the schema, nothing wired. Fix findings or register non-blocking ones in `docs/technical-debt.md` / `docs/enhancements.md` in this PR.
- [x] G.2 Ask the user before push.
- [x] G.3 Ask the user before creating the PR. Title `feat(auth): PR 1/4 — per-email login failure store`. Description: "not wired, no runtime change; not browser-verified, no UI change"; code vs test split.
- [x] G.4 PR passes `ci`; ask the user before merge.

## Phase B: PR 2 — email login limit (branch `login-account-lockout/02-email-login-limit`)

Branch from `main` after PR 1 merges.

### Domain error and use case (spec: Email blocked after the failure limit; Fewer failures than the limit; Only failed attempts count; Successful login resets; Unknown/Soft-deleted parity; Valid credentials rejected while blocked; fail closed; Reset failure)

- [x] B.1 RED: extend `apps/api/src/modules/auth/application/use-cases/login.use-case.spec.ts` with a mocked `LoginFailureLimiter` (existing cases get a not-blocked default). Cases: (1) `getBlock` blocked: throws `LoginBlockedError` with `retryAfterSeconds`, and `findByEmail`, `verify`, `verifyAgainstDummy`, `recordFailure` are not called (also with the correct password); (2) wrong password, unknown email and soft-deleted user (repository returns null) each call `recordFailure(email)` exactly once and throw `InvalidCredentialsError`, and the call sequence is identical for unknown and existing; (3) success calls `reset(email)` and not `recordFailure`; (4) `getBlock` rejects: the use case rejects with that error and no credential evaluation happens; (5) `recordFailure` rejects: rejects with that error, not `InvalidCredentialsError`; (6) `reset` rejects: the login still returns the token, `Logger.prototype.warn` is called, and the message does not contain the email. RED: `LoginBlockedError` and the port dependency are missing.
- [x] B.2 GREEN: create `apps/api/src/modules/auth/domain/login-blocked.error.ts` (`LoginBlockedError` with `readonly retryAfterSeconds`, no email). Modify `apps/api/src/modules/auth/application/use-cases/login.use-case.ts`: inject `LOGIN_FAILURE_LIMITER`; check `getBlock` first; `recordFailure` on every `InvalidCredentialsError` path; `reset` in a `try/catch` with a `warn` (no email) after a valid credential check (Decision 1). The unknown-email dummy verify stays unchanged.
- [x] B.3 REFACTOR and check: use-case spec green, API lint and build. Commit `feat(auth): count failed logins per email in the login use case`.

### Controller mapping (spec: Blocked response identical to the per-client-key response)

- [x] B.4 RED: extend `apps/api/src/modules/auth/presentation/auth.controller.spec.ts`: when the use case throws `LoginBlockedError(42)`, `login` rejects with a `ThrottlerException` (status 429, default message) and the response has `Retry-After: 42`; other errors are rethrown unchanged. RED: no mapping.
- [x] B.5 GREEN: `apps/api/src/modules/auth/presentation/auth.controller.ts`: add the `LoginBlockedError` branch (`response.setHeader('Retry-After', String(error.retryAfterSeconds)); throw new ThrottlerException();`), using `@Res({ passthrough: true })` if not already present; update the `@ApiTooManyRequestsResponse` text to "Too many login attempts from this client or for this email; see Retry-After." (Decision 6).

### Module wiring and test environment

- [x] B.6 `apps/api/src/modules/auth/auth.module.ts`: provide `LOGIN_FAILURE_LIMITER` with the factory from Decision 8 (`new PrismaLoginFailureLimiter(prisma, getLoginEmailRateLimitConfig())`). Wiring has no isolated RED; it is proven by B.9 and B.12 failing without it.
- [x] B.7 `apps/api/test/e2e-env.setup.ts` and `apps/api/test/test-database/rate-limit-env.setup.ts`: set `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES=1000` so suites that fail logins repeatedly with one email never trip the new limit. Dedicated suites set and restore low values explicitly.
- [x] B.8 Update the 12 e2e suites that use `overrideProvider(ThrottlerStorage)` (find with `grep overrideProvider(ThrottlerStorage) apps/api/test`): add `.overrideProvider(LOGIN_FAILURE_LIMITER).useFactory({ factory: () => new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()) })` (Decision 9). Expected RED before this task if B.6 landed first: those suites fail because the mocked Prisma cannot serve the real adapter. Run the full e2e suite to confirm all 12 are green.

### E2E contract (spec: scenarios over HTTP with the fake)

- [x] B.9 RED: create `apps/api/test/login-email-limit.e2e-spec.ts` (`TRUST_PROXY=true`, email max 2, fake limiter, env saved and restored, all apps closed): block after 2 failures sent from two different `X-Forwarded-For` values (3rd attempt is 429 with a `Retry-After`); the email 429 body and status equal the per-client-key 429 body from the same app; the correct password while blocked is 429 and no cookie is set; a request rejected by the email limit does not evaluate credentials (spy on the hasher); a different email is not blocked; email case/whitespace variants share one bucket; missing or non-string email gives 400 and does not touch any bucket; a success resets the counter. RED before B.2 to B.8 land.

### App-level integration (spec: distributed, restart, instances, concurrency, fail closed, parity, raw email)

- [x] B.10 RED: create `apps/api/test/login-email-limit.integration.spec.ts` (real `AppModule`, hermetic Postgres, `trust proxy` 1, `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES=3`, unique email and unique `X-Forwarded-For` per failure, users seeded via Prisma with unique emails): (1) distributed: 3 failures for one email from 3 client keys, then a 4th client key gets 429 with `Retry-After`; (2) reset: 2 failures, a success, 2 more failures give 401 and not 429; (3) 4 successes still give 200; (4) parity: unknown vs seeded vs soft-deleted email give identical status sequence, bodies and `Retry-After` presence through the block; (5) restart and two instances: block in app A, 429 in app B, and a recreated app still 429; (6) concurrency: 3 parallel failures all 401, the next 429; (7) fail closed: `getBlock` and `recordFailure` spied to reject once give 500, `reset` rejecting gives 200 and a warn; (8) mixed-case and whitespace variant hits the same bucket; (9) a client-key-blocked request (client max lowered for this suite or exhausted) adds no email failure.
- [x] B.11 Mutation checks: (a) swap `>=` to `>` in the adapter and confirm the "6th attempt" cases fail; (b) remove the `recordFailure` call on the unknown-email path and confirm the parity case fails; (c) remove the `reset` call and confirm case (2) fails; restore each.
- [x] B.12 Modify `apps/api/test/login-rate-limit.integration.spec.ts`: "never stores the raw client address" now expects two rows per failed attempt (client key plus email), both 64-char hex, neither containing the raw email; keep the rest of the file green. RED first (it fails once B.6 lands), then adjust.

### Verification (PR 2)

- [x] B.13 REFACTOR and full checks: API lint, build, `npm run test --workspace=apps/api`, `npm run test:e2e --workspace=apps/api` (full), `npm run test:integration --workspace=apps/api` (full). The existing per-client-key suites (`login-rate-limit.e2e-spec.ts`, `login-rate-limit.integration.spec.ts`, `auth.e2e-spec.ts`) stay green.
- [x] B.14 Commit by work unit: use case + error (B.1-B.3), controller (B.4-B.5), wiring + env + 12 suite overrides (B.6-B.8), e2e (B.9), integration (B.10-B.12).
- [x] B.15 `git diff --stat main`: expected ~410 lines; report code vs test split (accept if excess is tests). Confirm `git diff --stat main -- apps/web apps/api/prisma` is empty.

## Gate PR 2 (orchestrator)

- [x] G.5 Fresh-context independent review before push; focus: check-before-credentials ordering, identical path for unknown/soft-deleted emails, no raw email in logs or rows, 429 body identity, fail-closed vs reset-warn policy, test-env limit of 1000, no leftover reliance on the fake in integration. Fix findings or register non-blocking ones in the registers in this PR.
- [x] G.6 Ask the user before push, then before creating the PR (title `feat(auth): PR 2/4 — limit failed logins per email`; "not browser-verified, no UI change"), then before merge after `ci` passes.

## Phase C: PR 3 — combined Retry-After and docs (branch `login-account-lockout/03-combined-retry-after`)

Branch from `main` after PR 2 merges.

### Guard override (spec: Both limits blocked uses the larger Retry-After; Request rejected by the client-key limit adds no email failure)

- [x] C.1 RED: extend `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts`: construct the guard with the four arguments (options, storage, reflector, limiter); with a fake storage that blocks with `timeToBlockExpire` 100: email blocked 800 gives `Retry-After` 800; email blocked 50 keeps 100; email not blocked keeps 100; a body email missing, non-string or invalid does not call `getBlock`; a client key that is not blocked does not call `getBlock`; `getBlock` rejects gives a rejection (500); the guard writes no email failure (`recordFailure` never called). Existing tracker tests kept. RED: constructor and override missing.
- [x] C.2 GREEN: `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`: add the constructor re-declaring `@InjectThrottlerOptions()`, `@InjectThrottlerStorage()`, `Reflector` plus `@Inject(LOGIN_FAILURE_LIMITER)`; override `protected async throwThrottlingException(context, detail)` per Decision 5 (parse with `loginEmailSchema.safeParse(req.body?.email)`, raise `Retry-After` only when the email block is larger, then `super.throwThrottlingException`). Verify the guard still resolves under `AuthModule`.
- [x] C.3 RED then GREEN (e2e): extend `apps/api/test/login-email-limit.e2e-spec.ts` with the both-limits case: client key max 3 with a short window, email blocked for 900 s, an attempt from the blocked client key for the blocked email returns 429 with `Retry-After` greater than the client key's remaining time; a client-key-blocked request with 0 recorded email failures leaves that email usable from another client key. RED before C.2 lands.
- [x] C.4 Mutation check: remove the larger-value branch in the override and confirm C.1 (email 800) and C.3 fail; restore.
- [x] C.5 REFACTOR and check: API lint, build, unit, full e2e, full integration. Commit `feat(auth): return the larger Retry-After when both login limits block`.

### Docs and registers (TDD N/A)

- [x] C.6 `README.md`: document `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` (default 5) and `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (default 900), positive integers validated at boot, beside the existing login rate-limit variables; state that failures are counted per normalized email across all client keys and that a success resets the count.
- [x] C.7 `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`: add a dated addendum recording Approach A, failures only, reset on success, no stored lock, SHA-256 with the `login-email:` prefix (enumerable against known emails, see EN-6), the combined `Retry-After` rule, block on reaching the limit (5th evaluated, 6th rejected), fail closed on check and record with warn-and-continue on reset, the check-then-verify concurrency bound (`maxFailures + in-flight - 1` evaluations per window), and the accepted bounded DoS.
- [x] C.8 `docs/technical-debt.md`: move TD-31 to Resolved with change name `login-account-lockout` and PRs 1/4 to 3/4 (PR numbers filled in once known; PR 4/4 added at archive). IDs never reused or renumbered.
- [x] C.9 `docs/enhancements.md`: re-read the highest id first (EN-22 at planning time) and use the next free ids. Extend EN-6 so it also covers the email keys. Add one new EN for an admin unlock action (relevant only if a persistent lock is ever introduced; EN-23 at planning time). Add one new EN for a DB audit table of blocked logins beyond the `warn` log (EN-24 at planning time). Add any non-blocking finding from reviews that is not fixed in this PR.
- [x] C.10 Commit `docs: resolve TD-31 and record the login email limit decisions`.

### Verification (PR 3)

- [x] C.11 Full checks: repo root `npm run lint`, `npm run build`, `npm run test`; API e2e and integration in full.
- [x] C.12 `git diff --stat main`: expected ~250 lines; report code vs test vs docs split. Confirm `git diff --stat main -- apps/web apps/api/prisma` is empty.

## Gate PR 3 (orchestrator)

- [ ] G.7 Fresh-context independent review before push; focus: override reads only (no write on the cheap-blocked path), invalid body email skips the read, register IDs and cross-references, ADR addendum accuracy vs the implemented behavior. Fix findings or register them in this PR.
- [ ] G.8 Ask the user before push, before creating the PR (title `feat(auth): PR 3/4 — combined Retry-After and TD-31 docs`; "not browser-verified, no UI change"), and before merge after `ci` passes.

## Phase D: Web untouched confirmation (checked in every PR, final check before archive)

- [x] D.1 After each PR's diff is final, run `git diff --stat main -- apps/web` and confirm it is empty. If a PR touches `apps/web/**` for any reason, STOP: a browser pass becomes mandatory (CLAUDE.md "Verifying UI Changes": golden path plus the rate-limited message, in a real browser, with the user logging in), and the PR description must say what was browser-verified and what was test-verified only.
- [x] D.2 Confirm the existing web coverage of the 429 message stays green: `npm run test --workspace=apps/web -- LoginPage` (scenarios "Rate-limited message" and "Form usable after rate limit"). No new web scenario is added.

## Phase E: PR 4 — archive (branch `login-account-lockout/04-archive`) — placeholder

Docs only; branch from `main` after PR 3 merges. Details are refined at archive time.

- [ ] E.1 `sdd-verify` against every delta spec scenario (map each to its test: PR 1 to PR 3 tasks above); fix or register findings in `docs/technical-debt.md` / `docs/enhancements.md`.
- [ ] E.2 `sdd-archive`: merge the delta into `openspec/specs/authentication/spec.md` (ADDED "Login Failure Limiting per Email"; MODIFIED "Login Attempt Rate Limiting") and archive the change folder; confirm TD-31 Resolved carries the PR numbers including PR 4/4. Check `git status` after the archive and finish `git mv` plus commit only if the source folder remains.
- [ ] E.3 Ask the user before push, PR creation (title `docs(openspec): PR 4/4 — archive login-account-lockout`) and merge. Before reporting the change complete, state which register items were added.
