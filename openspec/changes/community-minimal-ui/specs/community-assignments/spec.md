# Delta for Community Assignments

## ADDED Requirements

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
