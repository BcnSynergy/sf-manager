# Review Document

## Purpose

The signed record of one completed review (FR-010, slice 1 of 2): a
single scoped, read-only request that returns **as data** everything a
printable review document needs — the organization letterhead, the
session's reference data, the recorded record and the signature — for
one `completed` session. Who may open it is **exactly** who may open the
same session in review history (`review-history`, five scopes); nothing
is widened and no new permission exists.

Signing itself is not a new operation: a session is signed by completing
it (`review-session-management`, *Completion Is the Signing Act*). The
printable page is owned by `review-document-ui`.

Out of scope (slice 2, next change): signer full name, signature image,
and snapshotting reference labels onto the session at signing time. Also
out of scope: any PDF, file, download or email, and any logo.

## Requirements

### Requirement: Read the Review Document of One Completed Session

The system MUST let an authorized caller read the review document of one
`completed` session by its identifier. A successful response MUST carry
four parts, returned as structured data:

| Part | Required content |
|---|---|
| Letterhead | The organization profile's `name`, `legalName`, `taxId`, `address`, `phone` and `email`, verbatim — blank values as empty strings, no substitution and no completeness flag |
| Session data | The community's name, the template's element type, frequency, name and version, the session's `startedAt` and `completedAt`, and the attributed maintenance company's name when the session carries an attribution |
| Recorded record | Every entry the history read-back returns for that session — each with its element's `code`, `name` and `location`, its answers paired with the snapshotted question wording, and, for an unreviewed element, its recorded reason |
| Signature | The signer, identified by the performer's email, and the signing date, equal to `completedAt` |

The recorded record MUST match *Scoped Read-Back of One Historical
Session* for the same session in its **entry set, answers, snapshotted
wording and unreviewed reasons** — no reduced, added or role-specific
variant. **Element identity deliberately differs**: the history read-back
resolves codes from the currently active elements only and shows the
neutral label for a deactivated or soft-deleted element, whereas the
document names every element that still has a row (below).

Its **order** MUST be deterministic: entries by their element's code
ascending, entries lacking a code **last**; ties — including among
code-less entries — broken by the entry's recorded time, then by its
identifier; each entry's answers by the frozen template's question
`order`. Only the document read applies this ordering; the history
read-back's content and order MUST be unchanged by this change. The read
MUST NOT mutate any persisted state.

Reference data MUST NOT disappear because its owner changed after
completion: a soft-deleted community or maintenance company (neither has
a deactivation state) MUST still be named; a deactivated or soft-deleted
performer MUST still be identified by email; and a deactivated or
soft-deleted inspectable element MUST still be identified by its real
`code`, `name` and `location`. The neutral "unknown element" label is a
defensive fallback only, for an element id that resolves no row at all.
A session with no attributed company MUST return no company, not an
error.

#### Scenario: The document carries all four parts
- GIVEN a `completed` session with answered elements, one unreviewed element with a reason, and an attributed company
- WHEN an in-scope caller reads its document
- THEN the response MUST be 2xx and MUST carry the letterhead, the session data, every entry with snapshotted wording or its reason, and the signer's email with `completedAt` as the signing date

#### Scenario: The recorded record matches the history read-back
- GIVEN a caller who can open session S in review history
- WHEN they read S's document and S's history detail
- THEN both MUST carry the same set of entries keyed by `inspectableElementId`, with identical answers per `questionId` (order excepted: the document orders them by question order), snapshotted wording and unreviewed reasons

#### Scenario: Element identity may differ from the history read-back
- GIVEN a `completed` session S one of whose elements was deactivated after completion
- WHEN a caller reads S's history detail and S's document
- THEN the history detail MUST show that entry under the neutral label, exactly as before this change, while the document MUST identify it by its real `code`, `name` and `location`

#### Scenario: Entries and answers are returned in a deterministic order
- GIVEN a `completed` session whose elements were recorded in an arbitrary order and whose template defines a question order
- WHEN its document is read twice
- THEN both responses MUST list entries ordered by element code ascending, with entries lacking a code last (ties, including among code-less entries, broken by recorded time then entry id), and each entry's answers ordered by the template's question `order`, identically on both reads

#### Scenario: The history read-back is unchanged
- GIVEN the same session's history detail read before and after this change
- WHEN the two are compared
- THEN its content and its order MUST be identical

#### Scenario: A session without an attributed company has no company
- GIVEN a `completed` session carrying no performing-company attribution
- WHEN an in-scope caller reads its document
- THEN the response MUST be 2xx and MUST carry no maintenance company

#### Scenario: Deleted context still labels the document
- GIVEN a `completed` session whose community, attributed company and performer were soft-deleted after completion
- WHEN a `SYSTEM_ADMIN` reads its document
- THEN the community and company MUST still be named and the signer MUST still be identified by email

#### Scenario: A decommissioned or soft-deleted element still labels its entry
- GIVEN a `completed` session one of whose elements was deactivated, and another of whose elements was soft-deleted, after completion
- WHEN its document is read
- THEN both entries MUST still be returned with their answers or reason, each identified by its real `code`, `name` and `location`

#### Scenario: An element id with no row falls back to the neutral label
- GIVEN a `completed` session one of whose entries carries an element id that resolves no row at all
- WHEN its document is read
- THEN that entry MUST still be returned with its answers or reason, and its element identity MUST be the neutral "unknown element" label

#### Scenario: A blank profile does not block the document
- GIVEN the organization profile has never been edited
- WHEN an in-scope caller reads any completed session's document
- THEN the response MUST be 2xx with all six letterhead fields as empty strings and no completeness flag

#### Scenario: A session completed before this change is signed by its performer
- GIVEN a session completed before this change was deployed
- WHEN its document is read
- THEN the signer MUST be its performer and the signing date its `completedAt`, with no backfill having run

#### Scenario: Reading the document changes nothing
- GIVEN a `completed` session
- WHEN its document is read any number of times
- THEN its status, entries, answers and observations MUST be byte-for-byte unchanged

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
capability MUST be added.

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
- GIVEN the `Permission` union and `ROLE_PERMISSIONS` before and after this change
- WHEN they are compared
- THEN they MUST be identical

### Requirement: Inclusive Name Lookups Run Only Inside the Scope Gate

The soft-delete-inclusive lookups that name the community and the
maintenance company, and the soft-delete- and deactivation-inclusive
lookup that identifies elements, MUST be called only **after** the
session has been loaded through the history scope gate, and only with
identifiers taken from that loaded session (its community, its
attributed company, its entries' elements). They MUST NOT be reachable
from any other route or use case: the port that declares them MUST stay
local to the review-session module and MUST NOT be exported to any other
module.

#### Scenario: A rejected read issues no name lookup
- GIVEN a caller for whom the session is out of scope, nonexistent or a `draft`
- WHEN they read its document
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND` and no community, company, element or organization-profile lookup MUST have been issued

#### Scenario: Lookups use only identifiers from the loaded session
- GIVEN an in-scope `completed` session
- WHEN its document is read
- THEN every community, company and element lookup MUST be keyed only by identifiers carried by that session, and no identifier supplied by the caller other than the session identifier MUST reach them

#### Scenario: The lookup port is not exported
- GIVEN the review-session module after this change
- WHEN its exports are inspected
- THEN the inclusive name-lookup binding MUST NOT be among them, and no other module MUST inject it

### Requirement: The Organization Profile Gains One Reader, Not a Wider Endpoint

The document read MUST be the only read of the profile outside the
capability's own endpoint. It MUST expose only
the six letterhead fields — never the profile's `id` or `logoAssetId`.
`GET /organization-profile` and `PATCH /organization-profile` MUST keep
their exact current permissions: a non-admin role MUST obtain letterhead
data only through a document it may already open.

#### Scenario: The profile endpoint stays admin-only
- GIVEN a `MAINTENANCE_TECHNICIAN` who can read a document
- WHEN they call `GET /organization-profile`
- THEN the response MUST be `403`, exactly as before this change

#### Scenario: The document exposes only the letterhead fields
- GIVEN any successful document response
- WHEN its letterhead is inspected
- THEN it MUST carry exactly the six text fields, and no `id` or `logoAssetId`

### Requirement: Reference Labels Are Read Live in This Slice

The letterhead, the community and company names, the element identity
labels and the performer's email MUST be read at request time. A document
read after one of them changes MUST show the new value. This is an
**accepted** slice-1 behaviour (proposal question 2) and MUST NOT be
treated as a defect; snapshotting them at signing belongs to slice 2.

Answers, snapshotted question wording, unreviewed reasons, the
performer's identity, the template version, `startedAt` and
`completedAt` MUST NOT change between reads.

#### Scenario: A renamed community shows its new name
- GIVEN a `completed` session on community C, whose name is changed after completion
- WHEN the session's document is read again
- THEN it MUST show C's new name, and its recorded record MUST be unchanged

#### Scenario: An updated letterhead appears on an old document
- GIVEN a document read once, then the organization profile updated
- WHEN the same document is read again
- THEN the letterhead MUST reflect the update and every frozen value MUST be unchanged

### Requirement: No Server-Generated Document Artifact and No Delivery

The document MUST be delivered as data only, and printing MUST be done
by the browser (`review-document-ui`). The system MUST NOT expose an
endpoint returning the document as a PDF, image or other downloadable
file, MUST NOT store a generated document, MUST NOT send it by email or
any other channel, and MUST NOT introduce a PDF-generation,
headless-browser or mailer dependency. No schema change and no data
migration MUST ship.

#### Scenario: No file-returning endpoint exists
- GIVEN the API surface after this change
- WHEN it is inspected
- THEN no endpoint MUST return a review document as a PDF, image or file

#### Scenario: No PDF, headless-browser or mailer dependency is added
- GIVEN every dependency manifest before and after this change
- WHEN they are compared
- THEN no PDF-generation, headless-browser or mail-sending dependency MUST have been added

#### Scenario: No sending path exists
- GIVEN the routes, use cases and web controls after this change
- WHEN they are searched for sending a document
- THEN no email, share or send operation MUST exist

#### Scenario: The schema is unchanged
- GIVEN `schema.prisma` and the migration directory before and after this change
- WHEN they are compared
- THEN no table, column, enum or migration MUST have been added
