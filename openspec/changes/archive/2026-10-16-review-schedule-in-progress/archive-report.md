# Archive Report: review-schedule-in-progress

**Archived**: 2026-10-16
**Archive path**: `openspec/changes/archive/2026-10-16-review-schedule-in-progress/`
**Artifact store**: openspec files canonical; Engram notes under `sdd/review-schedule-in-progress/*`
**Branch**: `review-schedule-in-progress/02-archive` (from main at 256fffd)

## Outcome

Resolves TD-22. Each review schedule row now carries `inProgress`, true while
any user holds an open `QUARTERLY` or `ANNUAL` draft for the pair, and the web
page shows "(In progress)" after the status label. Status, reason, deadline,
last review date and order are unchanged; the row names no owner.

- `PrismaReviewScheduleReader`: seventh typed query (q7, `groupBy` of drafts
  by community and template, same scope filter), folded with the existing
  `pairKey`.
- `SchedulePair.inProgress` and `ReviewScheduleRow.inProgress`, outside
  `PairCoverage`; the use case copies it after `evaluateReviewDue`.
- `ReviewScheduleRowDto.inProgress` and controller mapping.
- Web: row type, `IN_PROGRESS_LABEL_KEY`, marker span, en/es/ca keys.

## Delivery (final state)

| PR               | Content                                                  | Merge   |
| ---------------- | -------------------------------------------------------- | ------- |
| #235 (PR 1/2)    | Implementation, tests, delta specs, artifacts, registers | 256fffd |
| PR 2/2 (archive) | This change; number not known at writing time            | pending |

## Specs Synced

| Domain             | Action  | Details                                                                                                                                  |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| review-schedule    | Updated | 1 ADDED requirement "An Open Draft Marks a Pair as In Progress" (10 scenarios), appended; Purpose gains one sentence (design Decision 5) |
| review-schedule-ui | Updated | 1 ADDED requirement "An In-Progress Row Shows a Marker" (5 scenarios), placed before "Navigation Placement for the Four Roles"           |

No requirement was modified or removed. The SDD skills and the native
`gentle-ai sdd-archive-compose` command are no longer installed
(gentle-ai 4.1.1), so the ADDED blocks were inserted by a script and the line
endings of each main spec were preserved; `git diff` shows only the added
blocks and the Purpose sentence.

## Tasks

All tasks in `tasks.md` are checked. TDD evidence and the browser pass are in
`verify-report.md`.

## Reviews

- Native RDD review on the implementation (risk, reliability): approved.
- Native RDD review on the full PR 1 candidate (reliability): approved.
- Fresh-context review: APPROVE WITH NITS, no blocker.

## Registers

- TD-22 moved to Resolved (#235).
- Added: EN-53 (use-case order test flags every pair), EN-54 (draft on
  another element type; needs a second `ElementType`), EN-55 (widened
  `groupBy` status type; combined coverage-plus-draft reader test).
- Added in this archive PR: EN-56 (the "Marker in the browser" scenario
  depends on an unpinned seed draft), from the archive native review.
- `review-schedule` archive follow-up 6 (the deferred "in progress" marker)
  is done by this change.

## Notes

- Design Decision 2's fallback was used: a draft-only `groupBy` overload in
  the structural Prisma type is not assignable from `PrismaService`.
- During the browser pass the API dev server had crashed because
  `npm run build` rewrote `apps/api/dist` under `nest start --watch`; restart
  the dev server after a full build.
