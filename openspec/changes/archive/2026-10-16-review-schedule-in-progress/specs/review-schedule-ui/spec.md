# Delta for review-schedule-ui

## ADDED Requirements

### Requirement: An In-Progress Row Shows a Marker

A row whose `inProgress` is true MUST show a localized "in progress" marker
in its status cell, after the status label. A row whose `inProgress` is false
MUST show no marker. The marker MUST be text only: it MUST NOT be a link or a
control, and it MUST NOT name who holds the draft, how many drafts exist, or
when they started. The row's status label, reason line, last review date and
position MUST be rendered exactly as without the marker. The marker text MUST
come from a translation key with real values in `en`, `es` and `ca`
(_Internationalization Coverage_).

#### Scenario: Flagged row shows the marker

- GIVEN the server returns an `UPCOMING` row with `inProgress` true
- WHEN the page renders
- THEN the row shows its status label followed by the localized "in progress" marker, and its reason line as before

#### Scenario: Unflagged row shows no marker

- GIVEN the server returns a row with `inProgress` false
- WHEN the page renders
- THEN the row shows no "in progress" marker

#### Scenario: The marker is not a control

- GIVEN the page rendered with a flagged row
- WHEN its interactive controls are enumerated
- THEN the marker is not among them, and _The Page Offers No Controls Beyond Reading_ still holds

#### Scenario: The marker in each locale

- GIVEN a flagged row and each locale in turn
- WHEN the page renders
- THEN the marker text comes from that locale's translation key

#### Scenario: Marker in the browser

- GIVEN the dev database seeded per `dev-seed-data`, which holds an open draft
- WHEN an admin opens the page in a browser
- THEN the row of the draft's community and element type shows the marker, if the draft's template is `QUARTERLY` or `ANNUAL`, and the other rows do not
