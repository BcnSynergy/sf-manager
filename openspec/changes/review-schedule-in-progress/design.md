# Design: Review Schedule In-Progress Marker (TD-22)

## Technical Approach

One boolean travels from a seventh reader query to a text marker on the page:

1. `PrismaReviewScheduleReader` reads open drafts in scope on the covering
   template set (q3) and folds them to pair keys.
2. `SchedulePair` and `ReviewScheduleRow` carry `inProgress`; the use case
   copies it after `evaluateReviewDue`, so the due policy and the sort never
   see it.
3. The controller adds `inProgress` to `ReviewScheduleRowDto`.
4. The web row type gains `inProgress`, and `ReviewSchedulePage` renders a
   localized marker in the status cell.

No migration, no new endpoint, no change to coverage.

## Architecture Decisions

### Decision 1: The flag lives outside `PairCoverage`

`PairCoverage` is the due policy's input. Putting the flag there would make
the policy's signature carry a value it must ignore, and a later edit could
start using it. `SchedulePair.inProgress` sits next to `coverage`, and
`ReviewScheduleRow.inProgress` is set in the use case's `.map` from the pair,
not from the policy's result. A use-case test pins that the same pairs sort
identically with the flag true or false.

### Decision 2: q7 is a `groupBy` on `(communityId, templateId)` for drafts

```ts
// q7: open drafts on covering templates, per (community, template)
const drafts = await this.prisma.reviewSession.groupBy({
  by: ['communityId', 'templateId'],
  where: { status: 'draft', communityId: inScope, templateId: { in: coveringIds } },
});
```

- `coveringIds` from q3 already holds exactly the `QUARTERLY`/`ANNUAL`
  versions in `active` or `retired` status, which is the spec's template set
  (a draft frozen against a replaced version counts; a `draft` template can
  never back a session).
- `groupBy` returns at most one row per (community, template) however many
  users hold drafts, so the result size is bounded by communities × templates.
- The fold reuses `elementTypeByTemplateId` and `pairKey`; a template id not
  in q3 cannot occur because of the `in` filter.
- The structural `ReviewSchedulePrisma` type gets this as a second
  `groupBy` call signature (an overload) with `status: 'draft'` and no
  `_max`, so q4 and q5 keep their `status: 'completed'` literal type.
  Fallback if the overload does not accept both `PrismaService` and the
  `$extends` client (the constraint recorded in the type's header comment):
  widen `status` to `'completed' | 'draft'` and make `_max` optional, and
  note why in the comment. Decided during apply by typecheck.

Rejected: widening q6's status filter (q6 feeds coverage; a draft row there
could be pushed into `recentCoveringAt`), and a separate endpoint (a second
request and a client join for one boolean).

### Decision 3: The flag is required, not optional

`inProgress: boolean` is required on `SchedulePair`, `ReviewScheduleRow`,
the DTO and the web type. An optional field would let a reader or fixture
omit it and render "not in progress" silently. Fixture helpers (`pair(...)`
in the use-case spec and the e2e spec) default it to `false`.

### Decision 4: Marker markup

In the status cell, after the label:

```tsx
<td>
  {t(mapStatusToLabelKey(row.status))}
  {row.inProgress && (
    <>
      {' '}
      <span data-testid={`review-schedule-in-progress-${rowKey}`}>
        ({t(IN_PROGRESS_LABEL_KEY)})
      </span>
    </>
  )}
</td>
```

- Plain text in parentheses, readable by screen readers inline with the
  status ("Upcoming (In progress)"). No icon, no colour, no link: the visual
  redesign slice that follows will style it.
- `IN_PROGRESS_LABEL_KEY = 'reviewSchedule.inProgress'` in
  `schedule-labels.ts`, following `NEVER_REVIEWED_LABEL_KEY`.
- Values: en "In progress", es "En curso", ca "En curs".

### Decision 5: The living spec's Purpose and read-only wording

`review-schedule`'s Purpose says the list is "computed on every read from
completed review sessions", and _The Schedule Is Read-Only and Computed on
Read_ says status is derived from completed sessions. Both stay true for the
status. At archive, the Purpose gains one sentence noting that open drafts
add an in-progress flag without affecting status. No other existing
requirement changes.

## Data Flow

```
q3 templates ──► coveringIds ──► q7 drafts (groupBy community, template)
                                      │ fold via elementTypeByTemplateId
                                      ▼
                         Set<pairKey> inProgressPairs
                                      │
livePairs ──► SchedulePair { …, coverage, inProgress }
                                      │
use case: evaluateReviewDue(coverage) + inProgress ──► sort (unchanged)
                                      │
controller ──► ReviewScheduleRowDto.inProgress ──► web row ──► marker span
```

## File Changes

| File                                                                                                                | Change                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `apps/api/src/modules/review-schedule/application/ports/review-schedule.reader.port.ts`                             | `SchedulePair.inProgress`                    |
| `apps/api/src/modules/review-schedule/infrastructure/persistence/prisma-review-schedule.reader.ts`                  | q7, overload, fold, header comment "seven"   |
| `apps/api/src/modules/review-schedule/infrastructure/persistence/prisma-review-schedule.reader.integration.spec.ts` | Draft scenarios; count test six → seven      |
| `apps/api/src/modules/review-schedule/application/use-cases/list-review-schedule.use-case.ts`                       | Copy the flag into the row                   |
| `apps/api/src/modules/review-schedule/application/use-cases/list-review-schedule.use-case.spec.ts`                  | Pass-through and unchanged-order tests       |
| `apps/api/src/modules/review-schedule/application/testing/in-memory-review-schedule.reader*.ts`                     | Fixtures carry the field (if needed by type) |
| `apps/api/src/modules/review-schedule/presentation/dto/review-schedule-row.dto.ts`                                  | `@ApiProperty() inProgress: boolean`         |
| `apps/api/src/modules/review-schedule/presentation/review-schedule.controller.ts`                                   | Map the field                                |
| `apps/api/test/review-schedule.e2e-spec.ts`                                                                         | Response shape includes `inProgress`         |
| `apps/web/src/api/review-schedule.ts` (+ test)                                                                      | Row type                                     |
| `apps/web/src/review-schedule/schedule-labels.ts`                                                                   | `IN_PROGRESS_LABEL_KEY`                      |
| `apps/web/src/pages/ReviewSchedulePage.tsx` (+ test)                                                                | Marker                                       |
| `apps/web/src/i18n/locales/{en,es,ca}.json`                                                                         | `reviewSchedule.inProgress`                  |
| `docs/technical-debt.md`                                                                                            | TD-22 to Resolved                            |

## Interfaces / Contracts

`GET /review-schedule` rows gain one required field, additive for clients:

```json
{
  "communityId": "…",
  "elementType": "EXTINGUISHER",
  "status": "UPCOMING",
  "inProgress": true,
  "…": "…"
}
```

## Testing Strategy

Strict TDD, RED first per layer:

- **Reader integration (real Postgres)**, one test per spec scenario that
  depends on data: quarterly draft, annual draft, another user's draft,
  draft on a retired version, MONTHLY/SEMIANNUAL drafts, draft in another
  community, completed-only and discarded, and completing a draft. The
  existing "ignores an open draft" coverage tests stay unchanged and keep
  proving drafts never cover. Count test: seven for 2 and 20 communities.
- **Use case unit**: the flag is copied per pair; the same pairs give the same
  status, reason, deadline, last date and order with the flag true or false.
- **API e2e**: the flat DTO shape assertion includes `inProgress`.
- **Web**: the page shows the marker for a flagged row and none for an
  unflagged one, in each locale; the marker is not a control (existing
  "offers no control" test extended with a flagged row).
- **Browser**: the seeded draft's row shows the marker.

## Threat Matrix

| Threat                                              | Control                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Draft existence leaks for an out-of-scope community | q7 uses the same `inScope` filter; rows exist only for live pairs |
| Owner identity leaks                                | `groupBy` returns no performer; nothing about it reaches the row  |

## Migration / Rollout

None. Additive response field; revert removes it.

## Open Questions

None.
