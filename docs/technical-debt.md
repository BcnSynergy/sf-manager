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

- **TD-25**: A stale in-flight request that returns 401 after a re-login ends
  the new, valid web session, because the handler acts whenever a user is set.
  Likelihood is low; a session epoch captured at request start would fix it.
  Evidence: `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`
  (2026-10-06 addendum, item 6); `auth-live-user-check` archive-report W-2.
  Origin: `auth-live-user-check`.
- **TD-29**: IPv6 clients can rotate the low 64 bits to get fresh login
  rate-limit buckets, so the limit can be evaded; keying on the /64 prefix may
  be needed. Evidence: `login-rate-limit` archive-report, open question 3.
  Origin: `login-rate-limit`.
- **TD-30**: The in-memory login throttle counters reset on every restart or
  redeploy, so the limit does not survive them. Evidence: `login-rate-limit`
  archive-report, open question 4. Origin: `login-rate-limit`.
- **TD-31**: Account lockout and per-email rate-limit keying are deferred, so
  a distributed attack on one account is not limited. Evidence:
  `login-rate-limit` archive-report, open question 5. Origin:
  `login-rate-limit`.

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
- **TD-9**: Four `as any` casts on the mocked `Response` trigger
  `@typescript-eslint/no-unsafe-argument` warnings. Evidence:
  `apps/api/src/modules/auth/presentation/auth.controller.spec.ts` lines 61,
  92, 102, 117 (confirmed with `eslint` on 2026-10-09). Origin: the
  2026-10-06 debt inventory, after #188 removed the cast in
  `community.e2e-spec.ts`.
- **TD-10**: ADR-011 Decision 3 still says `PermissionChecker` resolves
  permissions from the role table "plus the `managerCapabilities` flags", with
  no inline pointer to the 2026-09-15 addendum that supersedes it (the
  capability is resolved by a separate Layer 2 port). Evidence:
  `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` lines 73-75
  versus the 2026-09-15 addendum, item 2. Origin:
  `review-history-manager-capability` archive-report W5.
- **TD-11**: The unknown-capability rejection test uses `'MANAGE_COMMUNITIES'`,
  one of ADR-011's undeclared capability names. This contradicts the spec
  invariant that no other capability name appears in `apps/**` or
  `packages/**` (the guard only scans `apps/api/src`), and the test would
  break once that capability is declared. Fix: use a non-ADR-011 string such
  as `'NOT_A_CAPABILITY'`. Evidence:
  `packages/validation/src/users/update-user.schema.spec.ts:25`. Origin:
  `review-history-manager-capability` verify-report W4.
- **TD-12**: No compile-time check that `ManagerCapability` has a single
  member. The schedule scope logic assumes `VIEW_ALL_REVIEWS` is the only one,
  so a second capability should fail the build until that logic is revisited.
  Evidence: `apps/api/src/modules/users/domain/manager-capability.ts` (plain
  union); `review-schedule` archive-report follow-up 3. Origin:
  `review-schedule`.
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
- **TD-26**: No integrated test of the mid-session 401 to `/login` redirect.
  The flag and the redirect are tested separately; the whole flow was only
  browser-verified. Evidence: `auth-live-user-check` archive-report W-1.
  Origin: `auth-live-user-check`.
- **TD-27**: The public-endpoint "no lookup" behavior is proven at unit level
  only. Evidence: `auth-live-user-check` archive-report S-1. Origin:
  `auth-live-user-check`.
- **TD-28**: The production `TRUST_PROXY` value depends on the deployment
  topology; a CDN plus a proxy (two hops) needs a numeric hop count, and
  `true` with no proxy lets clients spoof their key. Evidence:
  `login-rate-limit` archive-report, open questions 1 and 2. Origin:
  `login-rate-limit` (ADR-011 open questions).
- **TD-32**: CI scope deferred by `ci-pipeline` (ADR-006): deploy, coverage
  upload, matrix builds, Dependabot, Playwright, extra caching, a typecheck
  script, parallel jobs, and SHA-pinned actions.
- **TD-33**: Prettier is a dependency but is not enforced: there is no format
  script or CI step, and `main` already fails `prettier --check` (for example
  `apps/web/src/index.css`). Origin: `table-accessibility` review, 2026-10-09.
- **TD-34**: Stale wording in `docs/adr/INDEX.md`: it says most slices are
  API-only and that i18n tooling is undecided.

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
- Earlier, before numbering: export S-1 and S-2, manager-cap S4, W2, and the
  hermetic Jest version skew.

TD-21 does not appear in the migrated inventory. TD-32 and TD-34 were
unnumbered in the inventory and got IDs during the migration; TD-33 is new.
