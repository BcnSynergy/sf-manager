# Delta for Review History

> **Purpose amendment (for archive):** in the Purpose's "Deliberately
> **not** here" paragraph, replace "and any write, signing, export,
> scheduling or analytics path" with: "and any write, scheduling or
> analytics path. Signing is completion itself
> (`review-session-management`), and the review document of one
> completed session is owned by `review-document`, which reuses this
> capability's five scopes without widening any of them." No requirement
> of this capability is weakened.

## ADDED Requirements

### Requirement: The Review Document Read Inherits the Session-Level History Guards

The `review-document` read is a history read of one session and MUST be
bound by this capability's session-level guards exactly as the history
detail read is: *Only Completed Sessions Appear in History*, *History
Scope Is Carried by the Query, Not by the Caller*, *An Out-of-Scope
Historical Session Is Indistinguishable From a Nonexistent One*, *An
Ungranted Manager Reads Nothing* and *History Adds No Write Path*.

It MUST resolve its session through the same five scopes and the same
scoped reads the history detail read uses. It MUST NOT add a third
actor-unscoped repository read, MUST NOT reach either existing
actor-unscoped read from any path other than the `SYSTEM_ADMIN` path
and the affirmatively granted `MANAGER` path, and MUST NOT fetch a
session and check its scope afterwards.

#### Scenario: Still exactly two actor-unscoped reads
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods reading `completed` sessions or their entries are enumerated
- THEN exactly the same two actor-unscoped reads MUST exist as before this change, and every other method MUST carry a performer, community or maintenance-company scope

#### Scenario: The actor-unscoped reads gain no new caller path
- GIVEN every call site of the two actor-unscoped reads after this change
- WHEN they are enumerated — no sampling
- THEN each MUST still be reachable only from the `SYSTEM_ADMIN` path and the affirmatively granted `MANAGER` path

#### Scenario: The document read is scoped in the query
- GIVEN the document read for a technician, a representative and a company manager
- WHEN its data access is inspected
- THEN each MUST carry its own scope predicate, and none MUST fetch the session unscoped and narrow afterwards

#### Scenario: A draft is not readable through the document read
- GIVEN a `draft` session in the caller's own scope
- WHEN the caller reads its document
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical to a nonexistent session

> **Reconciling the base spec's "Deferred" table (line 1029):** "any
> capability gating anything other than the review-history reads" still
> holds. The `review-document` read is not a second thing `VIEW_ALL_REVIEWS`
> gates — it is the review-history read's own scope, reused verbatim by a
> second surface. No new capability check, branch or gate is added
> anywhere for it.
