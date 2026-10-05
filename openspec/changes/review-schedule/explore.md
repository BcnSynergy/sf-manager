# Exploration: review-schedule (FR-009 slice 1, read-only due/overdue list)

Method: Read, Grep and Glob only (Bash was unavailable). Statements marked **[V]** were verified in code or specs. Statements marked **[I]** are inference.

## 1. Current state

**Data that exists [V]**
- `ReviewSession` (`apps/api/prisma/schema.prisma:364-405`) holds `communityId`, `templateId` (the frozen version row), `performedById`, `status` (`draft` or `completed`), `startedAt` and `completedAt`. It has no `deletedAt`, and `performedByCompanyId` is a snapshot. Indexes exist on `communityId`, `performedById` and `performedByCompanyId`. The composite `(status, completedAt, id)` serves the installation-wide read.
- `ReviewTemplate` (`schema.prisma:295-305`) holds `elementType`, `frequency` (enum `MONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL`, `schema.prisma:235-240`), `status` (`draft | active | retired`) and `version`. Frequency lives on the template, not on questions or elements. `ChecklistQuestion.frequencies` is only an informational tag (`schema.prisma:252-258`).
- A session derives its element type and frequency from its template. `docs/architecture/domain-model-inspections.md:355` and `review-session-management/spec.md:84` say so explicitly. `GetReviewScopeUseCase` lists the active templates per element type and frequency.
- `InspectableElement` (`schema.prisma:193-228`) holds `communityId`, `elementType`, `installedAt`, `deletedAt` (administrative delete) and `deactivatedAt` (decommissioned). Review eligibility is `deletedAt IS NULL AND deactivatedAt IS NULL` (`domain-model-inspections.md:186-191`).
- `ElementReviewEntry` links a session to an element, with `observations` and `recordedAt`. Its index on `inspectableElementId` was added by the per-element history slice.
- **What a session covers [V]:** `CompleteReviewSessionUseCase` (`complete-review-session.use-case.ts:73-88`) requires that every active element of `(session.communityId, template.elementType)` has an entry, reviewed or unreviewed. Completing a session therefore means the whole `(community, elementType)` was covered under that session's template frequency. Every entry belongs to a session, and a session has exactly one template.
- Docs state the cadence policy but code does not implement it [V]. `domain-model-inspections.md:376-393` says:
  - every calendar quarter needs one session per `(community, elementType)`;
  - the quarter that uses an `ANNUAL` template is not fixed;
  - consecutive `ANNUAL` sessions may be at most 12 months apart, with the clock running from the actual date of the last one.

  It also names FR-009 as the consumer: "This is application-layer logic ... not new persisted state". No interval constants (month counts per frequency) exist anywhere in code.

**Time [V]**
- There is no clock port. `new Date()` is called inline in use cases and adapters (for example `complete-review-session.use-case.ts:90`, `open-review-session.use-case.ts:121`, `record-entry.use-case.ts:111`). The only injectable abstraction nearby is `IdGenerator`.
- No fake-timer usage exists in `apps/**`. `shared/testing/test-database.ts` takes a `now` parameter, but only for naming databases.
- A due calculation therefore needs a new `Clock` port. A pure function taking `now` as an argument would also work, with the use case reading `new Date()` once.

**Reminder infrastructure [V]**
- No mail, queue or scheduler dependency exists. Case-insensitive grep for `nodemailer`, `@nestjs/schedule`, `bull(mq)`, `cron` and `smtp` over every `package.json` returned nothing. There is no mail or Redis service in `docker-compose*`, `.env.example` or `app.module.ts`.
- This confirms that reminders need new infrastructure plus a product decision on channel, cadence and recipients. That justifies deferring them.

**Scoping in review-history [V]**
- `ReviewHistoryAccessService` (`review-history-access.service.ts:52-331`) dispatches on role with an exhaustive `switch` and `actor.role satisfies never`.
  - `MAINTENANCE_TECHNICIAN`: performer-based, with no community check (`:73-74`). This was a deliberate 2026-09-09 reversal.
  - `COMMUNITY_REPRESENTATIVE`: `CommunityScopeChecker.listAssignedCommunityIds`, with an empty set returning `[]`.
  - `MAINTENANCE_COMPANY_MANAGER`: `CompanyScopeChecker.resolveCompanyScope`, with `null` returning `[]` and using the frozen `performedByCompanyId`.
  - `SYSTEM_ADMIN`: unscoped read.
  - `MANAGER`: `ManagerCapabilityChecker.hasManagerCapability(..., 'VIEW_ALL_REVIEWS')`, failing closed before any repository call.
- Reusable pieces are the three checker ports in `apps/api/src/shared/application/authorization/` (`community-scope.checker.port.ts`, `company-scope.checker.port.ts`, `manager-capability.checker.port.ts`). The `switch` itself is history-specific and cannot be called as-is. It returns `ReviewSession[]`, and its repository methods are completed-session reads, which suits an "all sessions in my scope" read but not a per-community due view.
- The community checker's `listAssignedCommunityIds` takes `(userId, role)` and returns `[]` for roles with no assignment kind. It resolves per role and does not return the technician's performed communities.

**Patterns to copy [V]**
- API:
  - `list-review-history.use-case.ts`: access service, then a batched name and email lookup, then DTO rows.
  - `review-history.controller.ts`: `@RequirePermission('reviewSession:read')`, OpenAPI decorators, `mapError`, and the actor taken from `@CurrentUser`.
  - `review-history-row.dto.ts`.
  - `review-session.module.ts` for registration.
  - `prisma-review-document-name-directory.ts` as the precedent for a module-local Prisma lookup port.
  - `PrismaCommunity` lookups go through `CommunityRepository.findById` and `findAll` (`community.repository.port.ts:20-24`).
- Web:
  - `apps/web/src/pages/ReviewHistoryPage.tsx` (loading, error, empty and table states).
  - `apps/web/src/api/review-history.ts`.
  - `apps/web/src/layout/nav-items.ts`: `NAV_ITEMS_BY_ROLE ... satisfies Record<Role, ...>`, so a new item must be placed for all five roles or deliberately omitted.
  - `apps/web/src/routes/authenticated-routes.tsx`: path, element and `allowedRoles`.
  - i18n in `apps/web/src/i18n/locales/{en,es,ca}.json` (`reviewHistory` block at `en.json:459`, `nav` at `en.json:544`).
  - Tests: `ReviewHistoryPage.test.tsx`.

**Existing specs that forbid due logic today [V]**
- `review-session-management/spec.md:531` and scenario `:566-569`: "No scheduling or due-date logic exists" in the shipped code.
- `review-history/spec.md:1083` and `:1121-1124`: no overdue or due-date computation derived from an element's record, no stored `lastInspectedAt`, and a "second element-keyed surface" ban. Lines `:50` and `:1082` also say history has no list controls or scheduling.
- `review-history-ui/spec.md:117`: no overdue or due indicator on the element history page. `review-session-ui/spec.md:327` and `:353` ban due-date indicators in the field flow.
- These bind those capabilities' own surfaces. A new capability and module does not violate them. The scenario at `review-session-management/spec.md:566` ("the shipped code ... searched for due dates ... none MUST be found") is written globally, though. Its delta needs a "(Previously: ...)" narrowing to "in this capability's own surface" when the proposal is written, as earlier slices did.
- The nearest direct precedent, `review-history-per-element`, was allowed because it explicitly narrowed the matching guard scenarios.

## 2. What a due list can be derived from, and the unit of due

**Can "due" be computed from existing data? Yes, with no schema change [V/I].**
- `last completed session per (communityId, elementType, frequency)` comes from `ReviewSession WHERE status='completed'` joined to its frozen template row (`templateId` gives `elementType` and `frequency`). A retired template keeps its `elementType` and `frequency`, so replacing a template version does not change lineage membership. A last-completed lookup grouped by `(communityId, template.elementType, template.frequency)` is stable across version replacement.
- What is expected to exist comes from `(community, elementType)` pairs with at least one active, non-deactivated element, crossed with the frequencies for which an `active` template exists (`ReviewTemplateRepository.findActiveByElementType`).
- A due date needs an interval rule: `lastCompletedAt + interval(frequency)`. That rule is not in code and has to be introduced as constants, which ADR-008 supports (regulation-defined constants, like the hydrostatic interval in `domain-model-inspections.md:235-238`).
- A `lastInspectedAt` field on elements is explicitly not stored (`domain-model-inspections.md:219`), and `review-history` forbids a projection. This is compatible with deriving it.

**Candidate units**

| Unit | Supported with no schema change? | Cost | Fit |
|---|---|---|---|
| A. `(community, elementType, frequency)` | Yes. One aggregate query over `ReviewSession` joined to template, plus the existing community and element lookups. | Low. | Matches the docs' cadence policy and what a session actually covers. |
| B. Per element | Derivable through `ElementReviewEntry.inspectableElementId` joined to session and template. The entry index exists. | Medium. Many rows per community and a join per element. | Redundant with A because completion enforces full coverage. The one divergence is an element added after the last session, which would be correctly "never reviewed" here but is not a visible gap in A. [I] |
| C. Template lineage `(elementType, frequency)` only | Yes. | Lowest. | Wrong. It ignores which community was reviewed and hides overdue communities. |

Recommended unit is A, per community. Per-element due is a deferred refinement.

**ANNUAL versus QUARTERLY [V from docs, I for code]:** the docs say there is one session per quarter per `(community, elementType)`, and that `ANNUAL` can substitute for a quarter. A naive per-frequency due list would show `QUARTERLY` as overdue even when an `ANNUAL` session was done this quarter. This is an open product question (see section 4).

## 3. Approaches

| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| 1 | **Unit A, per-frequency, strict.** For each `(community, elementType, frequency)` that has an active template and at least one active element, compare the last completed session's `completedAt` against `now` and fixed intervals (MONTHLY 1 month, QUARTERLY 3, SEMIANNUAL 6, ANNUAL 12). A never-reviewed pair is overdue. | Smallest read-only slice. Needs no schema change. Follows the docs' own cadence unit. | Ignores the ANNUAL-substitutes-for-QUARTERLY rule, so it can over-report. Needs the `Clock` port. | Medium |
| 2 | **Unit A with ANNUAL substitution.** As 1, but a completed ANNUAL session in the quarter satisfies QUARTERLY. | Matches the documented policy (calendar quarters, 12-month ANNUAL gap). | Needs calendar-quarter logic, which is more than "thinnest", and a product decision on the rule. | Medium-High |
| 3 | **Per element (B).** | Handles elements added after the last session. | More rows, more joins, and a surface with redundant information. Higher scope and risk. | High |

**Recommendation: approach 1, with the ANNUAL substitution as an explicit product decision before spec.** It is the thinnest end-to-end read slice and is consistent with ADR-006. The substitution rule is the largest product risk. If it is out, the list will over-report QUARTERLY items for communities that do ANNUAL in a quarter.

**Scope cut for the first slice [I]:** the thinnest correct first cut is the roles whose scope is cheapest to express with the existing checkers.
- `SYSTEM_ADMIN` and a granted `MANAGER`: installation-wide, no scope predicate. Cheapest.
- `COMMUNITY_REPRESENTATIVE`: `listAssignedCommunityIds`.
- `MAINTENANCE_TECHNICIAN`: assigned communities via the same checker. Note this differs from history, where the technician sees performer-based scope. A due list is about communities needing work, so an assignment-based scope fits better. This is a product question.
- `MAINTENANCE_COMPANY_MANAGER`: a company has no direct community set, only the frozen `performedByCompanyId` on sessions. A company has no assignment to a community, so "which communities is my company responsible for?" has no answer in the model today. This is the hardest scope and the one to drop from slice 1 if a cut is needed.

## 4. Edge cases and open product questions

For the product question round, phrased as business questions.

1. **Interval rule.** Is the interval a fixed number of months since the last completed session (rolling), or a calendar period (the quarter you are in)? The docs say calendar quarter for QUARTERLY and a 12-month gap from the actual date for ANNUAL.
2. **ANNUAL versus QUARTERLY.** If a community completes an ANNUAL review during a quarter, does that count as that quarter's QUARTERLY review?
3. **"Upcoming" window.** How many days ahead counts as upcoming (for example 7, 14 or 30), and is it fixed or configurable? A fixed constant is the thinnest option.
4. **Never reviewed.** A `(community, elementType)` with elements and an active template but no completed session: overdue from when (installation date, template activation, element `installedAt`), or a separate "never reviewed" state?
5. **No active template.** An element type with elements but no active template for a frequency. Is that "not due" (nothing can be done), or a visible gap?
6. **Draft sessions.** A draft does not count as completion. Should the list show "in progress" for a pair with an open draft?
7. **Soft-deleted or deactivated.** A soft-deleted community drops out (ADR-010). Deactivated elements do not count. If every element of a pair is deactivated, the pair is not due.
8. **Element added after the last session.** With per-community units this is invisible (the old session still counts). Is that acceptable, or must a new element make its community due immediately?
9. **Retired template replaced.** Lineage `(elementType, frequency)` is stable across versions, so replacement does not reset the clock. Confirm this is the intended behaviour.
10. **Who sees what.** Do technicians see due items for assigned communities (assignment-based), or only for work they performed (like history)? Does `MAINTENANCE_COMPANY_MANAGER` need a view in slice 1, given the model has no company-to-community link?
11. **Which frequencies are supported in slice 1.** All four, or only those with an active template? (The model supports any combination.)

## 5. Explicitly deferred

- Reminder sending, email, queues, scheduled jobs and notification channels (no infrastructure exists).
- Per-element due and last-inspected displays (`lastInspectedAt` is deliberately not stored).
- Configurable intervals or windows, due-date overrides, snoozes and calendar views.
- Company-to-community responsibility modelling.
- Filters, sorting, pagination and search (the web list is unfiltered today).
- Notification preferences, recipients and per-user reminder state.
- The hydrostatic-test clock, which is per element and out of scope.

## 6. Risks

- **Existing negative specs.** Four specs forbid due logic in their own surface. A new capability sidesteps most of them, but `review-session-management/spec.md:566` is written globally and needs a narrowing delta.
- **Interval rule unspecified in code.** Intervals and calendar-quarter logic are docs-only. A wrong rule produces a misleading compliance list. Mitigation: pin the rule in the spec and cover boundaries with tests.
- **No clock port.** Time-dependent tests need either a new `Clock` port or an injected `now` parameter. Without one, tests rely on global fake timers, which the repo has not used in `apps/**`.
- **Scope-model mismatch.** The existing access service is history-specific. Reusing the checkers is safe, but copying its `switch` risks drifting from the five scope rules. Any new read must fail closed, as the history spec requires.
- **N+1 on community names.** `ListReviewHistoryUseCase` already notes an unbounded `findById` loop for the installation-wide scope. A due list can span every community, so a batched lookup (the `PrismaReviewDocumentNameDirectory` precedent) is preferable.
- **Aggregate query.** The last-completed lookup groups by community and template lineage. The existing `(status, completedAt, id)` and `communityId` indexes probably suffice for the expected volume [I], but no plan was measured.
- **Walking-skeleton drift.** Reminders, per-element due and configurable intervals are easy to pull in. Keep the slice read-only.
- **Permission.** `permission.ts` is a closed union. Reusing `reviewSession:read` is simplest (all five roles have it, `role-permission.checker.ts:45,61,69,78,85`), but a new `reviewSchedule:read` would be cleaner and affects the permission table, its spec and tests. This is a design decision.

## 7. Rough size estimate

Estimates [I], based on the file counts of the closest slices.

- **API, about 10-14 files, roughly 300-450 lines of logic plus tests:**
  - a new `Clock` port plus a system implementation;
  - a pure due-calculation function with interval constants;
  - one use case, one controller route, one DTO and a module registration;
  - one repository method (or a module-local read port) returning the last completed session per `(community, template lineage)`;
  - the access resolution reusing the existing checker ports;
  - unit tests with a fake `Clock`, plus an integration spec for the aggregate query.
- **Web, about 6-8 files:** one page, one API client module, a route entry, nav items for the roles that get it, and i18n keys in `en`, `es` and `ca`, plus tests.
- **Specs and docs:** a new `review-schedule` capability spec and `review-schedule-ui` spec, narrowing deltas to `review-session-management` (and probably `review-history`), and FR-009 status in `docs/requirements/functional-requirements.md`.
- This is probably one PR chain of 2-4 PRs under the 400-line budget, subject to the scope cut and the ANNUAL decision.

## Ready for proposal

**Yes**, after a product question round. The thinnest slice is a read-only per-community due and overdue list with fixed intervals and no reminders. The hypothesis holds: nothing in the code makes the read-only first slice unworkable. Questions 1, 2, 4 and 10 are the ones that change the shape of the proposal.
