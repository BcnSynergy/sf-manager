# Delta for Inspectable Element Admin UI

> **Purpose amendment (for archive):** the elements list now also shows
> each element's active/decommissioned state and offers a per-element
> decommission/reactivate control. "Active elements" in the existing
> *List Active Elements For a Community* requirement continues to mean
> "not soft-deleted" — decommissioned elements are not soft-deleted and
> therefore remain listed. Everything else about the capability's scope is
> unchanged: no bulk action, no decommission reason, no decommission
> history, no restore of soft-deleted elements.

## ADDED Requirements

### Requirement: Element State Shown in the List

The system MUST display each listed element's active/decommissioned state
to a `SYSTEM_ADMIN`, and MUST distinguish a decommissioned element from an
active one visually, not only by the label of its available action. The
state MUST be rendered through a localized label, never as a raw field
value. Soft-deleted elements MUST still never appear.

#### Scenario: Decommissioned elements are listed and distinguishable
- GIVEN community C has both active and decommissioned elements
- WHEN a `SYSTEM_ADMIN` opens C's elements list
- THEN both MUST appear, and the decommissioned ones MUST be visually distinguishable from the active ones

#### Scenario: State is rendered through a localized label
- GIVEN an element's state is displayed as visible text
- WHEN it is rendered
- THEN it MUST show a localized label, not a raw boolean, timestamp or enum value

#### Scenario: Soft-deleted elements never shown
- GIVEN community C has a soft-deleted element alongside active and decommissioned ones
- WHEN a `SYSTEM_ADMIN` opens C's elements list
- THEN the soft-deleted element MUST NOT appear

### Requirement: Decommission and Reactivate Control

The system MUST offer a `SYSTEM_ADMIN` a per-element control to
decommission an active element and to reactivate a decommissioned one.
The control MUST target exactly one element, MUST require an explicit
confirmation before decommissioning, and MUST reflect the element's new
state in the list once the action succeeds. A failure MUST show a distinct
error state and MUST leave the displayed state unchanged. The control MUST
NOT ask for a reason and MUST NOT offer a bulk or "decommission all"
variant.

#### Scenario: Admin decommissions an element from the list
- GIVEN a `SYSTEM_ADMIN` is viewing community C's elements list containing active element E
- WHEN they trigger decommission for E and confirm
- THEN E MUST be shown as decommissioned in the list

#### Scenario: Admin reactivates a decommissioned element
- GIVEN the list contains decommissioned element E
- WHEN the `SYSTEM_ADMIN` triggers reactivate for E
- THEN E MUST be shown as active in the list

#### Scenario: Decommission is confirmed before it happens
- GIVEN the `SYSTEM_ADMIN` triggers decommission for element E
- WHEN they dismiss the confirmation
- THEN E MUST remain active and no request MUST have been sent

#### Scenario: A failed action is reported and does not change the shown state
- GIVEN the decommission request fails
- WHEN the failure is shown
- THEN a distinct error state MUST be shown and E MUST still be displayed as active

#### Scenario: The control is single-element and reason-free
- GIVEN the elements list and edit surfaces after this change
- WHEN their controls are inspected
- THEN none MUST offer a bulk decommission action or ask for a decommission reason

### Requirement: Internationalization Coverage for the State Controls

The new state label and decommission/reactivate controls MUST contain zero
hardcoded UI strings. All their user-facing text — labels, confirmation
prompt, success and error messages — MUST come from translation keys with
real (non-placeholder) values in `en`, `es` and `ca`, enforced by the
existing locale parity test.

#### Scenario: All new visible text is translated in every configured locale
- GIVEN the elements list with its state labels and decommission/reactivate controls is rendered
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback

#### Scenario: New error handling does not branch on English message text
- GIVEN the client path mapping a decommission or reactivate failure to a UI message
- WHEN it selects the message
- THEN it MUST branch only on `ApiError.status` and `.code`
