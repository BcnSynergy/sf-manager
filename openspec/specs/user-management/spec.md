# User Management

## Purpose

Admin-only CRUD over `User` records: create, list, update, and
deactivate. Introduces password-strength enforcement for admin-set
passwords and the last-admin lockout invariant. No self-service, no
invitation flow, no pagination (proposal Out of Scope).

## Requirements

### Requirement: Create User

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a new
`User` by providing email, an initial password, and a role from the
`Role` enum. The system MUST reject creation if the email is already
in use by an active user.

#### Scenario: Admin creates a user
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they submit a valid email, a password meeting the strength policy, and a role
- THEN the response MUST be 2xx and MUST NOT include the password hash

#### Scenario: Duplicate email rejected
- GIVEN an active user already exists with a given email
- WHEN an admin attempts to create another user with that email
- THEN the response MUST be a 4xx validation error

#### Scenario: Non-admin caller rejected
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they attempt to create a user
- THEN the response MUST be 403

### Requirement: Password Strength Policy

The system MUST enforce a minimum password strength on any
admin-set password: minimum length 10 characters, and it MUST
contain at least one letter and at least one digit. The system MUST
reject non-conforming passwords with a 4xx validation error before
any hashing or persistence occurs.

#### Scenario: Weak password rejected
- GIVEN an admin submits a password shorter than 10 characters, or one without both a letter and a digit
- WHEN the create-user request is processed
- THEN the response MUST be a 4xx validation error and no user record MUST be created

#### Scenario: Conforming password accepted
- GIVEN an admin submits a password of at least 10 characters containing at least one letter and one digit
- WHEN the create-user request is processed
- THEN the password MUST pass validation and the user MUST be created

### Requirement: List Users

The system MUST allow an authenticated `SYSTEM_ADMIN` to list all
users. The response MUST NOT include password hashes. Soft-deleted
users MUST be excluded by default; no pagination is required in this
slice.

#### Scenario: Admin lists users
- GIVEN the caller is authenticated as `SYSTEM_ADMIN`
- WHEN they call the list-users endpoint
- THEN the response MUST be 2xx with an array of users, none containing a password hash

#### Scenario: Soft-deleted users excluded from the list
- GIVEN a soft-deleted user exists alongside active users
- WHEN an admin calls the list-users endpoint
- THEN the response MUST NOT include the soft-deleted user

#### Scenario: Non-admin caller rejected
- GIVEN the caller is authenticated but not `SYSTEM_ADMIN`
- WHEN they call the list-users endpoint
- THEN the response MUST be 403

### Requirement: Update User

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing user's email and/or role by user id (not by email upsert).
Updating a user's role to any value other than `SYSTEM_ADMIN` is
subject to the Last-Admin Lockout invariant below.

#### Scenario: Admin updates a user's email
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target user id exists
- WHEN they submit a new email for that user id
- THEN the response MUST be 2xx and the user's email MUST be updated

#### Scenario: Update targets a non-existent user
- GIVEN a user id that does not correspond to an existing user
- WHEN an admin attempts to update it
- THEN the response MUST be a 4xx error (not found)

### Requirement: Deactivate User

The system MUST allow an authenticated `SYSTEM_ADMIN` to deactivate a
user via soft delete (ADR-010: `deletedAt` set, no row deletion).
Deactivated users MUST NOT be able to authenticate (see
`authentication` spec, "Soft-Deleted User Login Rejected").

#### Scenario: Admin deactivates a user
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target active user exists
- WHEN they deactivate that user
- THEN the response MUST be 2xx and the user's `deletedAt` MUST be set

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
