# Review Schedule UI Specification

## Purpose

One minimal web page, **Review schedule**, that renders the server's
review-schedule result for the signed-in user. It is reachable by four roles
(`SYSTEM_ADMIN`, `MANAGER`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_TECHNICIAN`) through one global-navigation item. What each role
sees is decided entirely by the server (see `review-schedule`). The page is a
read-only view of obligations. It is not a history surface, not a dashboard and
not a filterable report. It ships in the same change as its API per ADR-006's
2026-08-25 addendum.

## Requirements

### Requirement: One Schedule Page Behind One Route

The system MUST ship one authenticated route, `/review-schedule`, that
renders the Review schedule page. The route MUST admit exactly `SYSTEM_ADMIN`, `MANAGER`,
`COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN`. Any other signed-in
role MUST receive the app's existing "not authorized" view, and an
unauthenticated visitor MUST follow the existing login redirect. The client
gate MUST be role-based only. The client MUST NOT learn, request or branch on
the `VIEW_ALL_REVIEWS` capability.

#### Scenario: Four roles open the page

- GIVEN a signed-in user of each of the four roles in turn
- WHEN they open the route
- THEN the Review schedule page renders

#### Scenario: Company manager is denied

- GIVEN a signed-in `MAINTENANCE_COMPANY_MANAGER`
- WHEN they open the route directly
- THEN the existing "not authorized" view renders and no schedule request is made

#### Scenario: Unauthenticated visitor

- GIVEN no signed-in user
- WHEN the route is opened
- THEN the visitor is redirected to `/login`

### Requirement: The Page Renders Loading, Empty, Error and Table States

The page MUST render exactly one of the following and MUST NOT be blank in any
case.

| State | Required rendering |
|---|---|
| Loading | An explicit loading indication while the request is in flight |
| Empty | A distinct localized empty message when the server returns no pair. It is not an error and not a "not authorized" message |
| Error | One uniform localized message chosen from `ApiError.status` / `.code`, never from a server-supplied English message string |
| Table | One row per pair returned |

An ungranted `MANAGER` MUST reach the empty state.

#### Scenario: Loading

- GIVEN the schedule request has not resolved
- WHEN the page renders
- THEN a loading indication is shown and neither table nor empty message is

#### Scenario: Empty state

- GIVEN the server returns an empty list
- WHEN the page renders
- THEN the empty message is shown, with no table rows and no error

#### Scenario: Ungranted manager

- GIVEN a `MANAGER` holding no capability opens the page
- WHEN the server returns an empty list
- THEN the empty state renders, not an error and not "not authorized"

#### Scenario: Error state

- GIVEN the request fails or is rejected
- WHEN the page renders
- THEN one localized error message is shown, independent of the failing status's server message text

### Requirement: Each Row Shows Status, One-Line Reason and Last Review

Each row MUST show the community name, the element type through the existing
localized label map (never the raw enum), the status as a localized label
(never the raw enum value), and the date of the last covering session. For an
`OVERDUE` or `UPCOMING` row it MUST show one line of localized reason text
that names the driving obligation and its deadline, for example an annual
review due by a given date, or a named quarter not covered. A `NEVER_REVIEWED`
row MUST show an explicit localized "never reviewed" indication and no date
and no overdue claim. An `UP_TO_DATE` row MUST show its status and last review
date and no reason line. The page MUST render the server's status, reason
data and order as received, and MUST NOT recompute any status or deadline on
the client. The deadline and the last review date arrive as
`Europe/Madrid` calendar dates (`YYYY-MM-DD`) and MUST be shown as that same
calendar date for every viewer: they MUST use the app's localized date
formatting, without any time-zone conversion, so the date does not change with
the browser's time zone.

#### Scenario: Upcoming annual row

- GIVEN a returned row with status `UPCOMING`, annual driver and deadline 31 Dec 2026
- WHEN the page renders
- THEN the row shows the localized status label and one reason line naming the annual review and that deadline

#### Scenario: Overdue quarterly row

- GIVEN a returned row with status `OVERDUE`, quarterly driver for Q3 2026
- WHEN the page renders
- THEN the row shows one reason line stating Q3 2026 is not covered

#### Scenario: Never reviewed row

- GIVEN a returned row with status `NEVER_REVIEWED`
- WHEN the page renders
- THEN the row shows the "never reviewed" indication, no last review date and no overdue wording

#### Scenario: Up to date row

- GIVEN a returned row with status `UP_TO_DATE`
- WHEN the page renders
- THEN the row shows the status and last review date and no reason line

#### Scenario: Dates do not shift with the viewer's time zone

- GIVEN a returned row whose last covering session date is 15 Nov 2026 and whose deadline is 31 Dec 2026, and a browser whose time zone is far from Madrid (for example UTC-10 and UTC+12, in turn)
- WHEN the page renders
- THEN the row shows 15 Nov 2026 and 31 Dec 2026 in both cases, formatted for the active locale

#### Scenario: Raw values never appear

- GIVEN a table with rows of every status
- WHEN the rendered text is enumerated
- THEN no raw enum value such as `NEVER_REVIEWED` or `EXTINGUISHER` is visible

#### Scenario: Server order is kept

- GIVEN the server returns rows in its own order
- WHEN the page renders
- THEN rows appear in exactly that order, none hidden or regrouped

### Requirement: The Page Offers No Controls Beyond Reading

The page MUST offer no filter, sort, search, pagination, export, print,
download, send, reminder, snooze or mutating control, and no control that
opens, resumes or starts a review session. It MUST NOT list sessions, show a
per-element record or per-element rollup, or embed a history view. The row
MUST have no action.

#### Scenario: No controls

- GIVEN the page rendered with rows in every status
- WHEN its interactive controls are enumerated
- THEN none is a filter, sort, search, pagination, export, print, send, reminder or session-start control

#### Scenario: Not a history surface

- GIVEN the page rendered
- WHEN its rendered data is enumerated
- THEN no session, per-element entry or per-element last-review figure is shown

### Requirement: Navigation Placement for the Four Roles

The global navigation MUST offer one **Review schedule** item to the four
roles that may open the route, and no item to
`MAINTENANCE_COMPANY_MANAGER`. The item MUST target the page's top-level
route and MUST be decided by role alone.

#### Scenario: Item offered to four roles only

- GIVEN the navigation rendered for each of the five roles
- WHEN the Review schedule item is looked for
- THEN it is present for the four in-scope roles and absent for `MAINTENANCE_COMPANY_MANAGER`

#### Scenario: Item leads to the page

- GIVEN a signed-in user of an in-scope role
- WHEN they activate the item
- THEN the schedule page renders and never the "not authorized" view

### Requirement: Internationalization Coverage

The page and its nav item MUST contain zero hardcoded user-facing strings.
Every label, state message, status label, reason text and the nav label MUST
come from translation keys with real (non-placeholder) values in `en`, `es`
and `ca`, enforced by the existing locale parity test.

#### Scenario: All locales are complete

- GIVEN the `en`, `es` and `ca` locale files after this change
- WHEN the parity test runs
- THEN every schedule key exists in all three with real values

#### Scenario: The page renders in each locale

- GIVEN the page rendered with each locale in turn
- WHEN the visible text is read
- THEN it comes from that locale's translation keys with no English fallback

### Requirement: The Page Is Verified in a Real Browser

The page MUST be exercised in a running dev app before the slice is reported
complete: the empty, loading-or-table, and error paths as feasible, and the
seeded states (one community `UP_TO_DATE`, one `UPCOMING`). If only
test-verified, that MUST be stated.

#### Scenario: Seeded states in the browser

- GIVEN a database reset and seeded per `dev-seed-data`
- WHEN an admin opens the page in a browser
- THEN Dev Seed Residences North shows `UP_TO_DATE` and Dev Seed Residences South shows `UPCOMING` with an annual-review reason
