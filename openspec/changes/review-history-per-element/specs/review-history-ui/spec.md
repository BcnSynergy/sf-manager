# Delta for Review History UI

> **Purpose amendment (for archive):** the capability's Purpose lists as
> out of scope "per-element history views". After this change the surface
> has **one** such view: a single page showing one inspectable element's
> header and its **full** review record across every session it was ever
> reviewed in, at
> `/communities/:communityId/inspectable-elements/:elementId/history`.
> One page, **two** entry links — from the element's own row in the
> community element list, and from each entry row of the shipped
> `ReviewHistoryDetailPage`, which is the link that makes the four
> non-admin scopes reachable in a browser at all. The page lives inside a
> URL family that is `SYSTEM_ADMIN`-only everywhere else and is
> **deliberately** gated on the five history roles instead, because it is
> a review-history read. Everything else holds: no filtering, sorting,
> pagination or search; no new page family; no layout; and what each role
> sees is still decided entirely by the server-scoped endpoint owned by
> `review-history`.

## ADDED Requirements

### Requirement: An Element's Own Review History Page

The system MUST ship **one** page showing a single inspectable element's
review record, at
`/communities/:communityId/inspectable-elements/:elementId/history`.

It MUST render two things and nothing else:

| Region | Required content |
|---|---|
| Element header | The element's `code`, name, element type (through the shipped localized label map, never the raw enum), location, active/decommissioned state and its community — identifying the physical element the record is about |
| Review record | One row per entry the server returned, most recent first, each showing when the review was recorded, who recorded it, whether the element was reviewed or left unreviewed, and its observations |

Each row MUST link to that entry's session on the already-shipped
read-only historical session view at `/review-history/:sessionId`. That
link MUST be the row's only action.

The page MUST render the server's result **unfiltered and unreordered**:
it MUST NOT hide, group, re-sort, paginate or truncate rows, and it MUST
NOT compute or display any derived figure — no count-based status, no
"last inspected" badge, no interval, no overdue or due indicator.

It MUST offer **no** mutating control of any kind: nothing that edits,
reopens, answers, records, marks unreviewed, enters an element `code`,
completes, discards, signs, exports, decommissions, reactivates or
deletes.

It MUST render three distinct states, none of which MUST be a blank page:

| State | Required rendering |
|---|---|
| Loading | An explicit loading indication while the request is in flight |
| Empty | For an element the caller reaches whose record is empty, an explicit empty state — **not** an error and **not** a "not authorized" message |
| Unreachable / error | For a rejected or failed request, one uniform localized message selected from `ApiError.status`/`.code`, never by comparing a server-supplied English message string |

The unreachable message MUST be identical whether the element does not
exist, is soft-deleted, belongs to another community, or is simply out of
the caller's scope — it MUST NOT state or imply that the element exists.

Every user-facing string the page introduces MUST come from a translation
key with real (non-placeholder) values in `en`, `es` and `ca`.

This page MUST NOT become a general element detail or management page: no
element field MUST be editable on it, and no element-management action
MUST be offered from it.

#### Scenario: The page shows the element and its full record
- GIVEN an element reviewed in three `completed` sessions the caller can see
- WHEN they open the element's history page
- THEN the element's `code`, name, localized type, location, state and community MUST be shown, together with all three entries, most recent first

#### Scenario: Each row opens its session's read-only view
- GIVEN the element history page rendering at least one entry
- WHEN the user activates that row's link
- THEN the read-only historical session view of that entry's session MUST be reached

#### Scenario: The server's result is rendered unfiltered and unreordered
- GIVEN the server returns a list of entries in its own order
- WHEN the page renders
- THEN every returned entry MUST be shown, in the order received, with none hidden, grouped, re-sorted, paginated or truncated client-side

#### Scenario: No derived figure is displayed
- GIVEN an element history page with several entries
- WHEN its rendered data is enumerated
- THEN no count-based status, "last inspected" badge, interval, overdue or due indicator MUST be computed or shown

#### Scenario: No mutating or element-management control renders
- GIVEN the element history page
- WHEN its controls are enumerated
- THEN none MUST offer edit, reopen, answer, record, mark-unreviewed, code entry, complete, discard, sign, export, delete, decommission or reactivate, and no element field MUST be editable

#### Scenario: A reachable element with no reviews shows an empty state
- GIVEN a `SYSTEM_ADMIN` opens the history page of an element that has never been reviewed
- WHEN the page renders
- THEN the element header MUST be shown with an explicit empty state — not an error, not a "not authorized" message and not a blank page

#### Scenario: A decommissioned element's page renders its record and its state
- GIVEN a decommissioned element with two past reviews
- WHEN a caller who can see them opens its history page
- THEN both entries MUST render and the header MUST show the element as decommissioned, through a localized label rather than a raw value

#### Scenario: Every unreachable cause shows the same message
- GIVEN the user opens, in turn, the history page of a nonexistent element, a soft-deleted element, an element of another community, and an element outside their own scope
- WHEN each rejection is shown
- THEN the displayed message MUST be identical in all four cases and MUST NOT state or imply that the element exists

#### Scenario: Error handling does not branch on English message text
- GIVEN the element history page mapping an API error to a UI message
- WHEN it selects the message
- THEN it MUST branch only on `ApiError.status` and `.code`

#### Scenario: A loading state renders while the request is in flight
- GIVEN the element history request has not yet resolved
- WHEN the page renders
- THEN an explicit loading indication MUST be shown, not a blank page and not an empty state

#### Scenario: Every new string is translated in all three locales
- GIVEN the translation keys this page introduces
- WHEN `en`, `es` and `ca` are compared
- THEN each key MUST have a real, non-placeholder value in all three, enforced by the existing locale parity test

### Requirement: Two Entry Links Reach the Element History Page

The element history page MUST be reachable by navigation, without a
hand-typed URL, through **exactly two** entry links. Neither MUST
introduce a new page, a new layout or a new control family.

| Entry link | Where | Who reaches it |
|---|---|---|
| From the element itself | A per-row action on the community's element list, alongside the shipped per-element print action | `SYSTEM_ADMIN`, the only role that reaches that list |
| From a session's history detail | A per-entry action on each entry row of the shipped read-only historical session view, leading to **that entry's own element's** full history | All five history roles |

The second link is **required, not optional**: every role other than
`SYSTEM_ADMIN` reaches no element list, so without it four of the five
scopes would have no browser path to a feature their API scope grants
them. Shipping the endpoint with only the element-list link MUST be
treated as an incomplete slice.

Each link MUST target exactly **one** element — the element of its own
row or entry. No list-level, bulk or cross-element history action MUST be
offered anywhere.

An entry row whose element no longer resolves MUST NOT offer the link at
all, rather than offering one that leads to a rejection.

Neither link MUST alter its host page otherwise: the element list's
existing columns and actions, and the session detail view's existing
rendering of entries, answers and observations, MUST be unchanged apart
from the added link.

#### Scenario: The element list row reaches that element's history
- GIVEN a `SYSTEM_ADMIN` viewing community C's element list containing element E
- WHEN they trigger the history action on E's row
- THEN E's history page — and no other element's — MUST be reached

#### Scenario: A session entry row reaches that entry's element's history
- GIVEN any of the five history roles viewing a completed session whose record contains an entry for element E
- WHEN they trigger that entry's element-history action
- THEN E's history page MUST be reached, showing E's record across all its sessions, not only the session they came from

#### Scenario: All four non-admin roles have a browser path to the feature
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding `VIEW_ALL_REVIEWS`, each with at least one readable session containing an element entry
- WHEN each navigates from the app's entry page through the history list and into a session's detail view
- THEN each MUST be offered a control leading to that entry's element's history page, with no hand-typed URL required

#### Scenario: An entry whose element no longer resolves offers no link
- GIVEN a session detail view containing an entry whose inspectable element was soft-deleted after completion
- WHEN that row renders
- THEN no element-history link MUST be offered on it, and the row MUST still render its answers and observations as it already does

#### Scenario: No bulk or cross-element history action is offered
- GIVEN the community element list and the session detail view after this change
- WHEN their list-level actions are enumerated
- THEN none MUST offer the history of more than one element at a time

#### Scenario: The host pages are otherwise unchanged
- GIVEN the community element list and the read-only session detail view before and after this change
- WHEN each is compared
- THEN the only difference MUST be the added per-row link — no column removed or reordered, no existing action changed, and no rendering of entries, answers or observations altered

### Requirement: The Element History Route Is Gated on the Five History Roles Despite Its Admin-Only URL Family

The element history route MUST be restricted to authenticated users
holding `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER`, `SYSTEM_ADMIN` or `MANAGER` — the **same
five** roles as every other review-history route — even though every
**other** route under `/communities/:communityId/inspectable-elements/**`
is `SYSTEM_ADMIN`-only.

This divergence is **deliberate**: the page is a review-history read that
happens to be keyed by an element, and gating it like its URL neighbours
would collapse a five-scope feature to one role. It MUST be defended
against being "fixed" in either direction — neither narrowed to
`SYSTEM_ADMIN` to match the family, nor used as precedent to widen any
other route of that family.

The intent MUST be recorded where a future reader will meet it: an
explicit in-place comment on the route declaration naming both the five
allowed roles and the family's `SYSTEM_ADMIN`-only default, plus a route
gate test that names both.

The `MANAGER` gate MUST be the role alone and MUST NOT be conditioned on
the `VIEW_ALL_REVIEWS` capability, which the client never learns: an
ungranted `MANAGER` MUST therefore reach the route and receive the
surface's uniform unreachable message from the server's rejection, never
a client-side "not authorized" screen. An unauthenticated visitor MUST be
redirected to `/login`.

No other route of the `inspectable-elements` family MUST change its gate,
and no element-management route MUST become reachable by any non-admin
role.

#### Scenario: All five history roles reach the element history route
- GIVEN the caller is authenticated as `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`, `MAINTENANCE_COMPANY_MANAGER`, `SYSTEM_ADMIN` or `MANAGER`
- WHEN they navigate to the element history route
- THEN the page MUST render for each, and in no case MUST the client's "not authorized" message appear

#### Scenario: An ungranted manager reaches the route and gets the server's answer
- GIVEN a signed-in `MANAGER` holding no capability, navigating directly to an existing element's history route
- WHEN the page resolves
- THEN the route MUST NOT refuse them client-side, and the surface's uniform unreachable message MUST be shown from the server's rejection

#### Scenario: The rest of the element family stays admin-only
- GIVEN the caller is authenticated as any role other than `SYSTEM_ADMIN`
- WHEN they navigate to the community element list, create, edit or label routes
- THEN an explicit "not authorized" message MUST be shown for each — the history route's widening MUST NOT have extended to any of them

#### Scenario: The divergence is documented and gate-tested
- GIVEN the element history route declaration after this change
- WHEN it is inspected
- THEN an explicit comment MUST name both the five allowed roles and the `inspectable-elements` family's `SYSTEM_ADMIN`-only default, and a route gate test MUST assert both the five-role allowance here and the admin-only default on a sibling route

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to the element history route
- THEN they MUST be redirected to `/login`

## MODIFIED Requirements

### Requirement: Role-Gated Route Access for the History Views

The system MUST restrict every review-history route to authenticated
users holding `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`,
`MAINTENANCE_COMPANY_MANAGER`, `SYSTEM_ADMIN` or `MANAGER`. All five MUST
reach the identical surface, with no reduced or alternative variant. The
`MANAGER` gate MUST be the role alone: it MUST NOT be conditioned on the
`VIEW_ALL_REVIEWS` capability, so a `MANAGER` without it reaches the same
surface and sees the shipped empty state (see *The Manager Reaches the
Shipped History Surface, Granted or Not*). An authenticated user of any
other role who reaches such a route MUST see an explicit "not authorized"
message, not a silent redirect. An unauthenticated visitor MUST be
redirected to `/login`.

"Every review-history route" MUST be read by **behaviour, not by URL
prefix**. It now includes one route outside the `/review-history*` family
— the element history route under
`/communities/:communityId/inspectable-elements/:elementId/history` — and
that route MUST carry the identical five-role gate, per *The Element
History Route Is Gated on the Five History Roles Despite Its Admin-Only
URL Family*. A future review-history view placed under any other URL
prefix MUST likewise take this gate; matching its URL neighbours instead
MUST be treated as a defect.

Standing note on the deny branch: `Role` has exactly five members, so
widening every review-history route to all five makes "any role other
than the five above" the empty set — no role can witness the deny branch
on this route family through an HTTP request. The deny-branch guarantee
is not lost: it is exercised on route families that still exclude a role,
namely `/review-sessions*` (below) and the rest of the
`/communities/:communityId/inspectable-elements/**` family, which stays
`SYSTEM_ADMIN`-only.
(Previously: the requirement governed the `/review-history*` routes
alone, and the standing note explained only why no deny scenario remains
on that family. This change adds a review-history route that lives under
a different — and otherwise `SYSTEM_ADMIN`-only — URL prefix, so the
requirement's reach is restated as behavioural rather than prefix-based,
and the deny branch gains a second family that still exercises it.)

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

#### Scenario: A MANAGER reaches the identical history views whether granted or not
- GIVEN the caller is authenticated as `MANAGER`, once holding `VIEW_ALL_REVIEWS` and once holding no capability
- WHEN they navigate to a review-history route, list or detail
- THEN in both cases the same surface MUST be shown, with no reduced, alternative or manager-specific variant, and in neither case MUST the "not authorized" message appear

#### Scenario: The element history route carries the same five-role gate
- GIVEN each of the five history roles in turn
- WHEN they navigate to `/communities/:communityId/inspectable-elements/:elementId/history`
- THEN each MUST reach the page, and none MUST be refused client-side — despite every sibling route of that URL family being `SYSTEM_ADMIN`-only

#### Scenario: The manager is still denied the review-session write routes
- GIVEN the caller is authenticated as `MAINTENANCE_COMPANY_MANAGER`
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render

#### Scenario: The admin is denied the review-session write routes too
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render — the history widening MUST NOT extend to the write surface

#### Scenario: The MANAGER is denied the review-session write routes too
- GIVEN the caller is authenticated as `MANAGER`, granted or ungranted
- WHEN they navigate directly to a `/review-sessions` route by hand-typed URL
- THEN an explicit "not authorized" message MUST be shown and no session-performing view MUST render

#### Scenario: The deny branch is still exercised on the element-management routes
- GIVEN the caller is authenticated as any role other than `SYSTEM_ADMIN`
- WHEN they navigate directly to a community's element list, create, edit or label route
- THEN an explicit "not authorized" message MUST be shown — the element history route's five-role gate MUST NOT have widened its siblings

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any review-history route, including the element history route
- THEN they MUST be redirected to `/login`

### Requirement: Internationalization Coverage

The review-history UI MUST contain zero hardcoded UI strings. All
user-facing text — including column headings, the empty state, answer and
element-type labels, timestamps' surrounding copy and rejection messages
— MUST come from translation keys with real (non-placeholder) values in
`en`, `es` and `ca`, enforced by the existing locale parity test. No
`elementType`, status, element-state or answer enum value MUST be
rendered raw.

This coverage MUST extend to **every** view of the surface, including the
element history page and both of its entry links: the page's header
labels, its row labels, its loading, empty and unreachable messages, and
the link labels on the element list and the session detail view MUST all
come from translated keys, and the element's type and active/
decommissioned state MUST be rendered through localized labels rather
than raw values.
(Previously: enumerated the list and the read-only session view's text
only, and named `elementType`, status and answer as the enums never to be
rendered raw. This change adds a third view and a new rendered enum-like
value — the element's active/decommissioned state — so the requirement's
reach and its raw-value prohibition are both extended.)

#### Scenario: All visible text is translated in every configured locale
- GIVEN any view of the review-history surface is rendered, including the element history page
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback

#### Scenario: Enum values are never rendered raw
- GIVEN an element type, a session status, an element's active/decommissioned state or an answer value is displayed as visible text
- WHEN it is rendered
- THEN it MUST show a localized label, not the raw enum string, boolean or timestamp

#### Scenario: The element history page's own keys have real values in all three locales
- GIVEN the translation keys introduced by the element history page and its two entry links
- WHEN `en`, `es` and `ca` are compared by the locale parity test
- THEN every key MUST be present with a real, non-placeholder value in all three

### Requirement: No Filtering, Analytics or Adjacent Controls Ship

The history surface MUST stay a single unfiltered list, a read-only
session detail view, **and one unfiltered per-element record** — for
every role that reaches it. It MUST NOT add pagination, infinite scroll,
a date-range filter, a sort control or a search box **on any of the
three**; and MUST NOT add signing, export, scheduling, due-date or
overdue indicators, compliance dashboards, per-community or
per-technician statistics, attachments or notifications. The
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
(Previously: the surface was "a single unfiltered list plus a read-only
detail view" and MUST NOT add a per-element history view at all, with the
*"No per-element history view exists"* scenario requiring that a search
of the web routes and pages find none. Exactly one such view now ships;
the guard is **narrowed, not deleted** — it becomes a bound on that one
view: one page, two links, no controls, no second variant and no
aggregation.)

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
- GIVEN every other page of the web app after this change
- WHEN each is inspected
- THEN none MUST embed an element's review record, none MUST render a cross-element "last review each" rollup, and none MUST compute a per-element chart, trend, interval or overdue indicator

#### Scenario: No adjacent capability surfaces
- GIVEN every view of the review-history surface, the element history page included
- WHEN its controls are enumerated
- THEN none MUST offer signing, export, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications
