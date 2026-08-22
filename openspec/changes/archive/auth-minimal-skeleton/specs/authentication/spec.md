# Delta for Authentication

New capability — no prior spec exists. All requirements are ADDED.

## Purpose

Answers one question end-to-end: is the request authenticated, yes/no.
Covers seeded-admin credential verification, single access-token
issuance via httpOnly cookie, logout, and a guard with a public
opt-out. Excludes registration, roles/RBAC, refresh tokens, password
reset, demo mode (proposal Out of Scope).

## ADDED Requirements

### Requirement: Successful Login

The system MUST verify credentials against the seeded admin user and,
when valid, MUST issue one JWT access token in an httpOnly cookie.

#### Scenario: Valid credentials
- GIVEN the seeded admin user exists
- WHEN the client POSTs valid credentials to the login endpoint
- THEN status MUST be 2xx and an httpOnly access-token cookie MUST be set
- AND the body MUST contain only public identity fields (e.g. id, email) — never the hash or raw token

### Requirement: Failed Login — Generic Error

The system MUST reject invalid credentials with an identical, generic
401 regardless of whether the email exists or the password is wrong.

#### Scenario: Wrong password or non-existent user
- GIVEN either a wrong password for an existing email, or an email with no matching user
- WHEN the client submits login credentials
- THEN the response MUST be 401 with the same generic error in both cases
- AND the response time MUST NOT be distinguishable between the two cases (no timing side-channel that reveals whether the email exists)

### Requirement: Protected Endpoint Access Control

The system MUST allow access to non-public endpoints only with a
valid, unexpired access-token cookie, and MUST deny access otherwise.

#### Scenario: Valid session
- GIVEN a valid access-token cookie from a successful login
- WHEN the client calls a protected endpoint
- THEN the response MUST be 2xx

#### Scenario: Missing or invalid session
- GIVEN no cookie, an expired token, or a tampered token
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401

### Requirement: Session Introspection (GET /auth/me)

The system MUST expose a `GET /auth/me` endpoint the web app can use to
detect session state. Like the login response, the body MUST NOT
contain the password hash or the raw token value — only public
identity fields.

#### Scenario: Valid session
- GIVEN a valid access-token cookie from a successful login
- WHEN the client calls `GET /auth/me`
- THEN the response MUST be 2xx with a body containing only `{ id, email }`

#### Scenario: No or invalid session
- GIVEN no cookie, an expired token, or a tampered token
- WHEN the client calls `GET /auth/me`
- THEN the response MUST be 401

### Requirement: Logout

The system MUST provide a logout action that clears the access-token
cookie.

#### Scenario: Logout clears cookie
- GIVEN an authenticated session
- WHEN the client calls the logout endpoint
- THEN the cookie MUST be cleared/expired
- AND reusing the old cookie value on a protected endpoint MUST return 401

### Requirement: Public Endpoint Opt-Out

The system MUST support marking endpoints public, exempt from the
guard, and MUST mark `/health` and the login endpoint public.

#### Scenario: Health and login stay reachable
- GIVEN no access-token cookie
- WHEN the client calls `/health` or the login endpoint
- THEN neither call MUST be blocked by the guard

### Requirement: CORS Configuration

The system MUST accept credentialed cross-origin requests from the
configured web origin. This applies to any endpoint (public or
protected) reachable from the web app, not just the public-opt-out
endpoints above.

#### Scenario: Cross-origin request receives CORS headers
- GIVEN a request from the configured web origin (`CORS_ORIGIN`)
- WHEN the client calls the API cross-origin with credentials
- THEN the response MUST include the expected `Access-Control-Allow-Origin`
  and `Access-Control-Allow-Credentials` headers

### Requirement: Soft-Deleted User Login Rejected

A soft-deleted user (`deletedAt` set, ADR-010) MUST NOT be able to
authenticate. Resolved by `sdd-design`: the repository's default
`deletedAt: null` filter makes the lookup behave as if the user does
not exist.

#### Scenario: Soft-deleted user attempts login
- GIVEN a user record has `deletedAt` set
- WHEN that user submits otherwise-valid credentials
- THEN the response MUST be 401 with the same generic error as an
  unknown email — no distinguishable message

### Requirement: Login Form Validation (Web)

The login form MUST require both fields client-side before submission
and MUST show one generic error on server rejection, never per-field.

#### Scenario: Empty fields blocked client-side
- GIVEN the login form is empty
- WHEN the user submits
- THEN submission MUST be blocked with a required-field message

#### Scenario: Server error shown generically
- GIVEN the server returns 401 with a generic error
- WHEN the form receives that response
- THEN the UI MUST show one generic message, not field-specific errors

### Requirement: Redirect When Unauthenticated (Web)

The web app MUST redirect unauthenticated visits to protected routes
to `/login`.

#### Scenario: Unauthenticated visit redirected
- GIVEN no valid session
- WHEN the user navigates to a protected route
- THEN the app MUST redirect to `/login`

### Requirement: Logout Flow (Web)

The web app MUST trigger the logout endpoint and redirect to `/login`
once the session is cleared.

#### Scenario: Logout redirects
- GIVEN an authenticated session
- WHEN the user triggers logout
- THEN the app MUST call the logout endpoint and redirect to `/login`

### Requirement: Login Page Branding

The `/login` page MUST render the SF-Manager app logo static asset.

#### Scenario: Logo visible on login page
- GIVEN the user navigates to `/login`
- THEN the page MUST render the app logo asset
