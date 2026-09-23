# Delta for Review Session UI

> **Purpose amendment (for archive):** in the Purpose's out-of-scope list,
> replace "signing and export" with: "any signing control other than the
> completion action itself (presented as **Sign and close**), and any
> export, print, download or send control, and any link to the printable
> review document — the printable review document is owned by
> `review-document-ui`, and this flow has no link to it at all; the only
> link ships on `review-history-ui`'s read-only historical session view,
> whose read is scoped by history, not by performer (superseded proposal
> question 3, 2026-09-23)". Nothing else in the Purpose changes.

## MODIFIED Requirements

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
attachment/photo control. No surface anywhere MUST add a
per-element history view, nor a company-wide or global review view, nor
pagination, date-range filtering, sorting or search over reviews.
(Previously: the field flow MUST NOT add "a signing or export action" at
all, and the by-id detail view MUST be left exactly as it is. Completion
is now the signing act, presented as **Sign and close** — the only change
to that view. Export stays forbidden; print, download, send and any
document link are now named explicitly, because the only link to the
review document lives on `review-history-ui`.)

#### Scenario: No offline infrastructure is added
- GIVEN the web app after this change
- WHEN it is inspected for a service worker, offline cache, local queue or sync logic
- THEN none MUST be found

#### Scenario: The field flow adds no history view of its own
- GIVEN every view belonging to the review-session field flow — session start, code entry, answering, completion, draft list and draft detail
- WHEN its controls and rendered data are enumerated
- THEN none MUST add a list of completed sessions, nor any read of a session the caller did not perform — the shipped performer-scoped, status-agnostic by-id detail view stays unchanged apart from the **Sign and close** relabel and its confirmation copy — and the flow's only permitted reference to history MUST be a navigation control leading to the `review-history-ui` surface

#### Scenario: No scheduling, signing or attachment control exists in the field flow
- GIVEN every view of the review-session field flow
- WHEN its controls are enumerated
- THEN none MUST offer due dates, overdue lists, a signing control other than **Sign and close**, export, print, download, send, a link to the review document, photos or attachments

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
