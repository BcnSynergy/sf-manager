# Delta for Authentication

## ADDED Requirements

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

## MODIFIED Requirements

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
