# Authentication

Source: `sdd/auth-minimal-skeleton` (merged into main specs at archive, 2026-08-22)

## Purpose

Answers one question end-to-end: is the request authenticated, yes/no.
Covers seeded-admin credential verification, single access-token
issuance via httpOnly cookie, logout, and a guard with a public
opt-out. Excludes registration, roles/RBAC, refresh tokens, password
reset, demo mode (proposal Out of Scope).

## Requirements

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
valid, unexpired, non-revoked access-token cookie whose user currently
exists and is not soft-deleted, and MUST deny access otherwise.
(Previously: validity of the token alone sufficed.)

#### Scenario: Valid session
- GIVEN a valid access-token cookie from a successful login, for an existing user
- WHEN the client calls a protected endpoint
- THEN the response MUST be 2xx

#### Scenario: Missing or invalid session
- GIVEN no cookie, an expired token, or a tampered token
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401

#### Scenario: Valid token, user missing or soft-deleted
- GIVEN a valid token whose user no longer exists or is soft-deleted
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401

### Requirement: Session Introspection (GET /auth/me)

The system MUST expose a `GET /auth/me` endpoint the web app can use to
detect session state. Like the login response, the body MUST NOT
contain the password hash or the raw token value — only public
identity fields, including `role`. The returned `role` and `email` MUST
be the user's current stored values, not the token claims.
(Previously: `role` and `email` were taken from the token claims.)

#### Scenario: Valid session
- GIVEN a valid access-token cookie from a successful login
- WHEN the client calls `GET /auth/me`
- THEN the response MUST be 2xx with a body containing `{ id, email, role }`

#### Scenario: No or invalid session
- GIVEN no cookie, an expired token, or a tampered token
- WHEN the client calls `GET /auth/me`
- THEN the response MUST be 401

#### Scenario: Access token carries role
- GIVEN a user with a given role successfully logs in
- WHEN the resulting access token is decoded
- THEN it MUST contain that user's `role` alongside the existing claims

#### Scenario: Role changed after login
- GIVEN a user's stored role changed after the token was issued
- WHEN the client calls `GET /auth/me`
- THEN the body MUST show the new role

#### Scenario: Soft-deleted user
- GIVEN a valid token whose user was soft-deleted
- WHEN the client calls `GET /auth/me`
- THEN the response MUST be 401

### Requirement: Live User Check on Authenticated Requests

For every non-public request carrying a valid, non-revoked token, the
system MUST verify that the token's user currently exists and is not
soft-deleted. If not, it MUST respond 401, indistinguishable from an
invalid-token 401. If the user cannot be loaded (e.g. a storage
failure), it MUST respond 401 (fail-closed). A revoked token MUST be
rejected with 401 without depending on the user lookup. The acting
user's `role` and `email` MUST be the current stored values, not the
token claims. Public endpoints MUST NOT be affected.

#### Scenario: Soft-deleted user's existing token
- GIVEN a valid, unexpired token whose user was soft-deleted after login
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401, identical to an invalid-token response

#### Scenario: Demoted user acts with current role
- GIVEN a user whose stored role was lowered after the token was issued
- WHEN the client calls a route requiring a permission the new role lacks
- THEN the response MUST be 403

#### Scenario: User lookup fails
- GIVEN a valid token and a user lookup that errors
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401

#### Scenario: Revoked token needs no lookup
- GIVEN a token that was revoked by logout
- WHEN the client calls a protected endpoint
- THEN the response MUST be 401 and no user lookup MUST occur

#### Scenario: Public endpoints unaffected
- GIVEN no cookie
- WHEN the client calls `/health` or the login endpoint
- THEN no user lookup MUST occur and the call MUST NOT be blocked

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

### Requirement: Login Attempt Rate Limiting

The system MUST limit the number of attempts to the login endpoint per
client IP address within a fixed time window. The default MUST be 10
attempts per 15 minutes, and both the attempt count and the window MUST
be configurable through environment variables; when those variables are
unset, the defaults MUST apply. Every attempt MUST count toward the
limit, whether it succeeds or fails. Once an IP has used up its
attempts in the window, further attempts from that IP MUST be rejected
with 429 and a `Retry-After` header, without evaluating the
credentials. The counter for one IP MUST NOT affect any other IP. The
limit MUST apply only to the login endpoint; no other endpoint MUST be
throttled by this requirement.

#### Scenario: Attempt over the limit
- GIVEN one IP has made 10 login attempts within the window
- WHEN that IP submits an 11th login attempt
- THEN the response MUST be 429 with a `Retry-After` header

#### Scenario: Successful attempts count
- GIVEN one IP has made 10 login attempts within the window, all with valid credentials
- WHEN that IP submits another login attempt, even with valid credentials
- THEN the response MUST be 429

#### Scenario: Limit isolated per IP
- GIVEN one IP has exhausted its login attempts in the window
- WHEN a different IP submits a login attempt
- THEN the attempt MUST be processed normally and MUST NOT be rejected with 429

#### Scenario: Other endpoints unaffected
- GIVEN one IP has exhausted its login attempts in the window
- WHEN that IP calls any other endpoint (public or protected)
- THEN the call MUST NOT be rejected with 429 by this limit

#### Scenario: Default limits
- GIVEN the limit environment variables are unset
- WHEN a single IP makes login attempts
- THEN the 10th attempt in 15 minutes MUST be processed and the 11th MUST get 429

#### Scenario: Configured limits
- GIVEN the limit environment variables set a lower attempt count or a different window
- WHEN a single IP makes login attempts
- THEN the configured values MUST apply instead of the defaults

#### Scenario: Window elapsed
- GIVEN an IP was rejected with 429
- WHEN the window has elapsed
- THEN a new login attempt from that IP MUST be processed normally

### Requirement: Client IP Resolution for Rate Limiting

The IP used for rate limiting MUST be the socket address of the
connection by default. When the `TRUST_PROXY` environment variable is
enabled, it MUST be the client IP taken from the forwarded-for header.
`TRUST_PROXY` MUST be off when unset.

#### Scenario: TRUST_PROXY off
- GIVEN `TRUST_PROXY` is unset or off
- WHEN requests carry different forwarded-for header values from the same socket address
- THEN they MUST share one counter, keyed by the socket address

#### Scenario: TRUST_PROXY on
- GIVEN `TRUST_PROXY` is enabled
- WHEN requests arrive from the same socket address with different forwarded client IPs
- THEN each forwarded client IP MUST have its own counter

### Requirement: Login Form Validation (Web)

The login form MUST require both fields client-side before submission
and MUST show one generic error on server rejection, never per-field.
When the server rejects an attempt with 429 (rate limited), the form
MUST show a generic message "Too many login attempts. Please try
again later." (EN, ES and CA), distinct from the invalid-credentials
message, without a countdown, and MUST remain usable for a later retry.
(Previously: covered only client-side validation and the 401 generic
error.)

#### Scenario: Empty fields blocked client-side
- GIVEN the login form is empty
- WHEN the user submits
- THEN submission MUST be blocked with a required-field message

#### Scenario: Server error shown generically
- GIVEN the server returns 401 with a generic error
- WHEN the form receives that response
- THEN the UI MUST show one generic message, not field-specific errors

#### Scenario: Rate-limited message
- GIVEN the server returns 429 for a login attempt
- WHEN the form receives that response
- THEN the UI MUST show the rate-limited message
- AND the invalid-credentials message MUST NOT be shown
- AND no countdown or retry time MUST be shown

#### Scenario: Form usable after rate limit
- GIVEN the rate-limited message is shown
- WHEN the user edits the fields and submits again
- THEN the form MUST send the attempt and MUST show the result of that attempt

#### Scenario: Localized rate-limited message
- GIVEN the UI locale is ES or CA
- WHEN the rate-limited message is shown
- THEN it MUST render the corresponding translated string

### Requirement: Redirect When Unauthenticated (Web)

The web app MUST redirect unauthenticated visits to protected routes
to `/login`, including when the session ends mid-session because an
authenticated API call returned 401.
(Previously: only covered visits with no valid session.)

#### Scenario: Unauthenticated visit redirected
- GIVEN no valid session
- WHEN the user navigates to a protected route
- THEN the app MUST redirect to `/login`

#### Scenario: Session ends mid-session
- GIVEN a signed-in user on a protected route
- WHEN an authenticated API call (not login) returns 401
- THEN the local session MUST be cleared and the app MUST redirect to `/login`

### Requirement: Session-Ended Notice (Web)

When an authenticated API call other than login returns 401
mid-session, the web app MUST end the local session, redirect to
`/login`, and show the notice "Your session has ended. Please sign in
again." (EN, ES and CA). The notice MUST NOT disclose the reason. A
failed login attempt MUST NOT show this notice.

#### Scenario: Mid-session 401
- GIVEN a signed-in user whose session is no longer accepted by the API
- WHEN any authenticated API call returns 401
- THEN the app MUST land on `/login` showing the session-ended notice
- AND the notice MUST NOT state why the session ended

#### Scenario: Failed login shows no session-ended notice
- GIVEN the login form
- WHEN the login call returns 401
- THEN the generic login error MUST be shown and the session-ended notice MUST NOT

#### Scenario: Localized notice
- GIVEN the UI locale is ES or CA
- WHEN the notice is shown
- THEN it MUST render the corresponding translated string

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
