# Delta for Review History UI

> The main spec's *Purpose* paragraph lists "scheduling, overdue
> indicators" as out of scope (main `:46`). It is not a requirement and
> cannot be modified by a delta. It describes the history surface, which
> still ships no scheduling or overdue indicator. The archive step MUST add a
> clause saying that scheduling lives on the separate review-schedule page.

## MODIFIED Requirements

### Requirement: No Filtering, Analytics or Adjacent Controls Ship

The history surface MUST stay a single unfiltered list, a read-only
session detail view, **and one unfiltered per-element record** — for
every role that reaches it. It MUST NOT add pagination, infinite scroll,
a date-range filter, a sort control or a search box **on any of the
three**; and MUST NOT add signing, export, print, download or send
controls, scheduling, due-date or overdue indicators, compliance
dashboards, per-community or per-technician statistics, attachments or
notifications. The one exception is the single **View document** link
on the read-only session view (*Read-Only Historical Session View*),
which is navigation, not an export control. The
installation-wide list is explicitly included — reachable by **two**
roles, a `SYSTEM_ADMIN` unconditionally and a granted `MANAGER` — and it
is by far the largest list in the app; so is a long-lived element's own
record, whose length is accepted on exactly the same terms. Their size is
an accepted, recorded consequence, and filtering, sorting, pagination and
search across all entities is a separate app-wide initiative that MUST
NOT be started, stubbed or parameterized for here.

Exactly **one** per-element history view MUST exist: the page defined by
*An Element's Own Review History Page*, reachable only through the two
entry links defined by *Two Entry Links Reach the Element History Page*.
No second per-element view, no element-history widget embedded in another
page, no cross-element rollup ("every element in this community, last
review each") and no per-element chart, trend, interval or overdue
computation MUST ship.

The separate **Review schedule** page (`review-schedule-ui`) is not a
history surface and is not bound by this requirement's list of forbidden
indicators. It shows, per `(community, elementType)` pair, one computed
status and the date of the pair's most recent covering session. That
per-pair date is **not** the forbidden "last review each" rollup: it is not
per element, it is not an element's record, and no per-element figure is
shown on it.

The global navigation's **Review schedule** item (`app-navigation`) is
rendered on every authenticated page for four roles, history views
included. It is a navigation entry to that separate capability: it is
**explicitly permitted**, it is not a control of the history surface, and it
is outside every control enumeration in this requirement and its scenarios,
which govern the history views' own controls. It MUST NOT be read as a
history, due-date or overdue indicator of the history surface.
(Previously: the surface was "a single unfiltered list plus a read-only
detail view" and MUST NOT add a per-element history view at all, with the
*"No per-element history view exists"* scenario requiring that a search
of the web routes and pages find none. Exactly one such view now ships;
the guard is **narrowed, not deleted**: it becomes a bound on that one
view: one page, two links, no controls, no second variant and no
aggregation. This change adds the paragraph on the Review schedule page,
and the scenario *No element-history widget, rollup or chart ships* is
clarified to match, and the global navigation's Review schedule item is
named as permitted, with the scenario *No adjacent capability surfaces*
restated to exclude the navigation's items.)

#### Scenario: No list-control ships
- GIVEN the history list view's controls
- WHEN they are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: No list-control ships for the company manager either
- GIVEN the history list view rendered for a `MAINTENANCE_COMPANY_MANAGER` with a large company-wide result
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-community or per-technician grouping control

#### Scenario: No list-control ships for the admin either
- GIVEN the history list view rendered for a `SYSTEM_ADMIN` with an installation-wide result spanning several companies and communities
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-company, per-community or per-technician grouping control

#### Scenario: No list-control ships for the manager either
- GIVEN the history list view rendered for a `MANAGER` holding `VIEW_ALL_REVIEWS` with an installation-wide result spanning several companies and communities
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-company, per-community or per-technician grouping control — mirroring the admin's own guarantee, since a granted manager's result is the identical read

#### Scenario: No list-control ships on the element's own record either
- GIVEN the element history page rendered for an element with a long record, for each of the five roles in turn
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting, search, or a per-session, per-performer or per-company grouping control

#### Scenario: Exactly one per-element history view exists, reachable from exactly two links
- GIVEN the web routes and pages after this change
- WHEN they are searched for a view of one inspectable element's past reviews
- THEN exactly one MUST be found, at `/communities/:communityId/inspectable-elements/:elementId/history`, and its only navigation entry points MUST be the element-list row link and the session-detail entry link

#### Scenario: No element-history widget, rollup or chart ships
- GIVEN every other page of the web app after this change, other than the Review schedule page
- WHEN each is inspected
- THEN none MUST embed an element's review record, none MUST render a cross-element "last review each" rollup, and none MUST compute a per-element chart, trend, interval or overdue indicator
(Previously: "every other page of the web app", with no exception.)

#### Scenario: The schedule page's per-pair date is not a per-element rollup
- GIVEN the Review schedule page rendered with rows of several statuses
- WHEN its rendered data is enumerated
- THEN each row MUST show one date for its `(community, elementType)` pair at most, and no element, element `code` or per-element last-review figure MUST appear

#### Scenario: No adjacent capability surfaces
- GIVEN every view of the review-history surface, the element history page included
- WHEN its own controls are enumerated, the global navigation's items excluded
- THEN none MUST offer signing, export, print, download, send, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications — the session detail view's single **View document** link being the only document-related control, and the list and element history page offering none
(Previously: "WHEN its controls are enumerated", with no exclusion, which would have counted the global navigation's Review schedule item as an overdue-list control. The navigation's items are checked by `app-navigation`.)

### Requirement: The System Admin Reaches the Shipped History Surface Unchanged

A signed-in `SYSTEM_ADMIN` MUST reach the review-history list and the
read-only session view through the **same pages already shipped for the
other four roles**, with no new page, no admin variant, no additional
column and no additional control. Widening the surface to this role MUST
be role-widening only.

They MUST be able to reach the history list by navigation without typing
a URL by hand, through the **global navigation's Review history item**
(`app-navigation`), rendered on **every** authenticated page. The app's
entry page is no longer the admin's entry point for this surface — it
carries no link at all after this change — and no admin dashboard exists
or is introduced. Opening a row MUST navigate to that session's read-only
view.

That navigation path MUST NOT cross the `/review-sessions` write surface
owned by `review-session-ui`, which this role MUST NOT gain: no
navigation control offered to an admin — the global navigation's items
included — MUST lead to it, and no control offering to open, resume,
answer, record, mark unreviewed, enter an element `code`, complete or
discard a session MUST be rendered for them anywhere on this surface.
Review history MUST be the admin's **only** history-or-session item; the
admin's other navigation items belong to Home, the administrative
sections, the Organization profile and the Review schedule, and MUST NOT
include the review-session flow.

The other roles' experience MUST be unchanged — same pages, same rows,
same controls — and that regression check covers **all four** other
roles, including `MANAGER`: a `MANAGER`, granted or ungranted, MUST see
exactly what this and the sibling `review-history-ui` requirements
already commit this role to (see *The Manager Reaches the Shipped History
Surface, Granted or Not*), unaffected by anything the admin's own
navigation does.
(Previously: the admin's entry point was a role-conditional link on the
app's entry page, justified by the absence of an admin dashboard. That
link is removed in this change and the mechanism becomes the global
navigation, which also carries the admin's five administrative sections —
so the requirement names the navigation as the entry point and adds the
guarantee that none of those seven items is the review-session write
surface. The counts "other six navigation items", "seven" and "seven-item"
were already stale once the Organization profile item shipped (eight items)
and are false with the Review schedule item (nine); the text and the two
scenarios below no longer count items.)

#### Scenario: The admin reaches history from any authenticated page
- GIVEN a `SYSTEM_ADMIN` is signed in and on any authenticated page
- WHEN they look for the installation's past reviews
- THEN a navigation control MUST be offered that navigates directly to the history list, with no hand-typed URL required

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
- WHEN every navigation control rendered for them is enumerated — all of the global navigation's items included
- THEN none MUST navigate to `/review-sessions` or to any session-performing view
(Previously: "all seven of the global navigation's items included".)

#### Scenario: No write control is rendered for the admin
- GIVEN a `SYSTEM_ADMIN` viewing the history list and a session's read-only view
- WHEN the controls on each are enumerated
- THEN none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other four roles' surface is unchanged, MANAGER included
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`, `MAINTENANCE_COMPANY_MANAGER`, and a `MANAGER` (once granted `VIEW_ALL_REVIEWS`, once holding no capability)
- WHEN each reaches the history list and a session's read-only view after this change
- THEN each MUST see exactly what they were already committed to seeing — their rows and controls unaffected by the admin's navigation, and the granted/ungranted manager's own experience exactly as specified by *The Manager Reaches the Shipped History Surface, Granted or Not*
(Previously: "unaffected by the admin's seven-item navigation".)
