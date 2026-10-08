# Delta for Review History

## MODIFIED Requirements

### Requirement: A Representative's Community-Scoped Completed Review History

The system MUST let a `COMMUNITY_REPRESENTATIVE` list the `completed`
review sessions of **every community they are actively assigned to**,
**including sessions they did not perform**, **plus every `completed`
session they personally performed on any community, whether or not they
hold an active assignment to it**. A session that belongs to a community
the caller holds no active representative assignment to, and that the
caller did not perform, MUST NOT appear. When the caller is actively
assigned to more than one community, the result MUST be a single flat
list covering all of them, ordered by completion time exactly as the
own-history list is; a session that is both in an assigned community and
performed by the caller MUST appear exactly once. An empty result MUST be
a successful empty list, never an error.
(Previously: only sessions of actively assigned communities; a session the caller performed on a community they were not actively assigned to did not appear.)

#### Scenario: A representative sees a session they did not perform
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C, and a `MAINTENANCE_TECHNICIAN` has completed a session for C
- WHEN the representative requests their community review history
- THEN the response MUST be 2xx and MUST contain that technician-performed session

#### Scenario: Another community's sessions never appear
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C and not to community D, completed sessions exist for both, and none of D's was performed by the caller
- WHEN they request their community review history
- THEN only C's sessions MUST be returned and no session of D MUST appear in the result under any field
(Previously: no "none of D's was performed by the caller" qualifier.)

#### Scenario: Multiple assignments produce one flat list
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to communities C and D, each with completed sessions
- WHEN they request their community review history
- THEN a single list MUST be returned containing the completed sessions of both, each row identifying its own community

#### Scenario: An own session outside the assigned communities is listed
- GIVEN representative R actively assigned to community C, who performed `completed` session S on community D to which R holds no active assignment
- WHEN R requests their review history
- THEN S MUST be listed alongside C's sessions, in the same completion-time order, and no other session of D MUST appear

#### Scenario: A session both assigned and own appears once
- GIVEN representative R actively assigned to community C who performed `completed` session S on C
- WHEN R requests their review history
- THEN S MUST appear exactly once

### Requirement: The Five Visibility Scopes Apply at Entry Level

The element-keyed read MUST resolve visibility through the **same five**
scopes the session-level history already ships, applied to the element's
**entries** rather than to whole sessions. No sixth scope, no narrower
technician rule and no element-specific exception MUST be invented, and
no scope MUST be widened beyond the representative's own-entries
relaxation below.

| Caller | Entries returned for element E |
|---|---|
| `MAINTENANCE_TECHNICIAN` | Exactly the entries **they** recorded on E — and nothing else. Entries recorded by any other performer MUST NOT be returned, whether or not the caller holds an active assignment to E's community |
| `COMMUNITY_REPRESENTATIVE` | **Every** entry on E, regardless of who recorded it, **iff** they hold an **active** representative assignment to E's community; otherwise exactly the entries **they** recorded on E, and nothing else |
| `MAINTENANCE_COMPANY_MANAGER` | Exactly the entries whose session carries their **own** company as its frozen performing-company attribution — across every technician of that company. An entry whose session carries **no** attribution MUST NOT be returned to any company manager. A caller whose own maintenance company is absent MUST receive nothing |
| `SYSTEM_ADMIN` | **Every** entry on E, unconditionally |
| `MANAGER` holding `VIEW_ALL_REVIEWS` | **Every** entry on E, identical to `SYSTEM_ADMIN` — same rows, same order, same fields, with no manager variant |
| `MANAGER` without the capability | Nothing |
(Previously: the representative row ended "otherwise nothing".)

A technician's own entries MUST stay readable permanently, exactly as at
session level: a deactivated community assignment MUST NOT retroactively
hide work the caller personally performed. The relaxation MUST stay
bounded to their own entries — a deactivated technician MUST still see
**no** entry recorded by anyone else. The same holds for a
`COMMUNITY_REPRESENTATIVE`: a deactivated representative assignment MUST
NOT hide the entries the caller recorded, and MUST still leave **no**
entry recorded by anyone else visible.
(Previously: the paragraph named the technician only.)

An unresolvable scope MUST fail **closed** and MUST short-circuit
**before** any review-session data access: an absent company and an
absent or unresolved `VIEW_ALL_REVIEWS` capability MUST each produce no
result rather than a wider one. An absent active representative
assignment MUST NOT widen the result and MUST narrow it to the caller's
own entries.
(Previously: an absent active representative assignment produced no result.)

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

#### Scenario: A deactivated representative sees only their own entries
- GIVEN element E on community C reviewed in a session performed by representative R and in another performed by technician W, and R's representative assignment to C deactivated
- WHEN R requests E's history
- THEN exactly R's own entry MUST be returned and W's entry MUST NOT appear

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
(Previously: unchanged table; the representative-without-assignment row now applies only when that caller also recorded no entry on the element, since a non-empty scoped set is always 2xx.)

The asymmetry is deliberate and MUST NOT be "corrected": the first three
scopes reach an element through a relation to the **element's own
context** — the whole installation, or an active assignment to its
community — so an empty record is a true and disclosable fact about an
element they are already entitled to see. The technician's and the
company manager's scopes are **session-derived**: they have no relation
to an element they have never reviewed, so for them "no entries in scope"
**is** "not reachable", and returning an empty list would disclose the
element's existence to a caller with no entitlement to know it. A
representative without an active assignment to the element's community is
in the same position: only their own entries are in scope, so an empty
set is "not reachable".

A **non-empty** scoped entry set MUST always produce 2xx, for every role.
Partial visibility MUST NOT escalate to a 404: a caller who can see one
of an element's five entries MUST receive that one entry, not a rejection.
This includes a deactivated representative who recorded an entry on the
element.

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
- GIVEN element E on community D, a `COMMUNITY_REPRESENTATIVE` actively assigned only to community C, and a second representative whose assignment to D has been deactivated, neither of whom recorded an entry on E
- WHEN each requests E's history
- THEN both MUST receive `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable from a nonexistent element
(Previously: no "neither of whom recorded an entry on E" qualifier.)

#### Scenario: A deactivated representative who recorded an entry reaches the element
- GIVEN element E on community D with an entry recorded by representative R, whose assignment to D has been deactivated
- WHEN R requests E's history under D's path
- THEN the response MUST be 2xx carrying E's header and exactly R's own entry(ies), not a 404

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

### Requirement: An Out-of-Scope Historical Session Is Indistinguishable From a Nonexistent One

This is a security requirement, not a UX preference. A session
identifier that the caller cannot see MUST be rejected with `404
REVIEW_SESSION_NOT_FOUND` — the **same** status, error code and message
as an identifier that matches no session anywhere in the installation,
carrying no field, hint or payload difference between them. No distinct
error code MUST exist for "exists, but not yours", and no response MUST
disclose that the session exists.

#### Scenario: An out-of-scope session behaves exactly like a nonexistent one
- GIVEN a `completed` session S the caller cannot see, and a well-formed session identifier matching no session at all
- WHEN the caller requests each in turn through the history detail read
- THEN both responses MUST be `404 REVIEW_SESSION_NOT_FOUND` with identical status, error code and message

#### Scenario: Another technician's completed session is not disclosed
- GIVEN technician W completed session S, and technician U did not perform it
- WHEN U requests S by id
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, indistinguishable from a nonexistent session

#### Scenario: Another community's completed session is not disclosed
- GIVEN a `completed` session S on community D performed by someone other than the representative, and a representative actively assigned only to community C
- WHEN the representative requests S by id
- THEN the response MUST be `404 REVIEW_SESSION_NOT_FOUND`, indistinguishable from a nonexistent session
(Previously: no "performed by someone other than the representative" qualifier; a session on D that the representative performed is now in scope.)

#### Scenario: No "exists but not yours" error code is introduced
- GIVEN the application's declared error codes after this change
- WHEN they are inspected
- THEN none MUST distinguish an out-of-scope session from an unknown one

### Requirement: History Access Requires a Currently Active Community Assignment, Except for One's Own Performed Sessions

**Reversed with the product owner (2026-09-09), superseding the
2026-09-08 confirmation.** A `MAINTENANCE_TECHNICIAN` MUST always be able
to see the sessions they **personally performed**, regardless of whether
their community assignment is still active: the performer relation alone
confers scope over the caller's own work, permanently. A deactivated
assignment MUST NOT retroactively hide a technician's own completed
sessions, in the list or by id.

**Extended to the `COMMUNITY_REPRESENTATIVE` (product owner, 2026-10-08).**
A representative MUST likewise always be able to see the sessions they
**personally performed**, on any community, regardless of whether their
representative assignment is still active, in the list, by id and in the
review document.

The active-assignment requirement stays fully in force for every history
scope that reaches sessions the caller did **not** perform through a
community assignment. A `COMMUNITY_REPRESENTATIVE` whose representative
assignment to a community has been deactivated MUST lose access to every
session of that community **that someone else performed** — retroactively,
on their next request, with no grace period and no cached grant, and
indistinguishably from a nonexistent session. A technician whose
assignment has been deactivated MUST still see **no** session performed
by anyone else on that community — the reversal widens nothing beyond
their own work, and the representative extension widens nothing beyond
theirs.

The `MAINTENANCE_COMPANY_MANAGER` scope is outside this requirement
entirely: it involves no community assignment, and no assignment
deactivation MUST affect it.
(Previously: named *…, Including for One's Own Sessions*, and required an
active community assignment for the caller's own performed sessions too;
then, until 2026-10-08, the own-session exception covered technicians only
and a deactivated representative lost every session of the community,
including ones they performed.)

#### Scenario: A technician's own completed session stays readable after their assignment is deactivated
- GIVEN a `MAINTENANCE_TECHNICIAN` actively assigned to community C who successfully reads back their own `completed` session S for C
- WHEN their technician assignment to C is deactivated and they repeat the same request
- THEN S MUST still appear in their own history and requesting S by id MUST still return its full recorded record

#### Scenario: A deactivated technician gains nothing beyond their own work
- GIVEN technician U, whose assignment to community C has been deactivated, and a `completed` session S on C performed by technician W
- WHEN U requests their history and requests S by id
- THEN S MUST NOT be listed and the by-id request MUST return `404 REVIEW_SESSION_NOT_FOUND`

#### Scenario: A representative loses others' community history on deactivation
- GIVEN a `COMMUNITY_REPRESENTATIVE` actively assigned to community C who successfully lists C's completed sessions, which were performed by technician W
- WHEN their representative assignment to C is deactivated and they repeat the same request
- THEN C's sessions MUST no longer be returned, and requesting any of them by id MUST return `404 REVIEW_SESSION_NOT_FOUND`
(Previously: "A representative loses community history on deactivation", for every C session.)

#### Scenario: A deactivated representative keeps their own completed session
- GIVEN representative R who performed and signed `completed` session S on community C, and whose representative assignment to C is then deactivated
- WHEN R lists their history and requests S by id
- THEN S MUST be listed and the by-id request MUST return S's full recorded record

#### Scenario: A deactivated representative gains nothing beyond their own work
- GIVEN representative R, whose assignment to community C has been deactivated, and a `completed` session S on C performed by technician W
- WHEN R lists their history and requests S by id
- THEN S MUST NOT be listed and the by-id request MUST return `404 REVIEW_SESSION_NOT_FOUND`, identical to an unknown identifier

#### Scenario: A representative's access returns with a new active assignment
- GIVEN a representative whose assignment to community C was deactivated and whose C history, other than their own sessions, is consequently empty
- WHEN they are actively assigned to C again and repeat the request
- THEN the previously hidden completed sessions MUST be visible again

#### Scenario: Deactivation takes effect on the next request
- GIVEN a `COMMUNITY_REPRESENTATIVE` who has just read a session of community C performed by someone else
- WHEN their assignment is deactivated and the identical request is issued immediately afterwards
- THEN the request MUST already be refused with `404 REVIEW_SESSION_NOT_FOUND` — no cached grant, no grace period

#### Scenario: A manager's history is unaffected by any assignment change
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` of company X, and the deactivation of every community assignment held by X's technicians
- WHEN the manager repeats their company history request
- THEN the same completed sessions MUST still be returned
