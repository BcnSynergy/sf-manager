# Enhancements

Register of optional improvements to SF-Manager: things that would make the
system better but that nothing currently requires. Known defects, gaps, and
shortcuts live in [technical-debt.md](technical-debt.md); new product
behavior belongs in `docs/requirements/functional-requirements.md`.

## How to use this file

- Each item has a stable ID (`EN-<n>`). IDs are never reused or renumbered.
- New items go at the end of **Open** with the next free number. Include the
  area, the evidence (file path or source review), and the origin.
- Typical sources: non-blocking suggestions from fresh-context reviews and
  RDD reviews (older items also came from `sdd-verify` and `sdd-archive`
  follow-ups).
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
- **EN-43** (tooling): With `endOfLine: "auto"` (needed for CRLF working
  trees on Windows), the CI `Format` step no longer checks line endings, so
  a CRLF file committed from a tree without `core.autocrlf` would pass. Today
  the whole index is LF. A `.gitattributes` with `* text=auto eol=lf` would
  keep line endings enforced. Origin: `td-33-prettier-enforced` PR 1 review,
  2026-10-14.
- **EN-44** (docs): In ADR-011 Decision 3, "The single port keeps a fully
  dynamic, DB-backed permission system..." follows a note that names a second
  port (`ManagerCapabilityChecker`), so a reader may think the text
  contradicts itself about how many authorization ports exist. Say which port
  is meant, e.g. "The single `PermissionChecker` port keeps...". Evidence:
  `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md:81-83`. Origin:
  `td-10-adr-011-decision-3-pointer` (#225) native review, findings
  `R2-single-port-wording` and `R3-001`, 2026-10-15.
- **EN-47** (api tests): The TD-24 live grant/revoke e2e seeds a MANAGER into
  the shared `built.userRepository` of its describe block and does not undo
  the grant in a `finally`, so a failure between the grant and the revoke
  leaves a granted manager behind. No test in that block lists users, and its
  sibling granted-manager tests already seed without cleanup, so nothing fails
  today. Wrap the grant/revoke in `try/finally` or give the test its own app,
  as the W1 test does. Evidence: `apps/api/test/review-history.e2e-spec.ts`
  (test "a live grant and revoke change what the same MANAGER session sees on
  the very next request"). Origin: `td-24-manager-capability-e2e` (#232) native
  review, finding `R3-001`, 2026-10-16.
- **EN-48** (api tests): The TD-16 review schedule exemption accepts any
  non-lowercase character after `review-schedule` / `ReviewSchedule`, so a
  future `review-schedule-reminders.ts` or `ReviewScheduleExport.tsx` would skip
  the forbidden-term scan. That is the accepted cost of a naming convention, but
  the table-driven test does not pin it: add rows for a hyphen continuation,
  mixed case (`reviewSchedule.ts`, `Review-Schedule`), and a schedule directory
  holding a non-matching file name. Evidence:
  `apps/api/test/review-session.e2e-spec.ts` (`isReviewScheduleFile` and its
  `it.each`). Origin: `td-16-schedule-guard-exemption` (#233) native review, findings
  `R3-001` and `R3-002`, 2026-10-16.
- **EN-49** (web build): `@sf-manager/validation` compiles to CommonJS
  (ADR-015), so Vite cannot tree-shake it and any page that imports one schema
  pulls in the whole package plus zod, a shared 358 kB chunk (login and every
  form page). An ESM build of the package (for example a dual CJS/ESM output)
  would let each page take only the schemas it uses. Evidence: `vite build`
  output (`dist-*.js`, 358 kB) on `td-8-route-code-splitting`, 2026-10-16.
  Origin: `td-8-route-code-splitting` (#234).
- **EN-50** (web tests): The TD-8 static-import guards in
  `apps/web/src/routes/authenticated-routes.test.ts` read source files from
  `process.cwd()`, so they only work when Vitest runs with `apps/web` as its
  working directory (the workspace scripts and CI do). Run from elsewhere they
  fail with ENOENT instead of checking the imports.
  `src/styles/check-app-nav-print-suppression.test.ts` (and, since EN-62,
  `src/styles/index-css-dialog.test.ts`) has the same limit and
  documents why `import.meta.url` does not work under jsdom. A shared helper
  resolving from the Vitest config root would fix both. Origin:
  `td-8-route-code-splitting` (#234) native review, finding `R3-002`, 2026-10-16.
- **EN-51** (web): `PageLoadBoundary` (`apps/web/src/components/PageSuspense.tsx`)
  catches every render error, not only chunk-load failures, so a page that
  crashes at runtime shows "This page could not be loaded" and the real error
  is not reported (no `componentDidCatch`). Before TD-8 such a crash blanked
  the whole app, so this is still an improvement. Tell the two cases apart (or
  word the message generically) and log the error. Also, the `/login`
  boundary in `App.tsx` has no test for its fallback or error path. Origin:
  `td-8-route-code-splitting` (#234) native review, findings `R3-001` and `R3-002`,
  2026-10-16.
- **EN-52** (web): react-router 7 `BrowserRouter` wraps each navigation in
  `startTransition` (unless `useTransitions={false}`), so on in-app navigation
  React keeps the current page on screen while a lazy page chunk downloads.
  The TD-8 "Loading page…" fallback only shows on a full load; on a slow
  network a nav click looks idle until the chunk arrives. Add a pending
  indicator (for example from `useNavigation`/transition state) or opt out of
  transitions. Also, a protected deep link downloads the page chunk only after
  `/auth/me` resolves (`ProtectedRoute` renders `null` while loading), two
  requests in sequence. Evidence: `node_modules/react-router` 7.18.2
  `BrowserRouter` `setState`. Origin: `td-8-route-code-splitting` (#234) fresh-context
  review, 2026-10-16.
- **EN-53** (api tests): The use-case test "leaves status, reason, deadline,
  last date and order unchanged" for the TD-22 `inProgress` flag compares a
  run where every pair is flagged with one where none is, so a comparator that
  started sorting or tie-breaking on the flag would still pass. Flag exactly
  one pair, as the spec scenario says (the e2e test already does this at the
  HTTP level). Evidence:
  `apps/api/src/modules/review-schedule/application/use-cases/list-review-schedule.use-case.spec.ts`.
  Origin: `review-schedule-in-progress` (#235) native review, finding
  `R3-uniform-flag-order-test`, 2026-10-16.
- **EN-54** (api tests): No reader integration test covers an open
  `QUARTERLY`/`ANNUAL` draft on a template of another element type in the same
  community, so the element-type half of the draft fold is untested against
  Postgres. It cannot be written while `ElementType` has only `EXTINGUISHER`;
  add it with the second element type, next to the existing "Pairs are per
  element type" follow-up of `review-schedule`. Origin:
  `review-schedule-in-progress` (#235) native review, finding
  `R3-other-element-type-draft`, 2026-10-16.
- **EN-55** (api): For TD-22, `ReviewSchedulePrisma.reviewSession.groupBy`
  now accepts `status: 'completed' | 'draft'` (a draft-only overload is not
  assignable from `PrismaService`), so the compiler no longer stops q4 or q5
  from filtering on `'draft'`. Today drafts still cannot cover (their
  `completedAt` is null, and the coverage tests would fail), but the rule is
  no longer documented by the type. Add a comment at q4/q5 that the status
  must stay `'completed'`, and optionally a reader test with a completed
  covering session plus an open draft on the same pair asserting the coverage
  is unchanged. Evidence:
  `apps/api/src/modules/review-schedule/infrastructure/persistence/prisma-review-schedule.reader.ts`.
  Origin: `review-schedule-in-progress` (#235) fresh-context review, 2026-10-16.
- **EN-56** (specs): The `review-schedule-ui` scenario "Marker in the
  browser" relies on the dev seed holding an open draft and passes vacuously
  when that draft is not `QUARTERLY`/`ANNUAL`. On 2026-10-16 the dev database
  held no open draft at all, and the browser pass opened a `QUARTERLY` draft
  in Dev Seed Residences South by hand. Reword the scenario to open a
  `QUARTERLY` draft as a seeded technician, or pin the seed draft's
  frequency. Origin: `review-schedule-in-progress` (#236) archive native review,
  finding `R3-browser-scenario-conditional`, 2026-10-16.
- **EN-57** (web UX): The community details page lists representatives and
  technicians by raw user id (a UUID) and assigns one by typing a user id
  (`apps/web/src/community/AssignmentSection.tsx`). Show each assignee's email
  and pick the user from a list of eligible users instead. This changes a flow,
  so it needs its own slice. Origin: `ui-redesign-foundation` screens canvas,
  2026-10-16.
- **EN-58** (web print): The `.label-print` print scope forces black only on
  `dt`/`dd`, while the review document scope also covers `th`, `td`, `code`
  and headings. The redesign's base styles give `th`, `td` and `code` token
  colors and fills that turn light in dark mode. The label page uses none of
  them today, but a future table or code element on it would print light text
  or a dark fill on a dark-mode OS. Extend the label override to the same
  element list. Evidence: `apps/web/src/index.css` print block. Origin:
  `ui-redesign-foundation` PR 1 native review, finding
  `R3-label-print-dark-colors`, 2026-10-16.
- **EN-59** (web tests): Pin the redesign's print rules with source-level
  tests like `apps/web/src/styles/index-css-print-credit.test.ts`. Today only
  a browser print pass covers them. PR 1: `main` back to block flow without
  width cap or padding, and the stacked `dl`/`dd` layout of labels and review
  documents. PR 2: `.sf-shell`/`.sf-main` as blocks and `.sf-main > main` back
  to `overflow: visible`, so a later screen rule placed after the print block
  cannot bring back print clipping. PR 3: `.sf-table-wrap` overflow visible,
  badges black with no fill, and the draft marker still dashed. Origin:
  `ui-redesign-foundation` native reviews, findings
  `R3-print-layout-reset-untested` (PR 1) and `R3-print-badge-untested`
  (PR 3), 2026-10-16.
- **EN-60** (web tests): The print guard
  (`apps/web/src/styles/check-app-nav-print-suppression.ts`) rejects a
  descendant rule after the chrome selector (`.app-nav .x { display: none }`)
  but still accepts an ancestor-qualified one (`.page .app-nav { display:
none }`) as hiding the nav or footer, although that only hides chrome inside
  `.page`. Today's CSS uses bare selectors, so nothing prints wrongly. Anchor
  the hidden-rule match to the start of a selector (start of the rule or after
  a comma) and add a fixture for the ancestor case. Origin:
  `ui-redesign-foundation` PR 2 native review, finding
  `R3-print-guard-left-descendant`, 2026-10-16.
- **EN-61** (web tests): The users list's `users-list-action-error` test id
  (and, since their restyles, the communities list's
  `communities-list-action-error` and the checklist questions list's
  `checklist-question-list-delete-error`) now sits on the `sf-alert` container,
  whose text content also includes the `aria-hidden` "!" icon. The current
  assertion is a substring match, so it passes, but an exact text match
  would fail. Move the message assertion to
  the alert's `<p>`, or assert the accessible text. Evidence:
  `apps/web/src/pages/UsersListPage.tsx` action error block (the communities
  and checklist questions tests already assert the message on the alert's
  `<p>`; no e2e test reads these ids). Origin:
  `ui-restyle-users` PR 1 native review, finding `R3-alert-textcontent`,
  2026-10-17.
- **EN-63** (web UI copy): A failed community delete that returns 404 (no
  error code) shows `community.error.assignmentTargetNotFound`, "This
  community or user could not be found.", because `mapApiErrorToMessageKey`
  maps every code-less 404 to the assignment-actions message. It already did
  this before the restyle; the communities list test now pins it. Give
  deletes their own not-found message (for example "This community no
  longer exists") if the shared wording reads wrong. Evidence:
  `apps/web/src/community/error-messages.ts` 404 case. Origin:
  `ui-restyle-communities` PR 1 pre-merge fresh review, 2026-10-17.
- **EN-64** (web tests): The restyled list pages check the loading, empty
  and error states in one test that renders and unmounts the page three
  times (`UsersListPage.test.tsx`, `CommunitiesListPage.test.tsx`,
  `MaintenanceCompaniesListPage.test.tsx`, and since their restyles the
  review templates, checklist questions, review history and review sessions
  lists: "puts the heading in a page header and the loading, empty and error
  messages in empty-state boxes"). A failure in the first state hides the
  other two.
  Split it into one test per state (or `it.each`) on all of these pages
  together, keeping them consistent. Origin:
  `ui-restyle-maintenance-companies` PR 1 fresh review, 2026-10-17.
- **EN-65** (web): The review templates list picks the version cell's class
  with `version === null` but its text with `version ?? noVersion`. The API
  type is `number | null`, so they agree today; an `undefined` version would
  show "no version" in the `sf-data` monospace style. Use one nullish check
  (`version == null`) for both if the contract ever loosens. Evidence:
  `apps/web/src/pages/ReviewTemplatesListPage.tsx` version cell. Origin:
  `ui-restyle-review-templates` PR 1 native review, finding
  `R3-version-null-check-mismatch`, 2026-10-17.
- **EN-66** (web tests): The TD-8 lazy-page tests in
  `apps/web/src/layout/AppLayout.test.tsx` delay `/auth/me` with a 50 ms
  `setTimeout` that is never cleared. Every test awaits the nav, so the timer
  has always fired before a passing test ends, and the file uses no fake
  timers. A test that fails early, or a future one that switches to fake
  timers, could leave the response pending after unmount. Clear the timers in
  `afterEach` (or note that the block needs real timers) if either happens.
  Origin: `td-38-lazy-page-test-race` PR 1 native review, finding
  `R3-pending-timer-teardown`, 2026-10-17.
- **EN-67** (web tests): `ConfirmDialog` puts Cancel before the confirm
  button so the native modal's initial focus lands on Cancel, not on a
  danger action. The tests pin only the DOM order: jsdom's `showModal` is a
  polyfill (`apps/web/src/test/setup.ts`) that does not move focus, so
  `document.activeElement` after opening proves nothing there. It was checked
  by hand in Chrome. Cover it with a real-browser test (Playwright) if the
  web E2E suite grows one. Origin: `en-62-confirm-dialog-restyle` PR 1
  native review, finding `R3-cancel-initial-focus-unproved`, 2026-10-17.
- **EN-68** (web UI): The review history list and the review history detail
  show `completedAt`, the review sessions list shows `startedAt`, and the
  element review history shows each entry's `recordedAt`, as the raw ISO
  string the API returns (for example `2026-10-08T09:36:36.272Z`), in every
  locale. A localized date and time would read better. Neither the
  `review-history-ui` nor the `review-session-ui` spec says anything about
  the format, so changing it is observable behavior and edits the spec.
  Evidence: `apps/web/src/pages/ReviewHistoryPage.tsx` completed-at cell,
  `apps/web/src/pages/ReviewHistoryDetailPage.tsx` completed-at field,
  `apps/web/src/pages/ReviewSessionsPage.tsx` started-at cell and
  `apps/web/src/pages/ElementReviewHistoryPage.tsx` recorded-at cell.
  Origin: `ui-restyle-review-history` PR 1 browser pass, 2026-10-17; widened
  in `ui-restyle-review-sessions` PR 1, 2026-10-18,
  `ui-restyle-element-history` PR 1, 2026-10-20, and
  `ui-restyle-review-history-detail` PR 1, 2026-10-20.
- **EN-70** (web a11y): Six list tables leave their link column header
  empty (`<th scope="col"></th>`), so a screen reader announces a blank
  header for the actions cells. Give it a `visually-hidden` label
  ("Actions", in en/es/ca), as the community elements list already shows
  visibly, on all of them together. Put the class on a `<span>` inside the
  `<th>`, as `community/AssignmentSection.tsx` does: on the `<th>` itself it
  takes the cell out of the table flow and cuts the header row short.
  Evidence: `CommunitiesListPage.tsx`,
  `MaintenanceCompaniesListPage.tsx`, `ReviewHistoryPage.tsx`,
  `ReviewSessionsPage.tsx`, `UsersListPage.tsx` and
  `ElementReviewHistoryPage.tsx` in `apps/web/src/pages/`. Origin:
  `ui-restyle-element-history` PR 1 fresh review, 2026-10-20.
- **EN-71** (web a11y): The review session's element code input does not
  point at its validation error: when "Enter an element code." shows, the
  input gets neither `aria-invalid` nor an `aria-describedby` to the alert.
  The alert is announced (`role="alert"`), but a screen reader user who
  returns to the field hears no error. Set both while `codeError` is shown.
  Evidence: `apps/web/src/pages/ReviewSessionDetailPage.tsx` code form.
  Origin: `ui-restyle-review-session-detail` PR 1 fresh review, 2026-10-20.
- **EN-72** (web UI): The review session's recorded elements table shows
  only each entry's result and observations, not which element it is, so
  its rows (on screen and to a screen reader) cannot be told apart. The
  session detail response carries `inspectableElementId` but no code or
  name; showing one needs an API and `review-session-ui` spec change.
  Evidence:
  `apps/web/src/pages/ReviewSessionDetailPage.tsx` entries table. Origin:
  `ui-restyle-review-session-detail` PR 1 fresh review, 2026-10-20.
- **EN-73** (web UI): On a draft template, Activate activates the last
  saved question selection. Picker changes not yet saved are silently
  dropped, with no warning or prompt to save first. Options: disable
  Activate while the selection is unsaved, or warn in the confirmation.
  Either changes observable behavior, so it edits the spec. Evidence:
  `apps/web/src/pages/ReviewTemplateDetailPage.tsx` (`confirmActivate`).
  Origin: `ui-restyle-review-template-detail` PR 1 analysis, 2026-10-20.
- **EN-91** (delivery): CI neither builds, publishes nor deploys the API and
  web images; today the operator builds them on the server with
  `docker compose ... up -d --build`. Build both images in CI so a broken
  Dockerfile fails the PR, and later publish them to a registry and deploy
  from there. Evidence: `.github/workflows/ci.yml`, README "Production
  deployment". Origin: `deployment` (S11), 2026-10-25; covers the deploy
  part of TD-32.
- **EN-92** (operations): The production stack has no monitoring or
  alerting: nothing reports a down API, a restart loop after a failed
  migration, or an expiring certificate. An external uptime check on
  `/api/health` would cover the first two. The API service also has no
  Compose healthcheck and `web` waits only for it to start, so Caddy answers
  502 for `/api/*` during such a loop. Evidence: `docker-compose.prod.yml`.
  Origin: `deployment` (S11) and its pre-push review, 2026-10-25.
- **EN-93** (delivery): The API image is about 1.7 GB because it ships dev
  dependencies, sources and tests: the Prisma CLI (`migrate deploy`) and
  ts-node (admin seed) are dev dependencies. A multi-stage build with a
  pruned runtime (Prisma CLI kept, seed compiled to JavaScript) would shrink
  it. Evidence: `apps/api/Dockerfile`. Origin: `deployment` pre-push review,
  2026-10-25.
- **EN-94** (security): Caddy sends no HSTS or other security headers
  (`Strict-Transport-Security`, `X-Content-Type-Options`,
  `Referrer-Policy`, a Content Security Policy). Evidence:
  `apps/web/Caddyfile`. Origin: `deployment` pre-push review, 2026-10-25.
- **EN-95** (delivery): The production images build from floating base tags
  (`node:24-bookworm-slim`, `caddy:2-alpine`, `postgres:18-alpine`), so two
  builds weeks apart can get different base layers and an upgrade is not
  reproducible. Pin them by digest and let Dependabot update them; TD-32's
  pinning covers GitHub Actions only. Evidence: `apps/api/Dockerfile`,
  `apps/web/Dockerfile`, `docker-compose.prod.yml`. Origin: `deployment`
  pre-merge review (PR #283), 2026-10-25.
- **EN-96** (web tests): `checkAppNavPrintSuppression` fails, on the safe
  side, for a descendant rule after the hide in the same print block
  (`.app-nav a { color: black }`) and for a hiding rule that nests CSS
  (`.app-nav { display: none; &:hover { ... } }`). `index.css` has neither.
  The later-rule check would need to count only rules whose selector list
  names the selector itself, and the hiding rule's declarations would need
  reading outside its nested rules. The `!important` show check (EN-90) also
  fails, on the safe side, for shows that cannot win in print: one in
  `@media screen { .app-nav { display: flex !important } }`, or one in a
  descendant rule such as `.app-nav a { display: block !important }`. It
  also fails for an `!important` hide followed by a plain hide in the same
  block (only the last hiding rule's priority is compared), and for a hide
  on a compound selector of the element itself
  (`nav.app-nav { display: none }`), which `main` accepted. Split out of
  EN-90 by `en-90-print-check-declarations` and its pre-push and pre-merge
  reviews, 2026-10-25.
- **EN-97** (web tests): `checkAppNavPrintSuppression` ignores specificity.
  It assumes every rule for the chrome has the specificity of one class, so
  `.shell .app-nav { display: flex !important }` before a print
  `.app-nav { display: none !important }` still passes, although the more
  specific show wins and the nav prints. True before EN-90 as well;
  `index.css` has no such rule. Origin: `en-90-print-check-declarations`
  pre-push review, 2026-10-25.
- **EN-98** (web tests): `checkAppNavPrintSuppression` misses an
  `!important` show in a conditional print block after the deciding one,
  e.g. `@media print and (min-width: 1px) { .app-nav { display: flex !important } .app-nav { display: none } }`:
  the later-rule check cuts that block's span up to its own hide, so the
  show is never read, and when the query applies the nav prints. True
  before EN-90 as well; `index.css` has no such block. Origin:
  `en-90-print-check-declarations` pre-merge review (PR #285), 2026-10-25.

## Done

- **EN-90** (web tests): `checkAppNavPrintSuppression` misread a few
  selector and declaration shapes and passed them: a descendant hiding rule
  (`.foo .app-nav { display: none }`), a rule that overrides its own hide
  (`display: none; display: block`), a custom property
  (`--nav-display: none`), and an earlier `display: block !important` show.
  It now reads each rule's declarations: only `display` itself counts, the
  last `!important` one wins (else the last one), a hiding rule must name
  the selector itself in its list, and an earlier `!important` show fails
  the check unless the print hide is `!important` too. A custom property no
  longer counts as the screen rule either. Done in
  `en-90-print-check-declarations`, PR #285.

- **EN-80** (web UI): On a long form at phone width, the review session
  element page's save confirmation sat above the form, out of view of the
  Save button just pressed, and stayed up (with Continue as the primary
  action) when the user then edited the answers. The confirmation now sits
  between the questions and Save, and any edit (an answer, the unreviewed
  toggle, the observations) withdraws it and makes Save primary again; the
  `review-session-ui` spec says so. Done in `en-80-save-confirmation`,
  PR #284.

- **EN-89** (web tests): `checkAppNavPrintSuppression` counts only a
  top-level `display: none` rule of a print block as hiding the chrome
  (`topLevelStyleRules`), so a hiding rule nested in `@media` or `@supports`
  inside a plain block no longer counts. The search for a later rule starts
  after the block's last hiding rule, so a block that hides and then shows
  the chrome fails, and of a later hiding block only the part up to its own
  last hiding rule is cut. Done in `en-89-print-check-rule-order`, PR #282.

- **EN-88** (web tests): `checkAppNavPrintSuppression` reports an unclosed
  block with the `printBlocks` message, which names its query (for
  `@media screen, print`, "The @media screen, print block is not properly
  closed."). Done in `en-87-print-check-conditions`, PR #281.
- **EN-87** (web tests): `printBlocks` tells whether a block applies whenever
  the page prints (`alwaysApplies`: a plain `print`/`only print` query, not
  nested in another rule). `checkAppNavPrintSuppression` takes the last such
  block hiding the chrome as the one that wins in print, fails when the chrome
  is hidden only in conditional blocks, and ignores later blocks that hide it
  again when looking for a rule after it. Done in
  `en-87-print-check-conditions`, PR #281.
- **EN-84** (web tests): `printBlocks` skips `@media` inside strings, ends an
  unterminated string at the newline as CSS does, resumes after each print
  block so a nested one is not returned twice, and names the media query of
  an unclosed block. `checkAppNavPrintSuppression` asks for the screen rule
  before the last block hiding the chrome, which wins the tie in print, so a
  screen rule between two hiding blocks passes. Done in
  `en-84-print-check-edges`, PR #280.
- **EN-86** (docs): ADR-006's addendum now says per-slice design happens in
  the slice's feature document and spec edits (ODD), naming the
  `sdd-spec`/`sdd-design` phases only as what it was until 2026-10-22. Done
  in `en-85-sdd-docs-followups`, PR #279.
- **EN-85** (docs): `CLAUDE.md` ("Keeping `openspec/specs/` Current") now
  asks for RFC 2119 keywords (MUST, SHALL, SHOULD, MAY) in spec
  requirements, next to the Given/When/Then rule, so the rule no longer
  lives only in the unread `openspec/config.yaml`. Done in
  `en-85-sdd-docs-followups`, PR #279.
- **EN-79** (docs): ADR-016 (strict TDD in `sdd-apply` / `sdd-verify`) is
  marked superseded by the ODD test-first policy, in the ADR and in
  `docs/adr/INDEX.md`. `openspec/config.yaml` opens with a comment that the
  SDD tooling is gone and nothing reads it, and its context no longer says
  only the health-check slice exists. Done in `en-79-sdd-docs`, PR #278.
- **EN-83** (web tests): `printBlocks` now reads every `@media` whose query
  list has a `print` media type (`print and (...)`, `only print`,
  `screen, print`), and leaves comment markers and braces inside strings
  alone. `checkAppNavPrintSuppression` reads every print block through it:
  the chrome must be hidden in one, its screen rule must come before the first
  block hiding it, and no rule for it may follow the last. Done in
  `en-83-print-block-detection`, PR #277.
- **EN-81** (web tests): The print CSS tests read the stylesheet through one
  shared helper, `printBlocks` (`apps/web/src/styles/print-blocks.ts`), which
  strips comments first and returns every `@media print` block, so a second
  print block or a brace in a comment no longer makes them pass or fail
  wrongly. Done in `en-81-print-css-blocks`, PR #276.
- **EN-82** (web a11y): The login page's errors (required fields, invalid
  email, failed or rate-limited login) now render as a danger `Alert` keyed
  by `useAlertMessage`, so a repeated error is a new `role="alert"` element
  that screen readers announce again; the page stores the message's i18n key,
  so a shown error follows a language switch. The `web-alert-announcements`
  spec no longer excludes the login page. Done in `en-82-login-alerts`, PR #275.
- **EN-76** (web a11y): Every action error on the design-system pages now
  renders through one `Alert` component with a key from `useAlertMessage`, so
  the same error shown again is a new `role="alert"` element and screen
  readers announce it again; the organization profile and review session
  element save confirmations appear inside a `StatusRegion`, a `role="status"`
  region that is on the page before them. Specified in the new main spec
  `web-alert-announcements`. The phone-width placement of the element page's
  confirmation was split out to EN-80, and the login page's errors to EN-82.
  Done in `alert-announcements`, PRs #271, #272, #273 and #274.
- **EN-78** (web a11y): The read-only element type term on the checklist
  question and inspectable element edit forms (EN-75) now ends with a colon in
  a `visually-hidden` span, so a screen reader no longer reads the term and
  the value as one run. Done in `en-75-read-only-type-field`, PR #269.
- **EN-75** (web): The checklist question and inspectable element edit forms
  now show the read-only element type as a field group like the other fields:
  an `sf-field` with a bold term (new `.sf-label` class, the global label
  weight) above its value, instead of a plain `Type: …` paragraph. Done in
  `en-75-read-only-type-field`, PR #269.
- **EN-74** (web a11y): On the maintenance company, checklist question and
  inspectable element edit forms, the page actions (Delete, and Decommission
  or Reactivate) no longer sit in the page header, where they came before the
  form fields in keyboard tab order. They now follow the form in their own
  `sf-actions` group, after its Save, with their failure alerts just above
  them; the header holds only the title. Done in `page-header`, PR #268.
- **EN-69** (web): The `sf-page-header` block with its `h1` that every page
  repeated (80 copies in 28 pages) is now one `PageHeader` component
  (`apps/web/src/components/PageHeader.tsx`): a title plus optional actions,
  passed through unchanged after the `h1`, so the rendered markup is the same.
  Done in `page-header`, PR #267.
- **EN-77** (web UI): The review session element page's read-only view of a
  completed session (TD-39) is now headed "Recorded element"
  (`reviewSession.element.readOnlyTitle`) instead of "Answer element"; the
  draft answer form keeps its heading. Done in
  `en-77-completed-element-heading`, PR #266.
- **EN-62** (web UI): `ConfirmDialog` now has the design system dialog: the
  `sf-dialog` surface, shadow and backdrop, a muted message, right-aligned
  actions with Cancel first, and a required `tone` prop (`danger` for
  removals, `primary` otherwise) passed by every caller. It is also named by
  its title for assistive technology. Done in `en-62-confirm-dialog-restyle`,
  PR #247.
- **EN-45** (api docs): The Swagger metadata for `managerCapabilities` (the
  `PATCH /users/:id` body and `UserResponseDto`) now lists
  `MANAGER_CAPABILITIES`, derived from a `Record<ManagerCapability, true>` in
  the domain, so a new capability fails to compile until it is listed and the
  OpenAPI enum follows. A spec checks both schemas against it. Done in
  `en-45-swagger-capability-enum`, PR #231.
- **EN-46** (api tests): `manager-capability.spec.ts` now also pins the
  lost-member case (`SoleCapability<never>`) with a fourth `@ts-expect-error`.
  Done in `en-46-lost-member-probe`, PR #230.
- **EN-26** (api tests): Widened the 1000 ms windows in the login-failure
  limiter integration spec to 3 s so the window-expiry tests no longer race a
  slow CI runner. Done in `login-account-lockout`, PR #214.
