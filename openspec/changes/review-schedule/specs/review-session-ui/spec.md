# Delta for Review Session UI

> The main spec's *Purpose* paragraph lists "due-date or overdue indicators"
> as out of scope for the field flow. It is not a requirement and cannot be
> modified by a delta; it describes the field flow's own views, which this
> change leaves untouched. The archive step MUST add a clause naming the global
> navigation's Review schedule item.

## MODIFIED Requirements

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
review view.)

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
- THEN none MUST offer due dates, overdue lists, a signing control other than **Sign and close**, export, print, download, send, a link to the review document, photos or attachments
(Previously: "WHEN its controls are enumerated", with no exclusion, which would have counted the global navigation's Review schedule item as an overdue-list control.)

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
