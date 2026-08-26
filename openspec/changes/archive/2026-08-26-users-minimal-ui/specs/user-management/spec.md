# Delta for User Management

## MODIFIED Requirements

### Requirement: Last-Admin Lockout

The system MUST reject any operation — deactivation or role change
away from `SYSTEM_ADMIN` — that would leave zero active
`SYSTEM_ADMIN` users. `POST`, `PATCH` and `DELETE /users` 409
responses MUST include a `code` field discriminating the business
cause: `EMAIL_ALREADY_IN_USE`, `LAST_SYSTEM_ADMIN`, or
`TRANSACTION_CONFLICT`. The existing `statusCode`, `error` and
`message` fields are unchanged — `code` is additive, non-breaking,
and exists so clients can distinguish these causes without parsing
the (English, non-localizable) `message` string.

#### Scenario: Deactivating the last admin is rejected
- GIVEN exactly one active `SYSTEM_ADMIN` user exists
- WHEN an admin attempts to deactivate that user
- THEN the response MUST be a 4xx error and the user MUST remain active

#### Scenario: Demoting the last admin is rejected
- GIVEN exactly one active `SYSTEM_ADMIN` user exists
- WHEN an admin attempts to change that user's role away from `SYSTEM_ADMIN`
- THEN the response MUST be a 4xx error and the role MUST remain unchanged

#### Scenario: Deactivating an admin when others remain is allowed
- GIVEN two or more active `SYSTEM_ADMIN` users exist
- WHEN an admin deactivates one of them
- THEN the response MUST be 2xx

#### Scenario: 409 responses carry a machine-readable cause
- GIVEN a `POST`, `PATCH` or `DELETE /users` request fails with 409
- WHEN the response body is inspected
- THEN it MUST include a `code` field equal to one of `EMAIL_ALREADY_IN_USE`, `LAST_SYSTEM_ADMIN`, or `TRANSACTION_CONFLICT`, matching the actual business cause
- AND `statusCode`, `error` and `message` MUST still be present, unchanged in shape

#### Scenario: Duplicate-email 409 is distinguishable from last-admin 409
- GIVEN a `POST /users` request fails because the email is already in use
- WHEN the response body is inspected
- THEN `code` MUST be `EMAIL_ALREADY_IN_USE`, distinct from the `code` a `LAST_SYSTEM_ADMIN` or `TRANSACTION_CONFLICT` failure would carry
