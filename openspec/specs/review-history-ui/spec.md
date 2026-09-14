# Review History UI

## Purpose

The web surface for reading completed reviews: a history list of the
`completed` sessions the signed-in user is allowed to see, and a
**read-only** view of one historical session showing its element entries,
answers and observations. **Four** roles reach it —
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER` and `SYSTEM_ADMIN` — and what each sees is
still decided entirely by the server-scoped endpoints owned by
`review-history` and the scope rule owned by `authorization`. The admin
reaches the same pages with no reduced or alternative variant, and — like
the manager — **not** through the `/review-sessions` write surface, which
it must never gain. The field write flow — code entry, answering,
completing, discarding — is owned by `review-session-ui` and is untouched
here. This is the second surface in the app reachable by a
non-`SYSTEM_ADMIN` role, shipped in the same slice as its API per
ADR-006's 2026-08-25 addendum.

Out of scope: pagination, date-range filters, sorting and search
controls; per-element history views; editing, annotating or deleting a
completed session; signing, export, scheduling, overdue indicators,
analytics and notifications; offline capability of any kind.

## Requirements

### Requirement: Role-Gated Route Access for the History Views

The system MUST restrict every review-history route to authenticated
users holding `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER` or `SYSTEM_ADMIN`. All four MUST reach the
identical surface, with no reduced or alternative variant. An
authenticated user of any other role who reaches such a route MUST see an
explicit "not authorized" message, not a silent redirect. An
unauthenticated visitor MUST be redirected to `/login`.
(Previously: only `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`
and `MAINTENANCE_COMPANY_MANAGER` were allowed.)

#### Scenario: A technician reaches the history views
- GIVEN the caller is authenticated as `MAINTENANCE_TECHNICIAN`
- WHEN they navigate to a review-history route
- THEN the history surface MUST be shown

#### Scenario: A representative reaches the identical history views
- GIVEN the caller is authenticated as `COMMUNITY_REPRESENTATIVE`
- WHEN they navigate to a review-history route
- THEN the same surface MUST be shown, with no reduced or alternative variant

#### Scenario: A maintenance company manager reaches the identical history views
- GIVEN the caller is authenticated as `MAINTENANCE_COMPANY_MANAGER`
- WHEN they navigate to a review-history route
- THEN the same surface MUST be shown, with no reduced, alternative or manager-specific variant

#### Scenario: A system admin reaches the identical history views
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate to a review-history route, list or detail
- THEN the same surface MUST be shown, with no reduced, alternative or admin-specific variant

#### Scenario: Another role is denied with an explicit message
- GIVEN the caller is authenticated as any role other than the four above
- WHEN they navigate to any review-history route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: The manager is still denied the review-session write routes
- GIVEN the caller is authenticated as `MAINTENANCE_COMPANY_MANAGER`
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render

#### Scenario: The admin is denied the review-session write routes too
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render — the history widening MUST NOT extend to the write surface

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

### Requirement: A Reachable Entry Point for the Maintenance Company Manager That Bypasses the Write Surface

A signed-in `MAINTENANCE_COMPANY_MANAGER` MUST be able to reach the
history list by navigation, without typing a URL by hand, through a
control that does **not** route through the `/review-sessions`
review-session surface. That surface is the write flow owned by
`review-session-ui`, which this role MUST NOT gain: no navigation path
offered to a manager MUST lead to it, and no control offering to open,
resume, answer, complete or discard a session MUST be rendered for them
anywhere in the app.

#### Scenario: The manager reaches history from the app's entry page
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` is signed in and on the app's entry page
- WHEN they look for their company's past reviews
- THEN a control MUST be offered there that navigates directly to the history list, with no hand-typed URL required

#### Scenario: The manager's path never crosses the write surface
- GIVEN a signed-in `MAINTENANCE_COMPANY_MANAGER`
- WHEN every navigation control rendered for them is enumerated
- THEN none MUST navigate to `/review-sessions` or to any session-performing view

#### Scenario: No write control is rendered for the manager
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` viewing the history list and a session's read-only view
- WHEN the controls on each are enumerated
- THEN none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other two roles' entry point is unchanged
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
- WHEN they reach the history list
- THEN the shipped `/review-sessions` entry point MUST still work exactly as before, unaffected by the manager's new link

### Requirement: The System Admin Reaches the Shipped History Surface Unchanged

A signed-in `SYSTEM_ADMIN` MUST reach the review-history list and the
read-only session view through the **same pages already shipped for the
other three roles**, with no new page, no admin variant, no additional
column and no additional control. Widening the surface to this role MUST
be role-widening only.

They MUST be able to reach the history list by navigation from the app's
entry page, without typing a URL by hand — no admin dashboard exists, so
the entry page is the admin's entry point exactly as it is the manager's.
Opening a row MUST navigate to that session's read-only view.

That navigation path MUST NOT cross the `/review-sessions` write surface
owned by `review-session-ui`, which this role MUST NOT gain: no
navigation control offered to an admin MUST lead to it, and no control
offering to open, resume, answer, record, mark unreviewed, enter an
element `code`, complete or discard a session MUST be rendered for them
anywhere on this surface.

The other three roles' experience MUST be unchanged — same pages, same
entry points, same rows, same controls.

#### Scenario: The admin reaches history from the app's entry page
- GIVEN a `SYSTEM_ADMIN` is signed in and on the app's entry page
- WHEN they look for the installation's past reviews
- THEN a control MUST be offered there that navigates directly to the history list, with no hand-typed URL required

#### Scenario: The admin sees the identical shipped pages
- GIVEN a `SYSTEM_ADMIN` viewing the history list and a session's read-only view
- WHEN both are compared with what a `MAINTENANCE_COMPANY_MANAGER` sees
- THEN they MUST be the same pages and the same row shape, with no admin-only column, badge, section or control

#### Scenario: A history row opens its session for the admin
- GIVEN the admin's history list shows at least one completed session
- WHEN they activate that row
- THEN the read-only view of that session MUST be shown

#### Scenario: The admin's path never crosses the write surface
- GIVEN a signed-in `SYSTEM_ADMIN`
- WHEN every navigation control rendered for them on this surface is enumerated
- THEN none MUST navigate to `/review-sessions` or to any session-performing view

#### Scenario: No write control is rendered for the admin
- GIVEN a `SYSTEM_ADMIN` viewing the history list and a session's read-only view
- WHEN the controls on each are enumerated
- THEN none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other three roles' surface is unchanged
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_COMPANY_MANAGER`
- WHEN each reaches the history list and a session's read-only view after this change
- THEN each MUST see exactly what they saw before it — their entry points, rows and controls unaffected by the admin's widening

### Requirement: The History List Renders the Server-Scoped Result Unfiltered

The list MUST render exactly what the scoped endpoint returns, in the
order it returns them. The client MUST NOT apply any scope, role,
community, company or performer filtering of its own — client-side scope
filtering is a security anti-pattern and contradicts the house rule
already documented on the existing list pages. This MUST hold for the
company-wide list too, which is the largest of the three and therefore
the most tempting to trim client-side.

Each row MUST identify its session well enough to open it; for a caller
who can see more than one community, MUST show which community it belongs
to; and for a caller whose scope spans sessions performed by more than one
user, MUST identify **who performed** the session. Loading, empty and
error MUST each be a distinct, single rendered state; a blank screen MUST
NOT be shown.
(Previously: rows had to show the community for a multi-community caller,
with no requirement to identify the performer.)

#### Scenario: Rows are rendered as returned
- GIVEN the scoped history endpoint returns a list of completed sessions
- WHEN the list view renders
- THEN every returned row MUST be shown, in the returned order, with no client-side filtering step applied

#### Scenario: A manager's company-wide list is rendered unfiltered
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose endpoint returns sessions from several technicians and several communities
- WHEN the list view renders
- THEN every returned row MUST be shown, with no client-side narrowing by community, performer or date

#### Scenario: An empty history renders an empty state
- GIVEN the scoped history endpoint returns an empty list
- WHEN the list view renders
- THEN a localized empty state MUST be shown, and it MUST NOT be an error state

#### Scenario: Distinct loading and error states
- GIVEN the history request is loading, and separately fails
- WHEN the list view renders in each case
- THEN each case MUST show its own distinct state, never a blank screen

#### Scenario: A multi-community caller sees each row's community
- GIVEN a `COMMUNITY_REPRESENTATIVE` or `MAINTENANCE_COMPANY_MANAGER` whose result spans more than one community
- WHEN their history list renders
- THEN each row MUST show the community the session belongs to

#### Scenario: A multi-performer caller sees who performed each row
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose result contains sessions performed by two different technicians
- WHEN their history list renders
- THEN each row MUST identify the user who performed that session

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
detail view, **for every role that reaches it**. It MUST NOT add
pagination, infinite scroll, a date-range filter, a sort control or a
search box; MUST NOT add a per-element history view; and MUST NOT add
signing, export, scheduling, due-date or overdue indicators, compliance
dashboards, per-community or per-technician statistics, attachments or
notifications. The installation-wide list is explicitly included: it is
by far the largest list in the app, its size is an accepted, recorded
consequence, and filtering, sorting, pagination and search across all
entities is a separate app-wide initiative that MUST NOT be started,
stubbed or parameterized for here.
(Previously: identical normative rule, naming the company-wide list as
the largest; this change adds only the explicit coverage of the fourth
scope, per the settled decision that the rule stays in force unchanged.)

#### Scenario: No list-control ships
- GIVEN the history list view's controls
- WHEN they are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: No list-control ships for the manager either
- GIVEN the history list view rendered for a `MAINTENANCE_COMPANY_MANAGER` with a large company-wide result
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-community or per-technician grouping control

#### Scenario: No list-control ships for the admin either
- GIVEN the history list view rendered for a `SYSTEM_ADMIN` with an installation-wide result spanning several companies and communities
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-company, per-community or per-technician grouping control

#### Scenario: No per-element history view exists
- GIVEN the web routes and pages after this change
- WHEN they are searched for a view of one inspectable element's past reviews
- THEN none MUST be found

#### Scenario: No adjacent capability surfaces
- GIVEN every view of the review-history surface
- WHEN its controls are enumerated
- THEN none MUST offer signing, export, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications
