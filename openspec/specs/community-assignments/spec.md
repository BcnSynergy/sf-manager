# Community Assignments

## Purpose

Representative and technician assignment lifecycle for a `Community`:
add, deactivate, reactivate. Enforces the single-active-representative-
per-community invariant, role eligibility gating at assignment time,
and the multi-community representative warning. Technicians have no
exclusivity. Community-scoped authorization is out of scope in this
slice — an active assignment grants no API permission (see
`authorization` spec).

## Requirements

### Requirement: Add Representative — Eligibility Gate

The system MUST allow adding a user as a community's representative
only if that user's current global `role` is exactly
`COMMUNITY_REPRESENTATIVE`.

#### Scenario: Eligible user added as representative
- GIVEN a user whose global role is `COMMUNITY_REPRESENTATIVE`
- WHEN an admin adds them as a community's representative
- THEN the response MUST be 2xx and the assignment MUST be created active

#### Scenario: Ineligible role rejected
- GIVEN a user whose global role is not `COMMUNITY_REPRESENTATIVE`
- WHEN an admin attempts to add them as a community's representative
- THEN the response MUST be a 4xx domain error and no assignment MUST be created

### Requirement: Single Active Representative Per Community

The system MUST guarantee exactly one active representative per
community at any time. Activating a representative for a community
MUST auto-deactivate the currently active representative **of that
same community only**.

#### Scenario: Activating a new representative deactivates the previous one
- GIVEN community C has representative A currently active
- WHEN an admin activates representative B for community C
- THEN B MUST become active, A MUST become inactive, and exactly one representative MUST remain active for C

#### Scenario: Activation in a different community is unaffected
- GIVEN representative A is active in community C1
- WHEN an admin activates representative B for a different community C2
- THEN A MUST remain active in C1, unaffected by B's activation in C2

### Requirement: Representative Reactivation

The system MUST allow reactivating a previously deactivated
representative record; deactivated records MUST persist (not be
deleted) and remain reactivable at any time. Reactivation MUST
re-apply the single-active-representative invariant.

#### Scenario: Reactivating a deactivated representative re-applies exclusivity
- GIVEN representative A was previously deactivated for community C, and representative B is currently active for C
- WHEN an admin reactivates A
- THEN A MUST become active, B MUST become inactive, and exactly one representative MUST remain active for C

#### Scenario: Reactivation rejected for a soft-deleted user
- GIVEN a deactivated assignment whose associated user has been soft-deleted in `users`
- WHEN an admin attempts to reactivate that assignment
- THEN the response MUST be a 4xx domain error and the assignment MUST remain inactive

### Requirement: Multi-Community Representative Warning

The system MUST allow a user to be an active representative in more
than one community simultaneously — this MUST NOT be blocked. WHEN
an activation results in that representative being active in more
than one community, the response MUST include a warning payload; the
activation itself MUST still succeed.

#### Scenario: Activating a representative already active elsewhere succeeds with a warning
- GIVEN representative A is already active in community C1
- WHEN an admin activates A for a different community C2
- THEN the response MUST be 2xx, A MUST be active in both C1 and C2, and the response body MUST include a warning

#### Scenario: First-time activation carries no warning
- GIVEN representative A is not currently active in any community
- WHEN an admin activates A for community C1
- THEN the response MUST be 2xx and MUST NOT include a warning

### Requirement: Add Technician — Eligibility Gate, No Exclusivity

The system MUST allow adding a user as a community's technician only
if that user's current global `role` is exactly
`MAINTENANCE_TECHNICIAN`. Technicians have no exclusivity: multiple
technicians MUST be able to be active in the same community
simultaneously, and the same technician MUST be able to be active
across multiple communities — with no warning ever emitted for
technicians.

#### Scenario: Eligible user added as technician
- GIVEN a user whose global role is `MAINTENANCE_TECHNICIAN`
- WHEN an admin adds them as a community's technician
- THEN the response MUST be 2xx and the assignment MUST be created active

#### Scenario: Ineligible role rejected
- GIVEN a user whose global role is not `MAINTENANCE_TECHNICIAN`
- WHEN an admin attempts to add them as a community's technician
- THEN the response MUST be a 4xx domain error and no assignment MUST be created

#### Scenario: Multiple technicians active in the same community
- GIVEN eligible technicians A and B
- WHEN both are added active to the same community C
- THEN both MUST remain active simultaneously and neither response MUST include a warning

#### Scenario: Same technician active across multiple communities
- GIVEN technician A is active in community C1
- WHEN A is also added active to a different community C2
- THEN A MUST be active in both C1 and C2, with no warning in either response

### Requirement: Technician Deactivation and Reactivation

The system MUST allow deactivating and reactivating a technician
assignment as a reversible toggle (deactivated ≠ deleted), applying
no exclusivity rule. The same soft-deleted-user rejection rule as
representatives applies.

#### Scenario: Reactivating a deactivated technician succeeds
- GIVEN a technician assignment previously deactivated for community C
- WHEN an admin reactivates it
- THEN the response MUST be 2xx and the assignment MUST become active, with no effect on any other technician's status

#### Scenario: Reactivation rejected for a soft-deleted user
- GIVEN a deactivated technician assignment whose associated user has been soft-deleted in `users`
- WHEN an admin attempts to reactivate it
- THEN the response MUST be a 4xx domain error and the assignment MUST remain inactive

### Requirement: Eligibility Drift Accepted (Interim Policy)

The system MUST NOT block, nor cascade-deactivate, an active
representative or technician assignment when a `SYSTEM_ADMIN` changes
that user's global role via `/users`, even when the new role no
longer matches the role required by the list the user is actively
assigned to. This is an interim policy pending a future
`ReviewSession`-based rule (out of scope in this slice).

#### Scenario: Changing an actively-assigned user's role leaves the assignment untouched
- GIVEN user U is the active representative of community C with global role `COMMUNITY_REPRESENTATIVE`
- WHEN a `SYSTEM_ADMIN` changes U's global role to a different role via `/users`
- THEN the role-change request MUST succeed (2xx) and U's representative assignment for C MUST remain active and unchanged

### Requirement: Representative Deactivation on Community Soft-Delete

WHEN a `Community` is soft-deleted, the system MUST check that
community's currently active representative assignment, if one
exists (already-inactive/historical representative records for that
community require no change). If the assigned user is not currently
active as representative in any other community, the system MUST
deactivate that assignment using the same `deactivatedAt` mechanism
as any other deactivation — no new field or marker is introduced. If
the assigned user is currently active as representative in at least
one other community, the system MUST leave that assignment
unchanged. Soft-deleting a `Community` MUST NOT perform any operation
on that community's technician assignments, active or deactivated.

#### Scenario: Sole-community representative deactivated on community soft-delete
- GIVEN representative A is active only in community C, with no other active representative assignment
- WHEN community C is soft-deleted
- THEN A's representative assignment for C MUST become deactivated via `deactivatedAt`

#### Scenario: Representative active elsewhere is untouched on community soft-delete
- GIVEN representative A is active in community C and also active in community C2
- WHEN community C is soft-deleted
- THEN A's representative assignment for C MUST remain active, still referencing C

#### Scenario: Already-inactive representative record requires no change on community soft-delete
- GIVEN community C has no currently active representative, only a previously deactivated representative record
- WHEN community C is soft-deleted
- THEN that deactivated representative record MUST remain unchanged

#### Scenario: Technician assignments are unaffected by community soft-delete
- GIVEN community C has active and deactivated technician assignments
- WHEN community C is soft-deleted
- THEN none of those technician assignments MUST be created, modified, or deactivated as a result

### Requirement: List Community Assignments

The system MUST allow an authenticated `SYSTEM_ADMIN` to list a
community's representative and technician assignments, including
both active and deactivated records, by community id.

#### Scenario: Admin lists a community's assignments
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a community with representatives and technicians exists
- WHEN they call the list-assignments endpoint for that community
- THEN the response MUST be 2xx and MUST include both representative and technician assignments, active and deactivated

### Requirement: Assignment 409 Error Codes

The system MUST include a `code` field on every 409 response from the
assignment routes (`POST` assign representative/technician,
`reactivate` representative/technician), discriminating the business
cause: `ASSIGNMENT_ALREADY_EXISTS`, `INELIGIBLE_ROLE`, or
`TRANSACTION_CONFLICT`. The existing `statusCode`, `error`, and
`message` fields MUST be unchanged — `code` is additive and
non-breaking, so clients can distinguish these causes without parsing
the (English, non-localizable) `message` string. 404 and 400
responses on these routes are untouched by this requirement.

#### Scenario: 409 responses carry a machine-readable cause
- GIVEN an assign or reactivate request fails with 409
- WHEN the response body is inspected
- THEN it MUST include a `code` field equal to one of
  `ASSIGNMENT_ALREADY_EXISTS`, `INELIGIBLE_ROLE`, or
  `TRANSACTION_CONFLICT`, matching the actual business cause
- AND `statusCode`, `error`, and `message` MUST still be present,
  unchanged in shape

#### Scenario: Already-assigned 409 is distinguishable from ineligible-role 409
- GIVEN a `POST` assign request fails because the target user already
  has an assignment (active or deactivated) for that role in that
  community
- WHEN the response body is inspected
- THEN `code` MUST be `ASSIGNMENT_ALREADY_EXISTS`, distinct from the
  `code` an `INELIGIBLE_ROLE` or `TRANSACTION_CONFLICT` failure would
  carry

#### Scenario: Ineligible-role 409 is distinguishable from the other two
- GIVEN a `POST` assign request fails because the target user's
  current global role does not match the assignment type
- WHEN the response body is inspected
- THEN `code` MUST be `INELIGIBLE_ROLE`, distinct from
  `ASSIGNMENT_ALREADY_EXISTS` and `TRANSACTION_CONFLICT`

#### Scenario: Transaction-conflict 409 is distinguishable from the other two
- GIVEN an assign or reactivate request fails due to a genuine
  transaction conflict, not a business-rule rejection
- WHEN the response body is inspected
- THEN `code` MUST be `TRANSACTION_CONFLICT`, distinct from
  `ASSIGNMENT_ALREADY_EXISTS` and `INELIGIBLE_ROLE`

#### Scenario: 404 and 400 responses on assignment routes are unaffected
- GIVEN an assign, deactivate, or reactivate request fails with 404
  (unknown community, user, or assignment) or 400 (validation)
- WHEN the response body is inspected
- THEN it MUST NOT include a `code` field added by this requirement
