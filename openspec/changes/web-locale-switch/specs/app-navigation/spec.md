# Delta for App Navigation

## MODIFIED Requirements

### Requirement: The Navigation Stays a Link Bar and Nothing More

The navigation MUST remain a plain list of links plus the logout
control, plus exactly one language selector as specified by
`web-locale-selection`. It MUST NOT introduce a sidebar, a hamburger,
dropdown or any collapse/toggle state other than that language selector;
breadcrumbs, a "back" affordance, search, a dashboard or a user/profile
menu; a design system, CSS framework, theming or app branding; or any
language switcher other than that one selector.
(Previously: forbade "a language switcher" outright and allowed no control other than the links and logout.)

The navigation's introduction MUST add no new runtime dependency, and MUST
leave the API, database schema and shared validation packages untouched.
(Previously: "This change MUST add no new runtime dependency, and MUST leave
the API, database schema and shared validation packages untouched",
unqualified, which is false once the review-schedule change adds an API
endpoint. The claim is scoped to the navigation's introduction.)

#### Scenario: No collapse, menu or dashboard chrome ships
- GIVEN the navigation after the web-locale-switch change
- WHEN its rendered controls and its state are enumerated
- THEN none MUST offer a sidebar, hamburger, dropdown (other than the language selector), collapse toggle, breadcrumb, search box, dashboard or profile menu, and the component MUST hold no open/closed state

#### Scenario: The language selector is the only added control
- GIVEN the navigation after the web-locale-switch change
- WHEN its rendered controls are enumerated
- THEN they MUST be the links, the logout control and exactly one language selector, and nothing else

#### Scenario: No dependency and no backend change ships
- GIVEN the project's dependency manifests, the API, the database schema and the shared validation package before and after the navigation's introduction
- WHEN each is compared
- THEN that introduction MUST have added no dependency and left all three untouched
(Previously: "before and after this change".)
