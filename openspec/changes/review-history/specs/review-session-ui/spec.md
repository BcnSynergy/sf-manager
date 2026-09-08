# Delta for Review Session UI

> **Purpose amendment (for archive):** the capability's Purpose lists
> "review history views" as out of scope. After this change that is
> narrower: a history list and a read-only historical-session view now
> exist, owned by the separate `review-history-ui` capability. The
> **field flow** described here still adds none of its own, and gains
> only a navigation entry point into that surface. Still out of scope
> here and everywhere: camera / QR scanning, offline capability of any
> kind, per-element history views, list filtering / pagination / sorting
> / search, due-date or overdue indicators, signing and export, photos
> and attachments.

## MODIFIED Requirements

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
(Previously: the requirement forbade **any** review history view in the
web app, which `review-history-ui` now makes false by design.)

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
