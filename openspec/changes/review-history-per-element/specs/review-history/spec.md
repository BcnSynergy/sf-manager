# Delta for Review History

> **Purpose amendment (for archive):** the capability's Purpose says
> "FR-008's role-based visibility axis closes here; **per-element**
> history remains the only deferred half." After this change nothing is
> deferred: the capability adds a second, **element-keyed** read surface
> — every past review of **one** inspectable element, across **every**
> session it was ever reviewed in — resolved through the **same five**
> visibility scopes, now applied at **entry** level instead of session
> level. **FR-008 closes with this change.** No new scope, no new
> permission, no new authorization primitive and no schema change ships:
> the element-keyed read reuses `ReviewHistoryAccessService`'s existing
> checkers branch for branch, and the element itself is resolved through
> the shipped community-scoped element lookup, which is what makes the
> `:communityId` segment verified rather than decorative. The
> session-level surface is untouched.

## ADDED Requirements

### Requirement: One Inspectable Element's Completed Review History

The system MUST let an authorized caller read the review history of a
**single** inspectable element, identified by its community and its own
identifier, and receive **every** review of that element the caller is
allowed to see, drawn from **every** `completed` session it was ever
reviewed in — not only the most recent, and not only those within one
session.

The response MUST carry two parts:

| Part | Required content |
|---|---|
| The element header | The element's `code`, name, element type, location, active/decommissioned state and the community it belongs to — enough to identify the physical element the record is about, without a second request |
| The entry list | One row per element review entry in the caller's scope, each carrying **when** the review was recorded, **who** recorded it, whether the element was **reviewed or left unreviewed**, its recorded **observations**, and a reference to the `completed` session the entry belongs to |

The entry list MUST be ordered **most recent first** by the moment each
entry was recorded, with a deterministic tiebreak so that two entries
recorded at the same instant always appear in the same relative order
across identical requests. The ordering MUST be stable and MUST NOT
depend on insertion order, on the database's default ordering, or on the
caller's role.

Only entries belonging to `completed` sessions MUST appear. An entry
recorded in a `draft` session — including one currently in progress
against the same element — MUST NOT appear for any caller, in any scope.

Each row MUST reference the session it belongs to, and it MUST be an
invariant of every scope that **any row the caller can see belongs to a
session that same caller can open** through *Scoped Read-Back of One
Historical Session*. A row the caller cannot follow through to its
session MUST NOT be returned.

The response MUST NOT re-render each past review's answers inline: the
rows carry the summary fields named above and the session reference, and
the answers stay where they already ship, on the session read-back. This
is a deliberate scope boundary, not an omission.

A **decommissioned** element (`deactivatedAt` set) MUST have its history
returned in full — decommissioning is domain state, not a delete, and a
retired element's compliance record MUST stay readable.

#### Scenario: Every past review of one element is returned across all its sessions
- GIVEN element E was reviewed in three different `completed` sessions on three different dates, and a caller whose scope covers all three
- WHEN they request E's review history
- THEN the response MUST be 2xx and MUST contain all three entries in one list, most recent first — not only the latest, and not only one session's

#### Scenario: The element header identifies the physical element
- GIVEN any successful element review history response
- WHEN its element header is inspected
- THEN it MUST carry the element's `code`, name, element type, location, active/decommissioned state and its community

#### Scenario: Each row carries when, who, the outcome and its session
- GIVEN an element history containing an entry that was reviewed and one that was left unreviewed with a reason
- WHEN the rows are inspected
- THEN each MUST carry the moment it was recorded, the user who recorded it, whether the element was reviewed or left unreviewed, its observations, and a reference to its `completed` session

#### Scenario: The ordering is deterministic and identical across repeated requests
- GIVEN an element whose history contains two entries recorded at the same instant
- WHEN the same caller requests the element's history twice
- THEN both responses MUST list every entry in exactly the same order, most recent first, with the same tiebreak applied

#### Scenario: Every visible row belongs to a session the same caller can open
- GIVEN any caller and any element history response they received
- WHEN each row's referenced session is requested by that same caller through the session read-back
- THEN every one MUST return its full recorded record — no row MUST reference a session the caller is refused

#### Scenario: A draft review of the same element never appears
- GIVEN element E has two entries from `completed` sessions and one recorded in a `draft` session still in progress
- WHEN any caller whose scope covers E requests its history
- THEN exactly the two `completed` entries MUST be returned, and the `draft` one MUST NOT appear

#### Scenario: A decommissioned element keeps its full history
- GIVEN element E was reviewed in two `completed` sessions and has since been decommissioned
- WHEN a caller whose scope covers both requests E's history
- THEN the response MUST be 2xx, MUST contain both entries, and the header MUST report the element as decommissioned

#### Scenario: Answers are not re-rendered per row
- GIVEN an element history response
- WHEN a row is inspected
- THEN it MUST NOT carry that past review's per-question answers — those MUST remain available only through the referenced session's read-back

### Requirement: The Five Visibility Scopes Apply at Entry Level

The element-keyed read MUST resolve visibility through the **same five**
scopes the session-level history already ships, applied to the element's
**entries** rather than to whole sessions. No sixth scope, no narrower
technician rule and no element-specific exception MUST be invented, and
no scope MUST be widened.

| Caller | Entries returned for element E |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Exactly the entries **they** recorded on E — and nothing else. Entries recorded by any other performer MUST NOT be returned, whether or not the caller holds an active assignment to E's community |
| `COMMUNITY_REPRESENTATIVE` | **Every** entry on E, regardless of who recorded it, **iff** they hold an **active** representative assignment to E's community; otherwise nothing |
| `MAINTENANCE_COMPANY_MANAGER` | Exactly the entries whose session carries their **own** company as its frozen performing-company attribution — across every technician of that company. An entry whose session carries **no** attribution MUST NOT be returned to any company manager. A caller whose own maintenance company is absent MUST receive nothing |
| `SYSTEM_ADMIN` | **Every** entry on E, unconditionally |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | **Every** entry on E, identical to `SYSTEM_ADMIN` — same rows, same order, same fields, with no manager variant |
| `MANAGER` without the capability | Nothing |

A technician's own entries MUST stay readable permanently, exactly as at
session level: a deactivated community assignment MUST NOT retroactively
hide work the caller personally performed. The relaxation MUST stay
bounded to their own entries — a deactivated technician MUST still see
**no** entry recorded by anyone else.

An unresolvable scope MUST fail **closed** and MUST short-circuit
**before** any review-session data access: an absent company, an absent
or unresolved `VIEW_ALL_REVIEWS` capability, and an absent active
representative assignment MUST each produce no result rather than a wider
one.

#### Scenario: A technician sees only their own entries on a shared element
- GIVEN element E was reviewed in two `completed` sessions on E's community, one performed by technician U and one by technician W
- WHEN U requests E's history and W requests E's history
- THEN U's response MUST contain exactly U's one entry and W's MUST contain exactly W's one entry — neither MUST contain the other's

#### Scenario: A technician's own entry survives their assignment's deactivation
- GIVEN technician U recorded an entry on element E and can read E's history
- WHEN U's technician assignment to E's community is deactivated and they repeat the identical request
- THEN U's own entry MUST still be returned, and no entry recorded by anyone else MUST appear

#### Scenario: A representative sees every entry on an actively assigned community's element
- GIVEN element E on community C, reviewed by two different technicians of two different maintenance companies, and a `COMMUNITY_REPRESENTATIVE` actively assigned to C who performed neither session
- WHEN they request E's history
- THEN both entries MUST be returned, regardless of performer or performing company

#### Scenario: A company manager sees only their own company's entries on a shared element
- GIVEN element E reviewed in a `completed` session attributed to company X and in another attributed to company Y, and a third whose session carries no attribution at all
- WHEN X's `MAINTENANCE_COMPANY_MANAGER` requests E's history
- THEN exactly the X-attributed entry MUST be returned — Y's entry and the unattributed entry MUST NOT appear

#### Scenario: Attribution survives the performer's transfer on the element read too
- GIVEN a technician recorded an entry on element E while employed by company X and has since transferred to company Y
- WHEN X's manager and Y's manager each request E's history
- THEN the entry MUST appear for X's manager and MUST NOT appear for Y's manager — the scope MUST resolve from the session's frozen attribution, never from the performer's current employer

#### Scenario: A granted manager's element history is identical to the admin's
- GIVEN an element reviewed across two companies, two performers and several dates, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request that element's history and the responses are compared
- THEN they MUST contain exactly the same entries, in exactly the same order, with exactly the same fields and the same element header

#### Scenario: An unresolvable scope issues no read at all
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` whose own maintenance company is absent, and a `MANAGER` holding no capability
- WHEN each requests any element's history
- THEN neither request MUST issue any review-session repository read, and neither MUST fall through to a wider read or to a read carrying an empty, wildcard or null scope value

#### Scenario: No sixth scope and no element-specific narrowing is introduced
- GIVEN the element-keyed history authorization after this change
- WHEN its branches are compared with the shipped session-level ones
- THEN there MUST be exactly the same five, decided by the same checkers, differing only by the element identifier — with no additional branch, no role-specific exception and no narrower technician rule

### Requirement: Element Reachability Decides 404 Versus an Empty History

Whether a caller learns that an element **exists** MUST be decided by one
explicit matrix, uniform across roles, so that no role learns more about
an element's existence than its own scope already entitles it to.

An element that is unknown, soft-deleted, or does not belong to the
`:communityId` in the request MUST be rejected with `404
INSPECTABLE_ELEMENT_NOT_FOUND` — the **same** status, error code and
message in all three cases, for **every** role including `SYSTEM_ADMIN`,
carrying no field, hint or payload difference between them. No distinct
code for "exists, but not in that community" and none for "exists, but
not yours" MUST be introduced.

For an element that **does** exist in the requested community, the
outcome MUST be:

| Caller | Element exists, caller's scoped entry set is **empty** |
|---|---|
| `SYSTEM_ADMIN` | 2xx with an **empty** entry list and the element header — never an error |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | 2xx with an **empty** entry list and the element header |
| `COMMUNITY_REPRESENTATIVE` with an **active** assignment to the element's community | 2xx with an **empty** entry list and the element header |
| `COMMUNITY_REPRESENTATIVE` without an active assignment to it | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MAINTENANCE_TECHNICIAN` | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MAINTENANCE_COMPANY_MANAGER` | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |
| `MANAGER` without the capability | `404 INSPECTABLE_ELEMENT_NOT_FOUND` |

The asymmetry is deliberate and MUST NOT be "corrected": the first three
scopes reach an element through a relation to the **element's own
context** — the whole installation, or an active assignment to its
community — so an empty record is a true and disclosable fact about an
element they are already entitled to see. The technician's and the
company manager's scopes are **session-derived**: they have no relation
to an element they have never reviewed, so for them "no entries in scope"
**is** "not reachable", and returning an empty list would disclose the
element's existence to a caller with no entitlement to know it.

A **non-empty** scoped entry set MUST always produce 2xx, for every role.
Partial visibility MUST NOT escalate to a 404: a caller who can see one
of an element's five entries MUST receive that one entry, not a rejection.

Every rejection on this surface MUST be produced at a single throw site
with a single code, so that no future branch can make the outcomes
diverge by role.

#### Scenario: Unknown, soft-deleted and wrong-community elements are indistinguishable
- GIVEN a well-formed element identifier matching no element at all, a soft-deleted element of community C, and an element that exists in community D
- WHEN the same caller requests each in turn under community C's path
- THEN all three responses MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, identical in status, error code and message

#### Scenario: The wrong-community pairing discloses nothing, even to an admin
- GIVEN element E belongs to community D, and a `SYSTEM_ADMIN`
- WHEN the admin requests E's history under community C's path
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, identical to a nonexistent element — the admin's installation-wide scope MUST NOT bypass the community segment

#### Scenario: A never-reviewed element renders an empty history for an admin
- GIVEN element E exists in community C and has never been reviewed in any session
- WHEN a `SYSTEM_ADMIN` requests E's history
- THEN the response MUST be 2xx, MUST carry E's element header and an empty entry list, and MUST NOT be an error

#### Scenario: A never-reviewed element renders an empty history for a granted manager and an assigned representative
- GIVEN element E exists in community C and has never been reviewed, a `MANAGER` holding `VIEW_ALL_REVIEWS`, and a `COMMUNITY_REPRESENTATIVE` actively assigned to C
- WHEN each requests E's history
- THEN both MUST receive 2xx with E's header and an empty entry list

#### Scenario: A technician gets 404, not an empty list, for an element they never reviewed
- GIVEN element E exists in community C and was reviewed only by technician W, and technician U who recorded nothing on E
- WHEN U requests E's history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element — U MUST NOT learn that E exists

#### Scenario: A company manager gets 404 for an element none of their sessions touched
- GIVEN element E exists in community C and was reviewed only in sessions attributed to company Y, and a `MAINTENANCE_COMPANY_MANAGER` of company X
- WHEN X's manager requests E's history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element

#### Scenario: A representative without an active assignment gets 404
- GIVEN element E on community D, a `COMMUNITY_REPRESENTATIVE` actively assigned only to community C, and a second representative whose assignment to D has been deactivated
- WHEN each requests E's history
- THEN both MUST receive `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element

#### Scenario: An ungranted manager gets 404 on every element
- GIVEN any element in the installation, reviewed or never reviewed, and a `MANAGER` holding no capability
- WHEN they request its history
- THEN the response MUST be `404 INSPECTABLE_ELEMENT_NOT_FOUND`, and no review-session repository read MUST be issued

#### Scenario: Partial visibility returns the visible rows, never a 404
- GIVEN element E has five entries, of which technician U recorded exactly one
- WHEN U requests E's history
- THEN the response MUST be 2xx carrying exactly U's one entry — partial visibility MUST NOT escalate to a rejection

#### Scenario: One throw site, one code
- GIVEN every rejection path of the element-keyed history read after this change
- WHEN they are enumerated
- THEN every one MUST resolve to the same `404 INSPECTABLE_ELEMENT_NOT_FOUND` response, and no role-specific status, code or message MUST exist

### Requirement: An Element Belongs to Exactly One Community for Its Lifetime

The element-keyed history read MUST resolve an element through its
community, and the system MUST keep that resolution unambiguous by
keeping an element's community **immutable**: no route, use case,
repository method or administrative action MUST move an inspectable
element between communities, and its community MUST NOT be an updatable
field.

This is a **standing recorded assumption**, relied on by this
capability: because an element never moves, every entry ever recorded
against it belongs to a session of that one community, and the read
therefore needs no cross-community rule and MUST NOT introduce one.

If element reassignment is ever built, that change MUST explicitly decide
whether an element's history spans its former community and MUST revisit
this requirement — it MUST NOT be allowed to ship while leaving the
question implicit.

#### Scenario: No path moves an element between communities
- GIVEN the inspectable-element routes, use cases and repository port after this change
- WHEN they are searched for a way to change an element's community
- THEN none MUST exist — the community MUST NOT appear among any update's mutable fields, and no reassignment or transfer operation MUST be reachable

#### Scenario: The element history adds no cross-community rule
- GIVEN the element-keyed history read's authorization and data access after this change
- WHEN they are inspected
- THEN neither MUST contain any rule, branch or predicate anticipating an element that has belonged to more than one community

## MODIFIED Requirements

### Requirement: History Scope Is Carried by the Query, Not by the Caller

Every history read MUST have its visibility scope expressed in the data
access itself, and the system MUST NOT obtain a broader result set and
narrow it in a use case, controller or client. This MUST hold for all
**five** scopes, and on **both** read surfaces — the session-level one
and the element-keyed one added by *One Inspectable Element's Completed
Review History* — including the two installation-wide ones, where the
scope **is** the whole installation: those reads MUST be distinct data
accesses whose only predicates are the `completed` status (and, on the
element-keyed surface, the element itself), never a scoped read issued
with an empty, wildcard or null scope value. A scope that cannot be
resolved MUST still produce no result rather than an unscoped one, for
every role that has a scope to resolve — and an unresolved or absent
`VIEW_ALL_REVIEWS` capability MUST be treated as exactly such an
unresolvable scope.

An **element identifier is not an actor scope.** It narrows *which*
entries are candidates; it says nothing about *who* may see them. Every
element-keyed read MUST therefore carry the actor's scope as a required
parameter alongside the element — with exactly **one** exception, the
installation-wide element read, which mirrors the shipped unscoped pair
and MUST be reachable from exactly **two** enumerable call sites: the
`SYSTEM_ADMIN` path, and the `MANAGER` path after the capability has
resolved affirmatively.

So after this change the repository MUST expose exactly **two**
actor-unscoped reads and no more: the shipped installation-wide
list/by-id pair, and the single installation-wide element-keyed read.
Both MUST be unreachable from every other path, and both MUST be named
and expressed so that a reader — and an autocomplete list — cannot
mistake either for, or accidentally select either in place of, a scoped
read. *How* this is achieved, and how the shipped property that no read
of a session is available from an identifier alone is restated now that
element-keyed reads exist, is a design decision; *that* the
actor-unscoped reads are unreachable from every other path is a
requirement.
(Previously: there was exactly **one** actor-unscoped read — the shipped
list/by-id pair — and the "exactly one unscoped read exists" scenario
asserted that every other repository method carried a performer,
community or maintenance-company scope. The element-keyed installation-
wide read makes that literal count false: it carries the element but no
actor scope. The guarantee is not weakened, only recounted — the number
of actor-unscoped reads is now a bounded, enumerable **two**, each
reachable from the same two actor paths and from nowhere else.)

#### Scenario: Exactly two actor-unscoped reads exist
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods that read `completed` sessions or their entries are enumerated
- THEN exactly two MUST carry no performer, community or maintenance-company scope — the shipped installation-wide list/by-id pair, and the single installation-wide element-keyed read — and every other method MUST carry one

#### Scenario: Every element-keyed read names its scope in its signature
- GIVEN the element-keyed repository methods after this change
- WHEN their signatures are inspected
- THEN each MUST take the element identifier **and** its actor scope as required parameters, except the single installation-wide one, so that no caller can widen its own scope by omitting an argument

#### Scenario: The actor-unscoped reads are reachable only from the admin and granted-manager paths
- GIVEN the call sites of both actor-unscoped reads after this change
- WHEN every one of them is enumerated — no sampling
- THEN each MUST be reachable from exactly two, all four in the history access resolution: the `SYSTEM_ADMIN` path and the `MANAGER` path guarded by an affirmative capability resolution — and no other use case, service, controller or adapter MUST call either

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change, session-level and element-keyed alike
- WHEN their data access is inspected
- THEN none MUST fetch sessions or entries outside the caller's scope and filter them afterwards in application, presentation or client code — in particular, the element-keyed read MUST NOT fetch all of an element's entries and drop the ones the caller may not see

#### Scenario: An unresolvable company never widens the query
- GIVEN a company-scoped history read whose caller has no maintenance company, on either surface
- WHEN the data access is inspected
- THEN it MUST NOT be issued without a company predicate, and MUST NOT fall back to an unfiltered read — and in particular MUST NOT fall through to either actor-unscoped read

#### Scenario: An absent capability never widens the query
- GIVEN a `MANAGER` history read whose caller holds no `VIEW_ALL_REVIEWS`, on either surface
- WHEN the data access is inspected
- THEN no read MUST be issued at all, and the path MUST NOT fall through to either actor-unscoped read

#### Scenario: The scoped reads are not re-expressed as the unscoped ones
- GIVEN the technician, representative and company-manager history reads after this change, session-level and element-keyed alike
- WHEN their data access is inspected
- THEN each MUST still carry its own scope predicate, and none MUST be implemented by issuing an actor-unscoped read and narrowing the result

### Requirement: The Deferred Review Visibility Scopes Are Not Built

**FR-008 closes with this change.** Its role-based visibility axis closed
with the fifth scope; its **per-element** half ships here (see *One
Inspectable Element's Completed Review History*). Nothing of FR-008
remains deferred. The `ManagerCapability` mechanism MUST still declare
exactly one member, `VIEW_ALL_REVIEWS`, and MUST gate review-history
visibility only — now across **both** read surfaces. The system MUST NOT
introduce any of the following.
(Previously: per-element history was deferred, its row forbade "any
query, route or use case returning the past reviews of one inspectable
element", the *"No per-element history query or route exists"* scenario
required that none be found, and FR-008 did not close. That row and that
scenario are **narrowed, not deleted**: exactly one such read now ships,
and the guard becomes a bound on it — one element-keyed read family, five
scopes, no controls, no second variant.)

| Deferred | Must not exist |
|---|---|
| ADR-011 Decision 2's other five capabilities | Any declaration, gate, branch, UI or reference to `MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`, `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS` or `MANAGE_ORGANIZATION_PROFILE`, anywhere in `apps/**` or `packages/**`; any capability gating anything other than the review-history reads |
| A third actor-unscoped read | Any actor-unscoped "all sessions" or "all entries" query beyond the two named in *History Scope Is Carried by the Query, Not by the Caller*, and any path reaching either while serving a caller who is neither a `SYSTEM_ADMIN` nor a `MANAGER` with an affirmatively resolved capability |
| Capability state outside the database | Any `managerCapabilities` claim in a JWT or token payload, any cached or precomputed capability, and any client-side authorization decision derived from one |
| An audit trail | Any audit table, event or write recording a capability grant, a capability revoke or a role change |
| A narrowed variant of the granted read | Any per-company, per-community or date-bounded variant of `VIEW_ALL_REVIEWS`, and any granted-manager-specific repository method or route, on either surface |
| A second element-keyed surface | Any cross-element or cross-community aggregation ("every element's last review"), any element-keyed read reached from a route other than the single nested one, any unscoped `findById` on the inspectable-element port, and any `GET` by-id inspectable-element endpoint |
| List controls | Any pagination, cursor, limit, offset, date-range filter, sorting or search parameter on a history read — on **either** surface, including the installation-wide list and an element's own record however long it grows |
| Analytics derived from the element record | Any stored `lastInspectedAt` or equivalent projection, any overdue or due-date computation, any trend or chart, and any export or signing path over an element's record |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

#### Scenario: Exactly one manager capability is declared
- GIVEN the `ManagerCapability` enum, the user model, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: The capability lives only in the database
- GIVEN the token payload, the authenticated actor, the current-user endpoint's response and the client's authorization code after this change
- WHEN each is inspected
- THEN none MUST carry `managerCapabilities`, and the capability MUST be re-read from the database on every request with no cache

#### Scenario: Every scoped query still names its scope, and only two name no actor
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier, each community-scoped method its communities and each performer-scoped method its performer — and exactly two methods MUST carry no actor scope at all, per *History Scope Is Carried by the Query, Not by the Caller*

#### Scenario: The company scope never joins to the performer's current company
- GIVEN the company-scoped history queries after this change, session-level and element-keyed alike
- WHEN their predicates are inspected
- THEN each MUST match the session's own recorded performing company, and none MUST resolve membership through the performer's current `User.maintenanceCompanyId`

#### Scenario: Exactly one per-element history read family exists, behind one route
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN exactly one family MUST be found — one nested route under the element's community, one use case, and one repository method per scope — and no second route, no flat element-keyed route, and no cross-element or cross-community aggregation MUST exist

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

#### Scenario: The capability column stays the only additive schema change, and this change adds none of its own
- GIVEN the migration directory and `schema.prisma` before and after this change
- WHEN they are compared
- THEN this change MUST introduce no table, no column, no enum, no backfill and no data migration — the `ManagerCapability` enum and the `User.managerCapabilities` column MUST remain the only additive schema objects the history slices introduced, and `ReviewSession` MUST be unchanged

#### Scenario: Any index for the element-keyed read is measured, additive and independently revertable
- GIVEN the element-filtered read's query plan
- WHEN an index is considered for it
- THEN one MUST ship only if a measured plan justifies it, MUST be purely additive, MUST be revertable independently of the rest of this change, and MUST NOT replace or drop any existing index

#### Scenario: The installation-wide read keeps its covering index
- GIVEN the composite index on `ReviewSession(status, completedAt, id)` that keeps the unscoped read off a full table scan and filesort
- WHEN the schema and migration directory are inspected after this change
- THEN that index MUST still exist unchanged — the element-keyed read MUST NOT be read as license to drop it or to alter it
