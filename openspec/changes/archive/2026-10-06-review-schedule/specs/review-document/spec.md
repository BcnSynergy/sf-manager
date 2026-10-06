# Delta for Review Document

## MODIFIED Requirements

### Requirement: Document Visibility Is Exactly the Review-History Scope

The document read MUST be reachable **if and only if** the history
detail read of the same session is reachable by the same caller, across
all five scopes (`review-history`): a `MAINTENANCE_TECHNICIAN` for the
sessions they performed, a `COMMUNITY_REPRESENTATIVE` for sessions on
communities they are actively assigned to, a
`MAINTENANCE_COMPANY_MANAGER` for sessions attributed to their own
company, a `SYSTEM_ADMIN` for any, and a `MANAGER` holding
`VIEW_ALL_REVIEWS` for any.

A session that is out of scope, nonexistent, or not `completed` MUST be
rejected with `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code
and message to the history detail read's rejection. A `MANAGER` without
the capability MUST receive that `404` for every session, before any
review-session data access.

The read MUST be gated by the existing `reviewSession:read` permission.
No permission, `Permission` member, `ROLE_PERMISSIONS` grant or
capability MUST be added **by this read**.
(Previously: "MUST be added", unqualified. Later slices, such as the
review-schedule read, add their own permission; this requirement governs the
review-document read only.)

#### Scenario: Each of the five scopes reads an in-scope document
- GIVEN a technician, a representative, a company manager, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`, each with a `completed` session in their history scope
- WHEN each reads that session's document
- THEN each response MUST be 2xx

#### Scenario: Document and history detail agree for every caller
- GIVEN any caller and any session identifier
- WHEN the caller requests the session's history detail and its document
- THEN both MUST produce the identical outcome

#### Scenario: Out-of-scope, nonexistent and draft are indistinguishable
- GIVEN a `completed` session outside the caller's scope, an identifier matching no session, and a `draft` in the caller's own scope
- WHEN the caller reads the document of each
- THEN all three MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code and message

#### Scenario: An ungranted manager reads no document
- GIVEN a `MANAGER` holding no capability and any `completed` session
- WHEN they read its document
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND` and no review-session repository read MUST be issued

#### Scenario: A deactivated representative loses the document
- GIVEN a representative whose assignment to community C was deactivated
- WHEN they read the document of a `completed` session on C
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A representative who signed loses the document after reassignment (accepted for slice 1)
- GIVEN a `COMMUNITY_REPRESENTATIVE` who signed and closed a session on community C as its performer, then had their assignment to C deactivated
- WHEN they read that session's document
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, the same uniform outcome as any out-of-scope caller, because document visibility is carried entirely by the review-history scope and never by having performed the session (this is why the field-flow session page carries no document link — a performer-retained-access exception is deferred as an open question, not solved in slice 1)

#### Scenario: No permission is added
- GIVEN the `Permission` union and `ROLE_PERMISSIONS`
- WHEN the review-document read is inspected
- THEN the read MUST have added no `Permission` member, no `ROLE_PERMISSIONS` grant and no capability, and it MUST be gated by the existing `reviewSession:read` alone
(Previously: the union and the table "before and after this change" MUST be identical, which cannot hold once the review-schedule change adds `reviewSchedule:read` to both.)
