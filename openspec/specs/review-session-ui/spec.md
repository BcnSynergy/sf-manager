# Review Session UI

## Purpose

The field-facing web flow for performing a review: open a session (choose
an assigned community and an element type) → type an element's `code` →
answer that element's questions → repeat → pause or complete, plus
resuming and discarding a draft. This is the **first** surface in the app
reachable by a non-`SYSTEM_ADMIN` role — both `MAINTENANCE_TECHNICIAN` and
`COMMUNITY_REPRESENTATIVE` use the **same** flow, with no simplified
representative variant. Codes are typed, or scanned from the element's QR
label with the device camera (EN-163). Behaviour of the
underlying operations is owned by `review-session-management`; permission
and community-scope rules by `authorization`. A history list and a
read-only historical-session view now exist, owned by the separate
`review-history-ui` capability; the field flow described here still adds
none of its own, and gains only a navigation entry point into that
surface. Out of scope: offline capability of any
kind, per-element history views, list filtering / pagination / sorting /
search, due-date or overdue indicators (the field flow's own views add
none; the global navigation's Review schedule item, offered to this flow's
two roles on every page, is an explicitly permitted entry to the separate
`review-schedule-ui` capability and is not a control of this flow), any signing control other than
the completion action itself (presented as **Sign and close**), and any
export, print, download or send control, and any link to the printable
review document — the printable review document is owned by
`review-document-ui`, and this flow has no link to it at all; the only
link ships on `review-history-ui`'s read-only historical session view,
whose read is scoped by history, not by performer (superseded proposal
question 3, 2026-09-23), and attachments other than element photos (EN-164,
see _Element Photos_).

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
MUST NOT be read as requiring a control that no longer exists. The entry
page is now the home page (`app-navigation`, "The Home Page Lists the
Role's Sections"): any link it offers into this flow is built from the
navigation's own role → items table, so it reaches exactly the same two
roles.

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

#### Scenario: The entry page offers the flow only through the navigation's table

- GIVEN a signed-in user of any role on the app's entry page
- WHEN that page's own controls are enumerated
- THEN it MUST render no logout button of its own, and MUST offer a link into the review-session flow only if that role's navigation offers one

#### Scenario: No other role is offered a path into the flow

- GIVEN a signed-in `SYSTEM_ADMIN`, `MANAGER` or `MAINTENANCE_COMPANY_MANAGER`
- WHEN every navigation control rendered for them is enumerated
- THEN none MUST lead into the review-session flow

#### Scenario: The route gate is unchanged

- GIVEN every review-session route before and after this change
- WHEN each route's allowed roles are compared
- THEN they MUST be identical — still `MAINTENANCE_TECHNICIAN` and `COMMUNITY_REPRESENTATIVE` only

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

### Requirement: Code Entry, Typed or Scanned

The system MUST accept an element's `code` as typed text. Codes MUST be
accepted case-insensitively where the underlying alphabet permits, and MUST
be trimmed of surrounding whitespace before submission.

Next to the code field, the system MUST offer a **Scan** control when the
browser can open a camera (it exposes `navigator.mediaDevices.getUserMedia`,
which needs a secure context), and MUST NOT offer it otherwise. Scan opens
the rear camera (`facingMode: environment`) in a dialog and reads QR codes
only. When a code is read, the system MUST stop the camera, close the
dialog and open that element exactly as a typed and submitted code would
(same trimming, case folding, validation and route), so a code the session
does not accept gets the uniform rejection message. While scanning, the
user MUST be able to cancel, which stops the camera and returns to the code
field. A camera that is denied or fails, or a reader that cannot load,
MUST show a message in the dialog and leave typed entry available. The
system MUST use the browser's native barcode reader when it supports QR
codes and otherwise load a bundled reader, served from the app's own origin
(never a third-party host), only when Scan is used. Typed entry stays the
fallback in every case.
(Previously: Manual Code Entry Only. The UI MUST NOT open a camera to read
a code, and MUST NOT depend on any scanning or device-capture library; the
only camera use was the photo control's file input. Changed by EN-163.)

#### Scenario: A code is entered by typing

- GIVEN the user is in an open session
- WHEN they type an element's `code` and submit it
- THEN the element's questions MUST be presented

#### Scenario: A scanned code opens the element

- GIVEN the user is in an open session on a device with a camera
- WHEN they press Scan and the camera reads an element's QR label
- THEN the camera MUST stop and the dialog MUST close
- AND the element's questions MUST be presented, as for a typed code

#### Scenario: Scan is not offered without camera support

- GIVEN a browser without `navigator.mediaDevices.getUserMedia` (for
  example a page served over plain HTTP)
- WHEN the user is in an open session
- THEN no Scan control MUST be shown and typed entry MUST work as before

#### Scenario: A denied or failing camera is reported

- GIVEN the user presses Scan
- WHEN camera access is denied or fails, or the reader cannot load
- THEN the dialog MUST show a message saying the camera could not be used
- AND closing it MUST return to the code field with typed entry available

#### Scenario: Cancelling stops the camera

- GIVEN the scan dialog is open with the camera running
- WHEN the user cancels
- THEN the camera MUST stop and the dialog MUST close without opening an
  element

### Requirement: Answer an Element's Questions

The system MUST present the session template's snapshotted questions for
the resolved element, in their stored order, each answerable as `YES`,
`NO` or `NOT_APPLICABLE` through localized labels. After the element is
recorded, the user MUST receive explicit confirmation that it was saved
and MUST be returned to code entry for the next element. The confirmation
MUST appear next to the Save control, and it MUST be withdrawn as soon as
the user edits the form again, because what is on screen then differs from
what was saved. For the same reason, a save that completes after the user
has edited the form MUST NOT be confirmed.

#### Scenario: Questions are shown in snapshot order and answered

- GIVEN an element is resolved in an open session
- WHEN its questions are rendered
- THEN they MUST appear in the template snapshot's order, each offering exactly the three answer values

#### Scenario: Saving is confirmed and the flow continues

- GIVEN the user has answered every question for the resolved element
- WHEN they submit
- THEN a save confirmation MUST be shown between the questions and the Save control, and the user MUST be able to enter the next element's code

#### Scenario: Editing after a save withdraws the confirmation

- GIVEN the save confirmation is shown
- WHEN the user changes an answer, toggles marking the element unreviewed, or edits the observations
- THEN the confirmation and its continue control MUST no longer be shown
- AND Save MUST again be the primary action

#### Scenario: An edit during the save is not confirmed

- GIVEN a save is in progress
- WHEN the user edits the form before it completes
- THEN no save confirmation MUST be shown
- AND Save MUST remain the primary action

#### Scenario: A save failure is reported without losing entered answers

- GIVEN the record request fails
- WHEN the failure is shown
- THEN a distinct error state MUST be shown and the user's entered answers MUST still be on screen

### Requirement: Element Photos

While answering an element of a `draft` session, the performer MUST be
offered a control to add photos of that element, at most 3 per element per
session (the rules are owned by `review-session-management`, _Photos of a Draft Review
Session_). The control MUST be a standard file input that accepts
images and asks for the rear camera (`capture="environment"`): on a phone it
opens the camera, on a desktop a file picker. Before upload, the web app
MUST resize each photo to at most 1600 px on its long side and re-encode it
as JPEG at quality 0.8, which also drops its metadata (GPS included). A
photo is uploaded as soon as it is chosen, separately from saving the
answers. The element's photos MUST be shown as thumbnails, each linking to
the full photo, and each MUST be removable while the session is a draft,
after a confirmation. At 3 photos the add control MUST give way to a note
that the maximum is reached. On the element view of a `completed` session
the photos MUST be shown read-only, with no add or remove control. Loading,
empty and error states MUST be distinct, and errors MUST branch on status
and code only.

#### Scenario: A photo is compressed and uploaded

- GIVEN the performer is answering an element of a draft session
- WHEN they choose or take a photo
- THEN the web app MUST upload a JPEG of at most 1600 px on its long side, encoded at quality 0.8
- AND its thumbnail MUST be shown with the element's other photos

#### Scenario: The control asks for the camera

- GIVEN the photo control is rendered
- WHEN its file input is inspected
- THEN it MUST accept images and carry `capture="environment"`

#### Scenario: The limit replaces the add control

- GIVEN the element has 3 photos in the session
- WHEN the photo section is rendered
- THEN no add control MUST be offered, and a note MUST say the maximum is reached

#### Scenario: A photo is removed after confirmation

- GIVEN the element has a photo in a draft session
- WHEN the performer chooses to remove it and confirms
- THEN the photo MUST be deleted and its thumbnail removed
- AND cancelling MUST send no request

#### Scenario: A file the browser cannot read is not uploaded

- GIVEN the chosen file cannot be decoded as an image
- WHEN it is chosen
- THEN an error MUST be shown and nothing MUST be uploaded

#### Scenario: A completed session's photos are read-only

- GIVEN a completed session
- WHEN its element view is rendered
- THEN the element's photos MUST be shown with no add or remove control

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

The system MUST let the user complete an open session, and completing
MUST be presented as **signing**. Before completion, every active element
of the session's community and element type that has no recorded answers
MUST be presented for a reason, and completion MUST remain unavailable —
or be rejected with a clear message — until each such element carries a
non-empty reason.

The completing control MUST be labelled **Sign and close**. Activating it
MUST open a confirmation dialog warning that the review will be closed
and can no longer be modified; the dialog's confirm control MUST also be
labelled **Sign and close**. The completion request MUST be sent only
when the user confirms. Cancelling MUST send nothing and MUST leave the
session a `draft`, with its answers and reasons intact and the user in
the flow.

After completion the session MUST be read-only in the UI. Neither a
`draft` nor a completed session MUST offer a link to the review document
or a print control here: this view's read is scoped by performer, not by
history, so the only **View document** link lives on
`review-history-ui`'s read-only historical session view (superseded
proposal question 3, decided 2026-09-23 — a representative later
unassigned from the community would otherwise see a link to a uniform
`404` for a document the history-scoped view would still show).
(Previously: the completing control and its confirmation carried no
signing meaning and no irreversibility warning, and the absence of a
document link was implicit.)

When the completion is rejected with `SIGNATURE_REQUIRED` (the performer has
no registered signature), the page MUST show, in the same danger alert as
the other completion errors, a message saying that a signature must be
registered before signing a review, and MUST offer a link labelled **My
signature** to `/my-signature` (`reviewer-signature-ui`). The message and
the link label MUST exist in English, Spanish and Catalan, and the message
MUST be chosen by the error code, never by the server's message text. The
session MUST remain a `draft` with its answers and reasons intact. The link
MUST be offered only for this error and MUST disappear when completion is
tried again. Every other completion error MUST be shown as before.
(Previously: a rejected completion could only name the unexplained elements
or show a generic error.)

#### Scenario: Completion collects a reason for each unreviewed element

- GIVEN 5 active elements exist and 3 have been answered
- WHEN the user starts completion
- THEN the 2 unanswered elements MUST be presented, each requiring a non-empty reason

#### Scenario: Completion is refused while a gap is unexplained

- GIVEN at least one unanswered element has no reason
- WHEN the user attempts to complete
- THEN completion MUST NOT succeed and a clear message MUST explain what is missing

#### Scenario: The completing control reads Sign and close

- GIVEN an open session whose gaps are all explained
- WHEN the user looks for the completing control
- THEN it MUST be labelled **Sign and close**

#### Scenario: Signing asks for a conscious confirmation

- GIVEN an open session whose gaps are all explained
- WHEN the user activates **Sign and close**
- THEN a confirmation dialog MUST warn that the review will be closed and can no longer be modified, and no completion request MUST have been sent yet

#### Scenario: Confirming signs and closes the session

- GIVEN the signing confirmation dialog is open
- WHEN the user confirms with **Sign and close**
- THEN the completion request MUST be sent, and on success the session MUST be shown read-only

#### Scenario: Signing without a registered signature links to My signature

- GIVEN an open session whose gaps are all explained, and a performer with no registered signature
- WHEN the user confirms with **Sign and close** and the API answers 409 `SIGNATURE_REQUIRED`
- THEN the danger alert MUST say that a signature must be registered before signing a review
- AND a link labelled **My signature** to `/my-signature` MUST be offered, and the session MUST remain a `draft`

#### Scenario: The signature message and link are translated

- GIVEN the same rejection with the interface in Spanish or in Catalan
- WHEN the alert and the link render
- THEN both MUST be shown in that language, and neither MUST fall back to the English text

#### Scenario: Another completion error offers no signature link

- GIVEN a completion rejected for any other reason, such as a network failure
- WHEN the alert renders
- THEN no link to `/my-signature` MUST be offered

#### Scenario: Cancelling leaves the session a draft

- GIVEN the signing confirmation dialog is open
- WHEN the user cancels it
- THEN no completion request MUST be sent, and the session MUST remain a `draft` with its answers and reasons intact

#### Scenario: A completed session offers no mutating control

- GIVEN a session has been completed
- WHEN the user views it
- THEN no control MUST offer to edit, reopen, answer, discard or delete it

#### Scenario: The completed session offers no document link

- GIVEN a session has just been signed and closed
- WHEN its read-only view renders
- THEN no **View document** link and no print control MUST be offered, and the document MUST NOT have opened by itself

#### Scenario: A draft offers no document link either

- GIVEN an open `draft` session
- WHEN its view renders
- THEN no **View document** link MUST be offered, exactly as on a completed session

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
view and MUST be left as it is, apart from the **Sign and close**
relabel. The field flow MUST NOT add a due-date or overdue indicator, a
signing action other than the completion action itself, an export,
print, download or send action, any link to the review document, or an
attachment control other than the element photo control (_Element
Photos_). No surface anywhere MUST add a
per-element history view, nor a company-wide or global **list of reviews or
sessions**, nor pagination, date-range filtering, sorting or search over
reviews.

The global navigation's **Review schedule** item (`app-navigation`), offered
on every authenticated page to `SYSTEM_ADMIN`, `MANAGER`,
`COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN` — the field flow's
pages included — is **explicitly permitted**. It is a navigation entry to the
separate `review-schedule-ui` capability. It is not a control, indicator or
link added to the field flow, and it is outside this requirement's
enumerations of the field flow's own controls. The Review schedule page lists
obligations per `(community, elementType)` pair and never a session, an entry
or a review, so it is not a "company-wide or global review view" within the
meaning of this requirement.
(Previously: the field flow MUST NOT add "a signing or export action" at
all, and the by-id detail view MUST be left exactly as it is. Completion
is now the signing act, presented as **Sign and close** — the only change
to that view. Export stays forbidden; print, download, send and any
document link are now named explicitly, because the only link to the
review document lives on `review-history-ui`. The prohibition on "a
company-wide or global review view" is narrowed to a company-wide or global
**list of reviews or sessions**, and the global navigation's Review schedule
item is named as permitted, because the navigation renders on the field
flow's pages and the schedule page is neither a list of sessions nor a
review view. Before EN-164, "an attachment/photo control" was forbidden
outright; the element photo control is now the one permitted exception.)

#### Scenario: No offline infrastructure is added

- GIVEN the web app after this change
- WHEN it is inspected for a service worker, offline cache, local queue or sync logic
- THEN none MUST be found

#### Scenario: The field flow adds no history view of its own

- GIVEN every view belonging to the review-session field flow — session start, code entry, answering, completion, draft list and draft detail
- WHEN its own controls and rendered data are enumerated, the global navigation's items excluded
- THEN none MUST add a list of completed sessions, nor any read of a session the caller did not perform — the shipped performer-scoped, status-agnostic by-id detail view stays unchanged apart from the **Sign and close** relabel and its confirmation copy — and the flow's only permitted reference to history MUST be a navigation control leading to the `review-history-ui` surface
  (Previously: "WHEN its controls and rendered data are enumerated", with no exclusion of the global navigation.)

#### Scenario: No scheduling, signing or attachment control exists in the field flow

- GIVEN every view of the review-session field flow
- WHEN its own controls are enumerated, the global navigation's items excluded
- THEN none MUST offer due dates, overdue lists, a signing control other than **Sign and close**, export, print, download, send, a link to the review document, or attachments other than the element photo control
  (Previously: "WHEN its controls are enumerated", with no exclusion, which would have counted the global navigation's Review schedule item as an overdue-list control. Before EN-164: "photos or attachments".)

#### Scenario: The global navigation's Review schedule item is permitted on field-flow pages

- GIVEN a signed-in `MAINTENANCE_TECHNICIAN` or `COMMUNITY_REPRESENTATIVE` on any field-flow page
- WHEN the global navigation's items are enumerated
- THEN the Review schedule item MUST be present and MUST lead to the schedule page, and no view of the field flow itself MUST contain a due date, an overdue indicator or a schedule list

#### Scenario: No per-element, company-wide or global review view exists anywhere

- GIVEN the web app's routes and pages after this change
- WHEN they are searched for one element's past reviews, for a company-wide list of reviews or sessions and for a global "all reviews" list of sessions
- THEN none MUST be found — the Review schedule page, which lists per-pair obligations and no session or review, is not one of them
  (Previously: "for a company-wide review view and for a global 'all reviews' view".)

#### Scenario: No review list control ships anywhere

- GIVEN every list of reviews rendered by the web app after this change
- WHEN its controls are enumerated
- THEN none MUST offer pagination, infinite scroll, a date-range filter, sorting or search

#### Scenario: A completed session still offers no mutating control

- GIVEN a session has been completed
- WHEN the user views it, in the field flow or in the history surface
- THEN no control MUST offer to edit, reopen, answer, discard or delete it
