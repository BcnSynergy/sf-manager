# Verify Report: Review Schedule In-Progress Marker (TD-22)

Date: 2026-10-16. Branch `review-schedule-in-progress/01-draft-marker`.

## Verdict

PASS. Every spec scenario is covered by a test or by the browser pass; no
blocker.

## Spec coverage

### review-schedule: An Open Draft Marks a Pair as In Progress

| Scenario                                           | Evidence                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A quarterly draft marks the pair                   | Reader integration "is true for an open draft on a QUARTERLY template" (and the ACTIVE-version variant)                                                     |
| An annual draft marks the pair                     | Reader integration "is true for an open draft on an ANNUAL template"                                                                                        |
| Another user's draft marks the pair                | Reader integration "is true whichever users hold drafts, and the pair carries no owner" (key set asserted)                                                  |
| A draft on a replaced template version still marks | Reader integration "is true for a draft frozen against a replaced template version"                                                                         |
| MONTHLY and SEMIANNUAL drafts do not mark          | Reader integration "is false when the only drafts are MONTHLY or SEMIANNUAL"                                                                                |
| A draft elsewhere does not mark the pair           | Reader integration "is false when the only draft belongs to another community" (other element type: EN-54)                                                  |
| Completed and discarded sessions do not mark       | Reader integration "is false when the only sessions are completed", "clears once the only draft is discarded"                                               |
| Completing the draft clears the marker             | Reader integration "clears once the only draft is completed, which then covers"                                                                             |
| Status and order are unchanged by a draft          | Use-case "leaves status, reason, deadline, last date and order unchanged" (strength: EN-53); e2e "carries inProgress per row without moving the marked row" |
| The flag counts toward the constant query count    | Reader integration "issues the same seven operations for 2 and for 20 communities"                                                                          |

The existing "ignores an open draft on a QUARTERLY template" and "ignores an
ANNUAL draft" tests are unchanged and still pass: drafts never cover.

### review-schedule-ui: An In-Progress Row Shows a Marker

| Scenario                      | Evidence                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Flagged row shows the marker  | Page test "shows the in-progress marker after the status label of a flagged row…"     |
| Unflagged row shows no marker | Page test "shows no in-progress marker on unflagged rows"                             |
| The marker is not a control   | Page test "offers no control and shows no per-session data" now renders a flagged row |
| The marker in each locale     | Page test "shows the in-progress marker from the {en,es,ca} locale"                   |
| Marker in the browser         | Browser pass below                                                                    |

## Checks

| Check                                   | Result      |
| --------------------------------------- | ----------- |
| `npm run test --workspace=apps/api`     | 1492 passed |
| `npm run test:e2e --workspace=apps/api` | 494 passed  |
| `npm run test:integration` (api)        | 268 passed  |
| `apps/web` Vitest                       | 1124 passed |
| `npm run lint`, `format:check`, `build` | pass        |

## TDD cycle evidence

| Layer    | RED                                                     | GREEN                                             |
| -------- | ------------------------------------------------------- | ------------------------------------------------- |
| Reader   | 13 failed (11 new scenarios + count and operation list) | 37/37                                             |
| Use case | 2 failed                                                | 28/28 (plus 3 fixtures updated for the new field) |
| HTTP e2e | 2 failed                                                | 18/18                                             |
| Web page | 6 failed                                                | 484/484 in the touched files                      |

## Browser pass

Logged in as `technician@sf-manager.example` (assigned to North and South):

1. Schedule before: South "Propera", North "Al dia", no marker.
2. Opened a QUARTERLY session in Dev Seed Residences South (draft).
3. Schedule: South "Propera (En curs)" with the same reason, last review date
   and position; North unchanged.
4. Discarded the draft (in-app confirmation); schedule back to no marker. No
   open draft left in the dev database.

No new console errors.

## Design deviation

Decision 2's fallback was used: a second, draft-only `groupBy` overload in the
structural `ReviewSchedulePrisma` type is not assignable from `PrismaService`,
so `status` widened to `'completed' | 'draft'` and q7 also requests `_max`
(ignored). Documented in the reader's type comment.

## Review

Native RDD review (lenses risk, reliability): approved and acknowledged. Two
non-blocking suggestions registered as EN-53 and EN-54.
