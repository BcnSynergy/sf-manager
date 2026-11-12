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
- **EN-52** (web): react-router `RouterProvider` (8.5.1; `BrowserRouter` in
  7, before EN-129) wraps each navigation in `startTransition` (unless
  `useTransitions={false}`), so on in-app navigation
  React keeps the current page on screen while a lazy page chunk downloads.
  The TD-8 "Loading page…" fallback only shows on a full load; on a slow
  network a nav click looks idle until the chunk arrives. Add a pending
  indicator (for example from `useNavigation`/transition state) or opt out of
  transitions. Also, a protected deep link downloads the page chunk only after
  `/auth/me` resolves (`ProtectedRoute` renders `null` while loading), two
  requests in sequence. Evidence: `node_modules/react-router` 8.5.1
  `dist/development/lib/components.js` (`RouterProvider` `setState`, the
  `React.startTransition` branch); first seen in 7.18.2 `BrowserRouter`.
  Origin: `td-8-route-code-splitting` (#234) fresh-context review,
  2026-10-16; rechecked against 8.5.1 in Dependabot PR #349 fresh review,
  2026-11-09.
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
- **EN-91** (delivery): CI builds both images, smoke-tests the stack and
  publishes the images to GitHub Container Registry (`en-91-ci-images`,
  #291), but nothing deploys them: the operator still builds on the server
  with `docker compose ... up -d --build`. Remaining: switch
  `docker-compose.prod.yml` to the published images (`image:` by tag or
  digest instead of `build:`), update the upgrade steps, and optionally
  deploy from CI, which needs server access as repository secrets. Both
  packages were public after the first publish (cause unconfirmed), so the
  server needs no token to pull them while they stay public; check Package
  settings before switching the compose file. Note that `publish` rebuilds the images instead of pushing the ones `ci`
  smoke-tested, so the pushed bytes can differ (unpinned `apt-get` and npm
  registry state).
  The planned host is an Oracle Cloud Always Free Ampere VM (arm64), but
  `publish` builds with a plain `docker build` on `ubuntu-24.04`, so the
  published images are amd64 only and an arm64 server cannot run them.
  Before switching the compose file, publish multi-platform images
  (`linux/amd64` and `linux/arm64`), for example by building on the native
  `ubuntu-24.04-arm` runner (free for public repositories) and merging the
  two into one manifest, rather than emulating arm64 with QEMU. The pinned
  base images (`node:24-bookworm-slim`, `caddy:2-alpine`, `postgres`,
  `rclone`) are multi-platform indexes that include `linux/arm64`, and
  `argon2` 0.45.1 ships a linux-arm64 glibc prebuild, so no source build is
  expected (both checked 2026-11-05). Building on the server therefore keeps
  working on arm64 until then; nothing has run on arm64 yet, so the first
  arm64 image build is the real proof.
  Evidence: `.github/workflows/ci.yml`, README "Images in CI". Origin:
  `deployment` (S11), 2026-10-25; covers the deploy part of TD-32. Arm64
  requirement added 2026-11-05 (`en-91-arm64-note`, PR #339).
- **EN-108** (delivery): every green push to `main` adds a new version of
  `ghcr.io/bcnsynergy/sf-manager-api` (about 1.7 GB, EN-93) and
  `sf-manager-web` to GitHub Container Registry, and nothing removes old
  ones. Free for public packages, but the list grows without bound. Add a
  retention rule, for example keep the last N `sha-*` versions. Origin:
  `en-91-ci-images`, 2026-10-26.
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
- **EN-99** (web tests): since `print-check-cascade`, `checkAppNavPrintSuppression`
  parses with `postcss`, which rejects stylesheets the old scan accepted: an
  unclosed non-print rule, comment or string at the end of the file fails
  with "The stylesheet could not be parsed: ...". It errs on the safe side,
  and the message gives no line or column; add `error.line:column`.
  Origin: `print-check-cascade` pre-push verification, 2026-10-25.
- **EN-100** (web tests): the check's specificity tokenizer overcounts in
  rare shapes, on the safe side: an escape followed by an identifier counts
  an extra type (`.sm\:flex` scores [0,1,1]), and arguments nested more
  than one level deep are not matched (`:where(:is(:not(#a))) .app-nav`
  scores [1,1,0]). `:nth-child(... of S)` undercounts, with no reachable
  unsafe shape found. Origin: `print-check-cascade` pre-push verification,
  2026-10-25.
- **EN-101** (web tests): the check does not model cascade layers. A
  layered `!important` show (`@layer a { .app-nav { display: flex !important } }`)
  beats an unlayered `!important` print hide, yet the check passes. True
  before `print-check-cascade` as well; `index.css` has no `@layer`.
  Origin: `print-check-cascade` pre-push verification, 2026-10-25.
- **EN-102** (web tests): the check does not see shows that reach the
  chrome without naming its class as a class: an attribute selector
  (`[class~="app-nav"]`), a universal rule (`* { display: block !important }`),
  or a double negation (`:not(:not(.app-nav))`, since the `:not` stripping
  is not parenthesis-aware). They pass although the chrome may print. True
  before `print-check-cascade` as well. Origin: `print-check-cascade`
  pre-push verification, 2026-10-25.
- **EN-103** (api tests): only `isApiDocsEnabled` is tested; nothing
  automated checks that `apps/api/src/main.ts` mounts Swagger only when it
  returns true, so a regression that mounts it unconditionally would pass CI.
  A bootstrap-level test (`/docs` 404 with `NODE_ENV=production`, 200 with
  `API_DOCS_ENABLED=true`) would cover the deployment spec's scenarios. The
  behaviour behind the real Caddy proxy was also not checked; a one-time
  `curl -i https://<SITE_ADDRESS>/api/docs` and `/api/docs-json` after the
  next deploy would confirm it. Origin: `td-40-api-docs` pre-merge review
  (#287), 2026-10-26.
- **EN-106** (security): the Content Security Policy in `apps/web/Caddyfile`
  has no `report-to`/`report-uri`, so a violation in production (a page the
  policy breaks) is seen only in that user's console. The QR page
  (`ElementQrCode.tsx`) and the print flow were not exercised under the
  policy in a browser. Also, `zod-config.test.ts` checks the jitless flag
  but not that `main.tsx` imports `./zod-config` first, which only a comment
  guards. Origin: `en-94-security-headers` pre-push review (#289),
  2026-10-26.
- **EN-107** (delivery): after EN-95, CI's Postgres service image
  (`.github/workflows/ci.yml`, `image: postgres:18-alpine`) is still a
  floating tag, and no Dependabot ecosystem updates workflow service images,
  so integration tests can run on a different Postgres build than dev and
  production. One follow-up as well: confirm on Dependabot's first run that
  it lists both `docker-compose.yml` and `docker-compose.prod.yml`, opens
  one postgres PR for both, and whether grouped PRs keep the
  `build(deps)` prefix (GitHub's reference says a group's identifier sets
  their branch and title). How Dependabot PRs are reviewed (CLAUDE.md asked
  for a fresh review before every merge, and their titles do not follow
  `PR N/M`) was decided by `dependabot-review-rule` (PR #341): see the
  "Dependabot exception" in CLAUDE.md. Origin: `en-95-pin-base-images`
  pre-push review (#290), 2026-10-26.
- **EN-122** (API): `logoFileMissingError()` lives in
  `logo-file.interceptor.ts` and the controller imports it from there, so
  an error factory sits in the interceptor's file. Fine for two callers; a
  small `logo-errors.ts` in the same folder would be the cleaner home if a
  third one appears. Evidence:
  `apps/api/src/modules/organization-profile/presentation/`. Origin:
  `en-115-logo-interceptor` (PR #304) pre-push review, 2026-10-30.

- **EN-123** (deploy): `restore` copies the owner and mode of the archive's
  `./` entry to `/files`, and excludes `./.restore.partial` from it. Both
  assume the archive was made like the script's own (`tar -C /files .`).
  An archive built by hand without that root entry would set `/files` to
  root, mode 755, so the API could no longer write there, and one without
  the `./` prefix would keep a `.restore.partial` it holds. Checking for the
  root entry first would close it, if hand-made archives ever become a
  documented input. Evidence: `deploy/postgres-backup.sh` (`restore`).
  Origin: `en-117-restore-files` (PR #305) pre-push review recheck,
  2026-10-30.

- **EN-128** (web tests): tighten the TD-43 CSS tests in
  `apps/web/src/styles/index-css-print-status-region.test.ts`. The print
  reset check rejects a re-scope to `main >` but not to a descendant
  selector such as `.sf-main .sf-status-region:empty`; the grid rule check
  `/margin:\s*0/` would also accept `margin: 0 auto`. The grid rule covers
  only direct children of `.sf-form` and `.sf-panel` (noted in its CSS
  comment), so a StatusRegion nested deeper in a grid, or placed in another
  grid container, would double the gap again with no test failing; a
  rendered layout test would need Playwright (TD-32). Origin:
  `td-43-status-region-grid-gap` (PR #315) pre-merge review, 2026-10-31.

- **EN-130** (web tests): walk the EN-127 round trip in one router session.
  The spec scenario "Coming back shows the current logo" is pinned per
  component: each preview gets a fresh URL on mount and after an upload,
  with a mocked clock. No test renders the profile and the logo page under
  one router, uploads, goes back and checks the profile's preview URL
  changed. It was checked in the browser for PR #316. Origin:
  `en-127-logo-page` (PR #316) native review, 2026-11-01.

- **EN-131** (web): warn before reloading or closing the tab with unsaved
  edits on the organization profile. EN-129's leave guard only catches
  in-app navigation; a reload or a closed tab still drops the edits without
  a word. A `beforeunload` handler (the browser's own prompt, its text not
  ours) would cover it. Origin: `en-129-unsaved-changes-guard` (PR #317), 2026-11-01.

- **EN-132** (web): `App` creates its data router in a `useState`
  initializer, which `<StrictMode>` runs twice in development; the discarded
  router stays subscribed to `popstate`. Harmless (no loaders, never
  rendered, dev only). React Router's documented pattern is a module-level
  `createBrowserRouter(...)`; that would create a browser router whenever a
  test imports `App.tsx`, which is why it was not moved. Origin:
  `en-129-unsaved-changes-guard` pre-push review, 2026-11-01.

- **EN-133** (web): on the organization profile, a nav link clicked while
  a save is in flight opens the leave dialog; if the save then succeeds,
  the form is clean but the dialog stays open until the admin chooses
  (either choice still works). Polish: call `proceed()` when the form turns
  clean while blocked. Related: for one effect pass after a save resolves,
  `useBlocker` still holds the dirty check (it installs the new one in an
  effect), so a click in that window would still ask; the "after the edits
  were saved" test flushes effects first and no test pins the window.
  Origin: `en-129-unsaved-changes-guard` pre-push review, 2026-11-01; window
  note from the PR #317 native review.

- **EN-134** (web): since the data router (EN-129), a render error that
  escapes the page-level boundaries (`AppLayout`, `ProtectedRoute`) shows
  React Router's built-in "Unexpected Application Error!" screen instead of
  unmounting the app to a blank page. Give the catch-all route in `App.tsx`
  an `errorElement` with the app's own, translated message. Origin:
  `en-129-unsaved-changes-guard` (PR #317) pre-merge review, 2026-11-01.

- **EN-135** (web tests): the EN-129 leave guard is pinned for the back
  button but not for forward. Both are POP navigations through the same
  blocker, so the gap is small. Origin: `en-129-unsaved-changes-guard` (PR
  #317) pre-merge review, 2026-11-01.

- **EN-136** (api tests): the in-memory `RefreshTokenStore.exchange`
  (`apps/api/src/modules/auth/application/services/testing/`) claims the
  consume before awaiting `create`. If that `create` fails, a concurrent
  exchange may already have won the grace exchange on the briefly consumed
  token, leaving a grace successor on a token that ends up unconsumed. The
  Prisma adapter cannot reach this (the row lock makes the second UPDATE
  wait for the first transaction). No test hits it today. Serialize
  exchanges per token id in the fake, or note the gap. Origin:
  `td-5-refresh-token-rotation` (PR #318) native review, 2026-11-01.

- **EN-137** (api): tidy the refresh-token rejection reasons and docs. A
  logout that commits between `findByHash` and `exchange` makes both
  exchanges return false (they require `revokedAt: null`), and
  `RefreshSessionsService.rotate` reports it as `superseded`, not `revoked`;
  the client is refused either way, but reason counts would mislabel it,
  and no service-level test covers that path. The `exchange` port comment
  says false only means "another request got there first", omitting the
  revoked case. `auth.config.ts` inlines the env lookup for
  `REFRESH_TOKEN_REUSE_GRACE` instead of sharing a `durationFromEnv` helper
  with the two TTLs. Origin: `td-5-refresh-token-rotation` (PR #318) native
  review, 2026-11-01.

- **EN-138** (api): refresh follow-ups from the TD-5 PR 2/3 native review.
  `RefreshSessionUseCase` looks the token up (`ownerOf`), reads the user and
  signs an access token before `rotate()` decides validity, so a replayed,
  expired or revoked token costs a user read and a JWT sign before its 401
  (bounded by the refresh rate limit); `ownerOf` could return null for a
  token that cannot be exchanged, at the cost of repeating `rotate()`'s
  rules. The two refresh e2e suites (`refresh.e2e-spec.ts`,
  `refresh-rate-limit.e2e-spec.ts`) each carry their own
  `InMemoryTokenDenylist` and env save/restore loop; a shared test helper
  would keep them from drifting. Origin: `td-5-refresh-token-rotation` PR
  2/3 native review, 2026-11-01.

- **EN-139** (api): two notes on `RefreshThrottlerGuard` (TD-5). Its
  `handleRequest` replaces the limit, window and block duration of every
  named throttler the module registers; today there is only one (login's),
  but a second module-wide throttler would be silently overwritten for the
  refresh route. Check `requestProps.throttler.name`, or say so in a
  comment. Its unit spec restores the `ThrottlerGuard.prototype` spy at the
  end of the test body, so a failing assertion would leave it mocked for
  later tests in the worker; restore it in `afterEach`. In `auth.controller.spec.ts`, the type alias `RefreshRequest` also casts logout requests; a neutral name such as `ControllerRequest` reads better. Origin:
  `td-5-refresh-token-rotation` PR 2/3 native review, 2026-11-01.

- **EN-141** (web): two notes on the silent refresh (TD-5 PR 3/3 native
  review). `apiFetch` refreshes and retries on any 401 under the current
  session, auth routes included; today login and logout use raw `fetch`,
  so nothing is affected, but a future call that answers 401 for wrong
  credentials through `apiFetch` would rotate the refresh token and replay
  the request; exclude such paths if one appears. `refreshSession<T>()`
  casts the shared in-flight `Promise<unknown>` to `T` without checking it;
  `AuthProvider` relies on that assertion for `AuthUser`. Origin:
  `td-5-refresh-token-rotation` PR 3/3 native review, 2026-11-02.

- **EN-151** (ci): The "No test or seed helpers in API build" step matches
  `*/seeding/*` anywhere in `apps/api/dist`, not only the emitted
  `shared/seeding`. No production module is named `seeding` today, so it
  has no false positive, and `testing/` is matched the same broad way. If a
  production `seeding` module is ever added, anchor the pattern to
  `apps/api/dist/shared/seeding/*`. Origin: `en-150-build-guard-gaps`
  (PR #332) native review, 2026-11-04.
- **EN-153** (delivery): Dependabot reported "No update needed" for
  `node 24-bookworm-slim` and `caddy 2-alpine` on a manual run (2026-11-05,
  job "docker in /apps/api, /apps/web - Update #1683768849"), while the tags
  pointed to newer digests (`node` `01d566e8…`, `caddy` `f6228111…`) than
  the ones pinned on `main` (`55fb5f5a…`, `eb4d35b7…`), checked with
  `docker buildx imagetools inspect`. The same job warned "Skipping update
  group for 'base-images' as it does not match any allowed dependencies".
  The 2026-11-02 run did open digest PRs (#324, #325), which Dependabot
  closed as "no longer updatable" after a rebase request. Cause unknown.
  Check the next weekly run: if it again skips a digest that changed,
  investigate (for example the `base-images` group warning) or fall back to
  manual digest bumps. Until it is settled, the base images can fall behind
  without notice. Origin: Dependabot PR review (PR #340), 2026-11-05.
- **EN-154** (delivery): The npm entry in `.github/dependabot.yml` has no
  `open-pull-requests-limit`, so the default of 5 open PRs applies. One
  grouped minor/patch PR plus several individual majors can reach it, and
  Dependabot then holds back later updates without notice. If that happens,
  raise the limit or group majors too. Origin: `td-32-dependabot-npm-actions`
  (PR #344) fresh review, 2026-11-06.

- **EN-155** (delivery): The npm version that writes `package-lock.json` is
  not pinned in practice. Root `package.json` declares
  `"packageManager": "npm@10.8.2"`, but nothing enforces it (no corepack in
  CI or the Dockerfiles), Node 24 ships npm 11, and local development uses
  npm 11.17. Each npm version can rewrite some lock flags differently. The
  first example, the `@types/react-dom` entry flipping between `"dev": true`
  (Dependabot) and `"devOptional": true` (local npm 11.17), stopped once
  react-router 8.5 declared it an optional peer (Dependabot PR #349): both
  sides now write `"devOptional"`. The unpinned npm version that caused it
  remains. It has no effect today because CI and both Dockerfiles
  run `npm ci` without `--omit`. Update `packageManager` to the npm actually
  used and decide whether to enforce it (corepack, or an equivalent check).
  Origin: Dependabot PR #360 fresh review (W-1), 2026-11-07. Registered in
  PR #362.

- **EN-156** (api tests): `prisma-unique-violation.spec.ts` pins the
  `isUniqueViolationOf` contract with two gaps. Name precedence is proved in
  one direction only (a non-matching name with matching columns returns
  false); add the inverse, a matching name with non-matching columns returns
  true, so an implementation that needs both to agree fails. The
  unreadable-shape table also skips type-malformed payloads (`fields` as a
  string, `index` as a non-string, a primitive `constraint`). Origin:
  `td-49-prisma-constraint-index` (PR #363) Gentle AI reliability review,
  2026-11-07.

- **EN-157** (api tests): `refresh-rate-limit.e2e-spec.ts` checks the refresh
  limit's `Retry-After` only with `toBeDefined()`. Unlike the login e2e
  (`toBe('1')`, `/^\d+$/`), nothing pins it as a plain number of seconds or
  checks its value, so a throttler upgrade that changed that header would
  pass every refresh test. Add a numeric check and the expected value.
  Pre-existing, not caused by the upgrade. Origin: `throttler-6-7` (PR #365)
  fresh review W-1, 2026-11-08.

- **EN-158** (api docs): A comment in
  `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`
  says "6.4.0 does not re-export `ThrottlerStorageRecord`". It is still true
  in 6.7.1, but the version is stale after the upgrade; reword it to
  "`@nestjs/throttler` 6.x". Origin: `throttler-6-7` (PR #365) fresh review
  S-1, 2026-11-08.

- **EN-159** (api): `toLogoUploadSetupError` in
  `apps/api/src/modules/organization-profile/presentation/logo-file.interceptor.ts`
  turns every `UnsupportedMediaTypeException` from multer's interceptor into
  400 `LOGO_UPLOAD_INVALID`, not only the one `@nestjs/platform-express` 12
  raises for a multipart type other than form-data (message `Unsupported
content type`). Today that is the only 415 it raises, but a future one
  would be recoded silently. Match the message too, or say in the comment
  that every 415 is translated on purpose. Origin: `nest-12` (PR #370)
  Gentle AI readability and reliability reviews, 2026-11-08.

- **EN-160** (api tooling): The six Jest scripts in `apps/api/package.json`
  each repeat `node --experimental-vm-modules ../../node_modules/jest/bin/jest.js`,
  which depends on npm hoisting `jest` to the workspace root. Put the flag and
  the path in one place (one shared script, or `NODE_OPTIONS` through
  `cross-env`), so a hoisting change breaks one line, not six. Origin:
  `nest-12` (PR #370) Gentle AI readability review, 2026-11-08.

- **EN-163** (web, FR-007): Scan an element's QR label with the device
  camera during a review session, as an alternative to typing the code.
  A "Scan" control fills the same code field, so manual entry stays the
  fallback and the API and data model do not change. Needs a spec change
  in `review-session-ui`: the overview ("Codes are typed, not scanned"),
  the out-of-scope list ("camera / QR scanning") and the requirement
  "Manual Code Entry Only", which forbids opening a camera, asking for
  camera permission, or any scanning library. Update the FR-007 status
  ("no camera scanning") when it ships. Camera access (`getUserMedia`)
  needs a secure context (production is HTTPS through Caddy; a phone on
  the LAN dev server over HTTP is not). The native `BarcodeDetector` API is
  not enough on its own: it is unsupported in Firefox and disabled by
  default in Safari, so in practice no browser on iPhone has it (iOS
  browsers use WebKit), and Chromium wires it up only where the OS has a
  decoder (Android, macOS, ChromeOS). Plan a polyfill (for example a
  ZXing-based one) behind feature detection. Also correct the "on web (no
  native camera)" premise in `docs/architecture/domain-model-inspections.md`.
  Independent of EN-164. Origin: product discussion, 2026-11-09.

- **EN-164** (feature): Attach photos to a review, captured with the device
  camera or chosen from files. On mobile,
  `<input type="file" accept="image/*" capture="environment">` opens the
  camera without a permission prompt; desktop browsers ignore `capture`
  and show a file picker. Not in any FR today, so it starts as a new FR
  with its own slice (ADR-006). Needs a spec change in `review-session-ui`:
  photos and attachments are out of scope, "Manual Code Entry Only"
  forbids camera capture and device-capture libraries, and the field flow
  forbids "an attachment/photo control". Open decisions: what a photo
  belongs to (session, element or answer); storage, size limits and
  client-side compression, starting from the existing `LocalFileStorage`
  port (ADR-012, used for the organization logo); who may view a photo
  (ADR-011 scopes); backup size and retention (each dump already archives
  the `api-files` volume since TD-42, so photos grow that archive); and
  whether photos appear in the review document (FR-010). Independent of
  EN-163. Origin: product discussion, 2026-11-09; kept out of the MVP
  unless clients or regulations require photo evidence.

- **EN-165** (web): two notes on the "Cannot reach the server" retry
  (`session-restore-unavailable`). `AuthProvider`'s session check turns
  every unavailable cause (network error, 429, 5xx, unavailable refresh,
  unreadable 200) into the same flag and drops the error, so a malformed
  `/auth/me` answer cannot be told apart from an outage; log the status or
  error before setting it. And "Try again" reruns the whole check,
  refresh included: when the mount-time refresh consumed the token but
  timed out (the stalled-answer case in EN-142), the retry presents the
  spent cookie outside the grace window, revokes the family and ends on
  `/login`. A reload did the same before this change, so it is not a
  regression, but the retry makes it likelier. EN-142's idempotent replay
  would have fixed this and EN-142's stalled-answer case, and was dropped, so this half is an accepted
  limitation. Origin: `session-restore-unavailable` Gentle AI
  review (resilience lens), 2026-11-09.

- **EN-167** (web tests): the Web Locks fake in `apps/web/src/api/client.test.ts`
  (`installFakeLocks`) reports only the refresh lock as held and an empty
  `pending` list, so it never models a lock handoff between tabs on its own;
  the pending-only path is covered by one `mockResolvedValueOnce`. It also
  grants shared and exclusive requests one at a time and reports every hold
  as exclusive, so the release of all shared waiters together is never
  exercised. Make `query()` report queued `request` callers as pending with
  their mode, and grant shared requests together, so the sibling-call,
  handoff and shared-wait tests run against realistic snapshots. Origin:
  `en-142-wait-other-tab` Gentle AI review (reliability lens), 2026-11-09.

- **EN-168** (deploy tests): `deploy/test-offsite-copy.sh` creates its
  backup fixtures inside the rclone image it tests (`in_volume`, line 82,
  used at lines 96-99), so they
  belong to whatever user that image runs as. If a future rclone image ran
  as a non-root user, the test would still pass while production, whose
  `./backups` files are root-owned with mode 600, could no longer read them.
  Create the fixtures as root (`--user 0`) and run the script as the
  image's default user, or assert that the image runs as uid 0. Today's
  1.76.0 image runs as root, like 1.75.2. Origin: Dependabot PR #381
  (rclone 1.76.0) fresh review, 2026-11-09.
- **EN-169** (api tests): since uuid 14 (ESM-only, no `require` export),
  the api Jest runs load it only because every Jest script in
  `apps/api/package.json` (lines 20-27) passes `--experimental-vm-modules`.
  Without the flag, Jest 30 fails with "Must use import to load ES Module"
  on `uuid/dist-node/index.js`. Nothing records that dependency, so the flag
  could be removed as unused. Add a note next to the scripts or a test that
  fails with a clear message when the flag is missing. The built API is not
  affected: Node 24 loads uuid through `require(esm)`. Origin: Dependabot PR
  #385 (uuid 14.0.3) fresh review, 2026-11-10.
- **EN-170** (web tests): `@testing-library/jest-dom` 7.0.1
  (`types/vitest.d.ts`) augments vitest's `Assertion<T>` with one type
  parameter, while vitest 5 declares `Assertion` with two. With
  `--skipLibCheck false`, `tsc -p apps/web/tsconfig.app.json` reports TS2428
  three times (none on vitest 4, per the #386 review). It is masked by
  `skipLibCheck: true` in `apps/web/tsconfig.app.json` (line 9), and matcher
  typing is unaffected: per the #386 review, misspelled matchers and wrong
  arguments still fail the typecheck exactly as on vitest 4. Keep
  `skipLibCheck` on until a jest-dom release supports vitest 5 (upstream PR
  testing-library/jest-dom#742, "feat: support vitest 5"), then bump it and
  recheck. Origin: Dependabot PR #386 (vitest 5.1.0) fresh review,
  2026-11-10.
- **EN-172** (tooling): migrate to TypeScript 7 (the native compiler). Not
  possible as a plain bump today. TypeScript 7.0 "does not ship with an
  API" (TypeScript 7.0 release post), so the tools that import the compiler
  API cannot use it: `ts-jest` (peer `typescript >=4.3 <7` in 29.4.15),
  `ts-node`, `typescript-eslint` (peer `typescript >=4.8.4 <6.1.0` in
  8.72.1) and `@nestjs/cli` (12.0.12 depends on `typescript ~6.0.2`, so it
  would keep a nested TypeScript 6 and not compile with 7). It
  also turns options deprecated in 6.0 into errors: CI failed on
  `packages/validation/tsconfig.json` (`moduleResolution: "node"`, TS5108),
  and the api Jest configs (`apps/api/package.json`,
  `apps/api/test/jest-e2e.json`, `apps/api/test/jest-integration.json`) set
  `moduleResolution: "node"` and `ignoreDeprecations: "6.0"`, as
  `packages/validation/tsconfig.json` does. TypeScript 7 also stops
  `skipLibCheck` from hiding conflicting declarations, so EN-170 must be
  fixed first. The official interim path is npm aliases (`typescript` →
  `@typescript/typescript6`, TypeScript 7 as `@typescript/native`). Revisit
  when those tools support TypeScript 7 or its new 7.1 API. Dependabot was
  told to ignore TypeScript 7.x on PR #387, so it will next propose 8.x.
  Origin: Dependabot PR #387 (typescript 7.0.2), 2026-11-10.

- **EN-181** (api): `auth.module.ts` builds the throttle key hasher twice,
  `createThrottleKeyHasher(getThrottleKeySecret())` in the
  `ThrottlerModule.forRootAsync` factory and in the `LOGIN_FAILURE_LIMITER`
  factory. Both counters must use the same secret, but nothing ties the two
  calls together; a later change to one (for example key rotation) could
  drift silently. Build it once, for example as a `THROTTLE_KEY_HASHER`
  provider that the limiter factory injects and that the throttler factory
  reaches through `forRootAsync` `imports`/`inject`. This also closes a
  test gap: `app.module.spec.ts` "refuses to boot without
  THROTTLE_KEY_SECRET" still passes if only one factory stops reading the
  secret (the integration test "keys both counters" catches it). Origin:
  `en-6-throttle-key-hmac` native review, finding `R2-001`, and fresh
  review `S-2`, 2026-11-12.

- **EN-182** (api): `readSecret()` (EN-180) checks length, not entropy: a
  32-character predictable value (one repeated character, a phrase) still
  passes, so an operator who ignores `openssl rand -hex 32` can still pick
  a brute-forceable `JWT_SECRET` or `THROTTLE_KEY_SECRET`. The short-length
  error also prints the actual length (never the value), and `length`
  counts UTF-16 code units, not characters, which only matters for
  non-ASCII secrets. Reliable entropy checks are hard, so the realistic
  option is rejecting obvious cases (a single repeated character, a
  value shorter than 32 bytes once decoded). Evidence:
  `apps/api/src/modules/auth/infrastructure/config/secret.config.ts`.
  Origin: `en-180-secret-strength` native review `R1-001` and fresh review
  `S-3`, 2026-11-12.

## Done

- **EN-180** (api): `JWT_SECRET` and `THROTTLE_KEY_SECRET` now need at
  least 32 characters and no surrounding whitespace, and
  `THROTTLE_KEY_SECRET` must differ from `JWT_SECRET`; otherwise the API
  refuses to start (shared `readSecret`, deployment spec "Secret
  strength"). Done in `en-180-secret-strength` (PR #TBD). Original entry:
  `getThrottleKeySecret()` refuses only a missing or empty
  `THROTTLE_KEY_SECRET`. A short or whitespace-only secret, or one equal to
  `JWT_SECRET`, is accepted, although the docs ask for 32 random bytes kept
  apart from `JWT_SECRET`. With table or log access and one known email or
  IP, a weak secret can be brute-forced offline, which undoes EN-6. Enforce
  a minimum length (and reject a value equal to `JWT_SECRET`) at boot; this
  changes the deployment spec. `JWT_SECRET` has no minimum either, so
  consider both together. Evidence:
  `apps/api/src/modules/auth/infrastructure/config/throttle-key.config.ts`.
  Origin: `en-6-throttle-key-hmac` native review, findings `R1-001` and
  `R3-002`, 2026-11-12.

- **EN-6** (api): throttle counter keys are now HMAC-SHA-256 under the new
  required `THROTTLE_KEY_SECRET` (per client key and per email, stored and
  logged), and the API refuses to boot without it. Old unkeyed rows expire
  on their own. Done in `en-6-throttle-key-hmac` (PR #408). Original entry:
  Hash the throttle key with an HMAC (secret-keyed) instead of
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

- **EN-179** (web): edge cases of the lock-holder check added by EN-177
  (`requestLockWithin`, `lockHolder` in `apps/web/src/api/client.ts`). (A
  lock held only in shared mode is followed by the lowest shared holder's
  `clientId`, like a moving queue; tests now pin that changing shared
  holders keep the refresh waiting, that the same shared holder at two
  checks, listed in any order, gives up, and that the lowest id decides.) (A `query()` that hangs adds up
  to `LOCK_QUERY_TIMEOUT_MS`, 1 s, to each check, and the next check is
  due 9 s after it decides; the spec now says each check can decide up to
  1 second late and that the delay carries over, rather than starting each
  query early, which would make a normal check decide before 9 s.)
  Done in `en-179-lock-edges`, PR #407. Origin: `en-177-lock-progress`
  (PR #405) Gentle AI review, 2026-11-11.

- **EN-178** (web): two defensive branches no test could reach.
  (`withRefreshLock` mapped an `AbortError` to `ApiError(0)` only while the
  lock was still queued, through a `granted` flag; `postRefresh` turns every
  error of a granted refresh into `ApiError`, so the flag guarded an
  impossible case and is gone.) (`LoginPage` had stopped treating an
  `ApiError` with status 0 as unavailable, because `AuthProvider.login`
  never throws one; it does again, so such an error can never read as wrong
  credentials, and the mapping now lives in `pages/login-error-key.ts` with
  a unit test covering status 0, 4xx, 429, 5xx, a network failure and an
  unreadable answer.) Done in `en-178-defensive-branches`, PR #406. Origin:
  `en-174-lock-deadline` (PR #402) and `login-unavailable` (PR #403)
  Gentle AI reviews, 2026-11-11.

- **EN-177** (web): several tabs loading at once could show "Cannot
  reach the server" instead of signing in. The load-time session check
  (`AuthProvider`) calls `refreshSession()` directly after a 401 from
  `/auth/me`, without first waiting for another tab's refresh, so each tab
  queues its own exclusive refresh. Since `en-174-lock-deadline` (PR #402)
  a refresh not granted the lock within 9 s is abandoned as unavailable,
  and that 9 s covers every refresh queued ahead of it: with five tabs
  restored together and an API taking about 2.5 s per refresh, the fourth
  and fifth show the unavailable page and need "Try again". The wait
  cannot tell a frozen tab from a long legitimate queue. Fixed in
  `en-177-lock-progress`, PR #405: every 9 s the waiting refresh checks
  which tab (Web Locks `clientId`) holds the lock and keeps waiting while
  it changes, giving up only when the same tab has held it for 9 s, or
  when the browser does not report the holder. A call waiting for another
  tab's refresh keeps its fixed 9 s cap and then refreshes itself. Two
  refreshes in a row from the same other tab would look like one holder,
  but a tab has at most one refresh in flight and the queue is first in,
  first out, so its next refresh queues behind this one. Origin: `en-174-lock-deadline` (PR #402) fresh review,
  2026-11-11.

- **EN-176** (api): costs and partial failures of the session check added
  by EN-174. (`AuthenticatedGuard` made three database round trips in a
  row on every authenticated request; the jti and session checks now run
  together. And a logout whose server-side revocation failed answered 500
  without clearing the cookies, so the browser kept the session; it now
  clears them and still answers 500.) (`PrismaRefreshTokenStore.isFamilyEnded`
  sorts the family's rows by `revokedAt`, up to about 700 consumed tokens
  per family. Measured on the dev database with `EXPLAIN ANALYZE` in a
  rolled-back transaction, a 701-row family among about 100 000 rows: the
  current query uses the `familyId` index and a top-N heapsort (25 kB) in
  0.40 ms; two `EXISTS` checks instead took 0.89 ms. No change. The guard's
  two checks at once take two pooled connections for under a millisecond
  each; reopen if pool saturation shows up.) All done or closed in
  `en-176-guard-logout`, PR #404. Origin: `en-174-session-revocation`
  (PR #401) Gentle AI review, 2026-11-11.

- **EN-175** (web): the login page showed "Invalid email or password." when
  the API could not be reached: `LoginPage.tsx` mapped every login error
  other than 429 to `auth.loginFailed`, including a network failure (the
  login `fetch` rejects) and a 5xx, so a user with the right password was
  told it was wrong while the API was down or restarting. The
  authentication spec's scenarios named only the 401 and 429 cases, and
  its requirement text ("one generic error on server rejection") could be
  read to cover a 5xx. The login page now shows "Cannot reach the server.
  Please try again in a moment." (EN, ES and CA) for a network failure, a
  5xx or an unreadable answer, and the spec names that case; done in
  `login-unavailable`, PR #403. Origin: `en-142-login-waits-refresh`
  (PR #398) browser check, 2026-11-11, with the dev API down.

- **EN-174** (web/api): leftovers of EN-142's logout and login waits.
  (A refresh that another tab started after `settleRefresh` checked the
  lock, or one still running when the 9 s cap ended the wait, could land
  after the logout with a new access token, a jti the logout never saw,
  and keep the session usable for up to `JWT_EXPIRES_IN`. Done in
  `en-174-session-revocation`, PR #401: every access token names its
  refresh session (`sid` claim), logout ends that session, and
  `AuthenticatedGuard` rejects any access token of an ended session.)
  (`settleRefresh` waited for this tab's own refresh without a cap,
  including its time queued for the cross-tab Web Lock, so a tab frozen
  while holding the lock could block login and logout. Capping that wait
  was not safe for login: the late refresh would belong to the previous
  session, which the login does not revoke, and could overwrite the new
  session's cookies. Instead the refresh itself is bounded: a refresh not
  granted the lock within 9 s is abandoned before it sends anything and
  counts as unavailable, and a call waiting for another tab's refresh
  stops after 9 s too. Done in `en-174-lock-deadline`, PR #402.) Origin:
  `en-142-login-waits-refresh` (PR #398) fresh review and
  `en-142-logout-other-tabs` (PR #399), 2026-11-11.

- **EN-142** (web): silent-refresh follow-ups from the TD-5 PR 3/3
  pre-push review. (A tab that waited on the `sf-manager.refresh` Web Lock
  no longer rotates once more: it retries with the other tab's cookies
  first, done in `en-142-wait-other-tab`, PR #388.) (The idempotent
  replay on the API for a refresh whose answer stalls past 10 s after the
  token was consumed was dropped on 2026-11-09, `en-142-replay-decision`,
  PR #380: the API stores only token hashes, so a replay would have to
  honour the spent token while its successor is unused, which lets a thief
  holding it keep the session until the real client next refreshes and
  delays ADR-011's reuse detection. The case is rare and costs one login;
  reopen with production evidence.) (The load-time case, where a 5xx or network error from the
  restore showed the login page even with a valid refresh cookie, was fixed
  by `session-restore-unavailable`.) (A refresh that the load-time session
  check started before a login is shared single-flight, so it could finish
  after the login and its `Set-Cookie` overwrite the login's cookies;
  `session-check-tidy` (EN-166) only stopped a superseded check from
  starting one. Login now cancels the check and waits for a refresh in
  flight (`settleRefresh`) before calling the login endpoint, done in
  `en-142-login-waits-refresh`, PR #398. Accepted trade-off from its fresh review: a
  signed-in user who opens `/login` while the check is pending and then
  fails a login is treated as signed out (protected pages redirect to
  `/login`, or show it instead of "Cannot reach the server") until a
  reload.) (The test-quality and duplicated-constant follow-ups were done in
  `en-142-web-hygiene`, PR #379.) (Logout waited only for this tab's refresh in flight and for other tabs' refreshes a call here was waiting for; a refresh committed in another tab just before the logout could still set its cookies after it, and its new access token, whose jti the logout never saw, kept the session usable for up to `JWT_EXPIRES_IN`. `settleRefresh` now also waits, up to 9 s, for any tab's refresh it sees on the `sf-manager.refresh` Web Lock, done in `en-142-logout-other-tabs`, PR #399.) (When the session changes during a refresh that turns out unavailable, the caller now gets the 401 the spec names instead of the refresh's `ApiError` (0 or 5xx), done in `en-142-stale-unavailable`, PR #396.) (In a browser without Web Locks (Safari < 15.4) a third tab refreshing at once gets 401 `superseded`, which the web treats as a refusal although the cookie is still valid; a reload restores the session. Closed as outside the supported browsers on 2026-11-11, `en-142-safari-no-locks`, PR #397: the web declares no browser support policy apart from its build target, and `apps/web/vite.config.ts` sets no `build.target`, so Vite compiles for its default `baseline-widely-available` (Chrome 111+, Edge 111+, Firefox 114+, Safari 16.4+), all of which have Web Locks. That target sets the syntax the code is compiled for, not a gate: an older browser may still load the app, but it is unsupported; and Web Locks exist only in a secure context, which production always is (Caddy serves HTTPS) and localhost is too. Fixing it would mean exposing the `superseded` reason in the refresh 401, which is the same bare 401 for every reason on purpose, or retrying after every refusal. Reopen if `build.target` is lowered below Safari 15.4 or the web is served over plain HTTP on another host.) (The client-deadline finding was done in `en-142-refresh-deadline`, PR #394: the refresh deadline, which counts from the first send while the API grace starts at `rotatedAt`, is now 9 seconds instead of 10, leaving a second of margin.) Origin:
  `td-5-refresh-token-rotation` PR 3/3 pre-push review, 2026-11-02. All items done or closed
  by 2026-11-11; what was left became EN-174, done in
  `en-174-lock-deadline` (PR #402).

- **EN-173** (web/api config): the web refresh deadline
  (`REFRESH_TIMEOUT_MS`, 9 s, `apps/web/src/api/client.ts`) is a fixed
  number, while the API's `REFRESH_TOKEN_REUSE_GRACE` is configurable (10 s
  by default; values such as `5s` are accepted, and `0s` turns the grace
  off). An operator who sets the grace below about 10 s brings back the
  late-retry revoke that `en-142-refresh-deadline` (PR #394) fixed. The
  README row for `REFRESH_TOKEN_REUSE_GRACE` now says that the web gives up
  on a refresh after a fixed 9 s and assumes a grace of at least 10 s.
  Deriving the web deadline from the configured grace was not done: the API
  would have to expose its configuration to the web for one rarely changed
  value. Done in `en-173-grace-note`
  (PR #395), 2026-11-11.

- **EN-171** (validation tooling): `packages/validation` now declares
  `vite` (`^8.3.6`, the version `apps/web` uses) as a devDependency, since
  vitest 5 lists it only as a peer; before, its tests ran only because the
  `vite` of `apps/web` was hoisted to the root `node_modules`. The lockfile
  keeps vite 8.3.6 and only drops the `"peer": true` marks on the optional
  rolldown and lightningcss platform packages. Done in `validation-vite`
  (PR #393), 2026-11-10.

- **EN-166** (web): the load-time session check in `AuthProvider` is
  cancelled when superseded: a login, a newer check ("Try again") or an
  unmount aborts its `/auth/me` request, and a superseded check that still
  gets a 401 no longer calls `refreshSession` with the pre-login cookie. The
  mount effect returns that cancel as its cleanup (unmount, StrictMode's
  discarded first run). `HTTP_SERVER_ERROR` is now `HTTP_SERVER_ERROR_MIN`
  in `AuthProvider` and `api/client`; the `SESSION_CHECK_TIMEOUT_MS` comment
  says it covers "Try again" and is restated in the authentication spec. An
  `App` test pins "another 4xx signs the visitor out" through the real
  `ProtectedRoute`. A refresh the check had already started before a login
  is shared single-flight and still finishes; that case belongs to EN-142.
  Done in `session-check-tidy` (PR #377), 2026-11-09.

- **EN-162** (web tests): `App.test.tsx` now renders the shipped default
  `App` (data router: `createBrowserRouter` and `RouterProvider` from
  `react-router/dom`) against the jsdom URL, for `/login` and for an unknown
  path with and without a session, which pins the router wiring. Both entry
  points render the same in jsdom, so the `react-router/dom` import is pinned
  by a `no-restricted-imports` rule in `apps/web/eslint.config.mjs` instead.
  Done in `not-found-route` (PR #374), 2026-11-09.

- **EN-161** (web): an unknown path renders a "page not found" view inside
  the authenticated layout (nav, localized message, link home) for any
  signed-in role, and redirects a visitor without a session to `/login`. A
  catch-all `*` route under `ProtectedRoute` in `AppRoutes`; spec
  `app-navigation` "An Unknown Path Shows a Not-Found Page". Done in
  `not-found-route` (PR #374), 2026-11-09.

- **EN-152** (api tests): The document/history-detail parity e2e in
  `apps/api/test/review-history.e2e-spec.ts` has a direct draft row,
  "document and history detail agree for technician, own draft session". It
  creates a draft, checks that both routes return 404 with the identical
  `REVIEW_SESSION_NOT_FOUND` body, and discards the draft in a `finally`.
  Done in `en-152-draft-parity-row` (PR #343), 2026-11-06.

- **EN-146** (api tests): `apps/api/test/auth.e2e-spec.ts` now hashes
  `ADMIN_PASSWORD` once in `beforeAll` and seeds users through file-level
  `seedUser(id, email)` and `seedAndLogin(id, email)` helpers, used by the
  admin seed, the TD-27 public no-lookup test and the live user check block.
  The file keeps its 12 tests, all passing. Done in
  `en-146-auth-e2e-seed-helper` (PR #333), 2026-11-04.

- **EN-150** (ci): The EN-149 build check, now "No test or seed helpers in
  API build", fails with an `::error::` annotation when `apps/api/dist` is
  missing, and also fails when the output contains a `seeding/` path, so a
  production import of `src/shared/seeding` is caught like one of
  `src/**/testing`. Verified by running the step's script on a missing,
  clean and leaking `dist`, and by importing a seeding file from `main.ts`:
  the build still passed and the check failed. Done in
  `en-150-build-guard-gaps` (PR #332), 2026-11-04.

- **EN-149** (api build): CI step "No test helpers in API build" runs after
  the build and fails, listing the files, when `apps/api/dist` contains a
  `testing/` path. It checks the emitted output, so it also catches a
  production import that pulls an excluded `src/**/testing` file back in.
  Verified by importing a testing helper from `main.ts`: the build still
  passed and the check failed. Done in `en-149-build-testing-guard` (PR #331),
  2026-11-04. EN-150 renamed the step to "No test or seed helpers in API
  build".

- **EN-148** (api tests): `withConflictRetry` now waits `baseDelayMs * n`
  (25 ms by default) before retry n, so a still-running concurrent
  transaction can finish instead of hitting the same cycle again, and its
  comment says that a transaction timeout (`P2028`), a dropped connection or
  any other error is not mapped to `TransactionConflictError` and is
  rethrown at once. Done in `en-147-conflict-retry-unit` (PR #329),
  2026-11-04.

- **EN-147** (api tests): `withConflictRetry` moved out of
  `prisma-user.repository.integration.spec.ts` into
  `users/infrastructure/persistence/testing/with-conflict-retry.ts`, with a
  unit spec that pins the retry branch CI never reaches: success on the
  first call, two conflicts then success (three calls, delays 25 and 50),
  the last conflict rethrown with no final wait, custom `attempts` and
  `baseDelayMs` honoured, and a non-conflict error rethrown without a
  retry. `sleep` is injectable, so the spec is instant.
  Mutating the bound, the rethrow or the delay fails it. Done in
  `en-147-conflict-retry-unit` (PR #329), 2026-11-04.

- **EN-145** (api tests): the `countActiveByRole()` soft-delete test now
  wraps its SERIALIZABLE `transactional()` call in a local
  `withConflictRetry` helper (three attempts). It retries only on
  `TransactionConflictError` and rethrows anything else and the last
  conflict; Postgres rolls the aborted transaction back, soft-delete
  included, so a retry starts clean. Checked by throwing a conflict after
  the soft-delete on the first attempt: the test passes with the retry and
  fails with one attempt. Done in `en-145-count-conflict-retry` (PR #328), 2026-11-04.

- **EN-144** (api tests): the `countActiveByRole() excludes soft-deleted
users` case now runs both counts and the soft-delete inside one
  `repository.transactional()` call (SERIALIZABLE), so both reads see the
  same snapshot and a MANAGER committed by another worker cannot shift the
  delta; it no longer depends on `--runInBand`. After the transaction it
  also checks through the root client that the soft-deleted row is gone
  from `findById`. Checked with a probe that
  inserts a MANAGER from a second connection between the reads: the old
  test failed (`Expected: 0, Received: 1`), the new one passes. Done in
  `en-144-scoped-manager-count` (PR #326), 2026-11-04.

- **EN-143** (api tests): `auth.config.spec.ts` now pins the two remaining
  branches of `assertIsOrigin`: an explicit default port
  (`https://app.example:443`, `http://app.example:80`) is rejected with a
  suggestion that omits the port, and a URL with an opaque origin
  (`file:///x`) is rejected without a suggestion. The no-suggestion cases
  compare the whole message, so a stray "did you mean" fails them. A
  wildcard or comma-separated `CORS_ORIGIN` booted before EN-140 and is now
  rejected; that is not a regression, because `cors` sends a string origin
  verbatim and browsers compare it exactly, so it never worked. Done in
  `en-143-assert-origin-tests` (PR #322), 2026-11-02.

- **EN-140** (api, docs): `apps/api/.env.example` lists the six refresh
  variables and `JWT_EXPIRES_IN` with their defaults (edited by the user;
  the agent cannot edit that file). `CORS_ORIGIN` must now be a serialized
  origin: a trailing slash, a path, upper-case letters or a non-URL stop the
  API at boot with an error naming the value and, when it can be derived,
  the expected origin (`authentication` spec, CORS Configuration). The
  refresh e2e suite now covers over HTTP the grace exchange and
  `superseded` (a second app booted with a 10 s grace), logout with both
  cookies, the revoked family of a deleted user and the refreshed JWT's
  `role` claim. Done in `en-140-refresh-leftovers` (PR #321), 2026-11-02.

- **EN-129** (web): the organization profile asks before any in-app
  navigation ("Change logo", a nav link, back/forward) while the form holds
  unsaved edits; cancelling keeps them, confirming leaves without saving.
  The app now runs on a data router (`createBrowserRouter`, one catch-all
  route rendering `AppRoutes`, no loaders or actions) so the page can use
  `useBlocker`. Reload and tab close are EN-131. Done in
  `en-129-unsaved-changes-guard` (PR #317), 2026-11-01.

- **EN-121** (deploy tests): the `BACKUP_RETENTION_DAYS=x` service case in
  `deploy/test-postgres-backup.sh` no longer waits out its 30-second
  `timeout` when the script wrongly starts its loop. A `sleep` placed first
  on `PATH` exits 99, so the loop fails right after its first cycle with
  "started its loop"; the timeout stays as a backstop against a hang. Done
  in `en-121-retention-loop-fast-fail` (PR #313), 2026-10-31.

- **EN-127** (web): the logo has a page of its own,
  `/organization-profile/logo`, which uploads and removes it. The profile
  page shows the logo, or says there is none, with a "Change logo" button
  (a button-styled link, like the page's other actions) to that page, and
  keeps to its data and its save button. Done in `en-127-logo-page` (PR
  #316), 2026-11-01.

- **EN-118** (deploy): closed without a change, by decision.
  `offsite-copy.sh pull` keeps overwriting a local backup of the same name
  with the bucket's copy. When restoring, the local file may be the damaged
  one and the bucket's copy should win, and the README's pull step is for
  restoring on a new server, whose `backups/` is empty. Backup names carry
  their timestamp and an upload never replaces a copy, so the same name is
  always the same backup. Revisit only if pulling into a populated directory
  becomes a normal step. Decided in `en-118-offsite-pull-overwrite` (PR
  #312), 2026-10-31.

- **EN-126** (API tests): the e2e rejection table now has one row for an
  SVG preceded by a no-break space (EN-124) and one for an SVG whose
  attribute is glued to the previous value (EN-125), so both rules are
  proven to return 400 `LOGO_UNSUPPORTED_FORMAT` over HTTP. Done in
  `en-126-svg-e2e-rejections` (PR #310), 2026-10-31.

- **EN-125** (API): SVG logo detection now requires each attribute of the
  `<svg>` root to be followed by XML whitespace, `>` or `/>`, as XML does,
  so `<svg width="10"xmlns="http://www.w3.org/2000/svg"/>` is rejected.
  Done in `en-125-svg-attribute-separator` (PR #309), 2026-10-31.

- **EN-124** (API): SVG logo detection now counts only XML whitespace
  (space, tab, CR and LF) before and inside the `<svg>` root tag, and
  accepts one byte order mark only at the very start; a no-break space, a
  line separator or a second byte order mark rejects the file, also inside
  an attribute name. Done in `en-124-svg-xml-whitespace` (PR #308), 2026-10-31.

- **EN-109** (feature): SVG organization logos are accepted. A file counts
  as SVG when it is UTF-8 text with an `<svg>` root in the SVG namespace
  and no DOCTYPE or entity declaration. It is stored as uploaded, and both
  logo reads serve every logo with
  `Content-Security-Policy: default-src 'none'; sandbox` and
  `X-Content-Type-Options: nosniff`, so a script in it never runs; pages
  show it through `<img>`. The file picker offers SVG. Done in
  `en-109-svg-logos` (PR #307), 2026-10-30.

- **EN-113** (tests): `organization-profile.module.spec.ts` now proves
  that `ORGANIZATION_LOGO_READER` resolves to the same
  `GetOrganizationLogoUseCase` instance, as it does for
  `ORGANIZATION_PROFILE_READER`. Done in `en-113-logo-reader-wiring`
  (PR #306), 2026-10-30.

- **EN-117** (deploy): `restore` extracts the files archive into
  `/files/.restore.partial` first and only then swaps it in by renames, so
  an archive that cannot be extracted, such as on a full disk, leaves the
  uploaded files as they were and says so. Backups exclude that directory
  and a restore removes a leftover one. Done in
  `en-117-restore-files` (PR #305), 2026-10-30.

- **EN-119** (deploy tests): `deploy/smoke-test.sh` adds a Compose
  override that mounts a volume at `/backups` for the backup and offsite
  services, so a local run no longer leaves dumps in the checkout's
  `backups/`. Done in `en-117-restore-files` (PR #305), 2026-10-30.

- **EN-120** (deploy tests): the smoke test's restore check also writes
  an uploaded file as the API's user before the dump, changes it, and
  checks that the restore brings it back with that owner. Done in
  `en-117-restore-files` (PR #305), 2026-10-30.

- **EN-115** (API): `LogoFileInterceptor` now answers busboy's
  `Malformed content type` with `LOGO_FILE_MISSING`, the code the spec gives an
  unparseable content type, instead of `LOGO_UPLOAD_INVALID`. The branch
  stays defensive, since multer normally drops those requests first. The
  controller and the interceptor share `logoFileMissingError()`. Done in
  `en-115-logo-interceptor` (PR #304), 2026-10-30.

- **EN-116** (tests): unit tests now cover `LogoFileInterceptor.intercept`
  with the base class's `intercept` (multer) stubbed: the accepted request
  passes through, both busboy content-type errors are translated, and any
  other error is rethrown unchanged. Done in
  `en-115-logo-interceptor` (PR #304), 2026-10-30.

- **EN-105** (deployment tests): CI runs ShellCheck on `deploy/*.sh`, and
  `deploy/test-postgres-backup.sh` and `deploy/test-offsite-copy.sh` test
  the backup and off-site copy scripts against throwaway containers (a
  Postgres, and `rclone serve s3` as the bucket), covering the scenarios of
  "Database backups" and "Off-site backup copies". `deploy/smoke-test.sh`
  now also restores a dump taken before the newest migration and checks
  that the API applies it. Done in `en-105-deploy-tests` (PR #303),
  2026-10-30.
- **EN-104** (deployment): an `offsite` service (rclone) copies the dumps
  and files archives in `backups/` every hour to an S3-compatible bucket at
  another provider, encrypted with `OFFSITE_ENCRYPTION_PASSWORD` before they
  leave the server. It is off until every `OFFSITE_*` value is set, only
  adds files (expiry is the bucket's lifecycle rule), and `pull` downloads
  and decrypts the copies for a restore. Done in `en-104-offsite-backups`
  (PR #302), 2026-10-29.
- **EN-114** (API): a logo removal clears the key only if it is still the
  one it read, with one conditional write (`updateManyAndReturn` on the expected
  key). An upload that recorded a new logo in between wins: the removal
  writes and deletes nothing and answers 200 with `hasLogo: true`, so the
  upload is no longer silently undone and its file no longer orphaned. Done
  in `en-114-logo-removal-race` (PR #300), 2026-10-29.
- **EN-112** (API): a logo read that finds its file deleted by a replacing
  upload reads the key once more and serves the new logo, instead of
  answering 404. One retry only. Covers the document logo read too, which
  uses the same use case. Done in `en-112-logo-read-race` (PR #298), 2026-10-27.
- **EN-111** (API): the logo upload's edges are hardened. A file counts as
  PNG, JPEG or WebP only with its image header and a size above zero (read
  by hand, no new dependency), and a form with the file in another field, a
  second file or any text field gets 400 `LOGO_UPLOAD_INVALID`. Decoding
  the whole image on upload was deliberately left out: a file with a valid
  header but broken pixel data is still accepted, and the web hides an
  image that fails to load. Done in `en-111-logo-upload-edges` (PR #297), 2026-10-27.
- **EN-110** (feature): the organization logo can be removed without
  uploading a new one: `DELETE /organization-profile/logo`
  (`organizationProfile:update`) and a confirmed Remove control on the
  profile page. Done in `en-110-remove-logo` (PR #296), 2026-10-27.
- **EN-95** (delivery): `node:24-bookworm-slim`, `caddy:2-alpine` and
  `postgres:18-alpine` are pinned as `tag@sha256:digest` in both Dockerfiles
  and both compose files, and `.github/dependabot.yml` checks weekly and
  opens one PR per image when a pinned tag gets a new digest (majors
  ignored: a Postgres major needs a dump and restore). Done in
  `en-95-pin-base-images`, PR #290.
- **EN-94** (security): Caddy now sends `X-Content-Type-Options: nosniff`
  and `Referrer-Policy: strict-origin-when-cross-origin` on every HTTPS response,
  HSTS (`max-age=31536000`) unless the site is `localhost`, and a strict
  Content Security Policy outside `/api/*`. The web app sets Zod's
  `jitless` mode so its `new Function` probe is not reported as a CSP
  violation. Done in `en-94-security-headers`, PR #289.
- **EN-96, EN-97, EN-98** (web tests): `checkAppNavPrintSuppression` failed,
  on the safe side, for rules that cannot show the chrome in print (a
  descendant rule after the hide, a hiding rule that nests CSS, an
  `!important` show in `@media screen` or on a descendant, an `!important`
  hide followed by a plain hide) (EN-96); ignored specificity, so a more
  specific show such as `.shell .app-nav { display: flex !important }`
  passed (EN-97); and missed an `!important` show in a later conditional
  print block (EN-98). It now parses the stylesheet with `postcss` and
  models the cascade in print: each rule is read with its media context,
  resolved nesting, the subject of its selector, its specificity and its
  own `display` declaration, and the hide must outrank every show that may
  apply in print by `!important`, specificity, then order. Nested `&`, and
  declarations directly in a group rule nested in a style rule, take the
  `:is()` specificity of the whole parent selector list. A hide on a
  compound selector (`nav.app-nav`) still fails on purpose: the check
  cannot know which element carries the class. Done in
  `print-check-cascade`, PR #286.

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
