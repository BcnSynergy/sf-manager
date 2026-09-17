# Delta for Review Session UI

> **Purpose note (for archive):** no Purpose rewording is required. The
> field flow still adds no history surface of its own and still keeps the
> one in-page navigation entry point into `review-history-ui` that it
> already renders on `/review-sessions`; that link is a contextual
> in-page control, not a competing global mechanism, and it stays exactly
> as shipped. What changes is where the *entry point into this flow*
> comes from — see the modified requirement below.

## MODIFIED Requirements

### Requirement: Both Non-Admin Roles Have a Reachable Entry Point

Neither role has ever had a reachable route: logging in as one before the
field flow shipped rejected everything. A logged-in
`MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` MUST be able to
navigate into the review-session flow without typing a URL by hand, and
MUST NOT be left on a "not authorized" screen after logging in.

That entry point MUST now be the **global navigation's Review sessions
item** (`app-navigation`), offered to these two roles on **every**
authenticated page — not a role-conditional link on the app's entry page.
The entry-page link that previously satisfied this requirement is removed
by the same change that introduces the navigation, and this requirement
MUST NOT be read as requiring a control that no longer exists: the entry
page renders its health-status readout and nothing else.

Because the navigation is global, reachability is no longer confined to
the landing view: these two roles MUST be able to enter the flow from any
authenticated page they are on, the wrong-role denial view included.

The Review sessions item MUST be offered to **these two roles only**. No
other role MUST be offered a navigation path into this flow, and every
review-session route MUST keep its shipped two-role gate unchanged.
(Previously: the requirement was satisfied by a role-conditional link on
the app's entry page, and its only scenario checked the post-login
landing view. The entry page's link is deleted in this change and the
mechanism moves to the global navigation, so the requirement is restated
in terms of the navigation and gains scenarios for the two roles it
serves and for the three it must not.)

#### Scenario: A non-admin lands somewhere usable after login
- GIVEN a user with either non-admin role logs in successfully
- WHEN the post-login landing view is rendered
- THEN it MUST NOT be a "not authorized" screen, and the global navigation rendered on it MUST offer an item leading into the review-session flow

#### Scenario: The flow is enterable from any authenticated page
- GIVEN a signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` on any authenticated page, including the wrong-role denial view
- WHEN the page renders
- THEN a navigation item leading into the review-session flow MUST be present, with no hand-typed URL required

#### Scenario: The entry page no longer carries the link
- GIVEN a signed-in user of either role on the app's entry page after this change
- WHEN that page's own controls are enumerated
- THEN it MUST render its health-status readout only — no role-conditional review-session link and no logout button of its own

#### Scenario: No other role is offered a path into the flow
- GIVEN a signed-in `SYSTEM_ADMIN`, `MANAGER` or `MAINTENANCE_COMPANY_MANAGER`
- WHEN every navigation control rendered for them is enumerated
- THEN none MUST lead into the review-session flow

#### Scenario: The route gate is unchanged
- GIVEN every review-session route before and after this change
- WHEN each route's allowed roles are compared
- THEN they MUST be identical — still `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` only
