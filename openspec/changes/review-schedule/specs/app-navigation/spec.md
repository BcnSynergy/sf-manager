# Delta for App Navigation

> The main spec's *Purpose* paragraph says the navigation has "**no**
> backend change of any kind" (main `:13-16`). It is not a requirement and
> cannot be modified by a delta. It describes the navigation change itself,
> which stays client-only. The archive step MUST scope that sentence to the
> navigation's introduction, because the Review schedule item points at a
> page backed by `GET /review-schedule` and `reviewSchedule:read`.

## MODIFIED Requirements

### Requirement: The Role → Navigation Items Map Is Exhaustive and Fixed

The system MUST derive the navigation's items from the signed-in user's
role alone, through a single static lookup that is **exhaustive over
every member of `Role`** — adding a sixth role MUST fail the build
rather than silently produce an empty navigation.

Each role MUST be offered exactly these items and no others:

| Role | Items |
|---|---|
| `SYSTEM_ADMIN` | Home, Users, Communities, Maintenance companies, Checklist questions, Review templates, Review history, Review schedule, Organization profile (**9**) |
| `MAINTENANCE_TECHNICIAN` | Home, Review sessions, Review history, Review schedule (**4**) |
| `COMMUNITY_REPRESENTATIVE` | Home, Review sessions, Review history, Review schedule (**4**) |
| `MAINTENANCE_COMPANY_MANAGER` | Home, Review history (**2**) |
| `MANAGER` | Home, Review history, Review schedule (**3**) |

Every item MUST point at its section's **top-level route**: the list
route for a section that manages a collection, and the page itself for
the organization profile, which manages a singleton and therefore has
no collection to list, and for the review schedule, which is a single
page. No `/new`, `/:id`, `/:id/edit` or other
sub-route MUST appear in the navigation; those stay reachable from
their list page as they already are.

The navigation MUST NOT fetch data, introduce a new context, or hold any
state beyond what the auth provider already exposes. In particular the
organization profile item MUST be decided by the role alone — the
navigation MUST NOT read the profile, and MUST NOT vary with whether the
profile is filled in or blank.
(Previously: the table had no Review schedule item, and counted 8, 3, 3, 2
and 2 items for the five roles in the order shown.)

#### Scenario: Each of the five roles sees exactly its own item set
- GIVEN a signed-in user of each role in turn
- WHEN the navigation renders for each
- THEN the rendered items MUST match that role's row of the table above exactly — none missing and none extra

#### Scenario: The admin reaches all nine sections without typing a URL
- GIVEN a signed-in `SYSTEM_ADMIN` on any authenticated page
- WHEN they use the navigation
- THEN all nine sections — Home, the five admin sections, Review history, Review schedule and Organization profile — MUST be reachable in one click, with no hand-typed URL required
(Previously: the body counted eight sections, without Review schedule. The scenario title and body now count nine.)

#### Scenario: Only the admin is offered the organization profile
- GIVEN a signed-in user of each of the five roles in turn
- WHEN the Organization profile item is looked for in the navigation rendered for each
- THEN it MUST be present for `SYSTEM_ADMIN` only, and absent for the other four roles

#### Scenario: Review schedule is offered to four roles and not to the company manager
- GIVEN a signed-in user of each of the five roles in turn
- WHEN the Review schedule item is looked for in the navigation rendered for each
- THEN it MUST be present for `SYSTEM_ADMIN`, `MANAGER`, `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN`, and absent for `MAINTENANCE_COMPANY_MANAGER`

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
(Previously: unchanged in this requirement's text. The first scenario below
read "the identical single Review history item", which would now read as the
manager's only item; it is restated as "the identical Review history item".)

#### Scenario: Granted and ungranted managers see the identical navigation
- GIVEN two signed-in `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability
- WHEN the navigation renders for each
- THEN both MUST be offered the identical Review history item — its visibility MUST NOT depend on the capability
(Previously: "the identical single Review history item".)

#### Scenario: An ungranted manager's item leads to the shipped empty state
- GIVEN a signed-in `MANAGER` holding no capability, in an installation that does contain completed sessions
- WHEN they activate their Review history item
- THEN the history surface's already-shipped empty state MUST be rendered — not an error, not a "not authorized" message and not a blank page

#### Scenario: The navigation never learns the capability
- GIVEN the current-user endpoint's response, the client's auth context and the navigation's own code after this change
- WHEN each is inspected
- THEN none MUST carry or branch on `managerCapabilities` or `VIEW_ALL_REVIEWS`, and no endpoint MUST have been added to expose it

### Requirement: Route Gating Is Unchanged by the Wrapping

Applying the navigation to the authenticated routes (**the wrapping**) MUST
preserve route gating exactly: routes MAY be relocated into a dedicated
route-table module, but gating behavior and every route's `allowedRoles`
values MUST be preserved exactly, no route MUST be added or removed **by the
wrapping**, each route's `path` MUST remain paired with its original page
component, and the route-protection component and its test MUST be untouched
— including its precedence order of still loading → no user → wrong role.
"Untouched" for the route-protection component's test file, and for other
shipped files whose comments merely reference the pre-relocation route table,
is narrow: logic and pass/fail conditions MUST NOT change, but comment-text
and test-name updates are explicitly permitted where needed to keep a file's
own documentation accurate about (a) which module now imports a relocated
constant, and (b) which module now holds the relocated route
declarations/comments, and whether a dedicated route test file exists (e.g.
following the route-table relocation above) — none of this is a gating
change; only comment-text updates are permitted, never
assertion/behavior/logic changes. Routes that later slices add (for example
`/review-schedule`) are governed by their own capabilities, not by this
requirement.
(Previously: "no route MUST be added or removed" and "before and after this
change", unqualified, which is false once the review-schedule change adds the
`/review-schedule` route. The claims are scoped to the wrapping.)

#### Scenario: Every route's allowed roles are unchanged
- GIVEN the application's route declarations before and after the wrapping
- WHEN each route's `allowedRoles` array is compared
- THEN every one MUST be byte-identical, and the wrapping MUST NOT have added or removed any declared route
(Previously: "before and after this change … the set of declared routes MUST be unchanged".)

#### Scenario: Every route's path stays paired with its original component
- GIVEN the application's route declarations before and after the wrapping
- WHEN each route's `path` is compared against the page component it renders
- THEN every route's `path` MUST be paired with the same component it was paired with before the wrapping

#### Scenario: The route-protection component and its test are untouched
- GIVEN the route-protection component and its test file before and after the wrapping
- WHEN they are compared
- THEN the component MUST be unchanged; the test file's logic and pass/fail conditions MUST be unchanged (a comment-text and test-name update to keep its documentation accurate about a relocated import is permitted); and the test MUST still pass

### Requirement: The Navigation Stays a Link Bar and Nothing More

The navigation MUST remain a plain list of links plus the logout
control. It MUST NOT introduce a sidebar, a hamburger, dropdown or any
collapse/toggle state; breadcrumbs, a "back" affordance, search, a
dashboard or a user/profile menu; a design system, CSS framework,
theming or app branding; or a language switcher.

The navigation's introduction MUST add no new runtime dependency, and MUST
leave the API, database schema and shared validation packages untouched.
(Previously: "This change MUST add no new runtime dependency, and MUST leave
the API, database schema and shared validation packages untouched",
unqualified, which is false once the review-schedule change adds an API
endpoint. The claim is scoped to the navigation's introduction.)

#### Scenario: No collapse, menu or dashboard chrome ships
- GIVEN the navigation after this change
- WHEN its rendered controls and its state are enumerated
- THEN none MUST offer a sidebar, hamburger, dropdown, collapse toggle, breadcrumb, search box, dashboard or profile menu, and the component MUST hold no open/closed state

#### Scenario: No dependency and no backend change ships
- GIVEN the project's dependency manifests, the API, the database schema and the shared validation package before and after the navigation's introduction
- WHEN each is compared
- THEN that introduction MUST have added no dependency and left all three untouched
(Previously: "before and after this change".)

## ADDED Requirements

### Requirement: The Manager's Schedule Item Is Gated on the Role Alone

The `MANAGER`'s Review schedule item MUST be conditioned on the role alone
and MUST NOT be conditioned on the `VIEW_ALL_REVIEWS` capability, on the
same terms as *The Manager's History Item Is Gated on the Role Alone*. An
ungranted `MANAGER` MUST see the identical item and reach the page's empty
state — not a hidden item, not a disabled item, not an error and not a "not
authorized" message. The new item MUST satisfy *Every Navigation Item
Targets a Route Its Viewer May Open*: the target route MUST admit every role
offered the item, and the existing reachability test MUST cover it unrelaxed.

#### Scenario: Granted and ungranted managers see the identical schedule item
- GIVEN two signed-in `MANAGER` users, one holding `VIEW_ALL_REVIEWS` and one holding no capability
- WHEN the navigation renders for each
- THEN both MUST be offered the identical Review schedule item

#### Scenario: An ungranted manager's item leads to the empty state
- GIVEN a signed-in `MANAGER` holding no capability
- WHEN they activate the Review schedule item
- THEN the schedule page's empty state MUST be rendered, not an error and not a "not authorized" message

#### Scenario: The new item never leads its viewer to a denial
- GIVEN a signed-in user of each of the four roles offered the item
- WHEN they activate it
- THEN the schedule page MUST render and the "not authorized" view MUST NOT appear
- AND the shipped reachability test MUST pass with the item included and without any exception or relaxation
