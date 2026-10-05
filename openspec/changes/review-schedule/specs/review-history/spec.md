# Delta for Review History

## MODIFIED Requirements

### Requirement: The Deferred Review Visibility Scopes Are Not Built

**FR-008 closes with this change.** Its role-based visibility axis closed
with the fifth scope; its **per-element** half ships here (see *One
Inspectable Element's Completed Review History*). Nothing of FR-008
remains deferred. The `ManagerCapability` mechanism MUST still declare
exactly one member, `VIEW_ALL_REVIEWS`, and MUST gate review-history
visibility only — now across **both** read surfaces — plus the
installation-wide scope of the separate `review-schedule` read, and nothing
else. The system MUST NOT introduce any of the following.
(Previously: per-element history was deferred, its row forbade "any
query, route or use case returning the past reviews of one inspectable
element", the *"No per-element history query or route exists"* scenario
required that none be found, and FR-008 did not close. That row and that
scenario are **narrowed, not deleted**: exactly one such read now ships,
and the guard becomes a bound on it — one element-keyed read family, five
scopes, no controls, no second variant. The capability clause previously
read "gate review-history visibility only"; the three rows marked
*(narrowed for review-schedule)* below are bounded, not deleted, to allow
the one read-only schedule read.)

| Deferred | Must not exist |
|---|---|
| ADR-011 Decision 2's other five capabilities *(narrowed for review-schedule)* | Any declaration, gate, branch, UI or reference to `MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`, `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS` or `MANAGE_ORGANIZATION_PROFILE`, anywhere in `apps/**` or `packages/**`; any capability gating anything other than the review-history reads and the installation-wide scope of the `review-schedule` read |
| A third actor-unscoped read *(narrowed for review-schedule)* | Any actor-unscoped "all sessions" or "all entries" query beyond the two named in *History Scope Is Carried by the Query, Not by the Caller*, and any path reaching either while serving a caller who is neither a `SYSTEM_ADMIN` nor a `MANAGER` with an affirmatively resolved capability. The `review-schedule` read is **not** a third such read: it is scoped to the caller by role, reads through its own module-local port, returns computed per-pair statuses and never a session or an entry, and reaches an installation-wide result only for a `SYSTEM_ADMIN` or a `MANAGER` with an affirmatively resolved capability |
| Capability state outside the database | Any `managerCapabilities` claim in a JWT or token payload, any cached or precomputed capability, and any client-side authorization decision derived from one |
| An audit trail | Any audit table, event or write recording a capability grant, a capability revoke or a role change |
| A narrowed variant of the granted read | Any per-company, per-community or date-bounded variant of `VIEW_ALL_REVIEWS`, and any granted-manager-specific repository method or route, on either surface |
| A second element-keyed surface *(narrowed for review-schedule)* | Any cross-element or cross-community aggregation ("every element's last review") **other than the `review-schedule` read, which aggregates per `(community, elementType)` pair and returns no element-level data**, any element-keyed read reached from a route other than the single nested one, any unscoped `findById` on the inspectable-element port, and any `GET` by-id inspectable-element endpoint |
| List controls | Any pagination, cursor, limit, offset, date-range filter, sorting or search parameter on a history read — on **either** surface, including the installation-wide list and an element's own record however long it grows |
| Analytics derived from the element record | Any stored `lastInspectedAt` or equivalent projection, any overdue or due-date computation, any trend or chart, and any export or signing path over an element's record. The `review-schedule` read is not derived from an element's record: it is computed on read, per pair, from completed sessions |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

(Previously, the *Analytics* row ended at "an element's record"; the added
sentence is a clarification, not a relaxation.)

#### Scenario: Exactly one manager capability is declared
- GIVEN the `ManagerCapability` enum, the user model, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: The capability gates only the history reads and the schedule's installation-wide scope
- GIVEN every authorization decision that consults `VIEW_ALL_REVIEWS` after this change
- WHEN they are enumerated
- THEN each MUST belong to a review-history read or to the review-schedule read's installation-wide scope, and none MUST gate any other surface

#### Scenario: The capability lives only in the database
- GIVEN the token payload, the authenticated actor, the current-user endpoint's response and the client's authorization code after this change
- WHEN each is inspected
- THEN none MUST carry `managerCapabilities`, and the capability MUST be re-read from the database on every request with no cache

#### Scenario: Every scoped query still names its scope, and only two name no actor
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier, each community-scoped method its communities and each performer-scoped method its performer — and exactly two methods MUST carry no actor scope at all, per *History Scope Is Carried by the Query, Not by the Caller*

#### Scenario: The schedule read leaves the review-session port's bound intact
- GIVEN the review-session repository port before and after this change
- WHEN its methods are compared
- THEN no method MUST have been added to it for the review-schedule read

#### Scenario: The company scope never joins to the performer's current company
- GIVEN the company-scoped history queries after this change, session-level and element-keyed alike
- WHEN their predicates are inspected
- THEN each MUST match the session's own recorded performing company, and none MUST resolve membership through the performer's current `User.maintenanceCompanyId`

#### Scenario: Exactly one per-element history read family exists, behind one route
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN exactly one family MUST be found — one nested route under the element's community, one use case, and one repository method per scope — and no second route, no flat element-keyed route, and no cross-element or cross-community aggregation of element reviews MUST exist
(Previously: "no cross-element or cross-community aggregation MUST exist", unqualified. The review-schedule read returns no element-level data and is not an element-keyed read.)

#### Scenario: The element port gains nothing
- GIVEN the inspectable-element repository port and the element-management routes before and after this change
- WHEN they are compared
- THEN the port MUST have gained no method — the element MUST be resolved through the shipped community-scoped lookup — and no `GET` by-id inspectable-element endpoint MUST exist

#### Scenario: No list-control parameters are accepted, on either surface
- GIVEN the history read routes and their request contracts after this change
- WHEN they are inspected
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter, on any of the five scopes or on the element-keyed read

#### Scenario: No projection or analytics is derived from the element record
- GIVEN the schema, the read model and the use cases after this change
- WHEN they are inspected
- THEN no stored `lastInspectedAt` or equivalent projection MUST exist, and no overdue computation, trend, chart, export or signing path MUST be derived from an element's record

#### Scenario: The capability column and the element-index stay the only additive schema changes
- GIVEN the migration directory and `schema.prisma` before and after this change
- WHEN they are compared
- THEN this change MUST introduce no table, no column, no enum, no backfill and no data migration beyond the one additive index on `ElementReviewEntry.inspectableElementId` (see the next scenario) — the `ManagerCapability` enum, the `User.managerCapabilities` column and that index MUST remain the only additive schema objects the history slices introduced, and `ReviewSession` MUST be unchanged

#### Scenario: Any index for the element-keyed read is measured, additive and independently revertable
- GIVEN the element-filtered read's query plan
- WHEN an index is considered for it
- THEN one MUST ship only if a measured plan justifies it, MUST be purely additive, MUST be revertable independently of the rest of this change, and MUST NOT replace or drop any existing index

#### Scenario: The installation-wide read keeps its covering index
- GIVEN the composite index on `ReviewSession(status, completedAt, id)` that keeps the unscoped read off a full table scan and filesort
- WHEN the schema and migration directory are inspected after this change
- THEN that index MUST still exist unchanged — the element-keyed read MUST NOT be read as license to drop it or to alter it

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

> **Reconciling the base spec's "Deferred" table:** "any capability
> gating anything other than the review-history reads and the
> installation-wide scope of the review-schedule read" still holds. The
> `review-document` read is not a second thing `VIEW_ALL_REVIEWS` gates
> — it is the review-history read's own scope, reused verbatim by a
> second surface. No new capability check, branch or gate is added
> anywhere for it.
(Previously: the note read "any capability gating anything other than the
review-history reads" still holds, which is the base table's clause before
the review-schedule read was added to it.)
