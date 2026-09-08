# Delta for Review Template Management

> **Purpose amendment (for archive):** the capability's Purpose states that
> "nothing here reads or writes a `ReviewSession` — consumption is FR-007".
> FR-007 is this change: templates are now **consumed**. The capability
> gains one read operation — resolving the currently `active` frozen
> template for an element type — and its *No Review Session Surface*
> requirement is removed. Template authoring itself is unchanged: no new
> write path, no new status, no change to activation, freezing, retirement
> or versioning.

## ADDED Requirements

### Requirement: Resolve the Currently Active Template for an Element Type

The system MUST support querying the currently `active` review template
for a given element type, so that a review session can be bound to it.
The query MUST return only templates whose status is `active`; `draft`,
`retired` and soft-deleted templates MUST never be returned. When no
`active` template exists for that element type, the query MUST report
that absence deterministically rather than falling back to a `draft`, a
`retired` predecessor, or an arbitrary template.

Because a lineage is `(elementType, frequency)`, an element type MAY have
more than one `active` template — at most one per frequency. In that case
the query MUST NOT pick one arbitrarily: it MUST either be constrained by
frequency so that at most one template is returned, or return all matching
active templates for the caller to choose from.

#### Scenario: The active template for an element type is returned
- GIVEN element type T has exactly one `active` template V
- WHEN the active-template query is performed for T
- THEN it MUST return V

#### Scenario: Drafts and retired versions are never returned
- GIVEN element type T has a `draft` template, a `retired` predecessor and an `active` template V
- WHEN the active-template query is performed for T
- THEN it MUST return V only

#### Scenario: A soft-deleted draft is never returned
- GIVEN element type T has a soft-deleted `draft` template
- WHEN the active-template query is performed for T
- THEN that template MUST NOT appear in the result

#### Scenario: Absence is reported, never substituted
- GIVEN element type T has no `active` template
- WHEN the active-template query is performed for T
- THEN it MUST report the absence, and MUST NOT return a `draft` or `retired` template instead

#### Scenario: Activation of a successor changes what the query returns
- GIVEN version 1 is `active` for element type T and lineage frequency F
- WHEN version 2 of that lineage is activated
- THEN the query for T and F MUST return version 2, and MUST NOT return the now-`retired` version 1

#### Scenario: Multiple active lineages are never disambiguated arbitrarily
- GIVEN element type T has an `active` template in two different frequency lineages
- WHEN the active-template query is performed for T alone
- THEN it MUST NOT return a single arbitrarily chosen template; it MUST require the frequency, or return both

### Requirement: Session Consumption Reads the Frozen Snapshot

The read path that supplies a session's questions MUST return each
question's wording **as snapshotted at activation**, together with its
stored order — never the live `ChecklistQuestion` pool's current wording.
Subsequent edits or soft-deletes in the live pool MUST NOT change what
that read path returns for an already-activated template.

#### Scenario: Snapshotted wording is returned, not live wording
- GIVEN template V is `active`, its snapshot holds question Q with wording W, and Q's live wording is later changed to W2
- WHEN the session-consumption read path returns V's questions
- THEN Q MUST be returned with wording W

#### Scenario: A soft-deleted pool question stays in the snapshot
- GIVEN template V is `active` and its snapshot holds question Q, which is later soft-deleted from the live pool
- WHEN the session-consumption read path returns V's questions
- THEN Q MUST still be returned, in its snapshotted position

#### Scenario: No live-pool read path backs a session
- GIVEN the read paths available to review sessions after this change
- WHEN they are inspected
- THEN none MUST resolve a template's questions through the live `ChecklistQuestion` pool

### Requirement: Template Authoring Is Unchanged by Session Consumption

Consumption MUST be read-only with respect to this capability: no new
template status, no new write path, and no change to creation,
question-selection replacement, activation, freezing, retirement,
versioning or draft soft-deletion. A template being referenced by a
session MUST NOT alter any of those rules — in particular, an `active` or
`retired` template MUST remain non-soft-deletable and a `draft` MUST
remain soft-deletable regardless of session activity.

#### Scenario: No new template status or write path is introduced
- GIVEN the template status values and write operations before and after this change
- WHEN they are compared
- THEN they MUST be identical

#### Scenario: Referencing a template does not change its lifecycle rules
- GIVEN an `active` template referenced by an open review session
- WHEN a `SYSTEM_ADMIN` attempts to soft-delete it
- THEN it MUST be rejected with 409 `code: REVIEW_TEMPLATE_NOT_EDITABLE`, exactly as before

## REMOVED Requirements

### Requirement: No Review Session Surface

(Reason: this requirement forbade any `ReviewSession`,
`ElementReviewEntry` or `QuestionAnswer` table, model, route, use case or
page, because templates were authored in the `checklist-management` slice
and consumed in FR-007. FR-007 is this change, so the prohibition is
satisfied and now superseded.)

(Migration: replaced by the `review-session-management` capability, which
owns those models and their behaviour. Any test asserting that no session
artifacts exist must be removed; the frozen-snapshot guarantee it
protected is preserved by *Session Consumption Reads the Frozen Snapshot*
and by `review-session-management` → *Sessions Render the Template's
Frozen Snapshot*.)
