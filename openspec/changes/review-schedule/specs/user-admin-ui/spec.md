# Delta for User Admin UI

## ADDED Requirements

### Requirement: The Capability Toggle Label Names Every Surface It Gates

The label of the `VIEW_ALL_REVIEWS` capability toggle on the edit user form
MUST describe every surface the capability gates, so a `SYSTEM_ADMIN` is not
told it grants less than it does. The capability gates the installation-wide
review history and, for a `MANAGER`, the installation-wide review schedule
(see `review-schedule`). The label MUST therefore refer to both completed
reviews and the review schedule, in `en`, `es` and `ca`, and MUST remain a
localized label, never the raw enum string. This requirement fixes the
behaviour of the label, not its exact wording, and adds no control, no
second toggle and no new capability.

#### Scenario: The label mentions history and schedule in every locale

- GIVEN the edit user form for a `MANAGER`, rendered in each of `en`, `es` and `ca` in turn
- WHEN the capability toggle's label is read
- THEN it names both the completed reviews and the review schedule, and it comes from the translation key with a real value for that locale

#### Scenario: The toggle itself is unchanged

- GIVEN the edit user form after this change
- WHEN the capability controls are enumerated
- THEN exactly one toggle exists, it is shown only for the `MANAGER` role, and it still grants and revokes `VIEW_ALL_REVIEWS` alone
