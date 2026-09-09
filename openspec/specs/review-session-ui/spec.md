# Review Session UI

## Purpose

The field-facing web flow for performing a review: open a session (choose
an assigned community and an element type) → type an element's `code` →
answer that element's questions → repeat → pause or complete, plus
resuming and discarding a draft. This is the **first** surface in the app
reachable by a non-`SYSTEM_ADMIN` role — both `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE` use the **same** flow, with no simplified
representative variant. Codes are **typed**, not scanned. Behaviour of the
underlying operations is owned by `review-session-management`; permission
and community-scope rules by `authorization`. A history list and a
read-only historical-session view now exist, owned by the separate
`review-history-ui` capability; the field flow described here still adds
none of its own, and gains only a navigation entry point into that
surface. Out of scope: camera / QR scanning, offline capability of any
kind, per-element history views, list filtering / pagination / sorting /
search, due-date or overdue indicators, signing and export, photos and
attachments.

## Requirements

### Requirement: Role-Gated Route Access for the Field Flow

The system MUST restrict every review-session route to authenticated users
holding `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE`. An
authenticated user of any other role who reaches such a route MUST see an
explicit "not authorized" message, not a silent redirect. An
unauthenticated visitor MUST be redirected to `/login`.

#### Scenario: A technician reaches the field flow
- GIVEN the caller is authenticated as `MAINTENANCE_TECHNICIAN`
- WHEN they navigate to a review-session route
- THEN the flow MUST be shown

#### Scenario: A representative reaches the identical field flow
- GIVEN the caller is authenticated as `COMMUNITY_REPRESENTATIVE`
- WHEN they navigate to a review-session route
- THEN the same flow MUST be shown, with no reduced or alternative variant

#### Scenario: Another role is denied with an explicit message
- GIVEN the caller is authenticated as any role other than the two above
- WHEN they navigate to any review-session route
- THEN an explicit "not authorized" message MUST be shown, not a silent redirect

#### Scenario: Unauthenticated visitor redirected to login
- GIVEN the caller is not authenticated
- WHEN they navigate to any review-session route
- THEN they MUST be redirected to `/login`

### Requirement: Both Non-Admin Roles Have a Reachable Entry Point

Neither role has ever had a reachable route: logging in as one today
rejects everything. After this change, a logged-in
`MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` MUST land on, or be
able to navigate to, an entry point that leads into the review-session
flow — without typing a URL by hand.

#### Scenario: A non-admin lands somewhere usable after login
- GIVEN a user with either non-admin role logs in successfully
- WHEN the post-login landing view is rendered
- THEN it MUST NOT be a "not authorized" screen, and it MUST offer navigation into the review-session flow

### Requirement: Open a Session From Assigned Communities Only

The system MUST let the user start a session by choosing a community and
an element type. The community choices offered MUST be limited to
communities the user is actively assigned to. When no `active` template
exists for the chosen element type, a distinct, actionable message MUST be
shown and no session MUST be started.

#### Scenario: Only assigned communities are offered
- GIVEN the user is actively assigned to community C and not to community D
- WHEN they open the session-start view
- THEN C MUST be offered and D MUST NOT appear

#### Scenario: No active template is reported clearly
- GIVEN the chosen element type has no `active` template
- WHEN the user attempts to start the session
- THEN a distinct message MUST be shown and no session MUST be started

#### Scenario: Distinct loading, empty and error states
- GIVEN the assigned-communities request is loading, returns nothing, or fails
- WHEN the session-start view is rendered
- THEN each case MUST show its own distinct state, never a blank screen

### Requirement: Manual Code Entry Only

The system MUST accept an element's `code` as typed text. The UI MUST NOT
open a camera, request camera permission, or depend on any scanning or
device-capture library. Codes MUST be accepted case-insensitively where
the underlying alphabet permits, and MUST be trimmed of surrounding
whitespace before submission.

#### Scenario: A code is entered by typing
- GIVEN the user is in an open session
- WHEN they type an element's `code` and submit it
- THEN the element's questions MUST be presented

#### Scenario: No camera or scanner dependency exists
- GIVEN the web app's dependencies and code after this change
- WHEN they are inspected
- THEN none MUST provide camera capture, QR scanning or a media-device permission prompt

### Requirement: Answer an Element's Questions

The system MUST present the session template's snapshotted questions for
the resolved element, in their stored order, each answerable as `YES`,
`NO` or `NOT_APPLICABLE` through localized labels. After the element is
recorded, the user MUST receive explicit confirmation that it was saved
and MUST be returned to code entry for the next element.

#### Scenario: Questions are shown in snapshot order and answered
- GIVEN an element is resolved in an open session
- WHEN its questions are rendered
- THEN they MUST appear in the template snapshot's order, each offering exactly the three answer values

#### Scenario: Saving is confirmed and the flow continues
- GIVEN the user has answered every question for the resolved element
- WHEN they submit
- THEN a save confirmation MUST be shown and the user MUST be able to enter the next element's code

#### Scenario: A save failure is reported without losing entered answers
- GIVEN the record request fails
- WHEN the failure is shown
- THEN a distinct error state MUST be shown and the user's entered answers MUST still be on screen

### Requirement: Rejected Codes Get One Uniform Message

The UI MUST show a single, identical message for every rejected code — an
unknown code, a code from another community, a code of another element
type, and a decommissioned or soft-deleted element's code alike. The UI
MUST NOT hint that the code exists elsewhere in the installation, and MUST
select its message from `ApiError.status`/`.code`, never by comparing a
server-supplied English message string.

#### Scenario: All rejection causes show the same message
- GIVEN the user submits, in turn, an unknown code, a foreign-community code, a wrong-element-type code and a decommissioned element's code
- WHEN each rejection is shown
- THEN the displayed message MUST be identical in all four cases

#### Scenario: No message hints that the element exists
- GIVEN any rejected code
- WHEN the message is read
- THEN it MUST NOT state or imply that the element exists in another community, of another type, or in another state

#### Scenario: Error handling does not branch on English message text
- GIVEN any client path mapping an API error to a UI message in this flow
- WHEN it selects the message
- THEN it MUST branch only on `ApiError.status` and `.code`

### Requirement: Pause, Resume and Discard a Draft

The system MUST let the user leave the flow at any point without losing
recorded work, and MUST offer an entry point to resume their own open
draft with all prior answers and reasons shown. A resume entry point for a
session MUST be offered only to the user who opened it. The system MUST
offer a discard action for a draft, behind an explicit confirmation.

#### Scenario: Leaving and returning preserves recorded work
- GIVEN the user recorded answers for two elements and navigated away
- WHEN they return and resume the session
- THEN both elements MUST be shown as already recorded

#### Scenario: Another user sees no resume entry point for someone else's draft
- GIVEN user U holds a draft for community C and user W is also assigned to C
- WHEN W views their own session list
- THEN U's draft MUST NOT be offered to W for resuming

#### Scenario: Discard is confirmed before it happens
- GIVEN the user has an open draft
- WHEN they trigger discard
- THEN an explicit confirmation MUST be required, and only on confirming MUST the draft be discarded

### Requirement: Complete a Session and Explain Its Gaps

The system MUST let the user complete an open session. Before completion,
every active element of the session's community and element type that has
no recorded answers MUST be presented for a reason, and completion MUST
remain unavailable — or be rejected with a clear message — until each such
element carries a non-empty reason. After completion the session MUST be
read-only in the UI.

#### Scenario: Completion collects a reason for each unreviewed element
- GIVEN 5 active elements exist and 3 have been answered
- WHEN the user starts completion
- THEN the 2 unanswered elements MUST be presented, each requiring a non-empty reason

#### Scenario: Completion is refused while a gap is unexplained
- GIVEN at least one unanswered element has no reason
- WHEN the user attempts to complete
- THEN completion MUST NOT succeed and a clear message MUST explain what is missing

#### Scenario: A completed session offers no mutating control
- GIVEN a session has been completed
- WHEN the user views it
- THEN no control MUST offer to edit, reopen, answer, discard or delete it

### Requirement: Internationalization Coverage

The review-session UI MUST contain zero hardcoded UI strings. All
user-facing text — including answer-value labels, element-type labels,
rejection messages and confirmation prompts — MUST come from translation
keys with real (non-placeholder) values in `en`, `es` and `ca`, enforced
by the existing locale parity test. No `elementType` or answer enum value
MUST be rendered raw.

#### Scenario: All visible text is translated in every configured locale
- GIVEN any view of the review-session flow is rendered
- WHEN the active locale is `en`, `es` or `ca`
- THEN every visible string MUST come from a translation key with a real value for that locale, not a placeholder or English fallback

#### Scenario: Enum values are never rendered raw
- GIVEN an element type or an answer value is displayed as visible text
- WHEN it is rendered
- THEN it MUST show a localized label, not the raw enum string

### Requirement: No Offline, History or Scheduling Surface

The system MUST NOT add offline storage, a service worker, background
sync or conflict resolution; a connection is assumed. The **field flow**
described by this capability MUST NOT add a review history view of its
own: listing completed sessions, and reading back a session the caller
did not perform, belong to `review-history-ui`, and this flow's only
relationship to it MAY be a navigation entry point. The shipped
performer-scoped, status-agnostic by-id detail view is **not** a history
view and MUST be left as it is. The field
flow MUST NOT add a due-date or overdue indicator, a signing or export
action, or an attachment/photo control. No surface anywhere MUST add a
per-element history view, nor a company-wide or global review view, nor
pagination, date-range filtering, sorting or search over reviews.

#### Scenario: No offline infrastructure is added
- GIVEN the web app after this change
- WHEN it is inspected for a service worker, offline cache, local queue or sync logic
- THEN none MUST be found

#### Scenario: The field flow adds no history view of its own
- GIVEN every view belonging to the review-session field flow — session start, code entry, answering, completion, draft list and draft detail
- WHEN its controls and rendered data are enumerated
- THEN none MUST add a list of completed sessions, nor any read of a session the caller did not perform — the shipped performer-scoped, status-agnostic by-id detail view stays exactly as it is — and the flow's only permitted reference to history MUST be a navigation control leading to the `review-history-ui` surface

#### Scenario: No scheduling, signing or attachment control exists in the field flow
- GIVEN every view of the review-session field flow
- WHEN its controls are enumerated
- THEN none MUST offer due dates, overdue lists, signing, export, photos or attachments

#### Scenario: No per-element, company-wide or global review view exists anywhere
- GIVEN the web app's routes and pages after this change
- WHEN they are searched for one element's past reviews, for a company-wide review view and for a global "all reviews" view
- THEN none MUST be found

#### Scenario: No review list control ships anywhere
- GIVEN every list of reviews rendered by the web app after this change
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: A completed session still offers no mutating control
- GIVEN a session has been completed
- WHEN the user views it, in the field flow or in the history surface
- THEN no control MUST offer to edit, reopen, answer, discard or delete it
