# Tasks: Review Schedule — Overdue and Upcoming Reviews (FR-009, slice 1)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,890 (design.md Migration/Rollout, re-forecast below) |
| 400-line budget risk | High (total); Medium per PR, two PRs exceed 400 through test code |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → ... → PR 9 (stacked-to-main, design order kept) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Decision needed: accept `size:exception` for PR 1 and PR 6 (see table), or ask for them to be split. The chained-PR split and the chain strategy are already decided.

| PR | Scope | Code | Test | Total | Over 400? |
|---|---|---|---|---|---|
| 1 | Seed (Decision 11), README, CLAUDE.md, planning artifacts | ~148 | ~921 | ~1,081 | Yes: excess is test code (real figures: ~148 code / 12 docs / ~921 test, size:exception accepted) |
| 2 | `Clock`, `ClockModule`, `FixedClock`, `calendar-quarter.ts` | ~110 | ~190 | ~300 | No |
| 3 | `review-due.policy.ts` (`evaluateReviewDue`) | ~130 | ~250 | ~380 | No (near limit) |
| 4 | Reader port, fake, Prisma adapter, integration spec | ~150 | ~230 | ~380 | No (near limit) |
| 5 | Permission, `compareScheduleRows`, use case | ~110 | ~200 | ~310 | No |
| 6 | DTO, controller, module, `AppModule`, e2e, bootstrap, wiring integration | ~110 | ~330 | ~440 | Yes, by ~40: excess is test fixtures (harness, inserts) |
| 7 | Web client, labels helper, i18n keys x3, locales test | ~150 | ~100 | ~250 | No |
| 8 | Page, route, nav, label text change, browser pass | ~160 | ~230 | ~390 | No (near limit) |
| 9 | FR-009 docs, archive prep | ~20 | 0 | ~20 | No |
| Total | | ~1,060 | ~1,830 | ~2,890 | |

Code/test split: ~37% code, ~63% test. No logic exceeds its PR budget. If PR 3, 4 or 8 passes 400, the overflow is expected to be test tables; report the split and let the user accept (never trim coverage).

### Suggested Work Units

| Unit | Goal | PR | Notes |
|---|---|---|---|
| 1 | Seed yields QUARTERLY + ANNUAL, S4 | PR 1 | Base: main. Standalone; reset + seed acceptance needs user OK |
| 2 | Clock port and Madrid calendar helpers | PR 2 | Base: main after PR 1 merged. No consumers yet |
| 3 | Pure due policy | PR 3 | Depends on PR 2 (`madridDate`, quarters) |
| 4 | Reader port, fake, Prisma adapter (unbound) | PR 4 | Depends on PR 2 (`coverageWindowStart`) and PR 3 (`PairCoverage`) |
| 5 | Permission, sort, use case | PR 5 | Depends on PR 3, PR 4 |
| 6 | HTTP surface, DI wiring, E2E | PR 6 | Depends on PR 5; first PR with a reachable endpoint |
| 7 | Web client, helpers, i18n | PR 7 | Depends on PR 6 contract; no page yet |
| 8 | Page, route, nav, label, browser pass | PR 8 | Depends on PR 7 |
| 9 | Docs and archive prep | PR 9 | Depends on PR 8 |

Branches: `review-schedule/<NN>-<slug>`. Titles: `type(scope): PR N/9 — description`. Revert in reverse order; each PR leaves main green.

### Design deviation (dependency problem found)

Design puts `PairCoverage` in the reader port (PR 4), but `evaluateReviewDue` (PR 3, `domain/`) takes it. A domain file must not import from `application/`, and PR 3 would not compile. Resolution: **declare `PairCoverage` in `review-due.policy.ts` (PR 3)**; the PR 4 port imports it from the domain. Interface shape unchanged. `compareScheduleRows` stays in the same file but lands in PR 5 with the sort (as design assigns "sort" to PR 5).

Strict TDD: every GREEN task is preceded by its RED task. Verification commands: API unit `npm run test --workspace=apps/api -- <path>`; API integration `npm run test:integration --workspace=apps/api -- <path>`; API e2e `npm run test:e2e --workspace=apps/api`; web `npm run test --workspace=apps/web -- <path>`; plus `npm run lint` and `npm run build` at PR close.

## PR 1 — Seed: QUARTERLY + ANNUAL templates, S4 (~420 lines)

Start: main. Finish: seed creates both lineages and four completed sessions; all seeding specs green. Rollback: revert PR.

- [x] 1.1 Commit planning artifacts under `openspec/changes/review-schedule/` (proposal, specs, design, tasks)
- [x] 1.2 RED `dev-dataset.spec.ts`: `templates` holds QUARTERLY and ANNUAL, no `MONTHLY` tag, questions tagged `['QUARTERLY','ANNUAL']`, S1–S3 + `rep@` draft QUARTERLY, S4 `technician@`/North/ANNUAL, 4 completed + 1 draft; rewrite test at 174-181 — dev-seed-data *Dev Dataset Contents* (Dataset shape, Templates are QUARTERLY and ANNUAL, Four completed sessions)
- [x] 1.3 RED `dev-seed-plan.spec.ts`: session key `(performer, community, frequency)`; per-lineage template outcome blocks only its frequency; S4 plan; `seeded()` name follows new templates — *A performer and community may hold one session per frequency*, *The session key includes the frequency*
- [x] 1.4 RED `seed-dev-dataset.spec.ts`: `template(frequency)` helper, record return `Record<SeededFrequency, TemplateOutcome>`, `createdDrafts` for both templates, unusable ANNUAL blocks only ANNUAL, unusable QUARTERLY blocks only QUARTERLY, unfinishable draft per lineage — *An unusable ANNUAL template blocks only ANNUAL sessions*, *Foreign or unusable template…*, *Seed draft that cannot be finished…*
- [x] 1.5 RED `seed-dev-dataset.integration.spec.ts` per design Test isolation: `buildDataset` keeps both templates; `lineage`/`lineageKind` take required `SeededFrequency`; per-frequency first-run assertions; `n14`/`u21` reset both lineages; second run keeps 4 completed, one ANNUAL template and one ANNUAL session; replaced-version session matched by frozen-template frequency — *Second run adds no second annual template or session*, *Partial data completed*, *New template version does not open a second draft*
- [x] 1.6 GREEN `dev-dataset.ts`: `SeededFrequency`, `templates: DevTemplate[]`, `DevSession.frequency`, S4, question tags (Decision 11)
- [x] 1.7 GREEN `dev-seed-plan.ts`: widened key and per-lineage planning
- [x] 1.8 GREEN `seed-dev-dataset.ts`: per-template `seedTemplate`, record return, `playSession` uses the session's own template (reads at 503, 531, 533, 535, 645)
- [x] 1.9 REFACTOR: re-run the `MONTHLY`/`Monthly` grep (E13) over `apps/api/src/shared/seeding` and `README.md`; remove leftovers; fix `dev-seed-docs.spec.ts` line 55 loop only after 1.10
- [x] 1.10 RED `dev-seed-docs.spec.ts`: README must name every template in `DEV_DATASET.templates`
- [x] 1.11 GREEN `README.md` line 80 and `CLAUDE.md` seed bullet: Quarterly and Annual templates, four completed sessions, one draft
- [x] 1.12 Verify: `npm run test --workspace=apps/api -- shared/seeding` and `npm run test:integration --workspace=apps/api -- seed-dev-dataset`; lint
- [x] 1.13 Manual acceptance (needs the user's explicit OK, then Prisma consent per CLAUDE.md): `migrate reset` + `db seed` with `NODE_ENV=development`; confirm via `psql` two templates, four completed sessions (one ANNUAL, North), one draft; rerun seed, counts unchanged — *Dataset shape*, *Second run* (done 2026-10-05: 2 active templates QUARTERLY + ANNUAL, 5 sessions = 4 completed incl. 1 ANNUAL in North + 1 draft; second run left counts at 2 templates / 5 sessions)

## PR 2 — Clock and Madrid calendar helpers (~300 lines)

Start: PR 1 merged. Finish: pure helpers and a bound-less Clock port exist. Rollback: revert PR.

- [x] 2.1 RED `domain/calendar-quarter.spec.ts` (table-driven): `madridDate` at 22:30/23:30 UTC on 30 Sep, 31 Dec in both DST offsets; `quarterOf`, `previousQuarter` across year boundary, `quarterEnd`; `addTwelveMonths` 29 Feb → 28 Feb; `coverageWindowStart` each side of both DST changes and across the year boundary, plus the invariant that every Madrid date inside the previous quarter is at or after it — review-schedule *Quarter edges are judged in Europe/Madrid*, *A 29 February anniversary…*; design Decisions 5, 6
- [x] 2.2 GREEN create `apps/api/src/modules/review-schedule/domain/calendar-quarter.ts` using `Intl.DateTimeFormat(...).formatToParts`
- [x] 2.3 RED specs for `SystemClock` (returns a current `Date`) and `FixedClock` (returns the fixed instant, can be advanced) — design Decision 4
- [x] 2.4 GREEN create `shared/application/ports/clock.port.ts` (`Clock`, `CLOCK`), `shared/infrastructure/clock/{system-clock,clock.module}.ts` (`@Global`, mirrors `IdGeneratorModule`), `shared/testing/fixed-clock.ts`
- [x] 2.5 REFACTOR names and comments; verify `npm run test --workspace=apps/api -- review-schedule shared/infrastructure/clock`; lint

## PR 3 — Due policy (~380 lines)

Start: PR 2 merged. Finish: `evaluateReviewDue` covers every branch. Rollback: revert PR.

- [x] 3.1 RED `domain/review-due.policy.spec.ts` NEVER_REVIEWED: no coverage → NEVER_REVIEWED, no deadline/quarter; any covering session removes it; MONTHLY-only pair modelled as empty coverage — *NEVER_REVIEWED Is Exclusive…* (3 scenarios)
- [x] 3.2 RED quarterly table: the four Decision 5 rows incl. "prev missed, cur covered → UP_TO_DATE"; first session in prev / current quarter; earlier gaps not judged; year boundary (today 10 Jan 2027 → OVERDUE Q4 2026 deadline 31 Dec) — *The Quarterly Obligation* (7 scenarios)
- [x] 3.3 RED annual table: deadline passed, inside quarter, later than quarter, deadline today (UPCOMING) vs day after (OVERDUE), 29 Feb, 31 Dec 2025 vs 1 Jan 2026, QUARTERLY/older ANNUAL do not move deadline, no annual on record, QUARTERLY-only element type stays UPCOMING — *The Annual Obligation* (9 scenarios)
- [x] 3.4 RED combined: worse status wins; both OVERDUE with quarterly earlier and with annual earlier; equal status earlier deadline drives; equal deadline → quarterly; UP_TO_DATE carries no deadline; status changes with time alone (same coverage, `now` 15 Nov 2026 vs 2 Jan 2027) — *One Combined Status per Pair*, *Status changes with time alone*
- [x] 3.5 GREEN create `domain/review-due.policy.ts`: `PairCoverage` (see deviation), types, `evaluateReviewDue(coverage, now)`, using PR 2 helpers
- [x] 3.6 REFACTOR: split quarterly/annual evaluators into private functions; verify `npm run test --workspace=apps/api -- review-due.policy`; lint

## PR 4 — Reader port, fake, Prisma adapter (unbound) (~380 lines)

Start: PR 3 merged. Finish: `listPairs` works against Postgres with six queries; nothing registered in `AppModule`. Rollback: revert PR.

- [x] 4.1 Spike (before any adapter code): write a throwaway compile check that a `prisma.$extends({ query: { $allOperations } })` client is assignable to `ReviewSchedulePrisma = Pick<PrismaService, 'community'|'inspectableElement'|'reviewTemplate'|'reviewSession'>` with no cast; if `tsc` rejects, narrow the `Pick` to `findMany`/`groupBy` — design Test isolation closing note
- [x] 4.2 Create `application/ports/review-schedule.reader.port.ts`: `ScheduleScope`, `SchedulePair`, `ReviewScheduleReader`, `REVIEW_SCHEDULE_READER`; imports `PairCoverage` from the domain (types only, no behaviour)
- [x] 4.3 RED `application/testing/in-memory-review-schedule.reader.spec.ts`: scope filtering (`all`, `communities`), returns seeded pairs — supports review-schedule use case tests
- [x] 4.4 GREEN `application/testing/in-memory-review-schedule.reader.ts`
- [x] 4.5 RED `infrastructure/persistence/prisma-review-schedule.reader.integration.spec.ts` (own run-unique communities/elements/users, retired templates with high `version`, direct session inserts, cleanup in `afterAll`): one live element → one pair; only deactivated/deleted elements → none; soft-deleted community → none; per-element-type pairs; DRAFT, MONTHLY, SEMIANNUAL ignored; retired-version session counted; other users' sessions count; window bound; `q4` pre-window existence and latest date; `q5` ANNUAL-only maximum — *A Pair Exists Only…* (4), *What Covers a Quarter* (QUARTERLY, ANNUAL, MONTHLY/SEMIANNUAL, draft, other users, replaced version)
- [x] 4.6 RED same spec: constant-count test with `$extends` counter, 2 vs 20 communities, both equal to 6 — *Constant lookup count*
- [x] 4.7 GREEN `prisma-review-schedule.reader.ts` (exports `ReviewSchedulePrisma`, `@Inject(PrismaService)`, six typed queries q1-q6, fold by `(communityId, elementType)`)
- [x] 4.8 REFACTOR; verify `npm run test --workspace=apps/api -- review-schedule` and `npm run test:integration --workspace=apps/api -- prisma-review-schedule`; lint

## PR 5 — Permission, sort, use case (~310 lines)

Start: PR 4 merged. Finish: `ListReviewScheduleUseCase` returns sorted rows per role scope; not exposed over HTTP. Rollback: revert PR.

- [x] 5.1 RED `role-permission.checker.spec.ts`: `reviewSchedule:read` held by exactly SYSTEM_ADMIN, MANAGER, MAINTENANCE_TECHNICIAN, COMMUNITY_REPRESENTATIVE; company manager stays exactly `['reviewSession:read']`; update every exact-set assertion for MANAGER, technician, representative, admin; table stays exhaustive — authorization *The permission is granted to exactly four roles*, *The company manager holds no schedule permission*, *The manager gains exactly two permissions…* (modified)
- [x] 5.2 GREEN `shared/application/authorization/permission.ts` and `auth/infrastructure/authorization/role-permission.checker.ts`
- [ ] 5.3 RED `review-due.policy.spec.ts` (sort part): status rank; community name via `Intl.Collator('es', {sensitivity:'base'})` ("alpha","Àgora","Zeta" → Àgora, alpha, Zeta); equal names by element type then community id; case/accent-only differences — *Every Pair in Scope Is Listed, Worst First* (status order, within a group, collation)
- [ ] 5.4 GREEN add `compareScheduleRows` to `domain/review-due.policy.ts` (module-level collator)
- [ ] 5.5 RED `list-review-schedule.use-case.spec.ts` (in-memory reader, existing checker fakes, `FixedClock`): admin and granted manager full scope and equal lists; ungranted manager `[]`; revoked capability empty on next read; soft-deleted manager `[]`; capability infrastructure fault rejects and reader spy not called; rep and technician assignment scope (technician with no session, technician with session in unassigned B); deactivated assignment; company manager and unknown role `[]`; every empty scope no reader call; nothing hidden (all UP_TO_DATE returned); empty scope `[]`; `lastCoveringSessionDate` as Madrid date incl. 22:30 UTC and 23:30 UTC cases; null for NEVER_REVIEWED; reads `now` once; no writes — *Scope Follows the Caller's Role* (9), *Last covering session date is a Madrid calendar date*, *Never reviewed carries nothing*, *Up to date shows the last session only*, *Nothing is hidden*, *Empty scope*
- [ ] 5.6 GREEN `application/use-cases/list-review-schedule.use-case.ts` (exhaustive `switch` on role, `satisfies never`) and DTO-agnostic row model
- [ ] 5.7 REFACTOR; verify `npm run test --workspace=apps/api -- review-schedule role-permission`; lint

## PR 6 — HTTP surface, DI wiring, E2E (~440 lines)

Start: PR 5 merged. Finish: `GET /review-schedule` reachable and tested through the real adapter. Rollback: revert PR (no migration).

- [ ] 6.1 RED `apps/api/test/review-schedule.e2e-spec.ts` (minimal harness, in-memory reader, `FixedClock`): 200 for the four roles with their pairs; ungranted MANAGER `[]`; company manager `403` with no data; no session `401` before role/capability resolution; MANAGER with capability cannot reach admin or write endpoints; no write route and no filter/sort/page/search params; capability fault returns an error, not `[]` — authorization *Four roles are admitted*, *Authentication precedes authorization*, *Scope fails closed…*, *An infrastructure fault…*, *The endpoint widens nothing*; review-schedule *No write route and no list controls*
- [ ] 6.2 RED extend `app.module.spec.ts` (`.compile()` only): `AppModule` compiles with real `PrismaReviewScheduleReader`, `SystemClock`, both checker tokens; `get(REVIEW_SCHEDULE_READER, { strict: false })` is a `PrismaReviewScheduleReader` — design Bootstrap row, E10
- [ ] 6.3 RED `apps/api/test/review-schedule.integration.spec.ts`: real `AppModule`, hermetic DB, only `CLOCK` overridden by `FixedClock`; set `JWT_SECRET`/`CORS_ORIGIN`; `app.use(cookieParser())` before `init()`; insert run-unique `SYSTEM_ADMIN` hashed via `PASSWORD_HASHER` (`strict:false`), login, read with `sf_access_token`; filter to own communities by id, assert row content and relative order; row counts identical before and after reads — *A read writes nothing*, *Admin and granted manager see everything*
- [ ] 6.4 GREEN `presentation/dto/review-schedule-row.dto.ts` (flat DTO, dates as `YYYY-MM-DD`), `presentation/review-schedule.controller.ts` (`@RequirePermission('reviewSchedule:read')`, no params), `review-schedule.module.ts` (imports `CommunityModule`, `UsersModule`; binds `REVIEW_SCHEDULE_READER`)
- [ ] 6.5 GREEN `apps/api/src/app.module.ts`: register `ClockModule`, `ReviewScheduleModule`
- [ ] 6.6 Verify "no schema, reminder or projection": `git diff --stat main -- apps/api/prisma` empty; no queue/cron added — *No schema, reminder or projection*
- [ ] 6.7 Verify: `npm run test --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`, `npm run test:integration --workspace=apps/api -- review-schedule`; `npm run build`; lint

## PR 7 — Web client, helpers, i18n keys (~250 lines)

Start: PR 6 merged. Finish: client, label/format helpers and keys exist, no page. `users.edit.viewAllReviewsLabel` untouched. Rollback: revert PR.

- [ ] 7.1 RED `apps/web/src/api/review-schedule.test.ts`: `GET /review-schedule`, typed rows, `ApiError` propagates status/code
- [ ] 7.2 GREEN `apps/web/src/api/review-schedule.ts`
- [ ] 7.3 RED `review-schedule/schedule-labels.test.ts`: status → key, reason code → key with quarter/deadline params, element type via existing label map, `formatCalendarDate('2026-11-15')` and `'2026-12-31'` identical under TZ UTC-10 and UTC+12, per locale, no instant formatting — review-schedule-ui *Dates do not shift…*, *Raw values never appear*
- [ ] 7.4 GREEN `apps/web/src/review-schedule/schedule-labels.ts` (`formatCalendarDate` with `timeZone: 'UTC'`)
- [ ] 7.5 RED `i18n/locales.test.ts`: add `reviewSchedule.*` and `nav.reviewSchedule` to guard list; parity and non-placeholder values in en/es/ca — *All locales are complete*
- [ ] 7.6 GREEN `i18n/locales/{en,es,ca}.json`: page title, states, column labels, four status labels, reason texts per code, never-reviewed text, nav label
- [ ] 7.7 Verify: `npm run test --workspace=apps/web -- review-schedule locales`; lint; build

## PR 8 — Page, route, nav, label text, browser pass (~390 lines)

Start: PR 7 merged. Finish: page reachable for four roles, label updated, browser-verified. Rollback: revert PR (no data change).

- [ ] 8.1 RED `pages/ReviewSchedulePage.test.tsx` (mocked client): loading; empty; ungranted manager empty (not error, not "not authorized"); error from `ApiError.status/.code` not server text; upcoming annual row; overdue quarterly row (Q3 2026 not covered); never-reviewed (no date, no overdue wording); up-to-date (status, date, no reason); no raw enums; server order kept; no filter/sort/search/pagination/export/print/send/reminder/session-start control and no per-session data; renders from each locale's keys — review-schedule-ui requirements 2, 3, 4, 6
- [ ] 8.2 GREEN `apps/web/src/pages/ReviewSchedulePage.tsx` (copy `ReviewHistoryPage` states)
- [ ] 8.3 RED `routes/authenticated-routes` test: four roles render the page; company manager sees the existing not-authorized view and no request is made; unauthenticated → `/login`; every other route's roles unchanged — *Four roles open the page*, *Company manager is denied*, *Unauthenticated visitor*, app-navigation *Every route's allowed roles are unchanged*
- [ ] 8.4 GREEN `routes/authenticated-routes.tsx`: `/review-schedule` for four roles
- [ ] 8.5 RED `layout/nav-items` and nav render tests: `REVIEW_SCHEDULE` present for four roles, absent for company manager; role item sets and counts per the delta table; admin reaches nine sections; granted and ungranted manager identical nav; item leads to the page; the item shows on technician/representative field-flow pages and on history pages while those views' own controls stay free of schedule controls (scope existing "enumerate controls" assertions to the view's own controls) — *Item offered to four roles only*, *Item leads to the page*, app-navigation (5 scenarios), review-session-ui and review-history-ui deltas
- [ ] 8.6 GREEN `layout/nav-items.ts`: item for the four roles; comment why the company manager is left out (E8)
- [ ] 8.7 RED `locales.test.ts` and `UserEditPage.test.tsx`: `users.edit.viewAllReviewsLabel` equals the exact Decision 12 strings in en/es/ca, differs from the raw enum, rendered label on a MANAGER's edit form in each locale; exactly one toggle, MANAGER only — user-admin-ui *The label mentions history and schedule…*, *The toggle itself is unchanged*
- [ ] 8.8 GREEN update `users.edit.viewAllReviewsLabel` in `i18n/locales/{en,es,ca}.json` (Decision 12)
- [ ] 8.9 REFACTOR; `npm run test --workspace=apps/web`, lint, `npm run build`
- [ ] 8.10 Browser check (claude-in-chrome; needs the user's explicit OK for any `migrate reset`/`db seed`, a reseed in the current quarter, and the user to log in): `npm run dev`; admin sees Dev Seed Residences North **UP_TO_DATE** and South **UPCOMING** with an annual reason; ungranted `manager-nocap@` shows the empty state; `companymgr@` has no nav entry and `/review-schedule` shows not-authorized; error path if feasible; nav item visible on a technician field-flow page. ES/CA are test-verified only. State explicitly what was only test-verified — review-schedule-ui *Seeded states in the browser*; dev-seed-data *Admin sees North up to date and South upcoming*, *Scope still differs by role*

## PR 9 — Docs and archive prep (~20 lines)

Start: PR 8 merged. Finish: FR-009 marked partial. Rollback: revert PR.

- [ ] 9.1 `docs/requirements/functional-requirements.md`: FR-009 status to `partial`, noting slice 1 shipped (due policy, list, UI) and reminders/notifications deferred
- [ ] 9.2 Final full check: `npm run lint`, `npm run build`, `npm run test`, `npm run test:integration --workspace=apps/api`, `npm run test:e2e --workspace=apps/api`
- [ ] 9.3 Archive prep note for `sdd-archive`: update the main `authorization` spec Purpose (company-manager, MANAGER, technician/representative sentences) to name `reviewSchedule:read` / the schedule surface, as the authorization delta header requires; mention the PR 1 README/CLAUDE.md edits are already merged

## Coverage Cross-Check

| Spec | Scenarios | Covered by |
|---|---|---|
| review-schedule | A Pair Exists (4) | 4.5 reader integration |
| review-schedule | What Covers a Quarter (9) | 2.1 Madrid edges, 3.2/3.3 policy, 4.5 reader (types, drafts, versions, other users) |
| review-schedule | The Quarterly Obligation (7) | 3.2 |
| review-schedule | The Annual Obligation (9) | 3.3, 4.5 (no-ANNUAL-template type) |
| review-schedule | NEVER_REVIEWED (3) | 3.1, 5.5 |
| review-schedule | One Combined Status (9) | 3.4, 5.5 (date scenarios) |
| review-schedule | Every Pair Listed (5) | 5.3, 5.5 |
| review-schedule | Scope Follows the Role (10) | 5.5; 6.1 (403/401/capability fault) |
| review-schedule | Read-Only and Computed (4) | 3.4, 6.1, 6.3, 6.6 |
| review-schedule | No Per-Row Lookups (1) | 4.6 |
| review-schedule-ui (21 across 6 requirements + browser) | 8.1, 8.3, 8.5, 7.3, 7.5, 8.10 |
| dev-seed-data deltas (all) | 1.2-1.5, 1.13; visibility scenarios 8.10, 5.5, 6.1 |
| authorization (new: 7; modified table clauses) | 5.1, 6.1 |
| app-navigation (6 modified, 3 added) | 8.5 |
| user-admin-ui (2) | 8.7 |
| review-session-ui, review-history-ui deltas | 8.5 (nav on field-flow and history pages, controls scoped) |
| review-session-management, review-history, review-document deltas | Text invariants (no new reads/ports, one unscoped-read bound): upheld by 4.2/5.6 design (no `ReviewSessionRepository` change), `git diff` check in 6.6, and existing suites run in 9.2; no new behaviour to test |
