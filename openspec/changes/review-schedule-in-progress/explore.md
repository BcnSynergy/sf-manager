# Exploration: Review Schedule In-Progress Marker (TD-22)

## Problem

The review schedule (`GET /review-schedule`, `ReviewSchedulePage`) shows one
row per (community, element type) pair. Drafts never cover a quarter or an
annual obligation, and they do not change a row's status or position
(`review-schedule` design.md Decision 8). A pair that someone is already
reviewing therefore looks the same as one nobody has started, so two users
can begin the same review without knowing it. TD-22
(`docs/technical-debt.md`) and archive follow-up 6 of `review-schedule`
record this as deferred.

## Current read path

- Port: `ReviewScheduleReader.listPairs(scope, since)` returns `SchedulePair`
  (`communityId`, `communityName`, `elementType`, `coverage`)
  (`application/ports/review-schedule.reader.port.ts:15-25`). The use case
  sees coverage dates only, no session rows.
- Use case: `ListReviewScheduleUseCase.execute` maps each pair through
  `evaluateReviewDue(pair.coverage, now)` and sorts with
  `compareScheduleRows` (`list-review-schedule.use-case.ts:83-107`).
- Prisma reader: exactly six typed queries, no raw SQL
  (`prisma-review-schedule.reader.ts:101`). q3 loads `QUARTERLY`/`ANNUAL`
  templates in `active` or `retired` status; q4-q6 read completed sessions
  only (`status: 'completed'`). An integration test pins the count at six
  (`prisma-review-schedule.reader.integration.spec.ts:697`).
- HTTP: the controller maps rows field by field into `ReviewScheduleRowDto`
  (`review-schedule.controller.ts:35-46`).
- Web: `ReviewScheduleRow` mirrors the DTO with no runtime parsing
  (`apps/web/src/api/review-schedule.ts:23-37`). The status cell is plain
  text (`ReviewSchedulePage.tsx:78`).

## Draft facts

- `ReviewSession.status` is `draft | completed`; there is no `deletedAt`.
  Discarding a draft is a hard delete
  (`prisma-review-session.repository.ts:251-256`).
- A partial unique index allows one draft per (community, template,
  performer), so several users can each hold a draft for the same pair.
- A draft keeps pointing at its frozen template version after a newer
  version activates; that version becomes `retired`, and the draft can still
  be completed. q3 already returns active and retired versions.

## Options

1. **Seventh reader query + pass-through flag (chosen).** A q7
   `reviewSession.findMany` (or `groupBy`) for drafts in scope whose
   `templateId` is in q3's set, folded to the existing `pairKey`.
   `SchedulePair` gains `inProgress: boolean`, kept outside
   `PairCoverage` so the due policy and sort never see it.
2. Fold drafts into q6 by widening its status filter. Rejected: q6 feeds
   coverage, and mixing drafts in risks them covering a quarter.
3. Separate endpoint for draft markers. Rejected: a second request and a
   client-side join for one boolean.

## User decision

2026-10-16: the marker shows when **any** user holds an open draft (option A),
not only the caller's own. It shows existence only: no owner, no link.
Only drafts on `QUARTERLY` or `ANNUAL` templates of the row's element type
count, because only those would cover the obligation once completed.
