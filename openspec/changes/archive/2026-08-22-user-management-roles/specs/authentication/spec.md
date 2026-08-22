# Delta for Authentication

Modifies exactly one requirement of `openspec/specs/authentication/spec.md`
— "Session Introspection (GET /auth/me)" — to include `role` in the
response body and in the underlying access-token payload. All other
11 requirements in that spec (Successful Login, Failed Login, Protected
Endpoint Access Control, Logout, Public Endpoint Opt-Out, CORS
Configuration, Soft-Deleted User Login Rejected, and the 4 web-layer
requirements) are unchanged and are NOT reproduced here.

## MODIFIED Requirements

### Requirement: Session Introspection (GET /auth/me)

The system MUST expose a `GET /auth/me` endpoint the web app can use
to detect session state. Like the login response, the body MUST NOT
contain the password hash or the raw token value — only public
identity fields, now including `role`.
(Previously: body was `{ id, email }`; access-token payload did not
carry role.)

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
