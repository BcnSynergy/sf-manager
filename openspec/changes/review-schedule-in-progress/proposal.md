# Proposal: Review Schedule In-Progress Marker (TD-22)

## Intent

The review schedule gives no sign that a pair is already being reviewed.
Drafts deliberately do not cover an obligation or move a row (`review-schedule`
design.md Decision 8), so a pair with an open draft looks exactly like one
nobody has started. Two users assigned to the same community can each open a
review of it without knowing.

This is TD-22 (`docs/technical-debt.md`) and `review-schedule` archive
follow-up 6.

Success: a schedule row shows an "In progress" marker while any user holds an
open draft on a `QUARTERLY` or `ANNUAL` template of that row's element type in
that community; the row's status, reason, deadline, and position are unchanged.

## Scope

### In Scope

- API: each `GET /review-schedule` row gains `inProgress: boolean`.
- It is true when at least one `draft` session exists for the row's community
  on a template whose element type is the row's and whose frequency is
  `QUARTERLY` or `ANNUAL`, in `active` or `retired` status (a draft frozen
  against a replaced version still counts). Who opened the draft does not
  matter (user decision, option A).
- The flag never feeds the due policy or the sort.
- The Prisma reader gets a seventh typed query for drafts; the query-count
  integration test moves from six to seven, still constant for 2 and 20
  communities.
- Web: the status cell shows an "In progress" marker (en/es/ca) when the
  flag is true. Text only: no owner, no link, no control.
- Delta specs for `review-schedule` and `review-schedule-ui`.
- TD-22 moves to Resolved in the delivering PR.

### Out of Scope

- Showing who holds the draft, how many drafts exist, or when they started.
- A link from the row to the draft or to "open review". Only the opener may
  resume a draft (`review-session-management`), so a link would fail for
  everyone else.
- Any change to coverage, status, reason, deadline, or order. Decision 8 stays.
- `MONTHLY` and `SEMIANNUAL` drafts: they never cover, so they do not mark.
- Filtering or sorting by the marker.
- Dev seed changes. The seed already holds one draft; the browser pass uses it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-schedule`: new requirement "An Open Draft Marks a Pair as In
  Progress" with scenarios for quarterly and annual drafts, another user's
  draft, a draft on a retired version, non-covering frequencies, other
  communities and element types, discard and completion, and unchanged
  status and order.
- `review-schedule-ui`: the page shows the marker in the status cell of a
  row whose `inProgress` is true, and nothing for the rest.

## Approach

Exploration option 1:

- `SchedulePair` gains `inProgress: boolean`, outside `PairCoverage`.
- `PrismaReviewScheduleReader` adds q7: drafts in scope (`communityId`
  filter as in the other queries) whose `templateId` is in q3's template
  set, folded with the existing `pairKey(communityId, elementType)`.
- `ListReviewScheduleUseCase` copies the flag into `ReviewScheduleRow`
  after `evaluateReviewDue`; the controller and DTO add the field.
- Web: `ReviewScheduleRow` gains `inProgress`; the page renders a marker
  span with its own test id after the status label.

Strict TDD per layer: reader integration (real Postgres), use-case unit,
API e2e (DTO shape), web page test. Browser pass with the seeded draft.

## Affected Areas

| Area                                                                       | Impact   | Description                                         |
| -------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| `apps/api/src/modules/review-schedule/application/ports/...reader.port.ts` | Modified | `SchedulePair.inProgress`                           |
| `apps/api/src/modules/review-schedule/infrastructure/persistence/...`      | Modified | q7 drafts query, structural Prisma type, count test |
| `apps/api/src/modules/review-schedule/application/use-cases/...`           | Modified | Pass `inProgress` through to the row                |
| `apps/api/src/modules/review-schedule/presentation/...`                    | Modified | DTO field and controller mapping                    |
| `apps/api/test/review-schedule.e2e-spec.ts`                                | Modified | Response shape includes `inProgress`                |
| `apps/web/src/api/review-schedule.ts`                                      | Modified | Row type                                            |
| `apps/web/src/pages/ReviewSchedulePage.tsx`                                | Modified | Marker in the status cell                           |
| `apps/web/src/i18n/locales/{en,es,ca}.json`                                | Modified | `reviewSchedule.inProgress`                         |
| `openspec/changes/review-schedule-in-progress/specs/...`                   | New      | Delta specs                                         |
| `docs/technical-debt.md`                                                   | Modified | TD-22 to Resolved                                   |

## Risks

| Risk                                                           | Likelihood | Mitigation                                                                      |
| -------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| A draft starts covering by accident                            | Low        | The flag lives outside `PairCoverage`; existing "ignores a draft" tests stay    |
| The marker reveals a draft in a community the caller can't see | Low        | q7 uses the same scope filter; rows only exist for in-scope pairs               |
| Query count grows with communities                             | Low        | q7 is one query; the constant-count test covers 2 and 20 communities            |
| A row's status or order shifts                                 | Low        | Scenario and use-case test: same pairs with and without drafts sort identically |

## Rollback Plan

Revert the implementation PR. No migration, no persisted state, and an
additive response field; reverting removes the field and the marker. If
reverted after archive, TD-22 moves back to Open and the spec requirement is
removed in the same revert PR.

## Dependencies

None.

## Delivery

- Strategy: `ask-on-risk`; chain strategy `stacked-to-main`.
- Estimated size: about 300 authored changed lines (source about 60, tests
  about 170, specs, i18n and registers about 70), under the 400-line budget.
- PR 1/2: implementation, tests, delta specs, TD-22 to Resolved, and the
  change artifacts. Branch `review-schedule-in-progress/01-draft-marker`.
- PR 2/2: archive. Branch `review-schedule-in-progress/02-archive`.

## Success Criteria

- [ ] A row shows `inProgress: true` while any user holds a `QUARTERLY` or
      `ANNUAL` draft for that community and element type, including one
      frozen against a retired version.
- [ ] `MONTHLY`/`SEMIANNUAL` drafts, drafts in other communities, and
      completed or discarded sessions leave it false.
- [ ] Status, reason, deadline, last review, and order are identical with
      and without drafts.
- [ ] The reader stays at a constant query count (seven) for 2 and 20
      communities.
- [ ] The page shows the marker in en/es/ca for flagged rows only, with no
      control; browser-verified with the seeded draft.
- [ ] TD-22 is in Resolved in the delivering PR.
