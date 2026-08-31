# Delta for Authorization

## ADDED Requirements

### Requirement: Permission Check on Inspectable Element Endpoints

The system MUST check the caller's role before allowing access to any
`/communities/:communityId/inspectable-elements` endpoint. Only
`SYSTEM_ADMIN` MUST be permitted; the other 4 roles MUST be rejected.
Authentication MUST be evaluated before this check: a request without
a valid session MUST receive 401 even if the requested action would
otherwise require role rejection (403). The `Permission` union gains
`inspectableElement:create`, `inspectableElement:read`,
`inspectableElement:update`, and `inspectableElement:delete`, granted
only on the `SYSTEM_ADMIN` row of `ROLE_PERMISSIONS`.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call an inspectable-elements endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call an inspectable-elements endpoint
- THEN the response MUST be 403

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls an inspectable-elements endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

#### Scenario: Non-admin roles stay mapped to no permissions
- GIVEN `ROLE_PERMISSIONS` is inspected after this change
- WHEN the entries for `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, and `COMMUNITY_REPRESENTATIVE` are read
- THEN each MUST equal `[]`, with no `inspectableElement:*` permission granted to any of them
