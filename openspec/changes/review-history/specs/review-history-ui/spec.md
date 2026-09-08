# Review History UI

## Purpose

The web surface for reading completed reviews: a history list of the
`completed` sessions the signed-in user is allowed to see, and a
**read-only** view of one historical session showing its element entries,
answers and observations. Both `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE` reach the same surface; what each sees is
decided entirely by the server-scoped endpoints owned by `review-history`
and by the scope rule owned by `authorization`. The field write flow —
code entry, answering, completing, discarding — is owned by
`review-session-ui` and is untouched here. This is the second surface in
the app reachable by a non-`SYSTEM_ADMIN` role, shipped in the same slice
as its API per ADR-006's 2026-08-25 addendum.

Out of scope: pagination, date-range filters, sorting and search
controls; per-element history views; editing, annotating or deleting a
completed session; signing, export, scheduling, overdue indicators,
analytics and notifications; offline capability of any kind.

## Requirements

### Requirement: Role-Gated Route Access for the History Views

The system MUST restrict every review-history route to authenticated
users holding `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`. An
authenticated user of any other role who reaches such a route MUST see an
explicit "not authorized" message, not a silent redirect. An
unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: A technician reaches the history views
- GIVEN the caller is authenticated as `MAINTENANCE_TECHNICIAN`
- WHEN they navigate to a review-history route
- THEN the history surface MUST be shown

#### Scenario: A representative reaches the identical history views
- GIVEN the caller is authenticated as `COMMUNITY_REPRESENTATIVE`
- WHEN they navigate to a review-history route
- THEN the same surface MUST be shown, with no reduced or alternative variant

#### Scenario: Another role is denied with an explicit message
- GIVEN the caller is authenticated as any role other than the two above
- WHEN they navigate to any review-history route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any review-history route
- THEN they MUST be redirected to `/login`

### Requirement: A Reachable Entry Point From the Existing Review-Session Surface

A signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` MUST
be able to reach the history list by navigation from the existing
`/review-sessions` surface, without typing a URL by hand. Opening a row
of the history list MUST navigate to that session's read-only view.

#### Scenario: History is reachable by navigation
- GIVEN a user with either in-scope role is signed in and viewing the existing review-session surface
- WHEN they look for their past reviews
- THEN a control MUST be offered that navigates to the history list, with no hand-typed URL required

#### Scenario: A history row opens its session
- GIVEN the history list shows at least one completed session
- WHEN the user activates that row
- THEN the read-only view of that session MUST be shown

### Requirement: The History List Renders the Server-Scoped Result Unfiltered

The list MUST render exactly what the scoped endpoint returns, in the
order it returns them. The client MUST NOT apply any scope, role,
community or performer filtering of its own — client-side scope filtering
is a security anti-pattern and contradicts the house rule already
documented on the existing list pages. Each row MUST identify its session
well enough to open it, and, for a caller who can see more than one
community, MUST show which community it belongs to. Loading, empty and
error MUST each be a distinct, single rendered state; a blank screen MUST
NOT be shown.

#### Scenario: Rows are rendered as returned
- GIVEN the scoped history endpoint returns a list of completed sessions
- WHEN the list view renders
- THEN every returned row MUST be shown, in the returned order, with no client-side filtering step applied

#### Scenario: An empty history renders an empty state
- GIVEN the scoped history endpoint returns an empty list
- WHEN the list view renders
- THEN a localized empty state MUST be shown, and it MUST NOT be an error state

#### Scenario: Distinct loading and error states
- GIVEN the history request is loading, and separately fails
- WHEN the list view renders in each case
- THEN each case MUST show its own distinct state, never a blank screen

#### Scenario: A multi-community caller sees each row's community
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to more than one community
- WHEN their history list renders
- THEN each row MUST show the community the session belongs to

### Requirement: Read-Only Historical Session View

Opening a completed session MUST render its recorded record — every
element entry with its answers and its observations, including elements
left unreviewed with their reason — and MUST offer **no** mutating
control. Specifically, no control MUST offer to edit, reopen, answer,
record, mark unreviewed, enter an element `code`, complete, discard,
sign, export or delete. The view MUST be reachable for a session the
caller did not perform whenever the server returns it.

#### Scenario: The recorded record is rendered in full
- GIVEN a completed session with answered elements and one element marked unreviewed with a reason
- WHEN its read-only view renders
- THEN every entry MUST be shown with its snapshotted question wording, its recorded answer values, and the unreviewed element's observations

#### Scenario: No mutating control renders
- GIVEN the read-only view of a completed session
- WHEN its controls are enumerated
- THEN none MUST offer edit, reopen, answer, record, mark-unreviewed, code entry, complete, discard, sign, export or delete

#### Scenario: An entry whose element no longer resolves still renders
- GIVEN a completed session one of whose inspectable elements was decommissioned or soft-deleted after completion
- WHEN its read-only view renders
- THEN that entry MUST still be shown with its answers and observations, under a localized neutral label in place of the missing element identity, and MUST NOT render as a blank, an error or a raw identifier

#### Scenario: A representative opens a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` whose history list includes a technician-performed session
- WHEN they open it
- THEN its full recorded record MUST be shown, identically to the performer's view and still with no mutating control

### Requirement: An Unreachable Session Gets One Uniform Message

The UI MUST show a single, identical message whether a requested session
does not exist, belongs to another performer, belongs to another
community, is still a draft, or has become unreachable because the
caller's assignment was deactivated. The message MUST NOT state or imply
that the session exists, and the client MUST select it from
`ApiError.status`/`.code`, never by comparing a server-supplied English
message string.

#### Scenario: Every unreachable cause shows the same message
- GIVEN the user opens, in turn, a nonexistent session id, another performer's session, another community's session, and a draft
- WHEN each rejection is shown
- THEN the displayed message MUST be identical in all four cases

#### Scenario: No message hints that the session exists
- GIVEN any rejected session id
- WHEN the message is read
- THEN it MUST NOT state or imply that the session exists for another performer, another community, or in another status

#### Scenario: Error handling does not branch on English message text
- GIVEN any client path mapping an API error to a UI message in this flow
- WHEN it selects the message
- THEN it MUST branch only on `ApiError.status` and `.code`

### Requirement: Internationalization Coverage

The review-history UI MUST contain zero hardcoded UI strings. All
user-facing text — including column headings, the empty state, answer and
element-type labels, timestamps' surrounding copy and rejection messages
— MUST come from translation keys with real (non-placeholder) values in
`en`, `es` and `ca`, enforced by the existing locale parity test. No
`elementType`, status or answer enum value MUST be rendered raw.

#### Scenario: All visible text is translated in every configured locale
- GIVEN any view of the review-history surface is rendered
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback

#### Scenario: Enum values are never rendered raw
- GIVEN an element type, a session status or an answer value is displayed as visible text
- WHEN it is rendered
- THEN it MUST show a localized label, not the raw enum string

### Requirement: No Filtering, Analytics or Adjacent Controls Ship

The history surface MUST stay a single unfiltered list plus a read-only
detail view. It MUST NOT add pagination, infinite scroll, a date-range
filter, a sort control or a search box; MUST NOT add a per-element
history view; and MUST NOT add signing, export, scheduling, due-date or
overdue indicators, compliance dashboards, per-community statistics,
attachments or notifications.

#### Scenario: No list-control ships
- GIVEN the history list view's controls
- WHEN they are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: No per-element history view exists
- GIVEN the web routes and pages after this change
- WHEN they are searched for a view of one inspectable element's past reviews
- THEN none MUST be found

#### Scenario: No adjacent capability surfaces
- GIVEN every view of the review-history surface
- WHEN its controls are enumerated
- THEN none MUST offer signing, export, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications
