# Technical Debt

Register of known technical debt in SF-Manager: shortcuts, gaps, and deferred
work that make the system harder to change, operate, or trust. Improvements
that add value without fixing a defect or gap live in
[enhancements.md](enhancements.md).

## How to use this file

- Each item has a stable ID (`TD-<n>`). IDs are never reused or renumbered.
  Commits, PRs, ADRs, feature documents and specs refer to items by this ID.
- New items go at the end of the matching severity section with the next free
  number. Include the evidence (file path, line, or source review) and the
  origin (which change or review found it).
- When an item is resolved, move it to **Resolved** with the change name and PR
  numbers. Do not delete it.
- Severity: **Medium** affects users, security, or correctness; **Low** affects
  maintainability, test quality, or operations.

Inventory first verified 2026-10-06 at `main` `b0276b7`; migrated from the
project's Engram memory on 2026-10-09.

## Open

### Medium

None.

### Low

- **TD-51**: The root `package.json` declares the Node engine as `>=24`, but
  the NestJS 12 dev tooling (`@nestjs/schematics` 12 and its
  `@angular-devkit/*` dependencies) requires `^22.22.3 || ^24.15.0 || >=26`.
  A contributor on Node 24.0 to 24.14 passes the repo's engines check and can
  then hit failures in `nest` CLI commands that are hard to trace. Raise the
  floor to `>=24.15` (and check that `.nvmrc`, Docker and CI agree), or
  document it. CI and the API image run a current Node 24, so neither is
  affected. Origin: `nest-12` (PR #TBD) Gentle AI reliability review, on
  2026-11-08.

- **TD-32**: CI scope deferred by `ci-pipeline` (ADR-006): deploy, coverage
  upload, matrix builds, Playwright, extra caching, parallel jobs, and
  SHA-pinned actions. The API typecheck step landed in
  `td-32-api-typecheck` (#219). Dependabot landed for Docker images (EN-95)
  and for npm and GitHub Actions in `td-32-dependabot-npm-actions` (PR #344). Evidence:
  `openspec/changes/archive/2026-10-06-ci-pipeline/archive-report.md`
  ("Follow-ups and deferred items", line 83 onward). Origin: `ci-pipeline`.
  `deployment` added a manual production stack (README "Production
  deployment"); deploying from CI is EN-91.

## Resolved

- **TD-50**: The root `package.json` carried a scoped npm override,
  `"@nestjs/platform-express": { "multer": "2.5.0" }`, to close Dependabot
  alert #59 (GHSA-q7qp-rjg7-q26m, high: denial of service via a pending
  asynchronous `fileFilter` after request teardown; fixed in multer 2.5.0).
  `@nestjs/platform-express` 11.2.8, the latest 11.x, pins `multer` to exactly
  2.4.0; the first release that ships 2.5.0 is 12.4.0. An override is a hidden
  version pin: remove it when NestJS moves to 12.x (or a later 11.x ships
  multer 2.5.0 or newer), and check that the installed `multer` is still at
  least 2.5.0. A flat `"multer"` override does not work with npm 11.17 (it
  keeps 2.4.0, or drops `multer` from the tree once its lock entry is
  removed); the scoped form needs the `node_modules/multer` and
  `node_modules/@nestjs/platform-express` lock entries removed before `npm
install`. Exposure before the override was low: the only multer use,
  `LogoFileInterceptor`, sets `limits` (`files: 1`) and no `fileFilter`,
  behind `organizationProfile:update`, whose guard runs before the
  interceptor. Evidence: `package.json` (`overrides`); `npm view
@nestjs/platform-express@11.2.8 dependencies.multer`;
  `apps/api/src/modules/organization-profile/presentation/logo-file.interceptor.ts`.
  Origin: `security-runtime-alerts` (PR #359) fresh review, 2026-11-06.
  Resolved by `nest-12` (PR #TBD): all `@nestjs/*` packages moved to 12.x
  (`@nestjs/platform-express` 12.4.0 depends on `multer` 2.5.0), and the
  override is gone. Removing the lock entries for `node_modules/multer` alone
  dropped `multer` from the tree, and a partial regeneration left its nested
  `type-is` 1.6.18 resolving the root `media-typer` 1.x and `mime-types` 3.x,
  so no upload was seen as multipart. Regenerating the `multer` and
  `@nestjs/platform-express` entries together fixed it; `npm ls --all`
  reports no invalid or missing package.

- **TD-48**: `@nestjs/throttler` was stuck at 6.4.0. Dependabot's grouped
  npm PR #345 bumped it to 6.7.1 and the API build failed with `TS2415: Class
'LoginThrottlerGuard' incorrectly extends base class 'ThrottlerGuard'`, so
  every throttler update PR failed CI the same way. Evidence:
  `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`;
  `openspec/changes/archive/2026-10-07-login-rate-limit/design.md` (D1).
  Origin: `dependabot-throttler-exclude` (PR #354) fresh review, 2026-11-06.
  Resolved by `throttler-6-7` (PR #365): 6.7.1 added a protected `logger` to
  `ThrottlerGuard`, which clashed with the guard's private `logger` field; the
  field is now `loginLogger`. The exact pin and the Dependabot group exclusion
  stay (design D1), and the login e2e and integration suites pass on 6.7.1
  with the same `Retry-After` and storage behavior.

- **TD-49**: Prisma is stuck at 7.9.x. Dependabot's grouped npm PR #355 bumped
  `prisma`, `@prisma/client` and `@prisma/adapter-pg` to 7.10.1, and two
  integration tests failed: a real unique-constraint violation no longer
  became `ElementCodeAlreadyExistsError` (a raw P2002
  `PrismaClientKnownRequestError` came back) or `AssignmentAlreadyExistsError`
  (a `TransactionConflictError` came back). Cause: for a Postgres unique
  violation (23505), `@prisma/adapter-pg` 7.10 sets
  `meta.driverAdapterError.cause.constraint` to `{ index: <constraint name> }`
  whenever Postgres names the constraint (always, in practice), and sets
  `fields` only as a fallback; 7.9 always set `fields`. Only two repositories
  read `constraint.fields`: `prisma-inspectable-element` (a code collision
  would no longer trigger the create use case's regenerate-and-retry, so the
  request fails with 500) and `prisma-community-representative` (a duplicate
  pair would answer 409 `TRANSACTION_CONFLICT`, telling the caller to retry,
  instead of 409 `ASSIGNMENT_ALREADY_EXISTS`). Evidence: CI run of PR #355
  (Integration step); `@prisma/adapter-pg` 7.9.1 vs 7.10.1 `dist/index.js`
  (23505 mapping); the two repositories' P2002 helpers. Origin:
  `dependabot-prisma-group` (PR #356) fresh review, 2026-11-06. Resolved by
  `td-49-prisma-constraint-index` (PR #363): both repositories now match the
  constraint by name (`constraint.index`), with the exact columns (`fields`)
  as a fallback, through the shared `isUniqueViolationOf` helper. The
  integration suite passes on 7.9.1 and on 7.10.1. The version bump itself
  arrives with the Dependabot Prisma group PR.

- **TD-23**: Several SDD changes lost their "TDD Cycle Evidence" table because
  the Engram `apply-progress` topic-key upsert overwrote it, so RED/GREEN order
  cannot be shown from the artifacts. Evidence: verify-reports of
  `label-printing` (W-1), `review-session`, `review-history` (W-2),
  `review-history-company-scope` (W-2), `review-history-admin-scope` (W-5),
  `organization-profile`, `hermetic-integration-tests` (W1), and
  `review-schedule` (W-1). Closed without a fix by `td-23-close-unrecoverable`
  (PR #338): the evidence cannot be recovered. The topic-key upsert keeps no
  prior versions (Engram's version history for
  `sdd/review-schedule/apply-progress`, 16 revisions, is empty), and the
  commits hold each test with its code (for example `93f962d`, `935d4c9`,
  `b3b6d76`), so git shows no test-first order either. The cause is gone: SDD
  and its `apply-progress` topic were retired on 2026-10-22. The affected
  changes passed their verify, some after remediation, and were archived with
  tests in place; only the order proof is missing.

- **TD-18**: Review-export test-quality gaps from the `review-export`
  verify-report. Resolved by `td-18-test-gaps` in three PRs. W-4 (PR #335):
  the permission-count lock checked only a test-local list, and es/ca dates
  were only checked non-empty; the lock is now tied to the production
  `Permission` union through a `Record<Permission, true>` the typecheck
  enforces, and en/es/ca dates are pinned to exact strings. S-5 (PR #336):
  the "rejected read issues no lookup" unit test covered only the
  nonexistent case; it now also covers a draft session and an out-of-scope
  one, for a technician and for an unassigned representative. S-6 (PR #337):
  the parity e2e compared only statuses; a 404 from the document route must
  now carry the same body as the history detail's.

- **TD-47**: The backup retention test failed depending on the time of
  day. `deploy/test-postgres-backup.sh` checked that the 2020 and 2021
  backups were gone with `grep -e 2020 -e 2021`, which also matched the new
  backup's own stamp when CI ran at a time such as 20:20:33 UTC
  (`sfmanager-20261104T202033Z.dump`), so it reported "retention left" for
  a retention that had worked. Seen on PR #333's first CI run. Resolved by
  `td-47-retention-test-clock` (PR #334): the check matches `sfmanager-2020` and
  `sfmanager-2021`, which still catches a leftover old dump or partial file.

- **TD-46**: Per-module test helpers shipped in the production build.
  Resolved by `td-46-exclude-testing-from-build` (PR #330):
  `apps/api/tsconfig.build.json` now excludes `src/**/testing` instead of
  only `src/shared/testing`. `tsc -p tsconfig.build.json --listFilesOnly`
  listed the 20 non-spec files under `src/modules/**/testing/` before and
  lists none after, and `npm run build` emits none into `dist`. An empty
  listing also proves no production code imports them: an imported file is
  compiled even when excluded. Keeping it that way is EN-149.

- **TD-27**: The public-endpoint "no lookup" behavior was proven at unit level
  only. Resolved by `td-27-public-no-lookup` (PR #327): `auth.e2e-spec.ts`
  "does not look up the user for a session cookie (public)" logs in,
  soft-deletes the user, then calls `GET /health` with that cookie and gets
  200 with no `findById` call; the same agent on `GET /auth/me` then gets 401
  after a `findById` call, proving the cookie was sent. `/health` is the probe
  because `POST /auth/refresh` reads the user by design.

- **TD-15**: The soft-deleted manager case was covered at e2e with fakes
  only. Resolved by `td-15-soft-deleted-manager-integration` (PR #323):
  `user-manager-capability.checker.integration.spec.ts` runs the real
  `UserManagerCapabilityChecker` over `PrismaUserRepository` and shows a
  MANAGER granted `VIEW_ALL_REVIEWS` losing it once soft-deleted, with the
  row and its grant still stored. The original evidence was partly wrong:
  `prisma-user.repository.integration.spec.ts` already had "softDeleteById()
  sets deletedAt so the user is excluded from findById()" with a MANAGER
  (since 9cbe46f, 2026-08-22), and `findById()` is what both
  `AuthenticatedGuard` and the checker use. The granted manager through the
  real checker was the part never covered.

- **TD-5**: No refresh-token rotation (2-hour access tokens, no refresh
  token). Resolved by `td-5-refresh-token-rotation` (#318, #319 and PR
  3/3): 15-minute access tokens renewed silently by the web with a
  rotating refresh token (reuse detection, 8 h idle, 7 days absolute);
  ADR-011 2026-11-01 addendum.
- **TD-1**: No CI. Resolved by `ci-pipeline` (#189, #191, #192; ADR-017).
- **TD-2**: Lint `--fix`. Resolved in #188.
- **TD-3**: Stale token after soft-delete or role change. Resolved by
  `auth-live-user-check` (#193, #194, #195; ADR-011 2026-10-06 addendum).
- **TD-4**: No login rate limiting. Resolved by `login-rate-limit` (#196,
  #197; ADR-011 2026-10-07 addendum).
- **TD-6**: A signer lost access to their own document after being
  unassigned. Resolved by `representative-retained-access` (#200, #201).
- **TD-7**: Web i18n hardcoded to English, with no language selector.
  Resolved by `web-locale-switch` (#198, #199).
- **TD-14**: Web tables had no caption or `scope="col"`. Resolved by
  `table-accessibility` (#203, #204).
- **TD-28**: Production `TRUST_PROXY` depends on topology; only off or one
  hop was supported. Resolved by `login-rate-limit-hardening` (#206):
  `TRUST_PROXY` accepts a hop count N and invalid values fail at startup;
  README and ADR-011 (2026-10-12 addendum) carry the topology table. Which
  value production needs remains an open deployment question in the addendum.
- **TD-29**: IPv6 clients could rotate the low 64 bits to evade the login
  limit. Resolved by `login-rate-limit-hardening` (#206): the client key is the
  `/64` prefix.
- **TD-30**: The in-memory login throttle counters reset on every restart.
  Resolved by `login-rate-limit-hardening` (#207, #208): counters persist in
  Postgres and are shared by all instances.
- **TD-17**: `ReviewDocumentPage` fell back to the raw `questionId` for an
  unknown question. Resolved by 5356761 (#165, 2026-09-24): it now shows the
  localized `reviewDocument.record.questionTextUnknown` label
  (`apps/web/src/pages/ReviewDocumentPage.tsx:205-206`, also
  `ReviewHistoryDetailPage.tsx:162`).
- **TD-19**: Hermetic-integration-tests findings W3, S3, and S6. Resolved in
  #169 (`chore/test-harness-messages`): 77e5f62 names the expected database in
  every global-setup abort message and asserts it (W3, S6; see
  `prepare-test-database.spec.ts:66,83`); 0e1e04c redacts the decoded
  migrate-output password (S3; `apps/api/src/shared/testing/test-database.ts:100-116`).
- **TD-20**: The dev-seed `finish-draft` window (an uncaught domain error when
  QA edits a seeded question while a Dev Seed draft is unfinished). Resolved by
  a1e07df (#176, `chore/dev-seed-leftovers`): the seed catches the expected
  template errors, logs a WARN, and returns `skip-unfinishable-draft`
  (`apps/api/src/shared/seeding/seed-dev-dataset.ts:535-547`).
- **TD-25**: A stale in-flight request that returned 401 after a re-login
  ended the new, valid web session. Resolved by `stale-401-session-guard`
  (PR 1/2, #210): `apiFetch` skips the unauthorized
  handler when the session epoch advanced since the request started
  (`apps/web/src/api/client.ts`), and `AuthProvider` advances it at login,
  logout and session end. Origin: `auth-live-user-check`.
- **TD-26**: No integrated test of the mid-session 401 to `/login` redirect.
  Resolved by `stale-401-session-guard` (PR 1/2, #210):
  `apps/web/src/auth/session-ended-flow.test.tsx` renders the real
  `AuthProvider`, `ProtectedRoute` and `LoginPage` and covers the 401, the
  redirect to `/login` and the session-ended notice in one test. Origin:
  `auth-live-user-check`.
- **TD-35**: Every login attempt, including an already-blocked one, rewrote
  the `ThrottleCounter` row, and the awaited expired-row cleanup could scan
  expired-but-still-blocked rows with no statement timeout. Resolved by
  `td-35-throttle-db-load` (ODD, #213): a blocked attempt only locks the row
  and does not rewrite it, cleanup selects on an indexed, trigger-maintained
  `expiresAt` column, and it runs under a 500 ms `statement_timeout`
  (`apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`).
  Origin: `login-rate-limit-hardening` PR 2 and PR 3 RDD reviews, 2026-10-12.
- **TD-31**: Account lockout and per-email rate-limit keying were deferred, so
  a distributed attack on one account was not limited. Resolved by
  `login-account-lockout` (#214, #215, #216, #217): failed logins are now counted
  per normalized email across all client keys, with a hashed key in
  `ThrottleCounter`, block on reaching the limit, reset on success and a
  combined `Retry-After` (ADR-011 addendum 2026-10-14). A persistent account
  lock and an admin unlock stay out of scope (EN-23, EN-24). Origin:
  `login-rate-limit` archive-report, open question 5.
- **TD-36**: 36 `tsc` TS2554 errors in the `PrismaThrottlerStorage` specs,
  which called `increment()` with the library's five arguments on a variable
  typed as the four-parameter adapter. Resolved by
  `td-36-throttler-spec-types` (#218): the specs now type the variable as the
  `ThrottlerStorage` port, as `ThrottlerGuard` calls it. The adapter still
  declares four parameters on purpose: the throttler name is already part of
  the key that `ThrottlerGuard.generateKey` hashes, so it is ignored. CI
  type-checks the specs since `td-32-api-typecheck` (#219).
- **TD-33**: Prettier was a dependency but not enforced. Resolved by
  `td-33-prettier-enforced` (#220, #221): root `format` / `format:check`
  scripts, a CI `Format` step, and the whole repo formatted (code in #220,
  docs in #221). Five archived Markdown files that Prettier cannot format
  stably or correctly stay in `.prettierignore`; `openspec/config.yaml` stayed
  there too until TD-37 was resolved.
- **TD-37**: `openspec/config.yaml` was not valid YAML: `rules.apply` mixed a
  list item with the mapping keys `tdd` and `test_command`. Resolved by
  `td-37-openspec-config-yaml` (#222): `rules.apply` is now a list like the other
  list-based phases, and the two keys became one rule. Nothing read them as keys:
  `sdd-apply` takes Strict TDD from the top-level `strict_tdd` and `testing`,
  and reads `rules.apply` as free-text rules. The file is formatted and no
  longer in `.prettierignore`.
- **TD-34**: Stale wording in `docs/adr/INDEX.md` (slices API-only, i18n
  tooling undecided). Resolved by `td-34-adr-index-wording` (#223): the i18n bullet
  names i18next/react-i18next on web and no i18n library on the API, and the
  end-user manual bullet no longer says slices are API-only.
- **TD-11**: The unknown-capability rejection test used `'MANAGE_COMMUNITIES'`,
  one of ADR-011's undeclared capability names, so it would break once that
  capability is declared. Resolved by `td-11-unknown-capability-test` (#224): it now
  uses `'NOT_A_CAPABILITY'`, and no ADR-011 undeclared name remains in
  `apps/**` or `packages/**`.
- **TD-10**: ADR-011 Decision 3 said `PermissionChecker` resolves permissions
  "plus the `managerCapabilities` flags", with no inline pointer to the
  2026-09-15 addendum that supersedes it. Resolved by
  `td-10-adr-011-decision-3-pointer` (#225): Decision 3 now carries an inline
  "superseded 2026-09-15" note, in the same style as the existing
  "corrected 2026-09-08" note in Decision 1.
- **TD-9**: `as any` casts on the mocked `Response` in
  `auth.controller.spec.ts` triggered `@typescript-eslint/no-unsafe-argument`
  warnings (six by 2026-10-15, up from the four first recorded). Resolved by
  `td-9-auth-controller-spec-casts` (#227): the spec casts the mock once to the
  Express `Response` type (`as unknown as Response`, the idiom other specs use),
  and the file lints clean.
- **TD-12**: No compile-time check that `ManagerCapability` has a single
  member, although the review schedule's MANAGER scope assumes
  `VIEW_ALL_REVIEWS` is the only one. Resolved by
  `td-12-single-manager-capability` (#228): `SoleManagerCapability` (next to
  `ManagerCapability`) becomes `never` once the union gains, renames or loses
  a member. The review schedule use case and `ReviewHistoryAccessService`,
  which makes the same assumption, pass constants typed with it, so the build
  fails at both until their MANAGER scope is revisited. `manager-capability.spec.ts`
  pins the collapse with `@ts-expect-error` probe unions.
- **TD-13**: Review schedule rows' `data-testid`s used `communityId` only, so
  two rows for one community would collide once a second `ElementType`
  exists. Resolved by `td-13-schedule-row-test-ids` (#229): the row, reason and
  last-review ids use the same `communityId-elementType` key as the React
  `key`, and a test with a simulated second type pins one id per pair.
- **TD-24**: `review-history-manager-capability` had no e2e for a granted
  MANAGER on an empty installation (W1) or for a live grant/revoke followed by
  `/review-history` on the same session (W3). Resolved by
  `td-24-manager-capability-e2e` (#232): both cases are in
  `apps/api/test/review-history.e2e-spec.ts`; W3 was mutation-checked against
  a checker that caches its answer per user.
- **TD-16**: The e2e guard that scans `apps/web/src` exempted the review
  schedule surface by exact relative path, so each new schedule file had to be
  added by hand. Resolved by `td-16-schedule-guard-exemption` (#233): the guard in
  `apps/api/test/review-session.e2e-spec.ts` skips any file with a directory or
  file name that is `review-schedule` / `ReviewSchedule` or continues with a
  non-lowercase character (so `ReviewScheduler` is still scanned). A
  table-driven test pins the rule, and the guard was checked both ways: a new
  schedule file using a forbidden term passes, and a review-session file using
  one still fails. This also newly exempts `api/review-schedule.ts` and its
  test, which were scanned before (both free of forbidden terms). Evidence:
  `review-schedule` archive-report W-3.
- **TD-8**: The web app shipped as a single ~830 kB JS chunk, over Vite's
  500 kB warning. Resolved by `td-8-route-code-splitting` (#234): every page,
  `LoginPage` included, is loaded with `React.lazy` behind a `<Suspense>`
  fallback, so each page is its own chunk. An error boundary shows a reload
  message if a chunk fails to load (for example after a redeploy). The entry chunk is 339 kB (100 kB
  gzip) and the warning is gone. `@sf-manager/validation` and zod now form a
  shared 358 kB chunk loaded with the login and form pages (EN-49).
  `authenticated-routes.test.ts` fails if a page is imported statically again.
- **TD-22**: No "in progress" marker on a review schedule pair that has an open
  draft; drafts never change status or sort. Resolved by
  `review-schedule-in-progress` (#235): each `GET /review-schedule` row carries
  `inProgress`, true while any user holds an open `QUARTERLY` or `ANNUAL`
  draft for the pair (a seventh reader query), and the page shows "In
  progress" after the status label. Status, reason and order are unchanged
  (Decision 8 still holds); the row names no owner.
- **TD-38**: "shows the page-loading message with the nav still present
  while a page chunk downloads" (TD-8, `apps/web/src/layout/AppLayout.test.tsx`)
  failed now and then in full web suite runs. The cause was not a timeout but
  an order race: the nav renders only once `/auth/me` resolves, while the
  page area shows its Suspense fallback (or chunk error) on the first render,
  so the tests found the page state before the nav and then read the nav
  synchronously. Resolved by `td-38-lazy-page-test-race` (#246): the three lazy-page
  tests delay the `/auth/me` response (which made two of them fail every
  run) and wait for the nav before checking the page area.
- **TD-39**: The review session element page opened an element of a
  completed session with its answer radios, the mark-unreviewed toggle and an
  enabled Save, against `review-session-ui`'s "A completed session still
  offers no mutating control". Resolved by `td-39-completed-session-element`
  (#265): the page also reads the session, and when it is completed it shows
  the completed notice, the recorded answers (or the not-reviewed reason, or
  that nothing was recorded) read-only, and Back to session as the only
  action. The API is unchanged.
- **TD-40**: Swagger UI and the OpenAPI document were public in production at
  `/api/docs`. Resolved by `td-40-api-docs` (#287): the API mounts them only
  when `API_DOCS_ENABLED=true`, or when it is unset and `NODE_ENV` is not
  `production`; any other value fails at startup. The production stack
  passes `API_DOCS_ENABLED` from `prod.env`, default `false`.
- **TD-41**: The production stack had no database backups. Resolved by
  `td-41-db-backups` (#288): a `backup` service runs
  `deploy/postgres-backup.sh`, which dumps the database at start and every
  24 hours into `backups/`, keeps `BACKUP_RETENTION_DAYS` days (default 14),
  and restores a dump with one command; the restore was tested against the
  real schema. Copying the dumps off the server is a documented operator
  step (README "Database backups"); doing it from the stack is EN-104.
- **TD-44**: `PUT /organization-profile/logo` answered 500 for a multipart
  type other than form-data, such as `multipart/mixed`, because busboy
  rejects it with a plain `Error`. Resolved by `td-44-logo-content-type` (#299):
  `LogoFileInterceptor` turns busboy's content-type errors into a 400
  `LOGO_UPLOAD_INVALID` and lets every other error through. A malformed
  content type never reached busboy (multer does not take it as multipart)
  and already answered 400 `LOGO_FILE_MISSING`; the spec now says so.
- **TD-42**: The production `backup` service dumped only the database, not
  the `api-files` volume holding uploaded files (the organization logo).
  Resolved by `td-42-files-backup` (#301): after each dump it writes
  `sfmanager-<same timestamp>.files.tar.gz` with the same temporary-name
  rename and retention, and `restore` replaces the uploaded files with the
  archive of the dump's timestamp (owner kept); a dump without one restores
  the database only, and an unreadable archive stops the restore before
  anything changes.
- **TD-45**: The e2e test "rejects a non-admin upload with 403 before
  reading an oversized file" was flaky: it sent the whole 3 MiB body, and
  the server answering 403 and closing the connection mid-send sometimes
  made the client see `read ECONNRESET`. Resolved by
  `td-45-oversized-upload-flake` (#311): the test now declares a 3 MiB file
  but sends only the headers, without any of its bytes, and waits for the
  reply, so a 403 proves the upload was rejected before its file was read,
  and a server that read the file first gets no reply and fails the test.
- **TD-43**: An empty status region inside a grid container (`.sf-form`,
  `.sf-panel`) added one gap. The entry blamed print only, but measuring in
  the browser showed it on screen too: its negative top margin cancels a gap
  in `main`'s flex column, never a grid's row gap, so the empty region
  doubled the gap (32 px instead of 16) in the organization logo section and
  in ReviewSessionElement's form, breaking `web-alert-announcements` ("MUST
  NOT change the page layout while empty"). Resolved by
  `td-43-status-region-grid-gap` (#315): while empty, a region that is a
  direct child of a form or panel is positioned out of the grid flow (not
  `display: none`, so screen readers keep tracking it) and rejoins it when
  an alert fills it.
- Earlier, before numbering: export S-1 and S-2, manager-cap S4, W2, and the
  hermetic Jest version skew.

TD-21 does not appear in the migrated inventory; the ID stays reserved and is
never reused. TD-32 and TD-34 were
unnumbered in the inventory and got IDs during the migration; TD-33 is new.
