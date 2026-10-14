# Enhancements

Register of optional improvements to SF-Manager: things that would make the
system better but that nothing currently requires. Known defects, gaps, and
shortcuts live in [technical-debt.md](technical-debt.md); new product
behavior belongs in `docs/requirements/functional-requirements.md`.

## How to use this file

- Each item has a stable ID (`EN-<n>`). IDs are never reused or renumbered.
- New items go at the end of **Open** with the next free number. Include the
  area, the evidence (file path or source review), and the origin.
- Typical sources: non-blocking suggestions from fresh-context reviews, RDD
  reviews, `sdd-verify`, and `sdd-archive` follow-ups.
- When an item is done, move it to **Done** with the change name and PR
  numbers. If it is dropped, move it to **Done** marked "dropped" with a
  one-line reason.
- If an item turns out to fix a real gap, add it to
  [technical-debt.md](technical-debt.md) with the next free `TD-<n>` and
  "(ex EN-<n>)", and move the EN item to **Done** marked "moved to TD-<n>".

## Open

- **EN-1** (web tests): Assert that no `<caption>` renders in the loading and
  error states of the table pages. Today only the CommunitiesList empty state
  is asserted; the other states are browser-verified only. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-2** (web tests): Assert that each `<caption>` is the table's first
  child, as `web-table-accessibility` requires. It is browser-verified only.
  Origin: `table-accessibility` RDD review, 2026-10-09.
- **EN-3** (web tests): Test that captions follow the active language on the
  grouped pages (ReviewTemplatesList, ChecklistQuestionsList). Today only
  ReviewSchedule has a non-English caption test. Origin:
  `table-accessibility` RDD review and `sdd-verify`, 2026-10-09.
- **EN-4** (specs): Reword the two scenarios in
  `openspec/specs/web-table-accessibility/spec.md` that compare against the
  state "before this change" ("Pages with no table are unchanged" and "No new
  strings"). In a living spec they cannot be checked. For example, state that
  each caption uses the same translation key as its heading. Origin:
  `table-accessibility` archive RDD review, 2026-10-09.
- **EN-5** (api): Unmap the other IPv6 forms that embed an IPv4 address in
  the login throttle key. Today only IPv4-mapped (`::ffff:a.b.c.d`) becomes
  IPv4. IPv4-compatible (`::a.b.c.d`) and NAT64 (`64:ff9b::/96`) addresses
  collapse into one `/64` bucket each, so behind a NAT64 translator one client
  could throttle all translated clients. No documented topology does this.
  Evidence: `apps/api/src/modules/auth/presentation/guards/client-key.ts`.
  Origin: `login-rate-limit-hardening` PR 1 RDD review (R1-001), 2026-10-12.
- **EN-6** (api): Hash the throttle key with an HMAC (secret-keyed) instead of
  the library's unsalted SHA-256. An IPv4 key has only 2^32 values, so the
  stored hash can be enumerated: today the key is pseudonymized, not
  anonymized, at rest. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`
  (key stored as received from the library). Origin:
  `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
  Extended by `login-account-lockout` (#214, 2026-10-14): the per-email
  limiter stores `sha256("login-email:" + email)` and logs the same hash on
  the block transition, so anyone who can read the table or the application
  logs can hash candidate emails and learn which accounts were targeted. An
  HMAC should cover both the stored key and the logged value. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`.
- **EN-7** (api tests): Close the client-key and guard test gaps. Add rows for
  `1::`, `1:2:3:4:5:6:7::`, `::2:3:4:5:6:7:8`, uppercase hex, and an IPv4 with
  a zone id (`1.2.3.4%x` is accepted as IPv4). Pin the IPv4-compatible
  `::a.b.c.d` behavior that EN-5 describes. The guard "shared key" unit test
  also passes on the base `ThrottlerGuard`; pin the sha256 of
  `AuthController-login-default-unresolved` so it fails on the base guard.
  Evidence: `apps/api/src/modules/auth/presentation/guards/client-key.spec.ts`;
  `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts`.
  Origin: `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
- **EN-8** (docs): Note in the README that a `TRUST_PROXY` larger than the real
  proxy count makes the client-controlled leftmost `X-Forwarded-For` entry the
  key, even with no proxy chain at all. Evidence: `README.md` (`TRUST_PROXY`
  section). Origin: `login-rate-limit-hardening` reviews, 2026-10-12.
- **EN-9** (api): Improve the adapter SQL readability. The three `CASE`
  ladders repeat the same predicates without state labels; the expiry boundary
  uses `<=` in the upsert and `<` in the cleanup; the `totalHits === 1`
  cleanup trigger relies on the `CASE` layout. Also, with a limit below 1 the
  first hit of a window is never blocked (unreachable today: the config rejects
  non-positive values). Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`.
  Origin: `login-rate-limit-hardening` PR 2 RDD review, 2026-10-12.
- **EN-10** (api tests): Close the adapter and integration test gaps. No case
  uses `ttl != blockDuration` (60 s/1 s and 1 s/60 s); the 1000 ms windows
  could flake on slow CI (widen to about 3000 ms); no app-level
  window-elapsed test runs over Postgres. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts`;
  `apps/api/test/login-rate-limit.integration.spec.ts`;
  `login-rate-limit-hardening` verify-report S-1. Origin:
  `login-rate-limit-hardening` reviews and `sdd-verify`, 2026-10-12.
- **EN-11** (test harness): Tidy the rate-limit test harness. Extract a shared
  e2e helper for the `ThrottlerStorage` override plus the `PrismaService` mock
  (duplicated in 13 e2e chains and unexplained at the call sites). The
  integration spec keeps its apps open until `afterAll`. The fail-closed test
  should assert the storage spy was called and that the 500 body leaks no
  storage details. The comment in `rate-limit-env.setup.ts` is in future tense.
  Evidence: `apps/api/test/login-rate-limit.integration.spec.ts`;
  `apps/api/test/login-rate-limit.e2e-spec.ts`;
  `apps/api/test/test-database/rate-limit-env.setup.ts`. Origin:
  `login-rate-limit-hardening` PR 3 RDD review, 2026-10-12.
- **EN-12** (api): Map counter-storage failures to `503` with `Retry-After` and
  a distinct log label instead of a generic `500`, so a storage outage can be
  told apart from a bug. Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`
  (fails closed with a generic error today); spec "Counters ... fail closed"
  behavior in `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`
  (2026-10-12 addendum). Origin: `login-rate-limit-hardening` reviews,
  2026-10-12.
- **EN-13** (api tests): Prove at boot level that an invalid `TRUST_PROXY`
  stops the app before it serves requests. Today only the parser is
  unit-tested (`trust-proxy.spec.ts`); that `main.ts` calls it before
  `listen` is checked by reading the code only, so a reorder would go
  unnoticed. Evidence: `apps/api/src/main.ts`,
  `apps/api/src/shared/infrastructure/env/trust-proxy.spec.ts`. Origin:
  `login-rate-limit-hardening` archive RDD review, 2026-10-12.

- **EN-14** (web tests): Pin the defensive epoch advances. The
  `advanceSessionEpoch()` calls in `logout()` and in the unauthorized handler
  (`apps/web/src/auth/AuthProvider.tsx:117`, `:72`) have no test that fails
  without them, and the logout-only stale test
  (`apps/web/src/auth/AuthProvider.test.tsx:312`) passes even without the
  fix, because the `userRef` null check already covers it. Either find an
  observable case or accept them as documented defensive code. Origin:
  `stale-401-session-guard` tasks C.5/C.6 and `sdd-verify`, 2026-10-13.
- **EN-15** (web tests): Pin the ordering in `login()`: the epoch advance
  must run before `response.json()` and `updateUser`
  (`apps/web/src/auth/AuthProvider.tsx:100`). The re-login stale test
  (`apps/web/src/auth/AuthProvider.test.tsx:287-310`) does not fail if the
  advance moves after them. Origin: `stale-401-session-guard` `sdd-verify`,
  2026-10-13.
- **EN-16** (web tests): Tidy `AuthProvider.test.tsx`. The stale-401 tests
  repeat the same scaffold (`:287-363`; extract a helper), the stale-logout
  test title is ambiguous (`:335`; say it covers logout followed by a new
  login), and the comment "Any data call: the API answers 401" (`:173`)
  sits above the `options.data` branch instead of the default 401 response.
  Origin: `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-17** (web tests): `apps/web/src/auth/session-ended-flow.test.tsx:15`
  stubs `fetch` with `vi.stubGlobal` but has no
  `afterEach(vi.unstubAllGlobals)`, unlike the repo convention (for example
  `apps/web/src/components/LanguageSelector.test.tsx:9`). Origin:
  `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-18** (specs): Tidy the authentication spec and the archived design.
  In `openspec/specs/authentication/spec.md`, "Session ends mid-session" and
  "Current-session 401 ends the session and redirects" are near-duplicates,
  as are "Mid-session 401" and "Current-session 401 still shows the notice";
  merge or differentiate them. The Open Questions in
  `openspec/changes/archive/2026-10-13-stale-401-session-guard/design.md:254`
  are stale (both were settled in `sdd-tasks`/`sdd-design`). Origin:
  `stale-401-session-guard` `sdd-verify`, 2026-10-13.
- **EN-19** (web): The mount-time `/auth/me` restore does not advance the
  session epoch. It is unreachable as a problem today because
  `ProtectedRoute` renders no `apiFetch` caller while loading (see the
  ADR-011 2026-10-06 addendum, item 6). Revisit if a caller can run before
  the restore completes. Origin: `stale-401-session-guard` design, 2026-10-13.
- **EN-20** (api tests): Login-throttle cleanup test gaps in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts`.
  The statement-timeout test only shows the timeout does not leak onto
  pooled connections; nothing proves the 500 ms bound applies to the cleanup
  `DELETE` or that a timeout is logged and the login still succeeds at
  integration level (the unit spec covers the logging). The "deletes fully
  expired rows even when more than 100 still-blocked rows have an ended
  window" test empties the
  whole table first, which couples it to other tests in the suite. The
  index test runs `EXPLAIN` on a copy of the cleanup SQL rather than the
  adapter's statement, so it would not notice the predicate drifting. The
  no-leak test relies on the pool reusing the cleanup's connection among a
  few parallel queries, which is likely but not guaranteed. The one-retry
  path in `increment()` is covered by unit tests only, and one seed helper
  still writes an explicit `expiresAt` that the trigger overwrites. Origin:
  `td-35-throttle-db-load` native review, 2026-10-13.
- **EN-21** (api): The window-end expression
  `date_trunc('milliseconds', now()) + ttl * interval '1 millisecond'` is
  repeated in the throttle upsert in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`;
  computing it once (for example in a CTE) would make the SQL easier to read
  and change. Related to EN-9. Origin: `td-35-throttle-db-load` native
  review, 2026-10-13.
- **EN-22** (api): Login-throttle follow-ups from the `td-35-throttle-db-load`
  native review, 2026-10-13. The cleanup's interactive `$transaction` costs
  extra round trips (`BEGIN`, `set_config`, `DELETE`, `COMMIT`); a single
  statement or a batched transaction would be cheaper. Migration
  `20261013120000_throttle_counter_expires_at` rewrites every row and builds
  the index without `CONCURRENTLY`, so it locks the table for its duration
  (small today; revisit if the table grows). It also drops
  `ThrottleCounter_windowEndsAt_idx`, so after a code-only rollback the
  previous adapter's cleanup (which filters on `windowEndsAt`) falls back to a
  sequential scan; accepted while there is no production deployment
  (TD-32). `ThrottleCounter.expiresAt` is a
  required field in the Prisma client although the trigger owns it, so a
  future Prisma `create` would have to pass a value the trigger then
  overwrites. The cleanup's `$transaction` uses Prisma's default `maxWait`
  to acquire a connection, so under pool exhaustion the wait before the
  500 ms statement timeout applies is longer than that timeout suggests.
- **EN-23** (api): Admin unlock action for a blocked email. Only relevant if a
  persistent account lock is ever introduced; the current email limit is a
  counter that expires on its own, so there is nothing to unlock. Evidence:
  ADR-011 addendum 2026-10-14, decision 1. Origin: `login-account-lockout`
  proposal, 2026-10-13.
- **EN-24** (api): Persist blocked logins in a DB audit table, beyond the single
  `warn` log the adapter writes on the block transition (key hash only, no
  email). It would let an admin see which accounts are under attack, but needs
  a retention policy and an answer to the hashed-email enumeration in EN-6.
  Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`.
  Origin: `login-account-lockout` proposal, 2026-10-13.
- **EN-25** (api): Tidy the SQL in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`.
  The upsert repeats the "new window" condition (`blockedUntil IS NOT NULL OR
  windowEndsAt <= now()`) four times and the window-end expression five
  times; computing each once (for example in a CTE or a single anchor) would
  state every rule once. Related to EN-9 and EN-21. Origin:
  `login-account-lockout` native review of PR 1/4 (#214), 2026-10-14.
- **EN-27** (api): The in-memory login failure limiter
  (`apps/api/src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter.ts`)
  lives in the application layer but imports its config type from
  `infrastructure/config/login-rate-limit.config.ts`, reversing the port's
  dependency direction (design Decision 9 accepted this as a type-only
  import). Defining the config shape next to the port, or passing plain
  `maxFailures` and `windowMs`, would keep the layering clean. Origin:
  `login-account-lockout` native review of PR 1/4 (#214), 2026-10-14.
- **EN-28** (api tests): The in-memory limiter's unit spec does not cover the
  re-block that follows an expired block when `maxFailures` is 1. The adapter
  integration spec covers that path against Postgres; a matching unit case
  in `in-memory-login-failure-limiter.spec.ts` would prove the fake keeps
  matching the SQL adapter that later e2e suites stand in for. Origin:
  `login-account-lockout` native review of PR 1/4 (#214), 2026-10-14.
- **EN-29** (api tests): The in-memory `LOGIN_FAILURE_LIMITER` override (five
  lines plus three imports) is copied into 13 e2e suites under
  `apps/api/test/*.e2e-spec.ts`, next to the `ThrottlerStorage` override. A
  shared test helper that applies both overrides to a `TestingModuleBuilder`
  would keep the wiring in one place and make the next limiter change a
  one-file edit. Related to EN-11. Origin: `login-account-lockout` fresh review
  of PR 2/4 (#215), 2026-10-14.
- **EN-30** (api tests): In
  `apps/api/src/modules/auth/application/use-cases/login.use-case.spec.ts`, the
  parity test's `verifyAgainstDummy` mock records the same `'verify'` label as
  the real `verify`, so the call-sequence comparison treats the two hasher
  calls as one step on purpose. Add a comment saying so, so nobody reads it as
  a gap. Origin: `login-account-lockout` fresh review of PR 2/4 (#215),
  2026-10-14.
- **EN-31** (api): `PrismaThrottlerStorage.increment()` retries one empty
  result silently (`(await run())[0] ?? (await run())[0]`) and only throws when
  the second statement is also empty. The retry is legitimate (a snapshot
  that predates a concurrent first insert), but nothing records that it
  happened, so a rise in retries, which would point at a driver or contention
  change, cannot be seen. A `debug` log or a counter on the retry path would
  add that. Related to TD-35 (#213). Evidence:
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`.
  Origin: `login-account-lockout` fresh review of PR 2/4 (#215), 2026-10-14.
- **EN-32** (api): `LoginUseCase` calls `limiter.reset(email)` on every
  successful login, which is a database `DELETE` even when the email has no
  counter row. Skipping it (for example by reading the block state first, or
  by having `reset` report whether a row existed) would save one write per
  login, at the price of an extra read or a wider port. Decide with real
  traffic numbers. Evidence:
  `apps/api/src/modules/auth/application/use-cases/login.use-case.ts`. Origin:
  `login-account-lockout` fresh review of PR 2/4 (#215), 2026-10-14.
- **EN-33** (api tests): The "same 429 as per-client-key" case in
  `apps/api/test/login-email-limit.e2e-spec.ts` compares only the bodies and
  the content type. Assert the headers too, for example that the email 429
  carries no `X-RateLimit-*` header the client-key 429 lacks, so a future
  header cannot reveal which limit fired. Origin: `login-account-lockout` fresh
  review of PR 2/4 (#215), 2026-10-14.
- **EN-34** (api tests): The combined `Retry-After` is proven with the in-memory
  limiter (e2e) and a mocked limiter (guard unit spec) only. An integration case
  against the real `PrismaLoginFailureLimiter` in
  `apps/api/test/login-email-limit.integration.spec.ts` (client key blocked and
  email blocked longer, expect the email's wait) would prove the guard's read
  against Postgres. The design called this check optional. Origin:
  `login-account-lockout` PR 3/4, 2026-10-14.
- **EN-35** (api tests): The both-limits case in
  `apps/api/test/login-email-limit.e2e-spec.ts` (around line 294) does not pin
  that the 4th request was rejected by the client-key guard. If the 10 s window
  expires on a slow CI run, the use case answers 429 with the email's wait and
  the assertions still pass. The guard unit spec covers the branch
  deterministically. Fix by asserting something only the guard path produces,
  or by using a longer window. Origin: `login-account-lockout` PR 3/4 review,
  2026-10-14.
- **EN-36** (api): Every client-key-rejected request with a valid email now
  costs one extra database read (`getBlock`) in
  `LoginThrottlerGuard.throwThrottlingException`, on the cheap blocked path
  from TD-35. The read is also awaited with no timeout, so a hanging (not
  failing) store delays every rejected login and holds a pool connection.
  Consider skipping or caching the read, or bounding it with a timeout, if
  pool pressure appears under attack. Evidence:
  `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`.
  Origin: `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-37** (api): `LoginThrottlerGuard.throwThrottlingException` always
  writes the literal `Retry-After` header. `@nestjs/throttler` suffixes the
  header with the throttler name unless it is `'default'`
  (`Retry-After-<name>`), so renaming the login throttler or adding a second
  one would leave the library's header untouched and add an unsuffixed one,
  silently breaking the combined `Retry-After`. Today the only throttler is
  `'default'` (`apps/api/src/modules/auth/auth.module.ts`). Derive the suffix
  the same way the library does, or pin the name with a test. Origin:
  `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-38** (api tests): The client-key-only case in
  `apps/api/test/login-email-limit.e2e-spec.ts` (around line 309) needs four
  sequential requests inside one 10 s fixed window. On a very slow runner the
  window can roll over and the 4th request gets 401 instead of 429 (a
  timing-dependent failure, not a false pass). A longer window would make it
  deterministic. Origin: `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-39** (api): A client already blocked by its client key can learn, at no
  cost, whether any email is currently blocked: `LoginThrottlerGuard` raises
  `Retry-After` above the client-key value when the email block is longer, and
  the probe records no failure and evaluates no credentials. It does not
  reveal whether an account exists (unknown emails are counted the same way),
  and the email-only 429 already exposes block state to unblocked clients, so
  the extra signal is small and matches the accepted design. Revisit only if
  block state becomes sensitive. Evidence:
  `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`.
  Origin: `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-40** (api): When the advisory `getBlock` read fails in
  `LoginThrottlerGuard.throwThrottlingException`, one `warn` line is written
  per rejected login. During a store outage under attack, log volume grows
  with attack traffic. Rate-limit or sample the warn, or count failures as a
  metric. Origin: `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-41** (api tests): `login-throttler.guard.spec.ts` has two diverging
  `ExecutionContext` fakes: `rejectWith` builds its own stub (handler, class,
  `switchToHttp`) instead of extending the existing `contextFor` helper with a
  response. A later change to what the guard reads from the context must be
  made in both. Origin: `login-account-lockout` PR 3/4 review, 2026-10-14.
- **EN-42** (api tests): No test boots `AppModule` with an invalid
  `LOGIN_EMAIL_RATE_LIMIT_*` value to prove the factory in
  `apps/api/src/modules/auth/auth.module.ts` (~line 105) throws at startup. The
  "Invalid configuration rejected at startup" scenario is proven only by the
  config unit spec. Origin: `login-account-lockout` sdd-verify, 2026-10-14.

## Done

- **EN-26** (api tests): Widened the 1000 ms windows in the login-failure
  limiter integration spec to 3 s so the window-expiry tests no longer race a
  slow CI runner. Done in `login-account-lockout`, PR #214.
