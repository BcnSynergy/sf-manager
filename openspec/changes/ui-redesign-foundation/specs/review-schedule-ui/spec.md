# Delta for review-schedule-ui

## ADDED Requirements

### Requirement: The Status Is Shown as a Badge

Each row's localized status label MUST be rendered as a status badge whose
tone matches the status: `OVERDUE` critical, `NEVER_REVIEWED` warning,
`UPCOMING` notice, `UP_TO_DATE` success. The badge MUST always carry the
localized word; color MUST NOT be the only way the status is told apart. The
in-progress marker MUST keep _An In-Progress Row Shows a Marker_: it follows
the status badge in the same cell, it is text only, and it has its own
neutral, outlined look so it never reads as a status. The badge MUST NOT be a
link or a control, so _The Page Offers No Controls Beyond Reading_ still
holds. Labels, reasons, dates and order MUST stay as _Each Row Shows Status,
One-Line Reason and Last Review_ specifies.

#### Scenario: Each status gets its tone

- GIVEN the server returns one row of each status
- WHEN the page renders
- THEN each status cell shows a badge with the localized label, in the critical, warning, notice or success tone for `OVERDUE`, `NEVER_REVIEWED`, `UPCOMING` and `UP_TO_DATE` respectively

#### Scenario: The marker follows the badge

- GIVEN the server returns a `NEVER_REVIEWED` row with `inProgress` true
- WHEN the page renders
- THEN the status cell shows the warning badge followed by the localized "in progress" marker, which is not a link or control

#### Scenario: The badge in the browser, in both themes

- GIVEN the dev database seeded per `dev-seed-data`
- WHEN an admin opens the page in a browser, once with the OS in light mode and once in dark mode
- THEN every status reads as a badge with its word and its tone, and the text of every badge meets 4.5:1 contrast
