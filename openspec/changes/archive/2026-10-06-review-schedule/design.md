# Design: Review Schedule — Overdue and Upcoming Reviews (FR-009, slice 1)

## Technical Approach

A new `review-schedule` module with three parts:

- a **pure due policy** in `domain/`, which maps `(coverage facts, now)` to one status and its driving reason;
- a **module-local read port**, which returns every `(community, elementType)` pair in scope with its coverage facts in a fixed number of queries;
- a **thin use case**, which resolves scope from the existing checker ports, reads `now` from a new `Clock` port, evaluates and sorts.

The web adds one page, one route, one nav item for four roles, and `en`/`es`/`ca` keys. PR 1 changes the dev seed.

There is no schema change, no new `ReviewSessionRepository` method and no stored projection.

## Evidence (verified in code)

| # | Fact | Source |
|---|---|---|
| E1 | `ReviewSession` has no Prisma `@relation` to `ReviewTemplate`, `Community` or `InspectableElement` (ADR-013), so a typed `include` join is impossible. | `schema.prisma:364-405` |
| E2 | `MAINTENANCE_COMPANY_MANAGER` holds `reviewSession:read`. | `role-permission.checker.ts:69` |
| E3 | No clock abstraction exists. `IdGeneratorModule` is the `@Global` port-plus-adapter precedent. | `shared/infrastructure/id/id-generator.module.ts` |
| E4 | No date library exists in any `package.json`. The web already pins `Europe/Madrid` through `Intl`, in web code only. No API-side Madrid date logic exists. | `apps/web/src/review-session/format-date.ts` |
| E5 | The seed keys sessions on `(performer, community)` only. A completed `technician@`/North session (S1) would make a planned ANNUAL session for the same pair a `skip`. | `dev-seed-plan.ts:125-135` |
| E6 | `SetReviewTemplateQuestions` allows cross-frequency picks, so questions tagged `MONTHLY` on an old dev DB do not abort a `QUARTERLY` template. | `set-review-template-questions.use-case.ts:24-25` |
| E7 | `ReviewTemplateRepository.findAll` returns active and retired rows, and excludes only soft-deleted drafts. | `review-template.repository.port.ts:54-58` |
| E8 | `NAV_ITEMS_BY_ROLE` `satisfies Record<Role, …>`. Leaving the company manager out is a visible choice, not an omission. | `nav-items.ts:67-82` |
| E9 | The repo has no Prisma query-count mechanism: no `$on('query')` listener, no `$extends` counter, and `PrismaService` constructs `PrismaClient` with a driver adapter and no `log` option. | `grep` over `apps/api/src`, `apps/api/test`; `prisma.service.ts` |
| E10 | `app.module.spec.ts` compiles `AppModule` (no `.init()`, no database) and is the DI-bootstrap regression precedent. `test/app.integration.spec.ts` boots the app against the per-run hermetic database. | `apps/api/src/app.module.spec.ts`, `apps/api/test/app.integration.spec.ts` |
| E11 | The seed's `DEV_DATASET.template` (single `DevTemplate`) is read by `dev-dataset.spec.ts` (138, 175), `dev-seed-docs.spec.ts` (55, README check), `seed-dev-dataset.spec.ts` (262, 766, 796, 844, 1197) and `seed-dev-dataset.integration.spec.ts` (77, 83, 408, 811, 847). `README.md:80` names the Monthly template. `seedTemplate` and `playSession` read `data.template` (`seed-dev-dataset.ts` 503, 645). | seeding directory, `README.md` |
| E12 | The `users.edit.viewAllReviewsLabel` key ("Can view every completed review in the installation") labels the only capability toggle, in `UserEditPage.tsx:263`. The `user-admin-ui` main spec requires a localized label but pins no text. | `apps/web/src/i18n/locales/{en,es,ca}.json:45`, `openspec/specs/user-admin-ui/spec.md:327-345` |
| E13 | The `'MONTHLY'` literals in the seeding directory are, at least: `dev-dataset.ts` 174 (question tags) and 179 (template frequency); `dev-dataset.spec.ts` 174-181 (test title plus `toContain('MONTHLY')`); `seed-dev-dataset.spec.ts` 558 (the `template()` helper's `frequency: 'MONTHLY'`); `seed-dev-dataset.integration.spec.ts` 260 and 285 (`'MONTHLY'` defaults of `lineage` and `lineageKind`). Lines 77, 83 and 100 of the same file are indirect reads, not `'MONTHLY'` literals: they read `DEV_DATASET.template.frequency` or the `frequency` parameter, so they change with the dataset shape and not through a literal. The template name `Dev Seed Extinguisher Monthly Check` appears in `dev-dataset.ts` 180, `dev-seed-plan.spec.ts` 142 and `README.md` 80. No other `MONTHLY` literal exists in the seeding directory. | `grep -n "MONTHLY\|Monthly"` over `apps/api/src/shared/seeding`, `README.md` |

## Architecture Decisions

| # | Question | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Permission | New `reviewSchedule:read`, granted to `SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE`. | Reusing `reviewSession:read`. That would need an in-use-case role refusal to produce the company-manager `403` (E2). | The guard returns the `403`, and the role table becomes the one place that says who reaches the surface. Cost: a `MANAGER` row change plus the `authorization` delta already listed in the proposal. |
| 2 | Module | New `apps/api/src/modules/review-schedule/`. It imports `CommunityModule` (`COMMUNITY_SCOPE_CHECKER`) and `UsersModule` (`MANAGER_CAPABILITY_CHECKER`). Both export these tokens and import nothing back, so there is no cycle. | Adding the read to `review-session`, or adding methods to `ReviewSessionRepository`. | Leaves the "exactly two unscoped reads" bound and *History Scope Is Carried by the Query* untouched. Scheduling is its own capability (screaming architecture). |
| 3 | Where the rule lives | Pure functions in `domain/`. `calendar-quarter.ts` holds Madrid calendar dates, quarters, the 12-month addition and `coverageWindowStart(now)`. `review-due.policy.ts` holds `evaluateReviewDue(coverage, now)` and `compareScheduleRows`. No I/O, no Nest. | Putting the rule in the use case or in SQL. | Table-driven unit tests at every boundary (Strict TDD, ADR-016). The adapter applies no quarter logic. |
| 4 | Time | `Clock` port (`now(): Date`) in `shared/application/ports/clock.port.ts`. `SystemClock` plus a `@Global ClockModule`, mirroring `IdGenerator` (E3). The use case reads `now` once and passes it into the policy. Only this use case adopts it. | Inline `new Date()`, which leaves E2E results tied to the real date and flaky at quarter edges. Jest fake timers, which are unused in `apps/**` and have global side effects. Retrofitting existing use cases, which ADR-006 rules out. | E2E overrides `CLOCK` with `FixedClock`. Unit tests pass `now` directly. |
| 5 | Time zone and comparison | Every judgement uses **`Europe/Madrid` calendar dates**, derived through `Intl.DateTimeFormat(...).formatToParts` (E4). A session's quarter is the quarter of its Madrid-local `completedAt` date. Deadlines **and the last covering session date** are Madrid calendar dates sent as `YYYY-MM-DD` strings, never `Date` or an ISO instant (the use case applies `madridDate` to the latest session instant). | Comparing UTC instants. That puts a 00:30 Madrid session on 1 April into Q1. | The web pins `Europe/Madrid` the same way in `apps/web/src/review-session/format-date.ts`, but that precedent is web-only: the API-side Madrid date logic is new code, so the DST unit tests in the Testing Strategy are not optional. The `installedAt` DATE precedent avoids the browser off-by-one. |
| 6 | Read shape | `ReviewScheduleReader.listPairs(scope, coverageSince)` runs six typed Prisma queries (no raw SQL), whatever the result size. `coverageSince` = `coverageWindowStart(now)`: UTC midnight of the previous quarter's first day minus one day, a safe superset that the policy narrows exactly. Community names come in the same read, so there is no N+1. Only the columns the policy needs are selected. The six queries are listed under Data Flow. | `$queryRaw` with joins (only the activation path uses raw SQL, and its error mapping differs, see `prisma-review-template.repository.ts:26-38`). An all-time `groupBy` of `min`/`max` over every completed session. Loading every session ever. Per-pair lookups (N+1). | The query count does not depend on the number of pairs. Session rows are read only inside the window (about two quarters). Older history is reduced to one row per `(community, template)`: an existence check with the latest pre-window date (`q4`), and `max(completedAt)` restricted to `ANNUAL` templates (`q5`). Neither returns session rows, and the scan is a range scan on the existing `(status, completedAt, id)` index. Its cost still grows with history, which is recorded under Accepted Limitations. The count is verified by a Prisma client-extension counter (see Testing Strategy), and the claim covers `listPairs` only, not scope resolution. |
| 7 | Scope | The use case runs an exhaustive `switch` on `actor.role` (`satisfies never`). `SYSTEM_ADMIN`: all. `MANAGER`: all if `VIEW_ALL_REVIEWS`, else `[]`. `REP`/`TECH`: `listAssignedCommunityIds`, `[]` when empty. `MAINTENANCE_COMPANY_MANAGER` and `default`: `[]`. A defensive backstop: the guard already returns `403`. Every empty scope returns before any reader call. | Reusing `ReviewHistoryAccessService`, which is performer-based for technicians and returns sessions, not pairs. | Fail-closed and assignment-based (decision 7). The checkers re-read on every request, so revocation applies on the next request. |
| 8 | Sorting | Server-side, in `compareScheduleRows`: status rank (OVERDUE, NEVER_REVIEWED, UPCOMING, UP_TO_DATE), then `communityName` through one module-level `Intl.Collator('es', { sensitivity: 'base' })` (case- and accent-insensitive, independent of the server's default locale), then `elementType`, then `communityId` as the deterministic tie-break. | Sorting on the client. Ordinal (code point) comparison, which puts "Zeta" before "alpha" and "Àgora" after both. | Decision 10 is a business rule. The server makes it unit-testable, and the page trusts the order, as `ReviewHistoryPage` does. A fixed locale keeps the order identical across environments. The unit test pins "alpha", "Àgora", "Zeta" to Àgora, alpha, Zeta. |
| 9 | API | `GET /review-schedule`, `@RequirePermission('reviewSchedule:read')`, no parameters. Returns `200 ReviewScheduleRowDto[]`, `401` or `403`. No domain error is thrown, so there is no `mapError`. The reason is a **code plus parameters**, never English text. | Server-rendered reason strings. | ADR-007: the web translates. |
| 10 | Web | `ReviewSchedulePage` with loading, error, empty and table states, copying `ReviewHistoryPage`. Route `/review-schedule` for the four roles. `REVIEW_SCHEDULE` nav item placed for those four roles; the company manager is left out with a comment (E8). The `reviewSchedule.*` and `nav.reviewSchedule` keys are guarded in `locales.test.ts`. | A filter or sort control (out of scope). | The minimal UI ships with the slice (ADR-006 addendum). |
| 11 | Seed | `DevDataset.template` becomes `templates: DevTemplate[]` (QUARTERLY, ANNUAL). `DevSession` gains `frequency`. `seedDevDataset` returns `Record<SeededFrequency, TemplateOutcome>` instead of a single `TemplateOutcome`, where `SeededFrequency = 'QUARTERLY' | 'ANNUAL'` is a named type exported from `dev-dataset.ts` and `DevTemplate.frequency` and `DevSession.frequency` use it (the full `ReviewFrequency` would force the record to carry `MONTHLY` and `SEMIANNUAL` keys that are never seeded). `seedTemplate(deps, data, template, questionIds, log)` receives one `DevTemplate` per call and `seedDevDataset` loops over `data.templates`. `seedSessions` receives the outcome record and `playSession` receives the session's own `DevTemplate`, looked up by `session.frequency`, instead of reading `data.template`. S1–S3 and the `rep@` draft use `QUARTERLY`. New S4: `technician@`/North/ANNUAL, completed. Questions are tagged `['QUARTERLY','ANNUAL']`. Template names follow the existing `Dev Seed Extinguisher <Frequency> Check` pattern, so `README.md` names both. **The session key widens to `(performer, community, frequency)`** (E5), with the frequency resolved from the session's frozen `templateId` through `findAll` (E7). Template planning and outcomes are tracked per lineage: a `skip-*` outcome blocks only the `open` plans of that frequency. | Keeping the key and adding an assignment so another performer covers North. That changes scopes and the dev-seed-data assignment table. | It is the smallest change that makes S4 seedable. Version replacement still never opens a second session, because a new version keeps its frequency. Idempotency, resume and `runSessionGuarded` are unchanged. |

### Decision 12: the capability label names both surfaces

`VIEW_ALL_REVIEWS` now also gates the installation-wide schedule for `MANAGER`. The only text a `SYSTEM_ADMIN` sees for it is `users.edit.viewAllReviewsLabel` (E12), which describes history alone. The label text changes in the web PR that ships the schedule page (PR 8, with the route and nav item), so the label never promises a page the app cannot yet reach:

| Locale | New text |
|---|---|
| `en` | Can view every completed review and the review schedule of the installation |
| `es` | Puede ver todas las revisiones completadas y el calendario de revisiones de la instalación |
| `ca` | Pot veure totes les revisions completades i el calendari de revisions de la instal·lació |

The key, the toggle and `locales.test.ts`'s guard list do not change, so no `user-admin-ui` requirement is modified. A new `user-admin-ui` delta requirement, *The Capability Toggle Label Names Every Surface It Gates*, pins the behaviour, not the wording.

### Decision 13: `review-session-ui` and `review-history-ui` carry deltas for the global nav item

The global navigation renders on every authenticated page, so a signed-in technician or representative sees the **Review schedule** item on the field-flow pages, and every history role that is offered it sees it on the history pages. The main specs count navigation links as controls in several enumerations (`review-session-ui`: *No scheduling, signing or attachment control exists in the field flow*, *The field flow adds no history view of its own*; `review-history-ui`: *No adjacent capability surfaces*). Read literally, the item would contradict "none MUST offer … due dates, overdue lists". So the change ships a MODIFIED delta for each capability instead of relying on interpretation:

- `review-session-ui` (new file): *No Offline, History or Scheduling Surface* names the Review schedule item as a permitted global-navigation entry, scopes the three enumerations to the field flow's **own** views, and narrows "company-wide or global review view" to a **list of sessions or reviews**. The schedule lists obligations per `(community, elementType)` pair, never a session, an entry or a review.
- `review-history-ui` (extended): *No Filtering, Analytics or Adjacent Controls Ship* gains the same permission, and *No adjacent capability surfaces* is restated so the global navigation's items are outside that enumeration.

The item still adds no control, indicator or link **inside** the field flow or the history views. `app-navigation` also carries MODIFIED blocks for the clauses that the new route and the backend work would otherwise make false (see its delta).

## Due Policy

The rule applies per pair. Let `today` be `madridDate(now)`, `cur` = `quarterOf(today)` and `prev` = `previousQuarter(cur)`.

1. If the pair has no covering session at all (`lastBeforeSinceAt` is null and `recentCoveringAt` is empty) → **NEVER_REVIEWED**. This is exclusive; there is no annual claim.
2. **Quarterly:**
   - `cur` is covered → UP_TO_DATE. A missed `prev` no longer shows once `cur` is covered (user decision, 2026-10-05).
   - Otherwise, `prev` is not covered **and** a covering session dated before `prev` exists → OVERDUE `QUARTER_MISSED(prev)`, deadline `quarterEnd(prev)`. A session dated before `prev` exists when `lastBeforeSinceAt` is non-null, or when any `recentCoveringAt` date has a Madrid quarter before `prev`.
   - Otherwise → UPCOMING `QUARTER_DUE(cur)`, deadline `quarterEnd(cur)`.

   OVERDUE therefore needs all three conditions: `prev` uncovered, a covering session before `prev`, and `cur` uncovered.
3. **Annual:**
   - `lastAnnualAt` is null → UPCOMING `ANNUAL_NOT_ON_RECORD`, deadline `quarterEnd(cur)`.
   - Otherwise, `deadline = addTwelveMonths(madridDate(lastAnnualAt))`, with 29 Feb becoming 28 Feb.
   - `today > deadline` → OVERDUE `ANNUAL_OVERDUE`.
   - `deadline <= quarterEnd(cur)` → UPCOMING `ANNUAL_DUE`.
   - Otherwise → UP_TO_DATE.
4. **Combined:** the worse status wins. UP_TO_DATE carries `deadline: null`.
5. **Tie-break when both obligations have the same status:** the obligation with the **earlier deadline** drives the reason and deadline. On an equal deadline, **quarterly drives**.

   "Quarterly always drives" is rejected for a concrete reason. An `ANNUAL_DUE` deadline is only required to fall on or before `quarterEnd(cur)`, so it can come well before the quarterly one. Example: today is 2026-10-05, the annual review is due 2026-11-10 and Q4 is uncovered. "Quarterly always drives" would show "due by 31/12/2026" while the binding date is 10/11/2026. The compliance list would then show a date seven weeks later than the real one. With two OVERDUE obligations, the earlier deadline shows the older miss. The spec covers both directions: one case where the quarterly deadline is earlier and one where the annual deadline is earlier.

   Where the deadlines are equal, the quarterly obligation drives. This includes `ANNUAL_NOT_ON_RECORD` against `QUARTER_DUE`, since both use `quarterEnd(cur)`.

Decision 5 examples, with Q4 as the current quarter:

| First covering session | Q3 | Q4 | Quarterly result |
|---|---|---|---|
| Q2 | uncovered | uncovered | OVERDUE `QUARTER_MISSED(Q3)` |
| Q2 | uncovered | covered | UP_TO_DATE (the missed Q3 is no longer shown) |
| Q3 | covered | uncovered | UPCOMING `QUARTER_DUE(Q4)` |
| Q4 | — | covered | UP_TO_DATE |

## Seeded Statuses (PR 1)

Every seeded session completes at seed time (no backdating), so it falls in the quarter of the seed run.

| Community | Covering sessions | Quarterly | Annual | Row |
|---|---|---|---|---|
| North | S1 `technician@`/QUARTERLY and S4 `technician@`/ANNUAL, both completed | UP_TO_DATE | UP_TO_DATE: the deadline is the seed date + 12 months, always after `quarterEnd(cur)` | **UP_TO_DATE** |
| South | S2 `technician@`/QUARTERLY and S3 `technician2@`/QUARTERLY, both completed | UP_TO_DATE | `ANNUAL_NOT_ON_RECORD` | **UPCOMING**, annual due by the end of the quarter |

- The `rep@`/North QUARTERLY session is a draft, so it covers nothing.
- South has two independent completed QUARTERLY sessions, so a single fail-soft skip (Decision 12 of dev-seed-data) still leaves it UPCOMING. Only if both are skipped does South show NEVER_REVIEWED.
- If S4 is skipped, North shows UPCOMING (`ANNUAL_NOT_ON_RECORD`).

## Data Flow

    GET /review-schedule
    AuthenticatedGuard → PermissionsGuard('reviewSchedule:read') → ReviewScheduleController
      ▼ ListReviewScheduleUseCase
      1 resolveScope(actor) ── [] ──→ 200 []   (no reader call)
      2 now = clock.now()
      3 reader.listPairs(scope, coverageWindowStart(now))
          communities (deletedAt null, ∩ scope)             q1
          element pairs groupBy (active, not deactivated)    q2
          QUARTERLY/ANNUAL frozen templates                  q3
          pre-window: completed sessions with completedAt < since,
            groupBy (community, template), max(completedAt)  q4  existence + latest date
          ANNUAL only: completed sessions on ANNUAL templates,
            groupBy (community, template), max(completedAt)  q5
          window: completed sessions with completedAt >= since,
            select communityId, templateId, completedAt      q6
          fold by (communityId, template.elementType)
      4 evaluateReviewDue(pair.coverage, now) per pair
      5 sort(compareScheduleRows) → ReviewScheduleRowDto[]

## Interfaces / Contracts

```ts
// shared/application/ports/clock.port.ts
export interface Clock { now(): Date }
export const CLOCK = Symbol('CLOCK');

// review-schedule/application/ports/review-schedule.reader.port.ts (not exported)
export type ScheduleScope = { kind: 'all' } | { kind: 'communities'; communityIds: readonly string[] };
export interface PairCoverage {
  lastBeforeSinceAt: Date | null;   // q4: latest covering completedAt < since; non-null = a pre-window session exists
  lastAnnualAt: Date | null;        // q5: latest ANNUAL covering completedAt, all time
  recentCoveringAt: readonly Date[]; // q6: covering completedAt >= since
}
// lastCoveringSessionDate = madridDate(max(lastBeforeSinceAt, max(recentCoveringAt))), computed in the use case
export interface SchedulePair { communityId: string; communityName: string; elementType: ElementType; coverage: PairCoverage }
export interface ReviewScheduleReader { listPairs(scope: ScheduleScope, since: Date): Promise<SchedulePair[]> }
export const REVIEW_SCHEDULE_READER = Symbol('REVIEW_SCHEDULE_READER'); // injection token, like the other ports; the module binds it to PrismaReviewScheduleReader

// review-schedule/domain/review-due.policy.ts
export type ScheduleStatus = 'OVERDUE' | 'NEVER_REVIEWED' | 'UPCOMING' | 'UP_TO_DATE';
export type ScheduleReasonCode = 'NEVER_REVIEWED' | 'QUARTER_MISSED' | 'QUARTER_DUE'
  | 'ANNUAL_OVERDUE' | 'ANNUAL_DUE' | 'ANNUAL_NOT_ON_RECORD' | 'UP_TO_DATE';
export interface ReviewDueEvaluation {
  status: ScheduleStatus; reasonCode: ScheduleReasonCode;
  quarter: { year: number; number: 1 | 2 | 3 | 4 } | null; // QUARTER_* only
  deadline: string | null;                                // YYYY-MM-DD, Madrid calendar date
}
export function evaluateReviewDue(coverage: PairCoverage, now: Date): ReviewDueEvaluation;

// review-schedule/domain/calendar-quarter.ts
export function coverageWindowStart(now: Date): Date; // UTC midnight of (first day of previous Madrid quarter) minus one day
export function madridDate(instant: Date): string; // YYYY-MM-DD in Europe/Madrid, via Intl.DateTimeFormat(...).formatToParts

// review-schedule/infrastructure/persistence/prisma-review-schedule.reader.ts
// Declared in the adapter file, so no other layer sees it. As delivered (PR 4 spike, task 4.1) it is a structural
// interface that spells out the six call signatures the reader makes (`community.findMany`,
// `inspectableElement.groupBy`, `reviewTemplate.findMany`, `reviewSession.groupBy`/`findMany`), with plain
// non-generic signatures. The originally designed `Pick<PrismaService, ...>` was rejected by `tsc`: a `$extends`
// client is not assignable to it, and narrowing the Pick to `findMany`/`groupBy` fails the same way. The interface
// accepts both `PrismaService` and its extended clients without a cast and without importing PrismaClient.
export interface ReviewSchedulePrisma { /* community, inspectableElement, reviewTemplate, reviewSession call shapes */ }
// constructor(@Inject(PrismaService) private readonly prisma: ReviewSchedulePrisma)
// `@Inject(PrismaService)` is required: an interface or type alias emits `Object` as decorator metadata, so Nest could not resolve it.
// Nest keeps injecting the real PrismaService.

// ReviewScheduleRowDto (flat):
// communityId, communityName, elementType, status, reasonCode,
// quarterYear|null, quarterNumber|null, deadline|null (YYYY-MM-DD, Madrid),
// lastCoveringSessionDate|null (YYYY-MM-DD, Madrid calendar date, never an instant)
```

## File Changes

The list names **at least** these files and edit sites. Line numbers are as read on 2026-10-05 and move as earlier PRs land; `sdd-apply` re-runs the `MONTHLY` grep (E13) before PR 1 is closed.

| File | Action |
|---|---|
| `apps/api/src/shared/seeding/dev-dataset.ts` | Modify (Decision 11): `SeededFrequency`, `templates: DevTemplate[]` (the single template at 177-180 becomes two), `DevSession.frequency`, S4, question tags at 174 (`['QUARTERLY','ANNUAL']`) |
| `apps/api/src/shared/seeding/dev-seed-plan.ts` | Modify (Decision 11): `planSession` key `(performer, community, frequency)`, per-lineage planning |
| `apps/api/src/shared/seeding/seed-dev-dataset.ts` | Modify (Decision 11): returns `Record<SeededFrequency, TemplateOutcome>`; `seedTemplate` per template; `seedSessions`/`playSession` use the session's own template (reads of `data.template` at 503, 531, 533, 535 and 645) |
| `apps/api/src/shared/seeding/dev-dataset.spec.ts` | Modify: lines 138 and 175 read `DEV_DATASET.template`; the test at 174-181 (title "targets the EXTINGUISHER x MONTHLY lineage…" and `toContain('MONTHLY')`) is rewritten to assert the QUARTERLY and ANNUAL lineages and that no `MONTHLY` tag remains; assert both templates and the S4 shape |
| `apps/api/src/shared/seeding/dev-seed-docs.spec.ts` | Modify: line 55 `DEV_DATASET.template.name` becomes a loop over `templates`; the README must name every template |
| `apps/api/src/shared/seeding/dev-seed-plan.spec.ts` | Modify: widened session key and per-lineage template outcomes; the `seeded()` fixture name at 142 (`Dev Seed Extinguisher Monthly Check`) follows the new template names |
| `apps/api/src/shared/seeding/seed-dev-dataset.spec.ts` | Modify: lines 262, 766, 796, 844, 1197 use `DEV_DATASET.template`; the `template()` helper at 558 hardcodes `frequency: 'MONTHLY'` and takes the frequency as a parameter; `createdDrafts` now holds both templates; assertions on the returned record |
| `apps/api/src/shared/seeding/seed-dev-dataset.integration.spec.ts` | Modify, per *Test isolation* below: `buildDataset` (77 default frequency, 83 `template` override, 100 `frequencies: [frequency]`) stops moving the dataset to one frequency; `lineage` (260) and `lineageKind` (285) lose their `'MONTHLY'` defaults and take a required `SeededFrequency`; `resetLineage` is applied to both lineages; lines 408, 811 and 847 read `data.template` and use the template of the matching frequency; per-frequency `Seeded template:` logs; S4 present on second run |
| `README.md` (line 80), `CLAUDE.md` | Modify: dataset bullet names the `Dev Seed Extinguisher Quarterly Check` and `Dev Seed Extinguisher Annual Check` templates, four completed sessions and one draft |
| `apps/api/src/shared/application/ports/clock.port.ts`, `shared/infrastructure/clock/{system-clock,clock.module}.ts`, `shared/testing/fixed-clock.ts` | Create |
| `apps/api/src/app.module.ts` | Modify: `ClockModule`, `ReviewScheduleModule` |
| `apps/api/src/app.module.spec.ts` | Modify: extend the DI-bootstrap regression (E10) so `AppModule` compiles with the real `PrismaReviewScheduleReader`, `SystemClock` and both checker tokens, and assert that `REVIEW_SCHEDULE_READER`, resolved with `get(token, { strict: false })`, is the Prisma adapter |
| `apps/api/test/review-schedule.integration.spec.ts` | Create: boots `AppModule` against the hermetic database with only `CLOCK` overridden by `FixedClock`, and reads `GET /review-schedule` through the real Prisma reader (see Testing Strategy) |
| `apps/api/src/modules/review-schedule/domain/{calendar-quarter,review-due.policy}.ts` (+ specs) | Create |
| `.../review-schedule/application/ports/review-schedule.reader.port.ts` (port, `REVIEW_SCHEDULE_READER` token), `application/testing/in-memory-review-schedule.reader.ts` (+ spec) | Create |
| `.../review-schedule/infrastructure/persistence/prisma-review-schedule.reader.ts` (+ integration spec) | Create: the adapter declares and exports `ReviewSchedulePrisma` (see Interfaces) and takes it through `@Inject(PrismaService)` |
| `.../review-schedule/application/use-cases/list-review-schedule.use-case.ts` (+ spec) | Create |
| `.../review-schedule/presentation/{review-schedule.controller.ts,dto/review-schedule-row.dto.ts}`, `review-schedule.module.ts` | Create |
| `apps/api/src/shared/application/authorization/permission.ts`, `auth/infrastructure/authorization/role-permission.checker{,.spec}.ts` | Modify: `reviewSchedule:read` |
| `apps/api/test/review-schedule.e2e-spec.ts` | Create: minimal harness, role matrix |
| `apps/web/src/api/review-schedule.ts`, `apps/web/src/review-schedule/schedule-labels.ts` (+ test) | Create: client; status/reason keys; `formatCalendarDate` (`timeZone: 'UTC'` for `YYYY-MM-DD`), used for both the deadline and the last review date, so neither shifts with the viewer's browser time zone and no instant is formatted on this page |
| `apps/web/src/pages/ReviewSchedulePage.tsx` (+ test) | Create |
| `apps/web/src/routes/authenticated-routes.tsx`, `apps/web/src/layout/nav-items.ts` (+ tests) | Modify |
| `apps/web/src/i18n/locales/{en,es,ca}.json`, `apps/web/src/i18n/locales.test.ts` | Modify: schedule keys (PR 7), and the text of `users.edit.viewAllReviewsLabel` (E12) in all three locales (PR 8, see Decision 12) |
| `apps/web/src/pages/UserEditPage.test.tsx` | Modify (PR 8): the label assertions of the Testing Strategy "Unit (web)" row |
| `docs/requirements/functional-requirements.md` | Modify (final PR): FR-009 changes to `partial` |

## Testing Strategy (Strict TDD, ADR-016)

| Layer | What | How |
|---|---|---|
| Unit | Madrid date at 22:30/23:30 UTC on quarter edges in both DST offsets; `coverageWindowStart(now)` for a `now` at each side of both DST changes (last Sunday of March and of October) and across the year boundary, and the invariant that every session dated inside the previous Madrid quarter falls at or after it; `quarterOf`, `previousQuarter` across the year boundary; `addTwelveMonths` on 29 Feb; every policy branch, the four rows of the decision 5 example table (including "prev missed but cur covered → UP_TO_DATE"), the annual deadline day itself (on time) and the day after (overdue), the tie-break (earlier deadline drives, equal deadline → quarterly, both OVERDUE in each direction); the community-name collation (`alpha`, `Àgora`, `Zeta` → Àgora, alpha, Zeta); an element type with a `QUARTERLY` and no `ANNUAL` template stays `UPCOMING` | Table-driven, `now` passed in |
| Unit | Use case: each role's scope, fail-closed with no reader call (spy), company manager `[]`, sort order, `lastCoveringSessionDate` (the Madrid calendar date, including a session completed at 22:30 UTC the day before) | In-memory reader, existing checker fakes, `FixedClock` |
| Unit | Seed: the widened `planSession` key, per-lineage template outcomes, the S4 plan | Existing fake-port specs |
| Integration | Reader: soft-deleted community excluded; pairs with only deactivated or deleted elements excluded; DRAFT, `MONTHLY` and `SEMIANNUAL` sessions ignored; retired-version sessions counted; window bound; pre-window existence (`q4`) and `ANNUAL`-only maximum (`q5`) match the policy's expectations; six Prisma client operations whatever the pair count | Real Postgres, scoped to the spec's own communities. The query count uses a counter set up in the test: `prisma.$extends({ query: { $allOperations: ({ args, query }) => { count += 1; return query(args); } } })`, the extended client (`moduleRef.get(PrismaService).$extends(...)`) being passed to `new PrismaReviewScheduleReader(...)` **without a cast**: the constructor parameter is the structural `ReviewSchedulePrisma` (Interfaces), because a `$extends` client is not assignable to the `PrismaService` class and ADR-013 keeps `PrismaClient` out of everything but `prisma.service.ts` and the `infrastructure/persistence/**` adapters (the spec sits in that folder, but importing the generated client there would still couple the test to it). A `$on('query')` listener is not used because `PrismaService` sets no `log` option (E9). The assertion compares two reads (2 and 20 communities) and the fixed number six, over `listPairs` only. Scope resolution through the community and capability checkers is excluded from the claim |
| Integration | Seed run twice: same counts; S4 present; per-lineage branching as in dev-seed-data, **for both the `QUARTERLY` and the `ANNUAL` lineage** | Existing spec, extended. Isolation rules in *Test isolation* below |
| E2E | 200 for the four roles with the right pairs; ungranted `MANAGER` gets `[]`; company manager `403`; `401` | New file, in-memory reader, `FixedClock`. It does not exercise the real DI wiring, which the two rows below cover |
| Bootstrap | `AppModule` compiles with the real `PrismaReviewScheduleReader`, `SystemClock` and the `COMMUNITY_SCOPE_CHECKER` and `MANAGER_CAPABILITY_CHECKER` tokens resolved in `ReviewScheduleModule` | Extend `app.module.spec.ts` (E10): `.compile()` only, no `.init()` and no database. `REVIEW_SCHEDULE_READER` is provided by `ReviewScheduleModule` and not exported, so the test resolves it with `moduleRef.get(REVIEW_SCHEDULE_READER, { strict: false })` and asserts the instance is a `PrismaReviewScheduleReader`. The PR that binds the module (PR 6) includes this test |
| Integration (wiring) | At least one case through the real Prisma reader behind the real controller: its own communities and sessions, `FixedClock` as the only override, an admin read returning the expected row and order | `apps/api/test/review-schedule.integration.spec.ts` boots the real `AppModule` against the per-run hermetic database, which is migrated but **not seeded** (`test/test-database/global-setup.ts` runs `prisma migrate deploy` only). Before compiling it sets `JWT_SECRET` and `CORS_ORIGIN`, as `test/app.integration.spec.ts` does. After `createNestApplication()` and before `init()` it calls `app.use(cookieParser())`, because `cookieParser` is installed only in `src/main.ts:16`, not in `AppModule`. The e2e harnesses do the same (`test/review-session.e2e-spec.ts:207`). Without it the login returns `200` and the read returns `401`. It inserts its own run-unique `SYSTEM_ADMIN`, hashing the password with the real `PasswordHasher` obtained by `moduleRef.get(PASSWORD_HASHER, { strict: false })`, logs in through `POST /auth/login` with a supertest agent, and reads `GET /review-schedule` with the session cookie (`sf_access_token`). Isolated as described in *Test isolation*. Included in PR 6 |
| Component | States, reason line per code, placeholders, route roles, nav per role | Vitest + Testing Library |
| Unit (web) | `users.edit.viewAllReviewsLabel` in `en`, `es` and `ca`: each value is non-empty, differs from the raw enum string, and names both completed reviews and the review schedule. The test asserts the exact strings of Decision 12, written first so it fails against the current history-only text and drives the label change (Strict TDD). It also checks the rendered label on the edit user form for a `MANAGER` in each locale (`user-admin-ui` delta) | Vitest, `locales.test.ts` plus the `UserEditPage` test. Included in PR 8 |
| Browser | North UP_TO_DATE, South UPCOMING (annual); company manager has no nav entry and is denied by the route | `npm run dev` + `claude-in-chrome` |

### Test isolation

The integration specs run in band against one per-run database (E10), so rows left by one file are visible to the next. Three rules keep the new and the extended specs independent.

| Spec | Isolation rule |
|---|---|
| `seed-dev-dataset.integration.spec.ts` | The dataset now seeds **two** EXTINGUISHER lineages, `QUARTERLY` and `ANNUAL`, and other integration specs leave active templates in both (the file's own comment on `resetLineage`). `buildDataset(suffix)` therefore no longer takes a frequency: it keeps both templates and tags questions `['QUARTERLY','ANNUAL']`. `lineage(frequency)` and `lineageKind(frequency)` take a required `SeededFrequency`. The first-run assertion runs once per frequency (`initialKind` and `before` become records keyed by `SeededFrequency`). Scenarios that must not depend on leftovers (the current `n14` and `u21`) call `resetLineage('QUARTERLY')` **and** `resetLineage('ANNUAL')` before seeding, because a seed run now plans both lineages and an un-reset one would skip with `skip-*` and block the sessions of its frequency. |
| `prisma-review-schedule.reader.integration.spec.ts` | Leaves the seeded and shared template lineages as it found them (one test swaps in a run-unique ACTIVE ANNUAL version and restores the previous active row in a `finally`; EXTINGUISHER is the only element type, so every covering lineage is shared). It creates its own communities (run-unique names), elements and users, inserts `retired` `ReviewTemplate` rows with run-unique high `version` numbers (the `(elementType, frequency, version)` unique index is avoided by the random high number, and a `retired` row never touches the one-active-per-lineage partial index). The one exception is the `withActiveTemplate` helper, which does exercise that partial index: it retires the lineage's current active row, inserts a run-unique ACTIVE row, and in a `finally` deletes it and reactivates the previous row, so the index is satisfied at every step and inserts `ReviewSession` rows directly, as setup only, the same way `resetLineage` already uses `PrismaService`. It reads with `{ kind: 'communities', communityIds }` of its own communities, so other specs' rows never enter the result, and deletes the template and session rows it inserted in `afterAll`. |
| `apps/api/test/review-schedule.integration.spec.ts` | Same direct-insert approach with its own run-unique fixtures. Its templates are all `retired` with run-unique high versions (`createRetiredTemplate`), so neither the lineage unique index nor the one-active-per-lineage partial index is hit there. The database is migrated but not seeded, so no admin exists: the spec sets `JWT_SECRET` and `CORS_ORIGIN` before compiling `AppModule` (as `test/app.integration.spec.ts` does), inserts its own run-unique `SYSTEM_ADMIN` with a password hashed by the real `PASSWORD_HASHER` provider, logs in through `/auth/login` and reads with the session cookie, then deletes that user in `afterAll`. The admin read uses scope `all`, so it returns every pair in the database; the spec filters the response to its own communities by id before asserting row content and order, and asserts only the relative order of its own rows. It overrides `CLOCK` only. |

The query-counter test relies on `tsc` accepting the `$extends` client as a `ReviewSchedulePrisma`. PR 4 checked this first (task 4.1) and the compiler rejected both the `Pick` and the narrowed `Pick`, so the delivered type is the structural interface with plain call signatures (see Interfaces), still without importing `PrismaClient` and without a cast.

## Migration / Rollout

No migration. Stacked-to-main. The table is a forecast: `sdd-tasks` sets the final split and the final PR count.

| PR | Scope | Est. code / test |
|---|---|---|
| 1 | Seed (Decision 11) with its four specs and the integration spec, README, CLAUDE.md. Acceptance: `migrate reset` + `db seed` with the user's OK | ~120 / ~300 |
| 2 | `Clock`, `ClockModule`, `FixedClock`, `calendar-quarter.ts` | ~110 / ~190 |
| 3 | `review-due.policy.ts` | ~130 / ~250 |
| 4 | Reader port, fake, Prisma adapter, integration spec (not bound yet) | ~150 / ~230 |
| 5 | Permission + use case (scope, sort) | ~110 / ~200 |
| 6 | DTO, controller, module, `AppModule`; E2E matrix; `app.module.spec.ts` bootstrap test with the real adapter; `review-schedule.integration.spec.ts` through the real Prisma reader | ~110 / ~330 |
| 7 | Web client, labels helper, schedule i18n keys ×3, locales test (no page yet; the `users.edit.viewAllReviewsLabel` text is untouched) | ~150 / ~100 |
| 8 | Page, route, nav, tests, the `users.edit.viewAllReviewsLabel` text change (Decision 12) with its test; full browser pass | ~160 / ~230 |
| 9 | FR-009 docs, archive | ~20 |

Total: about 2,900 changed lines. PR 1 and PR 6 exceed the 400-line budget through test updates and fixtures, not logic; the code and test split is reported at `sdd-tasks`. Revert the PRs in reverse order.

## Open Questions

- [x] A missed previous quarter is OVERDUE only while the current quarter is uncovered. Settled by the user on 2026-10-05.
- [x] `ANNUAL_NOT_ON_RECORD` uses the deadline `quarterEnd(cur)` and is never OVERDUE. Settled on 2026-10-05.
- [x] UP_TO_DATE and NEVER_REVIEWED carry no deadline, and rows within a status are ordered by community name, then element type, then id (Decision 8). Settled on 2026-10-05.
- [x] The 12-month annual deadline is inclusive, and 29 Feb becomes 28 Feb. Settled on 2026-10-05.
- [x] Tie-break: "earlier deadline drives, equal deadline → quarterly" (Due Policy, point 5). The spec and this design carry the same rule. Settled on 2026-10-05.
- [x] The `NEVER_REVIEWED` and `UP_TO_DATE` reason codes mean "no driving obligation". Both carry `deadline: null` and `quarter: null`, which matches the spec's "no driving obligation and no deadline". Settled on 2026-10-05.

## Follow-ups (deferred by ADR-006, recorded at PR 9)

Not needed by slice 1; each waits for the trigger named. Mirrored in tasks.md *Archive Prep*.

- [ ] Row `data-testid`s in `ReviewSchedulePage` use `communityId` only (one element type today). They must include `elementType` as soon as a second `ElementType` exists, or two rows for one community collide.
- [ ] `ReviewSchedulePage` and `ReviewHistoryPage` tables lack `<caption>` and `scope="col"` on headers. Fix both in one cross-cutting accessibility change, not per page.
- [ ] Compile-time single-member check for the `ManagerCapability` TypeScript union (`apps/api/src/modules/users/domain/manager-capability.ts` has `VIEW_ALL_REVIEWS` as its only member today; the schedule scope logic assumes that, so a second capability should fail the build until the logic is revisited).
- [ ] Optional integration test for a soft-deleted manager through the real `PrismaUserRepository` (the real-repository path is not exercised for this case today).
- [ ] The "Pairs are per element type" behaviour cannot be tested end to end while `ElementType` has only `EXTINGUISHER`; add the scenario when a second type ships.
- [ ] The "in progress" marker on a pair with an open draft is deferred (Decision 8: status and sort are unchanged by drafts).

## Accepted Limitations

- On a dev DB that was not reset, the additive seed opens QUARTERLY copies of S1–S3 and a second `rep@` draft next to the old `MONTHLY` rows. It does not abort. A reset is required (proposal).
- The dev statuses depend on the quarter in which the seed ran. Reseed before the browser pass if the quarter has changed since.
- An element type that has a `QUARTERLY` template and no `ANNUAL` template can never reach `UP_TO_DATE`: its pairs stay `UPCOMING` with `ANNUAL_NOT_ON_RECORD` until an `ANNUAL` template exists and a session on it is completed. This follows from the annual rule and is not corrected by the reader.
- The pre-window reads (`q4`, `q5`) aggregate older history on the existing `(status, completedAt, id)` index and return one row per `(community, template)`, but their scan cost grows with the number of completed sessions, most visibly for the admin scope. No stored projection is added (proposal). Measure before adding an index or a projection.
