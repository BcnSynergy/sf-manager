# App Navigation

## Purpose

The global authenticated shell: a single role-filtered navigation
control, rendered on **every** authenticated page, carrying one entry per
section the signed-in user's role can actually open, plus the logout
control. It replaces — it does not join — the two hand-rolled
role-conditional links and the logout button that have lived on
`HealthPage` alone since `review-session`; after this capability ships
there is **one** navigation mechanism in the app, not two.

What the nav offers is decided entirely by `useAuth().user.role` against
a single static, exhaustive role → items table. There is **no** backend
change of any kind: no entity, no endpoint, no Value Object, no
permission, no `/auth/me` field. In particular the client still never
learns `managerCapabilities`, so a `MANAGER`'s history item is gated on
the role alone and an ungranted manager sees the identical link and the
already-shipped empty state, exactly as ADR-011's *"link visible, empty
result"* precedent requires.

The nav is a **link bar and nothing more**. Out of scope: a sidebar, a
hamburger/dropdown or any responsive-collapse treatment; breadcrumbs, a
"back" affordance, search, a dashboard or a user/profile menu; a design
system, CSS framework, theming or app branding; a language switcher
(deferred by ADR-007); and any change to a route's `allowedRoles` or to
`ProtectedRoute`'s precedence logic. Promoting a CRUD sub-route or the
element-history drill-in to a nav item is likewise out of scope.

> **Recorded, explicitly out of scope — not a requirement of this
> capability.** The product owner asked to flag that a future change
> might revisit ADR-011's *"link visible, empty result"* pattern **more
> broadly across the app**, so that a user is never offered a surface
> that will be empty for them. Doing so has real consequences — an
> `/auth/me` contract change, a capability-aware client, and a decision
> about whether capability membership is itself sensitive — and this
> slice deliberately follows the shipped precedent unchanged. Nothing in
> this spec MUST be read as requiring, preparing for or stubbing that
> work. If the pattern is ever revisited, this navigation is one of its
> call sites and would need to be revisited with it.

## Requirements

### Requirement: A Global Navigation Renders on Every Authenticated Page

The system MUST render one navigation control on **every** authenticated
route, not on a landing page only: a user on a deep route such as a
user-edit form MUST see the same navigation a user on `/` sees. It MUST
be exposed as a `<nav>` landmark and MUST indicate the current page
(`aria-current`) when one of its items matches the active route.

It MUST render on the wrong-role denial view as well as on ordinary
pages: an authenticated user who reaches "not authorized" is signed in,
and the navigation is their way out of that page.

It MUST NOT render for a visitor with no user: not on the public
`/login` route, and not while the auth provider is still resolving the
session. The loading case MUST take precedence — no empty navigation bar
MUST flash, and no navigation code path MUST read a role off an absent
user.

#### Scenario: The navigation renders on a deep authenticated page
- GIVEN a signed-in user on an authenticated route other than the app's entry page
- WHEN the page renders
- THEN the navigation MUST be present, identical to the one rendered on the entry page

#### Scenario: The navigation renders on the wrong-role denial view
- GIVEN a signed-in user who navigates to a route their role may not open
- WHEN the explicit "not authorized" message renders
- THEN the navigation MUST be rendered alongside it, offering their own role's items

#### Scenario: No navigation on the public login route
- GIVEN an unauthenticated visitor on `/login`
- WHEN the page renders
- THEN no navigation MUST be rendered

#### Scenario: No navigation while the session is still resolving
- GIVEN the auth provider has not yet resolved whether a user is signed in
- WHEN the app renders
- THEN no navigation MUST be rendered — neither a populated one nor an empty bar — and no role MUST be read off an absent user

#### Scenario: The current page is indicated
- GIVEN a signed-in user on a route that one of their navigation items targets
- WHEN the navigation renders
- THEN that item MUST be marked as the current page, and no other item MUST be

### Requirement: The Role → Navigation Items Map Is Exhaustive and Fixed

The system MUST derive the navigation's items from the signed-in user's
role alone, through a single static lookup that is **exhaustive over
every member of `Role`** — adding a sixth role MUST fail the build
rather than silently produce an empty navigation.

Each role MUST be offered exactly these items and no others:

| Role | Items |
|---|---|
| `SYSTEM_ADMIN` | Home, Users, Communities, Maintenance companies, Checklist questions, Review templates, Review history, Organization profile (**8**) |
| `MAINTENANCE_TECHNICIAN` | Home, Review sessions, Review history (**3**) |
| `COMMUNITY_REPRESENTATIVE` | Home, Review sessions, Review history (**3**) |
| `MAINTENANCE_COMPANY_MANAGER` | Home, Review history (**2**) |
| `MANAGER` | Home, Review history (**2**) |

Every item MUST point at its section's **top-level route**: the list
route for a section that manages a collection, and the page itself for
the organization profile, which manages a singleton and therefore has
no collection to list. No `/new`, `/:id`, `/:id/edit` or other
sub-route MUST appear in the navigation; those stay reachable from
their list page as they already are.

The navigation MUST NOT fetch data, introduce a new context, or hold any
state beyond what the auth provider already exposes. In particular the
organization profile item MUST be decided by the role alone — the
navigation MUST NOT read the profile, and MUST NOT vary with whether the
profile is filled in or blank.

#### Scenario: Each of the five roles sees exactly its own item set
- GIVEN a signed-in user of each role in turn
- WHEN the navigation renders for each
- THEN the rendered items MUST match that role's row of the table above exactly — none missing and none extra

#### Scenario: The admin reaches all eight sections without typing a URL
- GIVEN a signed-in `SYSTEM_ADMIN` on any authenticated page
- WHEN they use the navigation
- THEN all eight sections — Home, the five admin sections, Review history and Organization profile — MUST be reachable in one click, with no hand-typed URL required

#### Scenario: Only the admin is offered the organization profile
- GIVEN a signed-in user of each of the five roles in turn
- WHEN the Organization profile item is looked for in the navigation rendered for each
- THEN it MUST be present for `SYSTEM_ADMIN` only, and absent for the other four roles

#### Scenario: The organization profile item does not depend on the profile's contents
- GIVEN a signed-in `SYSTEM_ADMIN`, once with a blank seeded profile and once with every field filled
- WHEN the navigation renders in each case
- THEN the identical Organization profile item MUST be offered, and the navigation MUST have issued no request for the profile

#### Scenario: A new role cannot ship with an unmapped navigation
- GIVEN a sixth member is added to `Role` without a row in the lookup
- WHEN the project is type-checked
- THEN the build MUST fail rather than render an empty navigation for that role

#### Scenario: No CRUD sub-route is offered
- GIVEN the navigation rendered for any role
- WHEN its item targets are enumerated
- THEN each MUST be a section's top-level route, and none MUST be a create, detail or edit sub-route

### Requirement: Every Navigation Item Targets a Route Its Viewer May Open

The navigation MUST NOT invent reachability: for the role it is rendered
for, **every** item's target route MUST be one that route's own
`allowedRoles` gate already admits. No role MUST be able to reach the
"not authorized" view by activating a navigation item.

#### Scenario: No navigation item leads its own viewer to a denial
- GIVEN a signed-in user of each role in turn
- WHEN every item the navigation offers them is activated
- THEN each MUST render its target page, and in no case MUST the "not authorized" view appear

#### Scenario: The item set agrees with the route gates
- GIVEN the navigation's role → items lookup and the application's route declarations
- WHEN each item's target route is cross-read against that route's `allowedRoles`
- THEN every item offered to a role MUST appear on a route that admits that role

### Requirement: The Added Item Preserves the Reachability Invariant

The organization profile item MUST satisfy *Every Navigation Item
Targets a Route Its Viewer May Open* without exception: the route it
targets MUST admit `SYSTEM_ADMIN` through its own `allowedRoles` gate,
so activating it MUST never land its viewer on the "not authorized"
surface. The existing reachability test MUST cover the added item
rather than being relaxed to accommodate it.

#### Scenario: The new item does not lead its viewer to a denial
- GIVEN a signed-in `SYSTEM_ADMIN`
- WHEN they activate the Organization profile item
- THEN the organization profile page MUST render, and the "not authorized" view MUST NOT appear

#### Scenario: The reachability test covers the new item unrelaxed
- GIVEN the navigation's role → items lookup, the route declarations and the reachability test after this change
- WHEN the test runs
- THEN it MUST pass with the added item included, and MUST NOT have been weakened, skipped or given an exception for it

### Requirement: The Navigation Offers No Path to the Review-Session Write Surface

No navigation item rendered for a `SYSTEM_ADMIN`, a `MANAGER` or a
`MAINTENANCE_COMPANY_MANAGER` MUST lead to `/review-sessions` or to any
session-performing view, and the navigation MUST offer none of them a
control to open, resume, answer, record, mark unreviewed, enter an
element `code`, complete or discard a session. This is the mechanism by
which the shipped `review-history-ui` guarantees — that no navigation
control offered to these three roles crosses the write surface — stay
true now that navigation is global rather than confined to one page.

Only `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` MUST be
offered the Review sessions item.

#### Scenario: The write surface is absent from three roles' navigation
- GIVEN a signed-in `SYSTEM_ADMIN`, `MANAGER` and `MAINTENANCE_COMPANY_MANAGER` in turn
- WHEN every navigation control rendered for them is enumerated
- THEN none MUST navigate to `/review-sessions` or to any session-performing view

#### Scenario: Only the two field roles are offered review sessions
- GIVEN the navigation rendered for each of the five roles
- WHEN the Review sessions item is looked for
- THEN it MUST be present for `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` only

### Requirement: The Manager's History Item Is Gated on the Role Alone

The `MANAGER`'s Review history item MUST be conditioned on the role
alone and MUST NOT be conditioned on the `VIEW_ALL_REVIEWS` capability.
The client MUST NOT learn, request or infer that capability for the
navigation's sake: no capability field MUST be added to the current-user
endpoint's response, no endpoint MUST be added to expose it, and the
navigation MUST derive no decision from it. The server MUST remain the
sole authority over what the history page returns.

An **ungranted** `MANAGER` MUST therefore see the identical item and,
on activating it, reach the surface's already-shipped empty state — not
a hidden item, not a disabled item, not an error and not a "not
authorized" message.

#### Scenario: Granted and ungranted managers see the identical navigation
- GIVEN two signed-in `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability
- WHEN the navigation renders for each
- THEN both MUST be offered the identical single Review history item — its visibility MUST NOT depend on the capability

#### Scenario: An ungranted manager's item leads to the shipped empty state
- GIVEN a signed-in `MANAGER` holding no capability, in an installation that does contain completed sessions
- WHEN they activate their Review history item
- THEN the history surface's already-shipped empty state MUST be rendered — not an error, not a "not authorized" message and not a blank page

#### Scenario: The navigation never learns the capability
- GIVEN the current-user endpoint's response, the client's auth context and the navigation's own code after this change
- WHEN each is inspected
- THEN none MUST carry or branch on `managerCapabilities` or `VIEW_ALL_REVIEWS`, and no endpoint MUST have been added to expose it

### Requirement: Logout Moves Into the Navigation and the Health Page Keeps Only Its Readout

The logout control MUST live in the navigation and MUST therefore be
reachable from **every** authenticated page. Its behaviour MUST be
unchanged: it calls the logout operation and then redirects to `/login`.

The health page's two role-conditional entry links and its logout button
MUST be **removed in the same change that introduces the navigation** —
the two mechanisms MUST NOT coexist on the main branch. After this
change the health page MUST render its health-status readout and nothing
else: no navigation link and no logout control.

The two translation keys those removed links used MUST be deleted from
every locale file, leaving no dead key behind.

#### Scenario: Logout is reachable from every authenticated page
- GIVEN a signed-in user on any authenticated page, including the wrong-role denial view
- WHEN the page renders
- THEN a logout control MUST be present

#### Scenario: Logout survives an unrecognized role
- GIVEN a signed-in user whose role is not one of the five known `Role` values (e.g. a stale client after a server-side role change)
- WHEN the navigation renders
- THEN it MUST still render a working logout control, with no navigation items

#### Scenario: Logout still clears the session and returns to login
- GIVEN a signed-in user activates the navigation's logout control
- WHEN the logout operation succeeds
- THEN they MUST be redirected to `/login`, exactly as the shipped logout flow already specifies

#### Scenario: The health page renders no link and no logout button
- GIVEN a signed-in user of any role on the health page
- WHEN its controls are enumerated
- THEN it MUST show its health-status readout, and MUST render no navigation link and no logout button of its own

#### Scenario: The removed translation keys exist in no locale
- GIVEN the `en`, `es` and `ca` locale files after this change
- WHEN the two keys that labelled the health page's removed links are looked for
- THEN they MUST be absent from all three

#### Scenario: Two navigation mechanisms never coexist
- GIVEN the state of the main branch at every commit of this change
- WHEN the app's navigation controls are enumerated
- THEN at no point MUST both the health page's role-conditional links and the global navigation be present together

### Requirement: The Navigation Adds No Third Entry Point to the Element History Page

The navigation MUST NOT offer an item leading to
`/communities/:communityId/inspectable-elements/:elementId/history`.
That page is a contextual drill-in whose shipped requirement fixes its
navigation entry points at **exactly two** — the element-list row link
and the session-detail entry link — and a navigation item would be a
third.

The in-page history link that `/review-sessions` already renders MUST
stay: it is a contextual in-page link, not a competing global
mechanism, and a shipped requirement depends on it.

#### Scenario: The element history page still has exactly two entry links
- GIVEN the web routes and pages after this change
- WHEN every navigation entry point to the element history page is enumerated
- THEN exactly two MUST be found — the element-list row link and the session-detail entry link — and the global navigation MUST NOT be among them

#### Scenario: The review-session surface keeps its own history link
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` on `/review-sessions`
- WHEN the page renders
- THEN its existing in-page history link MUST still be present and still navigate to the history list

### Requirement: Navigation Test Identifiers Do Not Collide With Shipped Ones

Every test identifier the navigation introduces MUST be distinct from
every identifier already used elsewhere in the app, under one consistent
naming convention that marks it as the navigation's own. In particular
the navigation's history item MUST NOT reuse the identifier the
review-session surface already renders for its in-page history link,
which would make that identifier ambiguous on a page showing both.

The shipped review-session page test MUST keep passing **unmodified**
after the navigation wraps that page.

#### Scenario: No identifier is ambiguous on a page that shows both
- GIVEN the review-session surface rendered inside the navigation for a field role
- WHEN each of the page's test identifiers is queried
- THEN each MUST resolve to exactly one element, with no ambiguity between a navigation item and an in-page link

#### Scenario: The shipped review-session test passes unmodified
- GIVEN the review-session page's existing test file, unchanged
- WHEN the suite runs after the navigation ships
- THEN it MUST pass with no edit to that file

#### Scenario: Navigation identifiers follow one convention
- GIVEN every test identifier the navigation renders
- WHEN they are enumerated
- THEN all MUST share one navigation-specific naming convention and none MUST duplicate an identifier used by any other component

### Requirement: The Navigation Is Absent From Printed Output

The navigation MUST NOT appear in printed output on any page. It is the
first real application chrome the printed-label surface's shipped
chrome-suppression requirement has ever had to suppress, so suppression
MUST be an actual, verified rule rather than a vacuous one.

#### Scenario: The navigation does not print
- GIVEN a signed-in `SYSTEM_ADMIN` on the element label page, with the navigation rendered on screen
- WHEN the print output is produced
- THEN the navigation MUST NOT appear in it, and the label content MUST print as it already does

#### Scenario: Print suppression is verified in a browser, not only in tests
- GIVEN the label page rendered inside the navigation on a running dev server
- WHEN its print preview is inspected
- THEN the navigation MUST be absent from the preview

### Requirement: Route Gating Is Unchanged by the Wrapping

Applying the navigation to the authenticated routes MUST preserve route
gating exactly: routes MAY be relocated into a dedicated route-table
module, but gating behavior and every route's `allowedRoles` values MUST
be preserved exactly, no route MUST be added or removed, each route's
`path` MUST remain paired with its original page component, and the
route-protection component and its test MUST be untouched — including
its precedence order of still loading → no user → wrong role. "Untouched"
for the route-protection component's test file, and for other shipped
files whose comments merely reference the pre-relocation route table, is
narrow: logic and pass/fail conditions MUST NOT change, but comment-text
and test-name updates are explicitly permitted where needed to keep a
file's own documentation accurate about (a) which module now imports a
relocated constant, and (b) which module now holds the relocated route
declarations/comments, and whether a dedicated route test file exists
(e.g. following the route-table relocation above) — none of this is a
gating change; only comment-text updates are permitted, never
assertion/behavior/logic changes.

#### Scenario: Every route's allowed roles are unchanged
- GIVEN the application's route declarations before and after this change
- WHEN each route's `allowedRoles` array is compared
- THEN every one MUST be byte-identical, and the set of declared routes MUST be unchanged

#### Scenario: Every route's path stays paired with its original component
- GIVEN the application's route declarations before and after this change
- WHEN each route's `path` is compared against the page component it renders
- THEN every route's `path` MUST be paired with the same component it was paired with before this change

#### Scenario: The route-protection component and its test are untouched
- GIVEN the route-protection component and its test file before and after this change
- WHEN they are compared
- THEN the component MUST be unchanged; the test file's logic and pass/fail conditions MUST be unchanged (a comment-text and test-name update to keep its documentation accurate about a relocated import is permitted); and the test MUST still pass

### Requirement: Internationalization Coverage

The navigation MUST contain zero hardcoded user-facing strings. Every
item label and the logout control's label MUST come from translation
keys with real (non-placeholder) values in `en`, `es` and `ca`, enforced
by the existing locale parity test. No role, route path or other raw
value MUST be rendered as visible text.

#### Scenario: Every navigation label is translated in all three locales
- GIVEN the navigation is rendered
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible label MUST come from a translation key with a real value for that locale, not a placeholder or an English fallback

#### Scenario: The locale parity test covers the added and removed keys
- GIVEN the locale files after this change
- WHEN the parity test runs
- THEN it MUST pass over the navigation's new keys and over the two removed health-page keys alike

### Requirement: The Navigation Stays a Link Bar and Nothing More

The navigation MUST remain a plain list of links plus the logout
control. It MUST NOT introduce a sidebar, a hamburger, dropdown or any
collapse/toggle state; breadcrumbs, a "back" affordance, search, a
dashboard or a user/profile menu; a design system, CSS framework,
theming or app branding; or a language switcher.

This change MUST add no new runtime dependency, and MUST leave the API,
database schema and shared validation packages untouched.

#### Scenario: No collapse, menu or dashboard chrome ships
- GIVEN the navigation after this change
- WHEN its rendered controls and its state are enumerated
- THEN none MUST offer a sidebar, hamburger, dropdown, collapse toggle, breadcrumb, search box, dashboard or profile menu, and the component MUST hold no open/closed state

#### Scenario: No dependency and no backend change ships
- GIVEN the project's dependency manifests, the API, the database schema and the shared validation package before and after this change
- WHEN each is compared
- THEN no dependency MUST have been added and all three MUST be untouched
