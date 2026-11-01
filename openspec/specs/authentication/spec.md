# Authentication

Source: `sdd/auth-minimal-skeleton` (merged into main specs at archive, 2026-08-22)

## Purpose

Answers one question end-to-end: is the request authenticated, yes/no.
Covers seeded-admin credential verification, access-token and rotating
refresh-token issuance via httpOnly cookies, session refresh, logout, and
a guard with a public opt-out. Excludes registration, roles/RBAC, password
reset, demo mode (proposal Out of Scope). (Refresh tokens added by TD-5,
ADR-011 Decision 4.)

## Requirements

### Requirement: Successful Login

The system MUST verify credentials against the seeded admin user and,
when valid, MUST issue one JWT access token in an httpOnly cookie and MUST
start a refresh session ("Session Refresh") whose refresh token is set in
a second httpOnly cookie.

#### Scenario: Valid credentials

- GIVEN the seeded admin user exists
- WHEN the client POSTs valid credentials to the login endpoint
- THEN status MUST be 2xx and an httpOnly access-token cookie MUST be set
- AND an httpOnly refresh-token cookie MUST be set, scoped to the auth routes and expiring with the refresh token
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

The system MUST provide a logout action that ends the session and clears
both the access-token and the refresh-token cookie. A valid access token (correctly signed, unexpired and not already revoked)
MUST be revoked; a presented refresh token MUST have its whole refresh
session revoked. Either one MUST be enough, so that logout works when
only the refresh cookie is left after the access token expired; with
neither a valid access token nor a refresh cookie the response MUST be 401. (Refresh session added by TD-5.) A request whose `Origin` header is present and is not
`CORS_ORIGIN` MUST be refused with 403.

#### Scenario: Logout clears cookie

- GIVEN an authenticated session
- WHEN the client calls the logout endpoint
- THEN both cookies MUST be cleared/expired
- AND reusing the old access-token cookie value on a protected endpoint MUST return 401
- AND presenting the old refresh token to the refresh endpoint MUST return 401

#### Scenario: Logout with only the refresh cookie

- GIVEN a session whose access-token cookie has expired and whose refresh cookie remains
- WHEN the client calls the logout endpoint
- THEN the response MUST be 2xx, both cookies MUST be cleared, and the refresh session MUST be revoked

#### Scenario: Logout without a session

- GIVEN no valid access token and no refresh cookie
- WHEN the client calls the logout endpoint
- THEN the response MUST be 401

### Requirement: Session Refresh

The system MUST let a client exchange its refresh token, sent in the
refresh-token cookie to `POST /auth/refresh`, for a new access token and a
new refresh token, set in the same two cookies, answering 2xx with the
same public identity fields as login. (ADR-011 Decision 4, TD-5.)

- **Opaque and hashed.** A refresh token MUST be an opaque random value,
  not a JWT, and only a one-way hash of it MAY be stored.
- **Rotation.** Every successful refresh MUST consume the presented token
  and issue its successor in the same refresh session; a login starts a
  new session.
- **Reuse detection.** A consumed token presented again after the grace
  window MUST be rejected with 401 and MUST revoke the whole refresh
  session, so neither the client nor a thief can refresh it again. Inside
  the grace window a consumed token MUST be honoured once (two tabs
  refreshing at the same time); further attempts inside the window MUST be
  rejected with 401 without revoking and without clearing the cookie (the
  browser may already hold the successor). With a zero grace window there
  is no such exchange.
- **Lifetime.** A refresh session MUST expire when it has not been
  refreshed for the idle timeout and, whatever the activity, when the
  absolute maximum after its login has passed. The defaults MUST be 8 hours
  idle and 7 days absolute (`REFRESH_TOKEN_IDLE_TTL`,
  `REFRESH_TOKEN_ABSOLUTE_TTL`) and a 10-second grace window
  (`REFRESH_TOKEN_REUSE_GRACE`), in the format of `JWT_EXPIRES_IN`. The two
  lifetimes MUST be greater than zero; an invalid value MUST make startup
  fail. The refresh cookie MUST expire with its token.
- **Live user.** The user MUST be read on every refresh: a deleted or
  soft-deleted user MUST be rejected with 401 and the refresh session
  revoked, and the new access token MUST carry the stored role.
- **Rejections.** A missing, unknown, expired, revoked or reused refresh
  token MUST be answered with the same bare 401; when a refresh cookie was
  presented and rejected for any reason other than a concurrent refresh
  (below), the response MUST clear it.
- **Same origin.** A request whose `Origin` header is present and is not
  `CORS_ORIGIN` MUST be refused with 403 without consuming the token.
- **Rate limit.** Refreshes MUST be limited per client key, separately
  from login attempts, with 429 and `Retry-After` past the limit. The
  defaults MUST be 60 refreshes per 60 seconds
  (`REFRESH_RATE_LIMIT_MAX_ATTEMPTS`, `REFRESH_RATE_LIMIT_WINDOW_SECONDS`,
  positive integers; an invalid value MUST make startup fail).
- **Cookie scope.** The refresh cookie MUST be httpOnly, Secure and
  SameSite like the access-token cookie, and scoped to the auth routes by
  its path (`REFRESH_TOKEN_COOKIE_PATH`, default `/auth`), so it is not
  sent with other API calls.

#### Scenario: Refresh issues a new pair

- GIVEN a client logged in and holding its refresh cookie
- WHEN it POSTs to the refresh endpoint
- THEN the response MUST be 2xx with the public identity fields
- AND new access-token and refresh-token cookies MUST be set, the refresh token MUST differ from the presented one, and the new access token MUST authenticate a protected request

#### Scenario: Reused refresh token revokes the session

- GIVEN a refresh token that was already exchanged, presented after the grace window
- WHEN the client POSTs it to the refresh endpoint
- THEN the response MUST be 401
- AND the successor issued by the earlier exchange MUST be rejected with 401 too

#### Scenario: Concurrent refresh within the grace window

- GIVEN a refresh token exchanged a moment ago, within the grace window
- WHEN a second request presents it
- THEN that request MUST succeed once without revoking the session
- AND a third request presenting it within the window MUST be rejected with 401 without revoking the session

#### Scenario: Idle and absolute expiry

- GIVEN a refresh session not refreshed for 8 hours, or one whose login was 7 days ago
- WHEN its refresh token is presented
- THEN the response MUST be 401

#### Scenario: Deleted user cannot refresh

- GIVEN a user deleted after logging in
- WHEN their refresh token is presented
- THEN the response MUST be 401

#### Scenario: Role change applies on refresh

- GIVEN a user whose role changed after logging in
- WHEN their refresh token is presented
- THEN the response MUST carry the new role

#### Scenario: Request from another origin

- GIVEN a valid refresh token
- WHEN it is presented with an `Origin` header other than `CORS_ORIGIN`
- THEN the response MUST be 403 and the token MUST remain usable from the web app's origin

#### Scenario: Missing or unknown refresh token

- GIVEN no refresh cookie, or one the system never issued
- WHEN the client POSTs to the refresh endpoint
- THEN the response MUST be 401, and an unknown cookie MUST be cleared

#### Scenario: Too many refreshes

- GIVEN a client key that has used up its refreshes in the window
- WHEN it POSTs to the refresh endpoint again
- THEN the response MUST be 429 with a `Retry-After` header

### Requirement: Public Endpoint Opt-Out

The system MUST support marking endpoints public, exempt from the
guard, and MUST mark `/health`, the login endpoint, the refresh endpoint
and the logout endpoint public. The refresh and logout endpoints check
their own cookies ("Session Refresh", "Logout").

#### Scenario: Health and login stay reachable

- GIVEN no access-token cookie
- WHEN the client calls `/health`, the login endpoint or the refresh endpoint
- THEN no call MUST be blocked by the guard

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
client key within a fixed time window. The client key is derived from the
resolved client IP address: for an IPv4 address it is the address itself;
for an IPv6 address it is the /64 prefix of the address (so all addresses
sharing the same first 64 bits share one client key); an IPv4-mapped IPv6
address (`::ffff:a.b.c.d`) MUST be treated as the IPv4 address `a.b.c.d`.
The default MUST be 10 attempts per 15 minutes, and both the attempt count
and the window MUST be configurable through environment variables; when
those variables are unset, the defaults MUST apply. Every attempt MUST
count toward the limit, whether it succeeds or fails. Once a client key
has used up its attempts in the window, further attempts from that client
key MUST be rejected with 429 and a `Retry-After` header, without
evaluating the credentials. The counter of this limit for one client key
MUST NOT affect the counter of any other client key; a different client
key MAY still be rejected with 429 by the per-email limit (see "Login
Failure Limiting per Email"), which is independent of this limit. The
counters MUST persist across an API restart and
MUST be shared by all API instances that use the same database, and
concurrent attempts MUST NOT cause attempts to go uncounted. If the client
IP of a request cannot be determined, the request MUST still be
rate-limited and MUST NOT cause an error. The limit MUST apply only to the
login endpoint; no other endpoint MUST be throttled by this requirement.
The 429 response contract (status, generic message, `Retry-After` header)
is unchanged.
(Previously: the isolation statement and the "Limit isolated per client
key" scenario were unqualified, although a different client key can now
also be rejected because of a blocked email; earlier still, the counter
was keyed by the plain client IP, held in process memory (reset by a
restart, not shared across instances), and IPv6 clients were not grouped
by prefix.)

#### Scenario: Attempt over the limit

- GIVEN one client key has made 10 login attempts within the window
- WHEN that client key submits an 11th login attempt
- THEN the response MUST be 429 with a `Retry-After` header

#### Scenario: Successful attempts count

- GIVEN one client key has made 10 login attempts within the window, all with valid credentials
- WHEN that client key submits another login attempt, even with valid credentials
- THEN the response MUST be 429

#### Scenario: Limit isolated per client key

- GIVEN one client key has exhausted its login attempts in the window
- WHEN a different client key submits a login attempt for an email that is not blocked by the per-email limit
- THEN the attempt MUST be processed normally and MUST NOT be rejected with 429 by the per-client-key limit

#### Scenario: Other endpoints unaffected

- GIVEN one client key has exhausted its login attempts in the window
- WHEN that client calls any other endpoint (public or protected)
- THEN the call MUST NOT be rejected with 429 by this limit

#### Scenario: Default limits

- GIVEN the limit environment variables are unset
- WHEN a single client key makes login attempts
- THEN the 10th attempt in 15 minutes MUST be processed and the 11th MUST get 429

#### Scenario: Configured limits

- GIVEN the limit environment variables set a lower attempt count or a different window
- WHEN a single client key makes login attempts
- THEN the configured values MUST apply instead of the defaults

#### Scenario: Window elapsed

- GIVEN a client key was rejected with 429
- WHEN the window has elapsed
- THEN a new login attempt from that client key MUST be processed normally

#### Scenario: IPv6 addresses in the same /64 share a counter

- GIVEN two IPv6 addresses that share the same /64 prefix and differ only in the low 64 bits
- WHEN the first address has exhausted its login attempts in the window and the second address submits a login attempt
- THEN the second attempt MUST be rejected with 429

#### Scenario: Rotating the low 64 bits does not reset the limit

- GIVEN a client has made 10 login attempts within the window from one IPv6 address
- WHEN it submits an 11th attempt from a different IPv6 address in the same /64 prefix
- THEN the response MUST be 429

#### Scenario: IPv6 addresses in different /64 prefixes are isolated

- GIVEN two IPv6 addresses in different /64 prefixes
- WHEN the first address has exhausted its login attempts in the window and the second address submits a login attempt
- THEN the second attempt MUST be processed normally and MUST NOT be rejected with 429

#### Scenario: IPv4 clients are unchanged

- GIVEN two different IPv4 addresses
- WHEN one has exhausted its login attempts in the window
- THEN each IPv4 address MUST have its own counter and the other IPv4 address MUST NOT be rejected with 429

#### Scenario: IPv4-mapped IPv6 shares the IPv4 counter

- GIVEN the IPv4 address `a.b.c.d` has exhausted its login attempts in the window
- WHEN a login attempt arrives from the IPv4-mapped form `::ffff:a.b.c.d`
- THEN the attempt MUST be rejected with 429

#### Scenario: Counters survive an API restart

- GIVEN a client key has exhausted its login attempts in the window
- WHEN the API is restarted against the same database and that client key submits a login attempt within the window
- THEN the response MUST be 429

#### Scenario: Counters shared across instances

- GIVEN two API instances use the same database
- WHEN one client key makes 6 login attempts through the first instance and 5 through the second within the window
- THEN the 11th attempt MUST be rejected with 429, regardless of the instance that receives it

#### Scenario: Concurrent attempts are all counted

- GIVEN a client key with no attempts in the window
- WHEN 10 login attempts from that client key are submitted concurrently
- THEN all 10 MUST be counted, and the next attempt MUST be rejected with 429

#### Scenario: Client IP cannot be determined

- GIVEN a login request whose client IP cannot be determined
- WHEN the request is submitted
- THEN the request MUST still be subject to rate limiting and MUST NOT cause a server error

### Requirement: Client IP Resolution for Rate Limiting

The IP used for rate limiting MUST be the socket address of the
connection by default. The `TRUST_PROXY` environment variable controls
how many trusted proxy hops are skipped when resolving the client IP from
the forwarded-for header. It MUST accept exactly these values: unset,
empty, or `false` (off); `true` (trust one hop); or a positive integer N
(trust N hops). When `TRUST_PROXY` is a positive integer N, the client IP
MUST be the address N hops back from the socket address in the
forwarded-for chain. `TRUST_PROXY` MUST be off when unset. Any other value
(zero, a negative number, a non-integer number, or any other text,
including CIDR lists and named values) MUST cause application startup to
fail with an error. No production default other than off applies.
(Previously: `TRUST_PROXY` was either off or enabled for exactly one hop; a hop count and startup validation of invalid values were not specified.)

#### Scenario: TRUST_PROXY off

- GIVEN `TRUST_PROXY` is unset or off
- WHEN requests carry different forwarded-for header values from the same socket address
- THEN they MUST share one counter, keyed by the socket address

#### Scenario: TRUST_PROXY on

- GIVEN `TRUST_PROXY` is enabled with `true`
- WHEN requests arrive from the same socket address with different forwarded client IPs
- THEN each forwarded client IP MUST have its own counter

#### Scenario: TRUST_PROXY with a hop count

- GIVEN `TRUST_PROXY` is set to `2`
- WHEN requests arrive from the same socket address through two trusted proxies, with different client IPs two hops back in the forwarded-for chain
- THEN each client IP two hops back MUST have its own counter

#### Scenario: Hop count ignores client-supplied extra entries

- GIVEN `TRUST_PROXY` is set to `2`
- WHEN a client prepends additional, spoofed entries to the forwarded-for chain
- THEN the spoofed entries MUST NOT determine the client IP, and the client IP MUST remain the address two hops back from the socket address

#### Scenario: TRUST_PROXY empty or false

- GIVEN `TRUST_PROXY` is set to the empty string or to `false`
- WHEN the application starts
- THEN it MUST start with proxy trust off

#### Scenario: Invalid TRUST_PROXY value rejected at startup

- GIVEN `TRUST_PROXY` is set to `0`, `-1`, `1.5`, `loopback`, a CIDR list, or any other value outside the accepted set
- WHEN the application starts
- THEN startup MUST fail with an error and the application MUST NOT begin serving requests

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
authenticated API call issued under the current session returned 401.
A 401 returned for a call issued under an earlier session MUST NOT end
the current session.
(Previously: any authenticated API call returning 401 ended the session,
regardless of which session issued the call.)

#### Scenario: Unauthenticated visit redirected

- GIVEN no valid session
- WHEN the user navigates to a protected route
- THEN the app MUST redirect to `/login`

#### Scenario: Session ends mid-session

- GIVEN a signed-in user on a protected route
- WHEN an authenticated API call (not login) issued under the current session returns 401
- THEN the local session MUST be cleared and the app MUST redirect to `/login`

#### Scenario: Current-session 401 ends the session and redirects

- GIVEN a signed-in user on a protected route who sent an authenticated API call under the current session
- WHEN that call returns 401
- THEN the local session MUST be cleared
- AND the app MUST redirect to `/login`
- AND the session-ended notice MUST be shown

#### Scenario: Stale 401 after re-login keeps the new session

- GIVEN an authenticated API call was sent under an earlier session
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the app MUST NOT redirect to `/login`
- AND the caller of the earlier call MUST still receive the 401 error

### Requirement: Session-Ended Notice (Web)

When an authenticated API call other than login, issued under the
current session, returns 401 mid-session, the web app MUST end the local
session, redirect to `/login`, and show the notice "Your session has
ended. Please sign in again." (EN, ES and CA). The notice MUST NOT
disclose the reason. A failed login attempt MUST NOT show this notice. A
401 returned for a call issued under an earlier session (before a
re-login or before a logout) MUST NOT end the current session and MUST
NOT show this notice; the caller of that call MUST still receive the 401
error.
(Previously: any authenticated API call returning 401 mid-session ended
the session and showed the notice, regardless of which session issued
the call.)

#### Scenario: Mid-session 401

- GIVEN a signed-in user whose session is no longer accepted by the API
- WHEN any authenticated API call issued under the current session returns 401
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

#### Scenario: Stale 401 after re-login does not end the new session

- GIVEN an authenticated API call was sent under an earlier session
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the session-ended notice MUST NOT be shown
- AND the caller of the earlier call MUST still receive the 401 error

#### Scenario: Stale 401 across logout raises no notice

- GIVEN an authenticated API call was sent before the user logged out
- WHEN the call returns 401 after the logout
- THEN the session-ended notice MUST NOT be shown
- AND the caller of that call MUST still receive the 401 error

#### Scenario: Stale 401 across logout and new login keeps the new session

- GIVEN an authenticated API call was sent before the user logged out
- AND the user then signs in again, starting a new session
- WHEN the earlier call returns 401
- THEN the new session MUST remain active
- AND the session-ended notice MUST NOT be shown

#### Scenario: Current-session 401 still shows the notice

- GIVEN a signed-in user who sent an authenticated API call under the current session
- WHEN that call returns 401
- THEN the local session MUST end, the app MUST land on `/login`, and the session-ended notice MUST be shown

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

### Requirement: Login Failure Limiting per Email

The system MUST limit the number of failed login attempts per email within
a fixed time window, independently of and in addition to the per-client-key
limit ("Login Attempt Rate Limiting"). The email used for limiting MUST be
normalized by trimming surrounding whitespace and lowercasing, so that
case and whitespace variants of one email share one counter. A request
whose email fails request validation MUST be rejected as invalid input before
this limit applies and MUST NOT count as a failure. The default MUST be 5
failed attempts per 15 minutes (900 seconds), and the block duration MUST
equal the window. Both values MUST be configurable through the environment
variables `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` and
`LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS`; when those variables are unset,
the defaults MUST apply, and a value that is not a positive integer MUST
cause application startup to fail with an error.

Only failed credential checks MUST count toward this limit; successful
logins MUST NOT count. A successful login MUST reset the failure counter
of that email. Once an email has used up its failures in the window,
further login attempts for that email, from any client key, MUST be
rejected with 429 and a `Retry-After` header, without evaluating the
credentials. The 429 response MUST be identical in status, body and
message to the per-client-key 429, and MUST NOT disclose which limit
applied. The block MUST be temporary: it ends when the window elapses, and
no persistent lock is stored on the user.

Existing, unknown and soft-deleted emails MUST be treated identically:
they MUST be counted, blocked and answered with the same status, body and
message at every step, so that the limit cannot be used to tell whether an
account exists. Failures for one email submitted from many different
client keys MUST all be counted against that email. When both the client
key and the email are blocked, the response MUST be 429 with the larger of
the two `Retry-After` values. A request rejected by the per-client-key
limit MUST NOT evaluate credentials and MUST NOT add a failure to any
email counter.

The counters MUST persist across an API restart and MUST be shared by all
API instances that use the same database, and concurrent failed attempts
MUST NOT cause failures to go uncounted. The raw email MUST NOT be stored
at rest or written to logs; only a one-way hash of it MAY be. If the
block state cannot be read, or a failed attempt cannot be recorded, the
login MUST be refused with a 500 response (fail closed). If the counter
reset after a valid login fails, the login MUST still succeed and a
warning MUST be logged. When an email becomes blocked, the system MUST log
one warning identified by the hash only.

The web login page MUST show the existing rate-limited message for this
429; no distinct message and no countdown MUST be shown.

#### Scenario: Email blocked after the failure limit

- GIVEN an existing email has had 5 failed login attempts within the window
- WHEN a 6th login attempt is submitted for that email
- THEN the response MUST be 429 with a `Retry-After` header
- AND the credentials MUST NOT be evaluated

#### Scenario: Fewer failures than the limit are processed

- GIVEN an existing email has had 4 failed login attempts within the window
- WHEN a login attempt with valid credentials is submitted for that email
- THEN the login MUST succeed

#### Scenario: Default limits

- GIVEN the email limit environment variables are unset
- WHEN failed login attempts are submitted for one email
- THEN the 5th failed attempt in 15 minutes MUST be answered 401 and the next attempt MUST get 429
- AND the `Retry-After` value MUST NOT exceed 900 seconds

#### Scenario: Configured limits

- GIVEN the email limit environment variables set a different failure count or window
- WHEN failed login attempts are submitted for one email
- THEN the configured values MUST apply instead of the defaults

#### Scenario: Invalid configuration rejected at startup

- GIVEN `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` or `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` is set to zero, a negative number, a non-integer number, or non-numeric text, or `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` is set above 2147483647, or `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` is set above 86400 (24 hours, which bounds the lockout a misconfiguration could cause)
- WHEN the application starts
- THEN startup MUST fail with an error and the application MUST NOT begin serving requests

#### Scenario: Only failed attempts count

- GIVEN an existing email has had many successful logins within the window
- WHEN a login attempt with valid credentials is submitted for that email
- THEN the login MUST succeed and the successful logins MUST NOT have counted toward the email limit

#### Scenario: Successful login resets the counter

- GIVEN an existing email has had 4 failed login attempts within the window
- WHEN a login with valid credentials succeeds, followed by 4 more failed attempts for that email
- THEN the following attempt MUST be processed normally and MUST NOT be rejected with 429

#### Scenario: Distributed attempts from many client keys are counted

- GIVEN 5 failed login attempts for one email were submitted from 5 different client keys within the window
- WHEN a 6th attempt for that email is submitted from a sixth client key
- THEN the response MUST be 429 with a `Retry-After` header
- AND the credentials MUST NOT be evaluated

#### Scenario: Blocking one email does not affect another email

- GIVEN one email is blocked
- WHEN a login attempt for a different email is submitted from any client key not blocked by the per-client-key limit
- THEN the attempt MUST be processed normally and MUST NOT be rejected with 429

#### Scenario: Email variants share one counter

- GIVEN failed attempts were submitted for `User@Example.com`, `user@example.com` and `USER@EXAMPLE.COM`, 5 in total within the window
- WHEN another attempt is submitted for `user@example.com`
- THEN the response MUST be 429

#### Scenario: Invalid email is rejected before the limit

- GIVEN a login request whose email is missing or not a string
- WHEN it is submitted
- THEN the response MUST be 400
- AND it MUST NOT count as a failed attempt for any email

#### Scenario: Unknown email behaves like an existing email

- GIVEN one email belongs to an existing user and another email belongs to no user
- WHEN the same sequence of failed attempts is submitted for each, up to and including the blocked attempt
- THEN the status, body, message and `Retry-After` presence MUST be identical for both at every step

#### Scenario: Soft-deleted email behaves like an existing email

- GIVEN an email belongs to a soft-deleted user
- WHEN 5 failed attempts and then a 6th attempt are submitted for that email
- THEN the responses MUST be identical to those for an existing email at every step, including the 429 on the 6th attempt

#### Scenario: Blocked response identical to the per-client-key response

- GIVEN an email is blocked by the email limit and no client key is blocked
- WHEN a login attempt for that email is submitted
- THEN the response status, body and message MUST be identical to the 429 returned by the per-client-key limit

#### Scenario: Valid credentials rejected while the email is blocked

- GIVEN an existing email is blocked
- WHEN a login attempt with the correct password is submitted for that email
- THEN the response MUST be 429 and no session MUST be established

#### Scenario: Window elapsed

- GIVEN an email was blocked
- WHEN the window has elapsed
- THEN a new login attempt for that email MUST be processed normally

#### Scenario: Both limits blocked uses the larger Retry-After

- GIVEN a client key and an email are both blocked, with different remaining times
- WHEN a login attempt from that client key for that email is submitted
- THEN the response MUST be 429
- AND the `Retry-After` value MUST be the larger of the two remaining times

#### Scenario: Request rejected by the client-key limit adds no email failure

- GIVEN a client key is blocked by the per-client-key limit and an email has 0 recorded failures
- WHEN 5 login attempts for that email are submitted from that client key and rejected with 429
- THEN the email MUST NOT be blocked
- AND a login attempt for that email from a different, unblocked client key MUST be processed normally

#### Scenario: Counters survive an API restart

- GIVEN an email is blocked
- WHEN the API is restarted against the same database and a login attempt for that email is submitted within the window
- THEN the response MUST be 429

#### Scenario: Counters shared across instances

- GIVEN two API instances use the same database
- WHEN 3 failed attempts for one email are submitted through the first instance and 2 through the second within the window
- THEN the next attempt for that email MUST be rejected with 429, regardless of the instance that receives it

#### Scenario: Concurrent failures are all counted

- GIVEN an email with no failures in the window
- WHEN 5 failed login attempts for that email are submitted concurrently
- THEN all 5 MUST be counted, and the next attempt for that email MUST be rejected with 429

#### Scenario: Raw email not stored or logged

- GIVEN failed login attempts were submitted for an email
- WHEN the stored throttling data and the application logs are inspected
- THEN neither MUST contain the raw email, and the email MUST appear only as a one-way hash

#### Scenario: Block is logged once with the hash only

- GIVEN an email has had 4 failed login attempts within the window
- WHEN the 5th failed attempt makes the email blocked
- THEN exactly one warning MUST be logged for the block, identified by the hash and not by the raw email
- AND further rejected attempts in the same window MUST NOT log additional block warnings

#### Scenario: Storage error when checking the block state fails closed

- GIVEN the throttling storage is unavailable
- WHEN a login attempt is submitted
- THEN the response MUST be 500 and the login MUST be refused

#### Scenario: Storage error when recording a failure fails closed

- GIVEN the credentials are wrong and recording the failure fails because the throttling storage errors
- WHEN the login attempt is processed
- THEN the response MUST be 500 and the login MUST be refused

#### Scenario: Reset failure after a valid login does not block the login

- GIVEN valid credentials and the counter reset fails because the throttling storage errors
- WHEN the login attempt is processed
- THEN the login MUST succeed
- AND a warning MUST be logged

#### Scenario: Web shows the existing rate-limited message

- GIVEN the login page and a login call that returns 429 because the email is blocked
- WHEN the response is received
- THEN the existing rate-limited message MUST be shown, with no countdown and no distinct message for the email limit
- AND the form MUST remain usable
