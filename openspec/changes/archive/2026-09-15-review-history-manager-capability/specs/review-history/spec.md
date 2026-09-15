# Delta for Review History

> **Purpose amendment (for archive):** the capability's Purpose adds the
> read side for "**four** visibility scopes" and lists, as deliberately
> deferred, "the `MANAGER` half of global visibility and therefore the
> whole `ManagerCapability` mechanism". After this change there are
> **five** scopes: a `MANAGER` holding the `VIEW_ALL_REVIEWS` capability
> (ADR-011 Decision 2) sees **every** `completed` session in the
> installation, identically to a `SYSTEM_ADMIN`, and a `MANAGER` without
> it sees nothing. The fifth scope resolves neither from an assignment,
> nor a company, nor the role alone, but from a per-user capability read
> fresh from the database on every request. FR-008's role-based visibility
> axis closes here; **per-element** history remains the only deferred
> half. No new repository read, route or port signature ships: the granted
> manager reuses the single unscoped pair the admin scope introduced.

## ADDED Requirements

### Requirement: A Granted Manager's Installation-Wide Completed Review History

The system MUST let a `MANAGER` holding the `VIEW_ALL_REVIEWS` capability
list **every** `completed` review session in the installation, and open
any of them by identifier — the **same** result, in the **same** order,
with the **same** row shape as *A System Admin's Installation-Wide
Completed Review History* produces for a `SYSTEM_ADMIN`. There MUST be no
manager-specific variant: no reduced result, no enriched result, no extra
or missing row field, and no separate route.

It MUST be served by the **same** unscoped read pair the admin scope
already ships. No new repository method, no new route and no
`ReviewSessionRepository` port signature change MUST be introduced, and
the read MUST NOT be re-expressed as a scoped read issued with an empty,
wildcard or null scope value.

Visibility MUST NOT be reduced by deleted or deactivated context, exactly
as for the admin: a session whose community, attributed maintenance
company or performer has been deactivated or soft-deleted, and a session
carrying no performing-company attribution at all, MUST still be listed
and readable by id. `VIEW_ALL_REVIEWS` means literally everything.

The `completed`-only rule MUST still hold: a `draft` MUST NOT appear in
this list and MUST NOT be readable through the history detail read by
this actor either. An empty installation MUST produce a successful empty
list, never an error.

#### Scenario: A granted manager sees every completed session
- GIVEN completed sessions attributed to companies X and Y, on communities C and D, performed by three different technicians, and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN they request review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: The granted manager's list is identical to the admin's
- GIVEN the same installation, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN both request review history and both lists are compared
- THEN they MUST contain exactly the same sessions, in exactly the same order, with exactly the same row fields

#### Scenario: Deleted or deactivated context hides nothing from the granted manager
- GIVEN a `completed` session on a soft-deleted community, one attributed to a soft-deleted maintenance company, and one carrying no attributed company at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests review history and opens each of the three
- THEN all three MUST be listed and each MUST return its full recorded record

#### Scenario: The granted manager reads back any completed session
- GIVEN a `completed` session S performed by a technician of company X on community C, and a `MANAGER` holding `VIEW_ALL_REVIEWS` with no relationship to either
- WHEN they open S
- THEN the response MUST be 2xx and MUST return the same recorded record the performer and the admin would see, with no manager-specific variant

#### Scenario: An empty installation renders a successful empty list
- GIVEN an installation with no `completed` session at all
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

#### Scenario: Drafts and unknown ids still 404 for the granted manager
- GIVEN one `draft` session and a well-formed session identifier matching no session anywhere
- WHEN a `MANAGER` holding `VIEW_ALL_REVIEWS` requests each through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code and message

#### Scenario: The fifth scope adds no repository read
- GIVEN the `ReviewSessionRepository` port and its adapters before and after this change
- WHEN their methods and signatures are compared
- THEN they MUST be identical — the granted manager MUST be served by the existing unscoped list/by-id pair, with no method added, removed or re-signed

### Requirement: An Ungranted Manager Reads Nothing

A `MANAGER` who does **not** hold `VIEW_ALL_REVIEWS` MUST read nothing
through the history surface, and MUST be **observably identical** to the
role's behaviour before this change. This is a binding regression
requirement, to be proven rather than asserted: the list MUST be empty
and every by-id request MUST be `404 REVIEW_SESSION_NOT_FOUND`,
indistinguishable in status, code and message from a nonexistent
session, on **every** history route — proven for each route, not sampled.

The empty result MUST be produced **before** any review-session data
access: an absent capability MUST short-circuit, and MUST NOT fall
through to the unscoped read, to a scoped read with an empty or null
scope value, or to any post-hoc filtering of a broader result set.

The ungranted state MUST be the default and MUST be recoverable only by
an explicit grant. A newly created `MANAGER` MUST hold no capability; a
`MANAGER` whose capability was revoked MUST read nothing from their very
next request; a user changed away from `MANAGER` and later changed back
MUST hold **no** capability; and a soft-deleted `MANAGER` MUST read
nothing regardless of what their record carries.

#### Scenario: An ungranted manager's list is empty on every route
- GIVEN completed sessions existing across two companies and two communities, and an authenticated `MANAGER` holding no capability
- WHEN they request the history list
- THEN the response MUST be 2xx carrying an empty list

#### Scenario: An ungranted manager's by-id read is indistinguishable from nonexistent
- GIVEN any `completed` session in the installation and an authenticated `MANAGER` holding no capability
- WHEN they request it by id, and separately request a well-formed identifier matching no session
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, error code and message, disclosing nothing about the session's existence

#### Scenario: An ungranted manager reaches no repository call
- GIVEN an authenticated `MANAGER` holding no capability
- WHEN they call the history list and the history by-id read
- THEN no `ReviewSessionRepository` read MUST be issued for either request

#### Scenario: An absent capability never widens the query
- GIVEN the manager history path after this change
- WHEN its data access is inspected
- THEN an unresolved or absent capability MUST NOT issue the unscoped read, MUST NOT issue any read with an empty, wildcard or null scope value, and MUST NOT fetch-then-filter

#### Scenario: A newly created manager holds no capability
- GIVEN a `SYSTEM_ADMIN` creates a new `MANAGER`
- WHEN that manager requests review history
- THEN the list MUST be empty — creation MUST offer no way to hold a capability

#### Scenario: A revoked manager reads nothing from the next request
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` who has just listed every completed session
- WHEN the capability is revoked and they repeat the identical request without logging out or back in
- THEN the list MUST be empty

#### Scenario: A role round trip leaves no capability behind
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` whose role is changed to another role and later changed back to `MANAGER`
- WHEN they request review history
- THEN the list MUST be empty — the previously granted capability MUST NOT have survived the round trip

#### Scenario: A soft-deleted manager holding the capability reads nothing
- GIVEN a `MANAGER` whose record holds `VIEW_ALL_REVIEWS` and who has since been soft-deleted
- WHEN a history request is made on their behalf
- THEN it MUST return nothing

## MODIFIED Requirements

### Requirement: A System Admin's Installation-Wide Completed Review History

The system MUST let a `SYSTEM_ADMIN` list **every** `completed` review
session in the installation — across every maintenance company, every
community, every performer and all time — **with no scope narrowing of
any kind**. The absence of a scope filter is the requirement, not an
omission: it MUST be intended, asserted and preserved, and a later change
that re-introduces any narrowing on this read MUST be treated as a
regression.

The result MUST be a single flat list in the same deterministic
chronological order by completion time, and in the same direction, as
every other scope's list, including a granted `MANAGER`'s (see *A Granted
Manager's Installation-Wide Completed Review History*), whose list is
this same read and is therefore identical to the admin's, session for
session and in the same order. An empty installation MUST produce a
successful empty list, never an error.

Because this list spans companies, communities and performers, every row
MUST identify its community and **who performed** the session, exactly as
the company-wide list already does. No additional row field is required
by this scope.

Visibility MUST NOT be reduced by deleted or deactivated context — this
and the granted-manager scope are now the **two** scopes with no
exceptions:

| Case | Required behaviour |
|---|---|
| The session's community has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session's attributed maintenance company has been deactivated or soft-deleted | The session MUST still be listed and readable by id |
| The session carries no performing-company attribution at all | The session MUST still be listed and readable by id |
| The session's performer has been deactivated or soft-deleted, or has changed employer | The session MUST still be listed and readable by id |

This deliberately diverges from the technician, representative and
company-manager scopes, where deactivated context removes visibility. The
purpose here — as for a granted manager — is total system audit, not
operational scoping: deleted context MUST NOT hide a compliance record
from the auditor.

The `completed`-only rule MUST still hold: a `draft` MUST NOT appear in
this list and MUST NOT be readable through the history detail read by
this actor either.
(Previously: described as diverging from "the other three scopes" and
ordering compared against "the other three scopes' lists" — both counts
now understate the picture, since a granted `MANAGER`'s scope is the
identical read and therefore shares this scope's every property,
including the no-narrowing behaviour and the deactivated/deleted-context
exceptions table. The divergence from the technician, representative and
company-manager scopes — the three that still narrow — is otherwise
unchanged.)

#### Scenario: The admin sees every completed session in the installation
- GIVEN completed sessions attributed to companies X and Y, on communities C and D, performed by three different technicians
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx and MUST contain every one of those sessions in one flat list, in deterministic chronological order by completion time

#### Scenario: The ordering matches every other scope's list, including a granted manager's
- GIVEN the same set of completed sessions visible to a technician, a representative, a company manager, a `SYSTEM_ADMIN` and a `MANAGER` holding `VIEW_ALL_REVIEWS`
- WHEN each list is compared
- THEN the relative order of any two sessions present in more than one of them MUST be identical, and the admin's and the granted manager's lists MUST be identical session for session

#### Scenario: A deactivated community's sessions remain visible
- GIVEN a `completed` session on a community that has since been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` requests review history and opens that session
- THEN it MUST be listed and its full recorded record MUST be returned

#### Scenario: A soft-deleted or absent company does not hide a session
- GIVEN a `completed` session attributed to a soft-deleted maintenance company, and another carrying no attributed company at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN both MUST appear — even though the unattributed one appears in no company manager's list

#### Scenario: An empty installation renders a successful empty list
- GIVEN an installation with no `completed` session at all
- WHEN a `SYSTEM_ADMIN` requests review history
- THEN the response MUST be 2xx carrying an empty list, and MUST NOT be an error

#### Scenario: Drafts never appear for the admin either
- GIVEN the installation holds one `draft` session and one `completed` session
- WHEN a `SYSTEM_ADMIN` requests review history and requests the draft by id
- THEN only the `completed` session MUST be listed, and the draft's by-id request MUST be rejected as `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A nonexistent id still 404s for the admin
- GIVEN a well-formed session identifier matching no session anywhere in the installation
- WHEN a `SYSTEM_ADMIN` requests it through the history detail read
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical in status, code and message to the draft rejection above

#### Scenario: Each row identifies its community and its performer
- GIVEN an admin's installation-wide history spanning several communities and several performers
- WHEN the rows are inspected
- THEN each MUST identify the community the session belongs to and the user who performed it

#### Scenario: The unscoped read is asserted, not merely unfiltered by accident
- GIVEN the admin history read after this change
- WHEN a scope narrowing — by community, by company, by performer, by the liveness of any of them — is re-introduced into it
- THEN a test MUST fail, proving the absence of narrowing is asserted behaviour

### Requirement: Scoped Read-Back of One Historical Session

The system MUST let an authorized caller open one `completed` session
within their visibility scope and read back its full recorded record —
every element review entry with its answers and its observations,
including elements left unreviewed with their recorded reason. The
read-back MUST be available to the session's performer; to a
`COMMUNITY_REPRESENTATIVE` **who did not perform it**, for a session on a
community they are actively assigned to; to a
`MAINTENANCE_COMPANY_MANAGER` **who did not perform it**, for a session
attributed to their own maintenance company; to a `SYSTEM_ADMIN`, for
**any** `completed` session in the installation, whose scope is the whole
installation (see *A System Admin Can Read Any Completed Session by
Identifier*); and to a `MANAGER` holding `VIEW_ALL_REVIEWS`, for **any**
`completed` session in the installation on exactly the same terms (see
*A Granted Manager's Installation-Wide Completed Review History*). All
five MUST receive the identical record — there MUST be no reduced or
role-specific variant of the recorded record. The record MUST be returned
as it was answered, paired with the template snapshot's wording, per
*Sessions Render the Template's Frozen Snapshot*. Each entry MUST carry
the identity of the inspectable element it records — a record whose
entries cannot be attributed to a physical element is not a compliance
record.
(Previously: available to the performer, an actively assigned
representative, the manager of the attributed company and a
`SYSTEM_ADMIN` — four callers, with no capability-gated caller.)

#### Scenario: A performer reads back their own completed session
- GIVEN a `MAINTENANCE_TECHNICIAN` completed a session with three elements answered and one marked unreviewed with a reason
- WHEN they open that session from their history
- THEN the response MUST be 2xx and MUST return all four entries with their recorded answers, snapshotted question wording, and the unreviewed element's reason

#### Scenario: A representative reads back a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C, and a technician-performed `completed` session S for C
- WHEN the representative opens S from their history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: A manager reads back a session performed under their company
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X and a `completed` session S attributed to X, performed by one of X's technicians on a community the manager has no relationship to
- WHEN the manager opens S from their company history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: An admin reads back a session from any company or community
- GIVEN a `SYSTEM_ADMIN` and a `completed` session S attributed to any company, on any community, performed by anyone
- WHEN the admin opens S from their history
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see, with no admin-specific variant

#### Scenario: A granted MANAGER reads back the identical record
- GIVEN a `MANAGER` holding `VIEW_ALL_REVIEWS` and the same `completed` session S the admin just read back
- WHEN they open S
- THEN the response MUST be 2xx and MUST return byte-for-byte the same recorded record the admin received, with no manager-specific variant

#### Scenario: An ungranted MANAGER gets no read-back
- GIVEN a `MANAGER` holding no capability and any `completed` session S
- WHEN they open S
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: Each entry identifies the element it records
- GIVEN a `completed` session read back through history
- WHEN its entries are inspected
- THEN each entry MUST carry the identity of the inspectable element it records

#### Scenario: An element removed after completion does not drop its entry
- GIVEN a `completed` session one of whose inspectable elements was decommissioned or soft-deleted after completion
- WHEN the session is read back through history
- THEN that entry MUST still be returned with its answers and observations, with the element identity absent rather than the entry omitted

#### Scenario: Read-back survives later edits to the live question pool
- GIVEN a `completed` session and subsequent edits to the live `ChecklistQuestion` pool
- WHEN the session is read back through history
- THEN each answer MUST still be paired with the snapshotted wording that was answered

### Requirement: A System Admin Can Read Any Completed Session by Identifier

The system MUST let a `SYSTEM_ADMIN` open **any** `completed` session in
the installation by its identifier and read back its full recorded
record, **unconditionally** — with no scope condition evaluated against
the actor, no community assignment, no company match and no liveness
check on the session's community, company or performer.

The record returned MUST be identical to what the session's performer
would see. There MUST be no admin-specific, reduced or enriched variant.

The only two rejections that remain reachable for this actor are a
session identifier matching nothing at all, and a session whose status is
not `completed`; both MUST be `404 REVIEW_SESSION_NOT_FOUND`, identical
in status, error code and message, per *An Out-of-Scope Historical
Session Is Indistinguishable From a Nonexistent One*.

This unconditional read MUST be reachable by exactly **two** actors: a
`SYSTEM_ADMIN`, whose access is unconditional on anything beyond the
role, and a `MANAGER` for whom `VIEW_ALL_REVIEWS` resolves affirmatively,
whose access is conditional on that capability alone (see *A Granted
Manager's Installation-Wide Completed Review History*). For every other
role — and for a `MANAGER` without the capability — the shipped scope
rules MUST decide the outcome exactly as they did before this change.
(Previously: the read was reachable **only** for a `SYSTEM_ADMIN`, and
every other role, `MANAGER` included, was decided by the shipped scope
rules.)

#### Scenario: The admin opens a session from a company and community they have no relation to
- GIVEN a `completed` session S attributed to company X, performed by X's technician on community C, and a `SYSTEM_ADMIN` with no assignment and no company
- WHEN the admin opens S
- THEN the response MUST be 2xx and MUST return the same recorded record the performer would see

#### Scenario: Deleted context does not block the by-id read
- GIVEN a `completed` session whose community, attributed company and performer have all been deactivated or soft-deleted
- WHEN a `SYSTEM_ADMIN` opens it
- THEN the response MUST be 2xx and MUST return its full recorded record

#### Scenario: The admin's access stays unconditional on any capability
- GIVEN a `SYSTEM_ADMIN` whose user record carries no capability of any kind
- WHEN they open any `completed` session by id
- THEN the response MUST be 2xx — the capability mechanism MUST NOT be consulted for this actor

#### Scenario: No role other than the admin and a granted manager gains the unconditional by-id read
- GIVEN a `MAINTENANCE_TECHNICIAN`, a `COMMUNITY_REPRESENTATIVE`, a `MAINTENANCE_COMPANY_MANAGER` and a `MANAGER` holding no capability, and a `completed` session outside each one's scope
- WHEN each requests that session by id after this change
- THEN each MUST receive `404 REVIEW_SESSION_NOT_FOUND`, exactly as before this change

### Requirement: History Scope Is Carried by the Query, Not by the Caller

Every history read MUST have its visibility scope expressed in the data
access itself, and the system MUST NOT obtain a broader result set and
narrow it in a use case, controller or client. This MUST hold for all
**five** scopes — including the two installation-wide ones, where the
scope **is** the whole installation: that read MUST be a distinct data
access whose only predicate is the `completed` status, never a scoped
read issued with an empty, wildcard or null scope value. A scope that
cannot be resolved MUST still produce no result rather than an unscoped
one, for every role that has a scope to resolve — and an unresolved or
absent `VIEW_ALL_REVIEWS` capability MUST be treated as exactly such an
unresolvable scope.

The installation-wide read MUST be reachable from exactly **two**
enumerable call sites: the `SYSTEM_ADMIN` path, and the `MANAGER` path
after the capability has resolved affirmatively. It MUST be impossible to
reach it while serving any other role or an ungranted `MANAGER`, and it
MUST be named and expressed so that a reader — and an autocomplete list —
cannot mistake it for, or accidentally select it in place of, a scoped
read. *How* this is achieved, and how the shipped property that no read
of a session is available from an identifier alone is restated now that
one such read legitimately exists, is a design decision; *that* the
unscoped read is unreachable from every other path is a requirement.
(Previously: the unscoped read had to be reachable only from the
`SYSTEM_ADMIN` path, and there were four scopes.)

#### Scenario: Exactly one unscoped read exists
- GIVEN the review-session repository port and its adapters after this change
- WHEN the methods that read `completed` sessions are enumerated
- THEN exactly one list method and one by-id method MUST carry no performer, community or maintenance-company scope, and every other method MUST carry one

#### Scenario: The unscoped read is reachable only from the admin and granted-manager paths
- GIVEN the call sites of the unscoped read after this change
- WHEN every one of them is enumerated — no sampling
- THEN there MUST be exactly two, both in the history access resolution: the `SYSTEM_ADMIN` path and the `MANAGER` path guarded by an affirmative capability resolution — and no other use case, service, controller or adapter MUST call it

#### Scenario: Scope is never applied after the fact
- GIVEN the history use cases and routes after this change
- WHEN their data access is inspected
- THEN none MUST fetch sessions outside the caller's scope and filter them afterwards in application, presentation or client code

#### Scenario: An unresolvable company never widens the query
- GIVEN a company-scoped history read whose caller has no maintenance company
- WHEN the data access is inspected
- THEN it MUST NOT be issued without a company predicate, and MUST NOT fall back to an unfiltered read — and in particular MUST NOT fall through to the unscoped read

#### Scenario: An absent capability never widens the query
- GIVEN a `MANAGER` history read whose caller holds no `VIEW_ALL_REVIEWS`
- WHEN the data access is inspected
- THEN no read MUST be issued at all, and the path MUST NOT fall through to the unscoped read

#### Scenario: The scoped reads are not re-expressed as the unscoped one
- GIVEN the technician, representative and company-manager history reads after this change
- WHEN their data access is inspected
- THEN each MUST still carry its own scope predicate, and none MUST be implemented by issuing the unscoped read and narrowing the result

### Requirement: The Deferred Review Visibility Scopes Are Not Built

FR-008's **role-based** visibility axis is now fully built: this change
ships the fifth and last scope (see *A Granted Manager's
Installation-Wide Completed Review History*). **Per-element** history
stays deferred, and FR-008 does **not** close with this change. The
`ManagerCapability` mechanism now exists, but MUST declare exactly one
member, `VIEW_ALL_REVIEWS`, and MUST gate review-history visibility only.
The system MUST NOT introduce any of the following.
(Previously: the `MANAGER` half of global visibility was deferred
entirely, and no `VIEW_ALL_REVIEWS` permission or capability,
`ManagerCapability` enum, `User.managerCapabilities` field, migration or
capability-gated layer, and no `MANAGER` review visibility rule, was
allowed to exist.)

| Deferred | Must not exist |
|---|---|
| ADR-011 Decision 2's other five capabilities | Any declaration, gate, branch, UI or reference to `MANAGE_COMMUNITIES`, `MANAGE_MAINTENANCE_COMPANIES`, `MANAGE_CHECKLIST_CONTENT`, `MANAGE_INSPECTABLE_ELEMENTS` or `MANAGE_ORGANIZATION_PROFILE`, anywhere in `apps/**` or `packages/**`; any capability gating anything other than the review-history read |
| A second unscoped read | Any unscoped "all sessions" query beyond the single shipped pair, and any path reaching that pair while serving a caller who is neither a `SYSTEM_ADMIN` nor a `MANAGER` with an affirmatively resolved capability |
| Capability state outside the database | Any `managerCapabilities` claim in a JWT or token payload, any cached or precomputed capability, and any client-side authorization decision derived from one |
| An audit trail | Any audit table, event or write recording a capability grant, a capability revoke or a role change |
| A narrowed variant of the granted read | Any per-company, per-community or date-bounded variant of `VIEW_ALL_REVIEWS`, and any granted-manager-specific repository method or route |
| Per-element history (FR-008's other half) | Any query, route or use case returning the past reviews of one inspectable element |
| List controls | Any pagination, date-range filter, sorting or search parameter on a history read — including on the installation-wide list, by far the largest |
| Company-attribution history | Any effective-dated employment table, attribution version history, or route/use case that rewrites a session's recorded performing company |

#### Scenario: Exactly one manager capability is declared
- GIVEN the `ManagerCapability` enum, the user model, the schema and the authorization code after this change
- WHEN they are searched for capability names
- THEN exactly one — `VIEW_ALL_REVIEWS` — MUST exist, and none of ADR-011's other five names MUST appear anywhere in `apps/**` or `packages/**`

#### Scenario: The capability lives only in the database
- GIVEN the token payload, the authenticated actor, the current-user endpoint's response and the client's authorization code after this change
- WHEN each is inspected
- THEN none MUST carry `managerCapabilities`, and the capability MUST be re-read from the database on every request with no cache

#### Scenario: Every scoped query still names its scope, and only one query names none
- GIVEN the review-session repository port and its adapters after this change
- WHEN their methods are enumerated
- THEN each company-scoped method MUST take exactly one maintenance-company identifier, each community-scoped method its communities and each performer-scoped method its performer — and exactly one list/by-id pair MUST carry no scope at all

#### Scenario: The company scope never joins to the performer's current company
- GIVEN the company-scoped history queries after this change
- WHEN their predicates are inspected
- THEN each MUST match the session's own recorded performing company, and none MUST resolve membership through the performer's current `User.maintenanceCompanyId`

#### Scenario: No per-element history query or route exists
- GIVEN the routes, use cases and repository queries after this change
- WHEN they are searched for the past reviews of a single element
- THEN none MUST be found

#### Scenario: No list-control parameters are accepted
- GIVEN the history read routes and their request contracts after this change
- WHEN they are inspected
- THEN none MUST accept a page, cursor, limit, offset, date-range, sort or search parameter, on any of the five scopes

#### Scenario: This change adds exactly one additive column and no backfill
- GIVEN the migration directory and `schema.prisma` after this change
- WHEN they are compared with the state before the change
- THEN the only difference MUST be the additive `ManagerCapability` enum and the `User.managerCapabilities` column with an empty default — no table, no backfill, no data migration, and no change to `ReviewSession`

#### Scenario: The installation-wide read keeps its covering index
- GIVEN the composite index on `ReviewSession(status, completedAt, id)` that keeps the unscoped read off a full table scan and filesort
- WHEN the schema and migration directory are inspected after this change
- THEN that index MUST still exist unchanged — a second role reaching the same unscoped read MUST NOT be read as license to drop it, and MUST NOT add a further index to `ReviewSession`
