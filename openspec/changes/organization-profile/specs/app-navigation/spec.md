# Delta for App Navigation

> **Scope of this delta:** one item is added to the `SYSTEM_ADMIN` row of
> the role → items lookup. No other role row changes, no new navigation
> mechanism appears, and the capability's existing invariants —
> reachability, no CRUD sub-routes, no write-surface path for the three
> read-only roles, print suppression, i18n coverage — are preserved
> unchanged and MUST keep holding over the added item.

## MODIFIED Requirements

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
(Previously: the `SYSTEM_ADMIN` row listed **7** items, ending at Review
history, and every item was required to point at a *list* route — a
phrasing that predates the first singleton section.)

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

## ADDED Requirements

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
