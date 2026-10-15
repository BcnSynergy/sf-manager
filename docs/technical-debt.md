# Technical Debt

Register of known technical debt in SF-Manager: shortcuts, gaps, and deferred
work that make the system harder to change, operate, or trust. Improvements
that add value without fixing a defect or gap live in
[enhancements.md](enhancements.md).

## How to use this file

- Each item has a stable ID (`TD-<n>`). IDs are never reused or renumbered.
  Commits, PRs, ADRs, and SDD artifacts refer to items by this ID.
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

- **TD-5**: No refresh-token rotation. Access tokens live 2 hours and there is
  no refresh token, although ADR-011 Decision 4 targets rotation. Evidence:
  `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` (Decision 4 and
  the 2026-08-21 addendum); `auth-live-user-check` explore.md option 3
  (rejected by the user, deferred). Origin: `auth-minimal-skeleton`.
- **TD-8**: The web app ships as a single ~830 kB JS chunk, so first load is
  heavier than needed; Vite warns above 500 kB. Evidence: local
  `apps/web/dist/assets` build (832,225 bytes, 2026-10-09); the warning is
  recorded in the `checklist-management` archive-report (S-2), the
  `label-printing` verify-report (S-5, `qrcode` pushed it to 764 kB), and the
  `community-minimal-ui` verify-report. Origin: `checklist-management`.
- **TD-13**: Review schedule rows' `data-testid`s use `communityId` only, so
  two rows for one community collide once a second `ElementType` exists.
  Evidence: `apps/web/src/pages/ReviewSchedulePage.tsx:75,81,86`;
  `review-schedule` archive-report S-1 and follow-up 1. Origin:
  `review-schedule`.
- **TD-15**: The soft-deleted manager case is covered at e2e with fakes only,
  not through the real `PrismaUserRepository`. Evidence: `review-schedule`
  archive-report S-3 and follow-up 4; `prisma-user.repository.integration.spec.ts`
  has no soft-deleted manager case. Origin: `review-schedule`.
- **TD-16**: The e2e guard that scans `apps/web/src` exempts the schedule
  surface by exact relative path, so each new exempt file must be added by
  hand (all other files are still scanned; mutation-checked in task 9.2).
  Evidence: `apps/api/test/review-session.e2e-spec.ts` (guard block);
  `review-schedule` archive-report W-3. Origin: `review-schedule`.
- **TD-18**: Review-export test-quality gaps. W-4: the permission-count lock
  checks a test-local list, not the production `Permission` union, and es/ca
  date formatting is only checked non-empty. S-5: the "rejected read issues no
  lookup" unit test covers only the nonexistent case. S-6: the parity e2e does
  not compare 404 bodies between the history and document routes. Evidence:
  `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.spec.ts:150,347-350`
  and `apps/web/src/review-session/format-date.test.ts:55-56` (W-4 still
  present); `review-export` verify-report W-4, S-5, S-6 (S-5 and S-6 not
  re-checked in code). Origin: `review-export`.
- **TD-22**: No "in progress" marker on a review schedule pair that has an open
  draft; drafts never change status or sort. Deferred by design. Evidence:
  `review-schedule` design.md Decision 8 and archive-report follow-up 6.
  Origin: `review-schedule`.
- **TD-23**: Several SDD changes lost their "TDD Cycle Evidence" table because
  the Engram `apply-progress` topic-key upsert overwrote it, so RED/GREEN order
  cannot be shown from the artifacts. Evidence: verify-reports of
  `label-printing` (W-1), `review-session`, `review-history` (W-2),
  `review-history-company-scope` (W-2), `review-history-admin-scope` (W-5),
  `organization-profile`, `hermetic-integration-tests` (W1), and
  `review-schedule` (W-1). Origin: those reviews.
- **TD-24**: Coverage gaps in `review-history-manager-capability`. W1: no e2e
  for the empty-installation list as a granted MANAGER. W3: no e2e composes a
  live grant/revoke PATCH with a following `/review-history` request on the
  same session. Evidence: `review-history-manager-capability` verify-report W1
  and W3; `apps/api/test/review-history.e2e-spec.ts` has no such case (the
  comment at lines 2255-2263 defers W1 to the admin equivalent). Origin:
  `review-history-manager-capability`.
- **TD-27**: The public-endpoint "no lookup" behavior is proven at unit level
  only. Evidence: `auth-live-user-check` archive-report S-1. Origin:
  `auth-live-user-check`.
- **TD-32**: CI scope deferred by `ci-pipeline` (ADR-006): deploy, coverage
  upload, matrix builds, Dependabot, Playwright, extra caching, parallel
  jobs, and SHA-pinned actions. The API typecheck step landed in
  `td-32-api-typecheck` (#219). Evidence:
  `openspec/changes/archive/2026-10-06-ci-pipeline/archive-report.md`
  ("Follow-ups and deferred items", line 83 onward). Origin: `ci-pipeline`.

## Resolved

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
- Earlier, before numbering: export S-1 and S-2, manager-cap S4, W2, and the
  hermetic Jest version skew.

TD-21 does not appear in the migrated inventory; the ID stays reserved and is
never reused. TD-32 and TD-34 were
unnumbered in the inventory and got IDs during the migration; TD-33 is new.
