# Delta for User Management

## ADDED Requirements

### Requirement: Grandfathered Maintenance-Role Users Without a Company

Resolves Open Question 2. `POST /users` has accepted
`MAINTENANCE_COMPANY_MANAGER`/`MAINTENANCE_TECHNICIAN` since
`user-management-roles`, so rows with `maintenanceCompanyId = null`
may already exist when this migration lands. The system MUST allow
reading and listing such existing rows without restriction, forever —
`GET /users/:id` and the list endpoint MUST return them unchanged,
with no retroactive fix required. The system MUST reject any
`PATCH /users/:id` request targeting such a user unless the request
leaves the user in a state where `maintenanceCompanyId` is non-null
and references a live company — this check applies to the PATCH as a
whole, regardless of which field(s) the request changes; a PATCH that
only touches an unrelated field (e.g. `email`) on a grandfathered
maintenance-role user MUST be rejected just like one that touches
`role` or `maintenanceCompanyId` directly, with `code:
MAINTENANCE_COMPANY_REQUIRED`. Supplying a valid `maintenanceCompanyId`
in that same request resolves the invariant and the request succeeds.

#### Scenario: Grandfathered user remains readable and listable indefinitely
- GIVEN a `User` exists with role `MAINTENANCE_TECHNICIAN` and `maintenanceCompanyId` `null`, created before this invariant existed
- WHEN a `SYSTEM_ADMIN` calls `GET /users/:id` or the list-users endpoint
- THEN the response MUST be 2xx and MUST include that user unchanged

#### Scenario: PATCH on a grandfathered user is rejected even for an unrelated field
- GIVEN the same grandfathered user
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing only the email, without supplying `maintenanceCompanyId`
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_REQUIRED`
- AND the user MUST remain unchanged

#### Scenario: Supplying a company on that PATCH resolves the invariant
- GIVEN the same grandfathered user
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with a valid, live `maintenanceCompanyId` (with or without other field changes)
- THEN the response MUST be 2xx and the user's `maintenanceCompanyId` MUST be set

## MODIFIED Requirements

### Requirement: Create User

The system MUST allow an authenticated `SYSTEM_ADMIN` to create a new
`User` by providing email, an initial password, a role from the
`Role` enum, and — conditionally, based on role — a
`maintenanceCompanyId`. The system MUST reject creation if the email
is already in use by an active user. When `role` is
`MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN`,
`maintenanceCompanyId` MUST be required and MUST reference an
existing, non-soft-deleted `MaintenanceCompany` (`code:
MAINTENANCE_COMPANY_REQUIRED` if missing, `code:
MAINTENANCE_COMPANY_NOT_FOUND` if it does not resolve to a live
company). When `role` is `SYSTEM_ADMIN`, `MANAGER`, or
`COMMUNITY_REPRESENTATIVE`, a supplied `maintenanceCompanyId` MUST be
rejected (`code: MAINTENANCE_COMPANY_NOT_ALLOWED`), not silently
ignored.
(Previously: only validated email, password, and role — had no
knowledge of `maintenanceCompanyId`.)

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

#### Scenario: Maintenance-role user requires a live company
- GIVEN an admin submits role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` with a `maintenanceCompanyId` referencing an existing, non-soft-deleted company
- WHEN the create-user request is processed
- THEN the response MUST be 2xx and the user MUST be created with that `maintenanceCompanyId`

#### Scenario: Missing company for a maintenance role rejected
- GIVEN an admin submits role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` with no `maintenanceCompanyId`
- WHEN the create-user request is processed
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_REQUIRED` and no user MUST be created

#### Scenario: Company id rejected for a non-maintenance role
- GIVEN an admin submits role `SYSTEM_ADMIN`, `MANAGER`, or `COMMUNITY_REPRESENTATIVE` together with a `maintenanceCompanyId`
- WHEN the create-user request is processed
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_NOT_ALLOWED` and no user MUST be created

#### Scenario: Nonexistent or soft-deleted company rejected
- GIVEN an admin submits a maintenance role with a `maintenanceCompanyId` that does not exist or points at a soft-deleted company
- WHEN the create-user request is processed
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_NOT_FOUND` and no user MUST be created

### Requirement: Update User

The system MUST allow an authenticated `SYSTEM_ADMIN` to update an
existing user's email, role, and/or `maintenanceCompanyId` by user id
(not by email upsert). Updating a user's role to any value other than
`SYSTEM_ADMIN` is subject to the Last-Admin Lockout invariant below.
Every update MUST leave the user in a state consistent with the
`maintenanceCompanyId` invariant: when the resulting role is
`MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN`, the
resulting `maintenanceCompanyId` MUST be non-null and reference a
live company; when the resulting role is `SYSTEM_ADMIN`, `MANAGER`,
or `COMMUNITY_REPRESENTATIVE`, a `maintenanceCompanyId` supplied in
the same request MUST be rejected. Changing role away from a
maintenance role MUST leave any existing `maintenanceCompanyId`
untouched — the system MUST NOT auto-clear it and MUST NOT reject the
request because of it; only an explicit `maintenanceCompanyId` value
in the same or a later request changes it.
(Previously: only validated email and role changes against Last-Admin
Lockout — had no knowledge of `maintenanceCompanyId`.)

#### Scenario: Admin updates a user's email
- GIVEN the caller is authenticated as `SYSTEM_ADMIN` and a target user id exists
- WHEN they submit a new email for that user id
- THEN the response MUST be 2xx and the user's email MUST be updated

#### Scenario: Update targets a non-existent user
- GIVEN a user id that does not correspond to an existing user
- WHEN an admin attempts to update it
- THEN the response MUST be a 4xx error (not found)

#### Scenario: Admin moves a maintenance-role user to a different company
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a valid `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` with a different, existing, non-soft-deleted `maintenanceCompanyId`
- THEN the response MUST be 2xx and the user's `maintenanceCompanyId` MUST reflect the new company

#### Scenario: Role change away from a maintenance role leaves maintenanceCompanyId untouched
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing only `role` to `MANAGER`, without mentioning `maintenanceCompanyId`
- THEN the response MUST be 2xx, the role MUST be updated, and `maintenanceCompanyId` MUST remain exactly as it was

#### Scenario: Missing company when changing role to a maintenance role rejected
- GIVEN an existing user with role `MANAGER` and no `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `MAINTENANCE_COMPANY_MANAGER` without supplying a `maintenanceCompanyId`
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_REQUIRED` and no field MUST be changed

#### Scenario: Company id rejected when changing role to a non-maintenance role
- GIVEN an existing user with role `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN a `SYSTEM_ADMIN` submits `PATCH /users/:id` changing `role` to `COMMUNITY_REPRESENTATIVE` while also supplying a `maintenanceCompanyId`
- THEN the response MUST be a 4xx error with `code: MAINTENANCE_COMPANY_NOT_ALLOWED` and no field MUST be changed

### Requirement: Last-Admin Lockout

The system MUST reject any operation — deactivation or role change
away from `SYSTEM_ADMIN` — that would leave zero active
`SYSTEM_ADMIN` users. `POST`, `PATCH` and `DELETE /users` 409
responses MUST include a `code` field discriminating the business
cause: `EMAIL_ALREADY_IN_USE`, `LAST_SYSTEM_ADMIN`, or
`TRANSACTION_CONFLICT`. `POST` and `PATCH /users` 4xx responses MUST
additionally use `MAINTENANCE_COMPANY_REQUIRED`,
`MAINTENANCE_COMPANY_NOT_ALLOWED`, or `MAINTENANCE_COMPANY_NOT_FOUND`
to discriminate the maintenance-company-related causes defined above.
The existing `statusCode`, `error` and `message` fields are
unchanged — `code` is additive, non-breaking, and exists so clients
can distinguish these causes without parsing the (English,
non-localizable) `message` string.
(Previously: only enumerated `EMAIL_ALREADY_IN_USE`,
`LAST_SYSTEM_ADMIN`, and `TRANSACTION_CONFLICT` as possible codes.)

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

#### Scenario: Maintenance-company causes are distinguishable from each other
- GIVEN a `POST` or `PATCH /users` request fails for a maintenance-company-related reason
- WHEN the response body is inspected
- THEN `code` MUST be exactly one of `MAINTENANCE_COMPANY_REQUIRED`, `MAINTENANCE_COMPANY_NOT_ALLOWED`, or `MAINTENANCE_COMPANY_NOT_FOUND`, matching the actual cause
