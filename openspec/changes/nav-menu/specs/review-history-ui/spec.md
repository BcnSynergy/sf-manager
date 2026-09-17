# Delta for Review History UI

> **Purpose note (for archive):** no Purpose rewording is required. What
> changes is the **mechanism** of three entry points, not the surface:
> the `MAINTENANCE_COMPANY_MANAGER`, `SYSTEM_ADMIN` and `MANAGER` reached
> the history list through a role-conditional link on the app's entry
> page; that link is deleted and replaced by the global navigation's
> Review history item, offered on **every** authenticated page
> (`app-navigation`). Two shipped requirements are deliberately left
> untouched: *A Reachable Entry Point From the Existing Review-Session
> Surface* — the in-page link on `/review-sessions` stays exactly as
> shipped and is not a competing global mechanism — and *Two Entry Links
> Reach the Element History Page*, whose count MUST stay **exactly two**:
> the global navigation MUST NOT become a third entry point to the
> element history page.

## MODIFIED Requirements

### Requirement: A Reachable Entry Point for the Maintenance Company Manager That Bypasses the Write Surface

A signed-in `MAINTENANCE_COMPANY_MANAGER` MUST be able to reach the
history list by navigation, without typing a URL by hand, through a
control that does **not** route through the `/review-sessions`
review-session surface. That surface is the write flow owned by
`review-session-ui`, which this role MUST NOT gain: no navigation path
offered to a manager MUST lead to it, and no control offering to open,
resume, answer, complete or discard a session MUST be rendered for them
anywhere in the app.

That control MUST now be the **global navigation's Review history item**
(`app-navigation`), rendered on **every** authenticated page rather than
on the app's entry page alone — so the requirement is no longer satisfied
by a landing-page link, which is deleted by the same change.
Correspondingly, the write-surface guarantee MUST be read against the
global navigation: when *"every navigation control rendered for them"* is
enumerated, the global navigation's items MUST be included in that
enumeration, and this role's single item MUST be the history list.
(Previously: the entry point was a role-conditional link on the app's
entry page, and the write-surface scenario enumerated the controls
rendered on that page. The link is removed in this change and the
mechanism becomes global, so the requirement names the navigation as the
entry point and the enumeration explicitly covers it on every page.)

#### Scenario: The manager reaches history from any authenticated page
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` is signed in and on any authenticated page, including the wrong-role denial view
- WHEN they look for their company's past reviews
- THEN a navigation control MUST be offered that navigates directly to the history list, with no hand-typed URL required

#### Scenario: The manager's path never crosses the write surface
- GIVEN a signed-in `MAINTENANCE_COMPANY_MANAGER`
- WHEN every navigation control rendered for them is enumerated — the global navigation's items included
- THEN none MUST navigate to `/review-sessions` or to any session-performing view

#### Scenario: The manager's navigation offers exactly two items
- GIVEN a signed-in `MAINTENANCE_COMPANY_MANAGER`
- WHEN the global navigation renders for them
- THEN it MUST offer exactly two items, Home and the history list, plus the logout control and nothing else

#### Scenario: No write control is rendered for the manager
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` viewing the history list and a session's read-only view
- WHEN the controls on each are enumerated
- THEN none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other two roles' entry point is unchanged
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`
- WHEN they reach the history list
- THEN the shipped `/review-sessions` in-page entry point MUST still work exactly as before, unaffected by the manager's navigation item

### Requirement: The Manager Reaches the Shipped History Surface, Granted or Not

A signed-in `MANAGER` MUST reach the review-history list and the
read-only session view through the **same pages already shipped for the
other four roles**, with no new page, no manager variant, no additional
column and no additional control. Widening the surface to this role MUST
be role-widening only.

They MUST be able to reach the history list by navigation without typing
a URL by hand, through the **global navigation's Review history item**
(`app-navigation`) — the same item the `MAINTENANCE_COMPANY_MANAGER` and
`SYSTEM_ADMIN` reach it by, now rendered on **every** authenticated page
rather than on the app's entry page alone. Opening a row MUST navigate to
that session's read-only view.

Both the route gate and that navigation item MUST be conditioned on the
**role alone** and MUST NOT be conditioned on the `VIEW_ALL_REVIEWS`
capability. The client MUST NOT learn, request or infer the capability:
no capability field MUST be added to the current-user endpoint's
response, no new endpoint MUST be added to expose it, and no client-side
authorization decision — the navigation's own item filtering included —
MUST be derived from it. The server MUST remain the sole authority over
what the page returns.

Consequently, a `MANAGER` **without** the capability MUST see the
identical navigation item, reach the history list and see the surface's
already-shipped **empty state** — not an error, not a "not authorized"
message, and not a hidden or disabled item. Their detail-route access
MUST resolve to the surface's existing uniform unreachable-session
message, per *An Unreachable Session Gets One Uniform Message*.

That navigation path MUST NOT cross the `/review-sessions` write surface
owned by `review-session-ui`, which this role MUST NOT gain: no
navigation control offered to a `MANAGER` — the global navigation's items
included — MUST lead to it, and no control offering to open, resume,
answer, record, mark unreviewed, enter an element `code`, complete or
discard a session MUST be rendered for them anywhere on this surface.

The other four roles' experience MUST be unchanged — same pages, same
rows, same controls. This change MUST add no new user-facing string and
therefore no new translation key **to this surface**; the navigation's
own labels are new keys owned by `app-navigation`, not by this
capability.
(Previously: the entry point was a role-conditional link on the app's
entry page, gated on the role alone, and the capability-independence
scenarios were phrased against that page. The link is removed in this
change and the mechanism becomes the global navigation, so the
requirement names the navigation as the entry point, extends the
"client never learns the capability" prohibition to the navigation's item
filtering, and clarifies that the navigation's own labels are not this
surface's keys.)

#### Scenario: The manager reaches history from any authenticated page
- GIVEN a `MANAGER` is signed in and on any authenticated page
- WHEN they look for the installation's past reviews
- THEN a navigation control MUST be offered that navigates directly to the history list, with no hand-typed URL required

#### Scenario: The navigation item is shown regardless of the capability
- GIVEN two signed-in `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability
- WHEN the navigation is rendered for each
- THEN both MUST be offered the identical history item — its visibility MUST NOT depend on the capability, and neither MUST see it hidden or disabled

#### Scenario: A granted manager sees the installation's sessions on the shipped page
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` and completed sessions across several companies and communities
- WHEN they open the history list
- THEN the shipped list page MUST render every session the server returned, with the same row shape a `SYSTEM_ADMIN` sees and no manager-only column, badge, section or control

#### Scenario: An ungranted manager sees the normal empty state
- GIVEN a signed-in `MANAGER` holding no capability, in an installation that does contain completed sessions
- WHEN they open the history list
- THEN the surface's already-shipped empty state MUST be rendered — not an error, not a "not authorized" message, and not a blank page

#### Scenario: An ungranted manager opening a session by URL gets the uniform message
- GIVEN a signed-in `MANAGER` holding no capability and the URL of an existing completed session's detail route
- WHEN they navigate to it directly
- THEN the surface's existing uniform unreachable-session message MUST be shown, identical to the one shown for a nonexistent session

#### Scenario: The client never learns the capability
- GIVEN the current-user endpoint's response, the client's auth context, the client's route-gating code and the navigation's role → items lookup after this change
- WHEN each is inspected
- THEN none MUST carry or branch on `managerCapabilities` or `VIEW_ALL_REVIEWS`, and no endpoint MUST have been added to expose it

#### Scenario: The manager's path never crosses the write surface
- GIVEN a signed-in `MANAGER`, granted or ungranted
- WHEN every navigation control rendered for them is enumerated — the global navigation's items included
- THEN none MUST navigate to `/review-sessions` or to any session-performing view, and none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other four roles' surface is unchanged
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`, `MAINTENANCE_COMPANY_MANAGER` and `SYSTEM_ADMIN`
- WHEN each reaches the history list and a session's read-only view after this change
- THEN each MUST see exactly what they saw before it — their rows and controls unaffected by the manager's widening

#### Scenario: This surface gains no new string
- GIVEN the review-history UI's own translation keys before and after this change
- WHEN they are compared
- THEN they MUST be identical — the navigation's labels are `app-navigation`'s keys and MUST NOT be added to this surface's namespace

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
admin's other six navigation items belong to Home and the administrative
sections and MUST NOT include the review-session flow.

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
surface.)

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
- WHEN every navigation control rendered for them is enumerated — all seven of the global navigation's items included
- THEN none MUST navigate to `/review-sessions` or to any session-performing view

#### Scenario: No write control is rendered for the admin
- GIVEN a `SYSTEM_ADMIN` viewing the history list and a session's read-only view
- WHEN the controls on each are enumerated
- THEN none MUST offer to open, resume, answer, record, mark unreviewed, enter an element `code`, complete or discard a session

#### Scenario: The other four roles' surface is unchanged, MANAGER included
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`, `MAINTENANCE_COMPANY_MANAGER`, and a `MANAGER` (once granted `VIEW_ALL_REVIEWS`, once holding no capability)
- WHEN each reaches the history list and a session's read-only view after this change
- THEN each MUST see exactly what they were already committed to seeing — their rows and controls unaffected by the admin's seven-item navigation, and the granted/ungranted manager's own experience exactly as specified by *The Manager Reaches the Shipped History Surface, Granted or Not*

> **Guarded but NOT modified — no archive action for these three.** They
> are listed here so a reviewer can see they were considered and
> deliberately left alone; they carry no `### Requirement:` block in this
> delta and MUST NOT be rewritten at archive time.
>
> - *Two Entry Links Reach the Element History Page* — its *"exactly
>   two"* entry links (the element-list row link and the session-detail
>   entry link) MUST stay exactly two. The global navigation MUST NOT
>   offer an item leading to
>   `/communities/:communityId/inspectable-elements/:elementId/history`;
>   such an item would be a third entry link and MUST be treated as a
>   defect against this requirement. The same guarantee is stated from
>   the navigation's side by `app-navigation`'s *The Navigation Adds No
>   Third Entry Point to the Element History Page*.
> - *No Filtering, Analytics or Adjacent Controls Ship* — its scenario
>   *Exactly one per-element history view exists, reachable from exactly
>   two links* independently pins the same *"only navigation entry points
>   MUST be the element-list row link and the session-detail entry
>   link"* guarantee. The global navigation MUST NOT become a third such
>   entry point, for the same reason as the sibling requirement above.
> - *A Reachable Entry Point From the Existing Review-Session Surface* —
>   the in-page history link `/review-sessions` already renders MUST stay
>   exactly as shipped, and its existing test MUST keep passing
>   unmodified once the navigation wraps that page, which requires that
>   the navigation's own test identifiers not collide with it.
