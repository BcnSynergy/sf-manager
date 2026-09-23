# Delta for Review History UI

> **Purpose amendment (for archive):** in the Purpose's "Out of scope"
> list, replace "signing, export" with: "signing and any export, print,
> download or send control on this surface — the printable review
> document is owned by `review-document-ui`, and this surface's only link
> to it is the single **View document** link on the read-only historical
> session view". Nothing else in the Purpose changes.

## MODIFIED Requirements

### Requirement: Read-Only Historical Session View

Opening a completed session MUST render its recorded record — every
element entry with its answers and its observations, including elements
left unreviewed with their reason — and MUST offer **no** mutating
control. Specifically, no control MUST offer to edit, reopen, answer,
record, mark unreviewed, enter an element `code`, complete, discard,
sign, export, print or delete. The view MUST be reachable for a session
the caller did not perform whenever the server returns it.

The view MUST offer exactly **one** non-mutating **View document** link,
leading to that session's document page (`review-document-ui`), for
every one of the five history roles. That link MUST be the view's only
addition: its existing rendering of entries, answers and observations,
and its per-entry element-history links, MUST be unchanged.
(Previously: the view forbade sign, export and delete controls, did not
name print, and offered no link to a document.)

#### Scenario: The recorded record is rendered in full
- GIVEN a completed session with answered elements and one element marked unreviewed with a reason
- WHEN its read-only view renders
- THEN every entry MUST be shown with its snapshotted question wording, its recorded answer values, and the unreviewed element's observations

#### Scenario: No mutating control renders
- GIVEN the read-only view of a completed session
- WHEN its controls are enumerated
- THEN none MUST offer edit, reopen, answer, record, mark-unreviewed, code entry, complete, discard, sign, export, print or delete

#### Scenario: An entry whose element no longer resolves still renders
- GIVEN a completed session one of whose inspectable elements was decommissioned or soft-deleted after completion
- WHEN its read-only view renders
- THEN that entry MUST still be shown with its answers and observations, under a localized neutral label in place of the missing element identity, and MUST NOT render as a blank, an error or a raw identifier

#### Scenario: A representative opens a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` whose history list includes a technician-performed session
- WHEN they open it
- THEN its full recorded record MUST be shown, identically to the performer's view and still with no mutating control

#### Scenario: The view offers one View document link
- GIVEN any of the five history roles on the read-only view of a completed session
- WHEN its controls are enumerated
- THEN exactly one **View document** link MUST be offered, and it MUST lead to that session's document page

#### Scenario: The link changes nothing else on the view
- GIVEN the read-only session view before and after this change
- WHEN both are compared
- THEN the only difference MUST be the added **View document** link

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
from the added link — and, on the session detail view only, apart from
the single **View document** link this change adds
(*Read-Only Historical Session View*).
(Previously: the session detail view's only addition was the per-entry
element-history link; the **View document** link is now a second,
independent addition to the same host page.)

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
- WHEN each navigates via the global navigation's Review history item, reachable from any authenticated page, through the history list and into a session's detail view
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
- THEN the only differences MUST be the added per-row element-history link and, on the session detail view only, the single **View document** link — no column removed or reordered, no existing action changed, and no rendering of entries, answers or observations altered

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
(Previously: forbade signing and export outright with no exception. The
guard is **narrowed, not deleted**: exactly one link to a session's
document is allowed, on the session detail view only; every signing,
export, print, download and send control on this surface stays
forbidden, and the list and the element history page gain nothing.)

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
- THEN none MUST offer signing, export, print, download, send, due dates, overdue lists, statistics, dashboards, photos, attachments or notifications — the session detail view's single **View document** link being the only document-related control, and the list and element history page offering none
