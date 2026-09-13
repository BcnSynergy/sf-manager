# Delta for Review History UI

> **Purpose amendment (for archive):** the capability's Purpose says
> "Both `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` reach the
> same surface". After this change **three** roles reach it —
> `MAINTENANCE_COMPANY_MANAGER` joins them — and what each sees is still
> decided entirely by the server-scoped endpoints owned by
> `review-history` and the scope rule owned by `authorization`. The
> manager reaches the same pages with no reduced or alternative variant,
> but **not** through the `/review-sessions` write surface, which it must
> never gain. Out of scope is unchanged: pagination, date-range filters,
> sorting and search controls; per-element history views; editing,
> annotating or deleting a completed session; signing, export,
> scheduling, overdue indicators, analytics and notifications; offline
> capability of any kind.

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Role-Gated Route Access for the History Views

The system MUST restrict every review-history route to authenticated
users holding `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE` or
`MAINTENANCE_COMPANY_MANAGER`. All three MUST reach the identical
surface, with no reduced or alternative variant. An authenticated user of
any other role who reaches such a route MUST see an explicit "not
authorized" message, not a silent redirect. An unauthenticated visitor
MUST be redirected to `/login`.
(Previously: only `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE`
were allowed.)

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

#### Scenario: Another role is denied with an explicit message
- GIVEN the caller is authenticated as any role other than the three above
- WHEN they navigate to any review-history route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: The manager is still denied the review-session write routes
- GIVEN the caller is authenticated as `MAINTENANCE_COMPANY_MANAGER`
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any review-history route
- THEN they MUST be redirected to `/login`

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

### Requirement: No Filtering, Analytics or Adjacent Controls Ship

The history surface MUST stay a single unfiltered list plus a read-only
detail view, **for every role that reaches it**. It MUST NOT add
pagination, infinite scroll, a date-range filter, a sort control or a
search box; MUST NOT add a per-element history view; and MUST NOT add
signing, export, scheduling, due-date or overdue indicators, compliance
dashboards, per-community or per-technician statistics, attachments or
notifications. The company-wide list is explicitly included: its size is
an accepted, recorded consequence, and filtering, sorting, pagination and
search across all entities is a separate app-wide initiative that MUST
NOT be started, stubbed or parameterized for here.
(Previously: identical normative rule, stated without naming the
company-wide list; this change adds only the explicit coverage of the
third scope, per the settled decision that the rule stays in force
unchanged.)

#### Scenario: No list-control ships
- GIVEN the history list view's controls
- WHEN they are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: No list-control ships for the manager either
- GIVEN the history list view rendered for a `MAINTENANCE_COMPANY_MANAGER` with a large company-wide result
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-community or per-technician grouping control

#### Scenario: No per-element history view exists
- GIVEN the web routes and pages after this change
- WHEN they are searched for a view of one inspectable element's past reviews
- THEN none MUST be found

#### Scenario: No adjacent capability surfaces
- GIVEN every view of the review-history surface
- WHEN its controls are enumerated
- THEN none MUST offer signing, export, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications
