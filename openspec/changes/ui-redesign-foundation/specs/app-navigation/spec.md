# Delta for app-navigation

> At archive, the Purpose paragraph that calls the nav "a **link bar and
> nothing more**" and lists "a sidebar … a design system, CSS framework,
> theming or app branding" as out of scope is rewritten to describe the
> grouped sidebar. A hamburger or dropdown, collapse state, breadcrumbs,
> search, a dashboard and a user/profile menu stay out of scope.

## MODIFIED Requirements

### Requirement: The Role → Navigation Items Map Is Exhaustive and Fixed

The system MUST derive the navigation's items from the signed-in user's
role alone, through a single static lookup that is **exhaustive over
every member of `Role`** — adding a sixth role MUST fail the build
rather than silently produce an empty navigation.

Each role MUST be offered exactly these items and no others, in this
order. Home comes first and belongs to no group. Every other item belongs
to exactly one group, and groups appear in the order Operations, Setup,
Administration:

| Role                          | Home | Operations                                       | Setup                                                                     | Administration              | Total |
| ----------------------------- | ---- | ------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------- | ----- |
| `SYSTEM_ADMIN`                | Home | Review schedule, Review history                  | Communities, Maintenance companies, Review templates, Checklist questions | Users, Organization profile | **9** |
| `MAINTENANCE_TECHNICIAN`      | Home | Review schedule, Review sessions, Review history | —                                                                         | —                           | **4** |
| `COMMUNITY_REPRESENTATIVE`    | Home | Review schedule, Review sessions, Review history | —                                                                         | —                           | **4** |
| `MAINTENANCE_COMPANY_MANAGER` | Home | Review history                                   | —                                                                         | —                           | **2** |
| `MANAGER`                     | Home | Review schedule, Review history                  | —                                                                         | —                           | **3** |

A group with no items for the role MUST NOT render, not even its label.
Each rendered group MUST show its localized label once, before its items.

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
(Previously: one flat list per role in the order Home, Users, Communities,
Maintenance companies, Checklist questions, Review templates, Review history,
Review schedule, Organization profile, with no groups. Every role keeps the
same item set; only the order and the grouping change.)

#### Scenario: Each of the five roles sees exactly its own item set

- GIVEN a signed-in user of each role in turn
- WHEN the navigation renders for each
- THEN the rendered items MUST match that role's row of the table above exactly — none missing and none extra

#### Scenario: Items render in the specified order and groups

- GIVEN a signed-in user of each role in turn
- WHEN the navigation's links and group labels are read in document order
- THEN Home MUST come first, followed by each non-empty group's label and its items in the order of that role's row

#### Scenario: An empty group renders nothing

- GIVEN a signed-in `MANAGER`, whose Setup and Administration groups are empty
- WHEN the navigation renders
- THEN neither the Setup nor the Administration label MUST be rendered

#### Scenario: The admin reaches all nine sections without typing a URL

- GIVEN a signed-in `SYSTEM_ADMIN` on any authenticated page
- WHEN they use the navigation
- THEN all nine sections — Home, Review schedule, Review history, the four setup sections, Users and Organization profile — MUST be reachable in one click, with no hand-typed URL required

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

### Requirement: The Navigation Is Absent From Printed Output

The navigation, including the signed-in user's email, the language selector
and logout, and the page footer MUST NOT appear in printed output on any
page. Suppression MUST be an actual, verified rule rather than a vacuous one.
(Previously: named the navigation only; the footer did not exist.)

#### Scenario: The navigation does not print

- GIVEN a signed-in `SYSTEM_ADMIN` on the element label page, with the navigation rendered on screen
- WHEN the print output is produced
- THEN the navigation MUST NOT appear in it, and the label MUST print the same content in the same layout, black on white, with the typography of `web-visual-foundation`

#### Scenario: The footer does not print

- GIVEN a signed-in user on the review document page, with the footer rendered on screen
- WHEN the print output is produced
- THEN neither the navigation nor the footer MUST appear in it, and the document MUST print the same content in the same layout, black on white, with the typography of `web-visual-foundation`

#### Scenario: Print suppression is verified in a browser, not only in tests

- GIVEN the label page and the review document page rendered inside the navigation on a running dev server
- WHEN their print previews are inspected
- THEN the navigation and the footer MUST be absent from both previews

## REMOVED Requirements

### Requirement: The Navigation Stays a Link Bar and Nothing More

(Reason: the redesign replaces the link bar with a grouped sidebar and brings
in a design system, theming and branding, which this requirement forbade. Its
remaining limits move to _The Navigation Is a Grouped Sidebar Without Toggle
State_.)

## ADDED Requirements

### Requirement: The Navigation Is a Grouped Sidebar Without Toggle State

The navigation MUST be a sidebar beside the page content on wide screens
that stacks above the content on narrow screens. It MUST hold, in this order:
the product wordmark, the role's items as specified in _The Role → Navigation
Items Map Is Exhaustive and Fixed_, and a foot with the signed-in user's
email, exactly one language selector as specified by `web-locale-selection`,
and the logout control.

The wordmark MUST NOT be a link, so the navigation's links stay exactly the
role's items. The navigation MUST NOT hold any open/closed state and MUST NOT
offer a hamburger, a dropdown other than the language selector, a collapse
toggle, breadcrumbs, a "back" affordance, search, a dashboard or a
user/profile menu.

The navigation MUST add no new runtime dependency, and MUST leave the API,
database schema and shared validation packages untouched.

#### Scenario: The sidebar holds wordmark, items and foot in order

- GIVEN a signed-in user of any role on a wide screen
- WHEN the navigation renders
- THEN it MUST show the wordmark, then the role's items, then the email, the language selector and logout, beside the page content

#### Scenario: The sidebar stacks on a narrow screen

- GIVEN a signed-in user on a screen about 400px wide
- WHEN the page renders
- THEN the navigation MUST appear above the page content at full width, with every item still visible and no horizontal page scroll

#### Scenario: The controls are only links, one selector and logout

- GIVEN the navigation for any role
- WHEN its interactive controls are enumerated
- THEN they MUST be the role's item links, exactly one language selector and the logout control, and nothing else

#### Scenario: No collapse state ships

- GIVEN the navigation component
- WHEN its state is inspected
- THEN it MUST hold no open/closed state

#### Scenario: No dependency and no backend change ships

- GIVEN the dependency manifests, the API, the database schema and the shared validation package before and after this change
- WHEN each is compared
- THEN no dependency MUST have been added and all three MUST be untouched

### Requirement: The Navigation Shows the Signed-In User's Email

The navigation's foot MUST show the signed-in user's email, taken from the
auth provider's user, as plain text. It MUST NOT be a link or a control, and
the navigation MUST NOT fetch it.

#### Scenario: The email is shown

- GIVEN a signed-in user whose email is `technician@sf-manager.example`
- WHEN the navigation renders
- THEN `technician@sf-manager.example` MUST be shown in its foot as plain text

#### Scenario: The email triggers no request

- GIVEN a signed-in user
- WHEN the navigation renders
- THEN it MUST have issued no request to obtain the email

### Requirement: Group Labels Are Localized

Each group label (Operations, Setup, Administration) MUST come from a
translation key with real values in `en`, `es` and `ca`, on the same terms as
_Internationalization Coverage_, and the locale parity test MUST cover the new
keys.

#### Scenario: Group labels in each locale

- GIVEN a signed-in `SYSTEM_ADMIN` and each locale in turn
- WHEN the navigation renders
- THEN the three group labels MUST come from that locale's translation keys, not from English fallbacks
