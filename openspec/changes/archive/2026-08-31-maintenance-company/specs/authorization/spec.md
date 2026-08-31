# Delta for Authorization

## ADDED Requirements

### Requirement: Permission Check on Maintenance Company Endpoints

The system MUST check the caller's role before allowing access to any
`/maintenance-companies` endpoint. Only `SYSTEM_ADMIN` MUST be
permitted; the other 4 roles MUST be rejected even though
`MAINTENANCE_COMPANY_MANAGER`/`MAINTENANCE_TECHNICIAN` users may hold
a `maintenanceCompanyId` referencing the very resource being
accessed. Authentication MUST be evaluated before this check: a
request without a valid session MUST receive 401 even if the
requested action would otherwise require role rejection (403). The
`Permission` union gains `maintenanceCompany:create`,
`maintenanceCompany:read`, `maintenanceCompany:update`, and
`maintenanceCompany:delete`, granted only on the `SYSTEM_ADMIN` row of
`ROLE_PERMISSIONS`.

#### Scenario: SYSTEM_ADMIN is permitted
- GIVEN an authenticated caller with role `SYSTEM_ADMIN`
- WHEN they call a `/maintenance-companies` endpoint
- THEN the request MUST proceed to the endpoint's own logic

#### Scenario: Non-admin role is rejected, including a maintenance-role holder
- GIVEN an authenticated caller whose role is any of `MANAGER`, `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN`, or `COMMUNITY_REPRESENTATIVE`
- WHEN they call a `/maintenance-companies` endpoint
- THEN the response MUST be 403, regardless of whether that caller's own `maintenanceCompanyId` matches the resource being accessed

#### Scenario: Unauthenticated caller is rejected before role check
- GIVEN no valid session (no cookie, expired, or tampered token)
- WHEN the caller calls a `/maintenance-companies` endpoint
- THEN the response MUST be 401, and the permission check MUST NOT execute

### Requirement: Maintenance-Role Permissions Stay Inert

Holding a `maintenanceCompanyId` MUST NOT grant `MAINTENANCE_COMPANY_MANAGER`
or `MAINTENANCE_TECHNICIAN` any API permission. After this change,
`ROLE_PERMISSIONS` MUST still map both roles to `[]`, identical to
their mapping before `User.maintenanceCompanyId` existed — this
slice stores and edits the company id only; it activates none of
ADR-011's scoped-permission behavior for either role.

#### Scenario: Maintenance roles remain permission-less after gaining a company
- GIVEN a `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` user has a valid `maintenanceCompanyId` set
- WHEN their `ROLE_PERMISSIONS` entry is inspected
- THEN it MUST equal `[]`, identical to a user of that role with no `maintenanceCompanyId`

#### Scenario: A maintenance-role user cannot access any endpoint via their company association
- GIVEN an authenticated caller with role `MAINTENANCE_COMPANY_MANAGER` or `MAINTENANCE_TECHNICIAN` and a set `maintenanceCompanyId`
- WHEN they call any permission-gated endpoint, including `/maintenance-companies` and `/users`
- THEN the response MUST be 403 for all of them, the same as before this slice
