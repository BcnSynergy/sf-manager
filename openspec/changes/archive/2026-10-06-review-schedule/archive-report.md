# Archive Report: review-schedule

**Change**: review-schedule — Review Schedule: Overdue and Upcoming Reviews (FR-009, slice 1)
**Archived**: 2026-10-06
**Archived to**: `openspec/changes/archive/2026-10-06-review-schedule/`
**Mode**: hybrid (filesystem merge plus Engram report)
**Verdict carried from sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 3 WARNING, 3 SUGGESTION. Archived as **intentional-with-warnings**: the user approved archiving and explicitly accepted warning 1 (missing Strict TDD evidence table) as non-blocking.
**Engram traceability**: explore `sdd/review-schedule/explore` (#396), proposal `sdd/review-schedule/proposal` (#406), spec `sdd/review-schedule/spec` (#409), design `sdd/review-schedule/design` (#410), tasks `sdd/review-schedule/tasks` (#413), apply-progress `sdd/review-schedule/apply-progress` (#415), verify-report `sdd/review-schedule/verify-report` (#431, mirrored in `verify-report.md`). Product decisions 4-11: #400, #402, #403, #404, #405, #407, #408. Size exception: #414. PR 9 merge record: #430.

## Task Completion Gate

Read `openspec/changes/review-schedule/tasks.md` before any merge. Tasks 1.1-9.3 are all `[x]` (66/66). The artifact has no archive task, and no stale-checkbox reconciliation was needed. The archived copy of `tasks.md` is identical to the source.

## Specs Synced

| Capability                  | Action                                          | Requirements added / modified / removed                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-schedule`           | Created (new capability, delta was a full spec) | 10 requirements (A Pair Exists Only While the Community Has a Live Element of the Type; What Covers a Quarter; The Quarterly Obligation; The Annual Obligation; NEVER_REVIEWED Is Exclusive and Makes No Overdue Claim; One Combined Status per Pair; Every Pair in Scope Is Listed, Worst First; Scope Follows the Caller's Role; The Schedule Is Read-Only and Computed on Read; Community Names Are Resolved Without Per-Row Lookups) |
| `review-schedule-ui`        | Created (new capability, delta was a full spec) | 7 requirements (One Schedule Page Behind One Route; The Page Renders Loading, Empty, Error and Table States; Each Row Shows Status, One-Line Reason and Last Review; The Page Offers No Controls Beyond Reading; Navigation Placement for the Four Roles; Internationalization Coverage; The Page Is Verified in a Real Browser)                                                                                                         |
| `authorization`             | Updated                                         | 1 added (_Permission and Scope Check on the Review Schedule Endpoint_, 7 scenarios) / 11 modified (see below) / 0 removed; Purpose hand-edited                                                                                                                                                                                                                                                                                           |
| `app-navigation`            | Updated                                         | 1 added (_The Manager's Schedule Item Is Gated on the Role Alone_, 3 scenarios) / 4 modified (_The Role → Navigation Items Map Is Exhaustive and Fixed_ — table now 9/4/4/2/3, plus one added scenario; _The Manager's History Item Is Gated on the Role Alone_; _Route Gating Is Unchanged by the Wrapping_; _The Navigation Stays a Link Bar and Nothing More_) / 0 removed; Purpose sentence scoped to the navigation's introduction  |
| `dev-seed-data`             | Updated                                         | 1 added (_Review Schedule Visibility_, 2 scenarios) / 3 modified (_Dev Dataset Contents_ + 2 scenarios; _Idempotent Additive Seeding_ + 3 scenarios, one reworded; _Fail-Soft on Conflicting State_, MONTHLY → QUARTERLY in two scenarios + 1 ANNUAL scenario) / 0 removed                                                                                                                                                               |
| `review-history`            | Updated                                         | 0 added / 2 modified (_The Deferred Review Visibility Scopes Are Not Built_ — three rows narrowed for review-schedule, 2 scenarios added, 2 reworded; _The Review Document Read Inherits the Session-Level History Guards_ — reconciling note updated) / 0 removed                                                                                                                                                                       |
| `review-history-ui`         | Updated                                         | 0 added / 2 modified (_No Filtering, Analytics or Adjacent Controls Ship_ — schedule page and nav item named as permitted, 1 scenario added, 2 restated; _The System Admin Reaches the Shipped History Surface Unchanged_ — stale item counts removed); Purpose clause added                                                                                                                                                             |
| `review-session-management` | Updated                                         | 0 added / 1 modified (_Adjacent Review Capabilities Are Not Introduced_ — FR-008 and FR-009 rows narrowed, 2 scenarios reworded) / 0 removed                                                                                                                                                                                                                                                                                             |
| `review-session-ui`         | Updated                                         | 0 added / 1 modified (_No Offline, History or Scheduling Surface_ — nav item permitted, 1 scenario added, 3 restated); Purpose clause added                                                                                                                                                                                                                                                                                              |
| `review-document`           | Updated                                         | 0 added / 1 modified (_Document Visibility Is Exactly the Review-History Scope_ — "added by this read" scoping, 1 scenario rewritten) / 0 removed                                                                                                                                                                                                                                                                                        |
| `user-admin-ui`             | Updated                                         | 1 added (_The Capability Toggle Label Names Every Surface It Gates_, 2 scenarios) / 0 modified / 0 removed                                                                                                                                                                                                                                                                                                                               |

`authorization` MODIFIED requirements (11): _The Organization Profile Grants Nothing Beyond Itself_; _Non-Admin Roles Remain Inert After the Checklist Permissions Are Added_ (+1 scenario _The company manager holds no schedule permission_); _Technician and Representative Become Operational_; _The Maintenance Company Manager Becomes Operational_; _The System Admin Becomes Operational on Review History Reads_; _The Manager Becomes Operational on Review History Reads, Gated by a Granted Capability_; _Installation-Wide Review History Scope for a Manager Holding VIEW_ALL_REVIEWS_; _The Element-Keyed Review History Read Is Gated on reviewSession:read, Never on inspectableElement:read_; _Permission Check on Community and Assignment Endpoints_; _Assignments Confer No Permission Outside the Review-Session Surface_; _The Deferred Review Visibility Scopes Grant Nothing_ (+1 scenario _The schedule's installation-wide result is reachable from the same two paths_).

All merges preserved every requirement not named in a delta. No REMOVED requirements appeared in any of the 11 deltas, so no `(Reason: ...)` / `(Migration: ...)` note was needed. Where a delta restated a requirement's "(Previously: ...)" note, the delta's note replaced the older one, as the delta block is the new text of the whole requirement. The two new main specs use the titles `# Review Schedule` and `# Review Schedule UI` (the delta files were headed "... Specification"), matching the main-spec title convention; the archived delta copies keep the original headings.

### Main spec files changed

New:

- `openspec/specs/review-schedule/spec.md`
- `openspec/specs/review-schedule-ui/spec.md`

Updated:

- `openspec/specs/authorization/spec.md`
- `openspec/specs/app-navigation/spec.md`
- `openspec/specs/dev-seed-data/spec.md`
- `openspec/specs/review-history/spec.md`
- `openspec/specs/review-history-ui/spec.md`
- `openspec/specs/review-session-management/spec.md`
- `openspec/specs/review-session-ui/spec.md`
- `openspec/specs/review-document/spec.md`
- `openspec/specs/user-admin-ui/spec.md`

## Purpose Edits (hand-edited, not expressible in a delta)

### `openspec/specs/authorization/spec.md` (tasks.md "Archive Prep" item 1)

1. Technician and representative sentence.
   - Before: "`MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` are additionally operational, but **only** on the review-session surface, subject to a second, composable dimension — ..."
   - After: "... are additionally operational, but **only** on the review-session surface and the review schedule read (`reviewSchedule:read`), subject to a second, composable dimension — ..."
2. Company manager sentence.
   - Before: "`MAINTENANCE_COMPANY_MANAGER` is operational on the review history reads only, holding `reviewSession:read` alone."
   - After: "`MAINTENANCE_COMPANY_MANAGER` is operational on the review history reads only, holding `reviewSession:read` alone: it holds no `reviewSchedule:read` and does not reach the review schedule surface (the schedule endpoint refuses it with `403`)."
3. `MANAGER` sentence.
   - Before: "No role is fully inert any longer: `MANAGER` holds `reviewSession:read` too — the **fifth** role operational on the review-history read surface, ..."
   - After: "No role is fully inert any longer: `MANAGER` holds `reviewSession:read` and `reviewSchedule:read` — the **fifth** role operational on the review-history read surface, ..."
4. Extra consistency fix (not named in Archive Prep, needed so the Purpose is not false): the element-keyed sentence said "no `ROLE_PERMISSIONS` change of any kind". It now reads "no `ROLE_PERMISSIONS` change by that read's introduction (the later review schedule read adds `reviewSchedule:read`, per the paragraph above)".

### Other Purpose clauses required by delta headers

- `openspec/specs/app-navigation/spec.md`: "There is **no** backend change of any kind" became "The navigation's introduction made **no** backend change of any kind ... (The later Review schedule item points at a page backed by `GET /review-schedule` and `reviewSchedule:read`, added by the `review-schedule` change; the navigation itself stays client-only.)"
- `openspec/specs/review-history-ui/spec.md`: out-of-scope list now says the history surface still ships no scheduling or overdue indicator, and that scheduling lives on the separate review-schedule page (`review-schedule-ui`).
- `openspec/specs/review-session-ui/spec.md`: "due-date or overdue indicators" now notes that the field flow's own views add none, and that the global navigation's Review schedule item is an explicitly permitted entry to `review-schedule-ui`.

Not touched, as instructed: the PR 1 `README.md` and `CLAUDE.md` edits and the PR 9 `docs/requirements/functional-requirements.md` change (FR-009 set to `partial`).

## Verification of the merge

Each touched main spec was re-checked after merging. Every ADDED requirement and every MODIFIED requirement named in a delta now carries the delta's text, including every scenario listed there (new scenarios added in place: _The company manager holds no schedule permission_, _The schedule's installation-wide result is reachable from the same two paths_, _The schedule read leaves the review-session port's bound intact_, _The capability gates only the history reads and the schedule's installation-wide scope_, _The schedule page's per-pair date is not a per-element rollup_, _The global navigation's Review schedule item is permitted on field-flow pages_, _Review schedule is offered to four roles and not to the company manager_). Requirements not named in a delta (for example _Company-Wide Review History Scope for a Maintenance Company Manager_, _Entry-Level Resource Scope for the Element-Keyed Review History Read_, _Resource Scope for Review History Reads_ in `authorization`) are unchanged.

## Archive Contents

- `proposal.md` ✅
- `explore.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (66/66 tasks complete)
- `verify-report.md` ✅
- `archive-report.md` ✅ (this file)
- `specs/authorization/spec.md` ✅
- `specs/app-navigation/spec.md` ✅
- `specs/dev-seed-data/spec.md` ✅
- `specs/review-document/spec.md` ✅
- `specs/review-history/spec.md` ✅
- `specs/review-history-ui/spec.md` ✅
- `specs/review-schedule/spec.md` ✅
- `specs/review-schedule-ui/spec.md` ✅
- `specs/review-session-management/spec.md` ✅
- `specs/review-session-ui/spec.md` ✅
- `specs/user-admin-ui/spec.md` ✅

## Accepted warnings carried forward

- **W-1 (accepted by the user, non-blocking)**: apply-progress (#415) has no "TDD Cycle Evidence" table, and RED/GREEN order is not provable from git because implementation and spec landed in the same commits. The strict module treats a missing table as CRITICAL; sdd-verify downgraded it because `tasks.md` encodes RED-before-GREEN for every task, every referenced test file exists and passes, and each PR got a fresh-context review. No reconstruction was made at archive time.
- **W-2**: the scenario "Pairs are per element type" (_A Pair Exists…_) has no test, because only `EXTINGUISHER` exists as an element type. Tracked as a design follow-up; the reader groups by `(communityId, elementType)`, so the behaviour is structural.
- **W-3**: the e2e guard in `review-session.e2e-spec.ts` exempts the schedule surface by exact relative path. Every other file is still scanned (mutation-checked in task 9.2). It is a hand-maintained allowlist.

### Accepted suggestions

- **S-1**: `ReviewSchedulePage` row `data-testid`s use `communityId` only.
- **S-2**: tables lack `<caption>` and `scope="col"` (both schedule and history pages).
- **S-3**: the soft-deleted manager is covered at e2e with fakes only, not through the real `PrismaUserRepository`.

## Follow-ups (design.md "Follow-ups", six items, none part of this change)

1. Row `data-testid`s in `ReviewSchedulePage` use `communityId` only. They must include `elementType` as soon as a second `ElementType` exists, or two rows for one community collide.
2. `ReviewSchedulePage` and `ReviewHistoryPage` tables lack `<caption>` and `scope="col"` on headers. Fix both in one cross-cutting accessibility change, not per page.
3. Compile-time single-member check for the `ManagerCapability` TypeScript union (`apps/api/src/modules/users/domain/manager-capability.ts` has `VIEW_ALL_REVIEWS` as its only member today; the schedule scope logic assumes that, so a second capability should fail the build until the logic is revisited).
4. Optional integration test for a soft-deleted manager through the real `PrismaUserRepository`.
5. The "Pairs are per element type" behaviour cannot be tested end to end while `ElementType` has only `EXTINGUISHER`; add the scenario when a second type ships.
6. The "in progress" marker on a pair with an open draft is deferred (Decision 8: status and sort are unchanged by drafts).

Related, from the proposal's open questions: company-manager scope (needs a company-to-community link), an element added after the quarter's session (decision 9), and reminders (the second half of FR-009).

## PR List

PR chain #177–#185 (stacked-to-main, delivery strategy ask-on-risk; `size:exception` accepted for PR 1 and PR 6, and for PRs 3, 4, 5 and 8 where test tables pushed them over, per #414):

| PR   | Scope                                                                               |
| ---- | ----------------------------------------------------------------------------------- |
| #177 | PR 1 — Seed: QUARTERLY + ANNUAL templates, S4, README/CLAUDE.md, planning artifacts |
| #178 | PR 2 — `Clock`, `ClockModule`, `FixedClock`, Madrid calendar helpers                |
| #179 | PR 3 — Pure due policy (`evaluateReviewDue`)                                        |
| #180 | PR 4 — Reader port, fake, Prisma adapter, integration spec                          |
| #181 | PR 5 — `reviewSchedule:read`, `compareScheduleRows`, use case                       |
| #182 | PR 6 — DTO, controller, module, `AppModule`, e2e, wiring integration                |
| #183 | PR 7 — Web client, labels helper, i18n keys                                         |
| #184 | PR 8 — Page, route, nav, Decision 12 label, browser pass (8.10, done 2026-10-06)    |
| #185 | PR 9 — FR-009 docs (`partial`), final check, archive prep                           |

## Source folder removal and commit (resolved)

The `sdd-archive` executor has no Bash access, so it could not delete the source folder or commit. The orchestrator did both in the archive commit on branch `review-schedule/10-archive`: it replaced the executor's copies with byte-identical copies of the source files (the executor's copy of the authorization delta had drifted in content), deleted `openspec/changes/review-schedule/`, and committed the move together with the main spec changes. Git records every moved file as a 100% rename.

## SDD Cycle Complete

The change has been fully planned, implemented, verified and archived. `review-schedule` (FR-009 slice 1) is closed. FR-009 stays `partial`: reminders and notifications are the remaining half and would start as a new `/sdd-new`.
