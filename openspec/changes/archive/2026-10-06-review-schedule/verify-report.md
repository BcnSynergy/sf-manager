# Verification Report: review-schedule (FR-009 slice 1)

Mode: hybrid, Strict TDD. Verified at main 4035926 (all 9 PRs, #177-#185, merged). Date 2026-10-06.
Verdict: PASS WITH WARNINGS (0 CRITICAL, 3 WARNING, 3 SUGGESTION).

## Completeness
Tasks 1.1-9.3: 66/66 ticked. Code and tests exist for each (module tree, clock port, web page/route/nav/labels, locales, seed, docs). No unchecked task.

## Execution evidence (real runs, 2026-10-06)
| Command | Result |
|---|---|
| `npm run test -- --force` (all workspaces) | validation 50/50 (4 files); api 1344/1344 (138 suites); web 1041/1041 (62 files); exit 0 |
| `npm run test:integration --workspace=apps/api` | 207/207, 29 suites, exit 0 |
| `npm run test:e2e --workspace=apps/api` | 457/457, 11 suites, exit 0 |
| `npm run build` | 4/4 tasks successful (3 cached, same sources), exit 0 |
| eslint (no --fix) api `src/modules/review-schedule` | 0 errors, 0 warnings |
| eslint (no --fix) web `src/review-schedule`, `ReviewSchedulePage.tsx` | 0 errors, 0 warnings |
Note: the eslint command as literally given (from repo root) fails with a tsconfigRootDir parse error (multiple workspaces); it was run per workspace instead. Working tree clean after all runs.

## Spec compliance (summary)
All scenarios of review-schedule (A Pair Exists 3/4, What Covers a Quarter 9, Quarterly 7, Annual 9, NEVER_REVIEWED 3, Combined 9, Listed Worst First 5, Scope 10, Read-Only 4, No Per-Row Lookups 1) map to passing tests: calendar-quarter.spec, review-due.policy.spec (526 lines, tables), list-review-schedule.use-case.spec, prisma-review-schedule.reader.integration.spec, review-schedule.e2e-spec, test/review-schedule.integration.spec, app.module.spec. Spot-checked deeply:
- Constant count: reader spec records Prisma operations through `$extends`/`$allOperations`; asserts 6 operations for 2 and 20 communities, exact model.operation sequence, and the scope filter on q1, q2, q4-q6 (66aa15f).
- Wiring: `test/review-schedule.integration.spec.ts` boots real AppModule on the hermetic DB, overrides CLOCK only, logs in, asserts content/order and unchanged row counts.
- E2E: four roles, ungranted manager `[]` with reader not called, company manager 403, 401 before capability resolution, capability fault is an error, soft-deleted manager `[]`, write verbs rejected, filter/sort/page/search params ignored.
- Web: page states, no controls, no raw enums, server order kept; routes (App.test.tsx: four roles render, company manager NotAuthorized and page never mounted so no request, unauthenticated -> /login); nav per role (AppLayout.test.tsx); Decision 12 strings asserted exactly in locales.test.ts and UserEditPage.test.tsx.
- Browser (8.10): taken as evidence from tasks.md (2026-10-06); ES/CA test-verified only.
- Text-invariant deltas (review-session-management, review-history, review-document): no ReviewSessionRepository change; `git diff cd73872~1..main -- apps/api/prisma` is empty; no cron/queue/mail dependency; package.json files unchanged.

## Design coherence
Due policy in `domain/` (pure, no Nest); `Clock` port + `@Global ClockModule`; Europe/Madrid via `Intl.DateTimeFormat.formatToParts`; reader is six typed queries (no raw SQL, no per-row lookups); structural `ReviewSchedulePrisma` with `@Inject(PrismaService)` (documented deviation from `Pick`, design text already corrected); exhaustive role switch `satisfies never`, empty scopes return before any reader call; `compareScheduleRows` uses module-level `Intl.Collator('es', {sensitivity:'base'})`; `reviewSchedule:read` held by exactly SYSTEM_ADMIN, MANAGER, MAINTENANCE_TECHNICIAN, COMMUNITY_REPRESENTATIVE (role-permission.checker.ts:47,67,91,99), company manager excluded with comment; route `/review-schedule` and `REVIEW_SCHEDULE` nav for those four roles only (E8 comments present); Decision 12 label strings match exactly in en/es/ca. PairCoverage declared in the policy (documented tasks.md deviation).

## Issues
### CRITICAL
None.
### WARNING
1. Strict TDD evidence: apply-progress (#415) has no "TDD Cycle Evidence" table, and RED/GREEN order is not provable from git (implementation and spec land in the same commits, e.g. acd961c, a991dd7). The strict module treats a missing table as CRITICAL; downgraded here because tasks.md encodes RED-before-GREEN for every task, every referenced test file exists and passes, and the work was fresh-reviewed per PR. Orchestrator may reclassify.
2. Spec scenario "Pairs are per element type" (A Pair Exists) has no test: only EXTINGUISHER exists. Accepted follow-up in design.md; the reader groups by (communityId, elementType) so behavior is structural.
3. The e2e guard in review-session.e2e-spec.ts now exempts the schedule surface by path; every other file is still scanned (mutation-checked per 9.2). Low risk but a hand-maintained allowlist.
### SUGGESTION
1. `apps/web/src/pages/ReviewSchedulePage.tsx` row `data-testid`s use communityId only (known follow-up).
2. Tables lack `<caption>`/`scope="col"` (known follow-up, both pages).
3. Soft-deleted manager is covered at e2e with fakes only; real PrismaUserRepository path is an accepted follow-up.

## Archive inputs (not defects)
Main `openspec/specs/authorization/spec.md` Purpose must be hand-edited by sdd-archive (company manager, MANAGER, technician/representative sentences to name `reviewSchedule:read`); see tasks.md "Archive Prep". Known follow-ups in design.md "Follow-ups" stay open.
