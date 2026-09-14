# Delta for Review History UI

> **Purpose amendment (for archive):** the capability's Purpose says
> "**Three** roles reach it". After this change **four** do —
> `SYSTEM_ADMIN` joins `MAINTENANCE_TECHNICIAN`,
> `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_COMPANY_MANAGER` — and what
> each sees is still decided entirely by the server-scoped endpoints
> owned by `review-history` and the scope rule owned by `authorization`.
> The admin reaches the same pages with no reduced or alternative
> variant, and — like the manager — **not** through the
> `/review-sessions` write surface, which it must never gain. Out of
> scope is unchanged: pagination, date-range filters, sorting and search
> controls; per-element history views; editing, annotating or deleting a
> completed session; signing, export, scheduling, overdue indicators,
> analytics and notifications; offline capability of any kind.

## ADDED Requirements

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

## MODIFIED Requirements

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
