# Authorization

## Purpose

Role-based access control over authenticated requests. Introduces the
full 5-role `Role` enum (ADR-011) but only `SYSTEM_ADMIN` is
operational in this slice — the other 4 roles are declared and MUST
be rejected wherever role-based checks apply. Composes with, and runs
after, the existing `authentication` guard.

## Requirements

### Requirement: Role Enum Declaration

The system MUST define a `Role` enum with exactly 5 values:
`SYSTEM_ADMIN`, `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`. Every `User`
MUST have exactly one `role`.

#### Scenario: All 5 roles are assignable at creation
- GIVEN an admin creates a user
- WHEN they submit any of the 5 declared roles
- THEN the user MUST be created with that role, regardless of whether the role is operational

### Requirement: Permission Check on Protected Endpoints

The system MUST check the caller's role before allowing access to any
`/users` endpoint. Only `SYSTEM_ADMIN` MUST be permitted; the other 4
roles MUST be rejected even though they are valid enum values.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/users` endpoint
- THEN the request MUST proceed to the endpoint's own logic (not blocked by the permission check)

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/users` endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/users` endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute (authentication is evaluated first)

### Requirement: Permission Check Order

The system MUST evaluate authentication before authorization: a
request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403).

#### Scenario: Missing session takes precedence over role
- GIVEN a request to a `/users` endpoint with no valid access-token cookie
- WHEN the request is processed
- THEN the response MUST be 401, not 403

### Requirement: Permission Check on Community and Assignment Endpoints

The system MUST check the caller's role before allowing access to any
`/communities` endpoint and any of its representative/technician
assignment sub-resource endpoints. Only `SYSTEM_ADMIN` MUST be
permitted; the other 4 roles MUST be rejected even though they are
valid enum values. Authentication MUST be evaluated before this
check: a request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403). The
new permissions are additive to the `Permission` union and are
granted only on the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`; the
other 4 roles (`MANAGER`, `MAINTENANCE_COMPANY_MANAGER`,
`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`) remain `[]` —
holding an active community assignment grants no permission.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the response MUST be 403, regardless of any active community assignment the caller may hold

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/communities` endpoint or an assignment sub-resource endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute
