# Delta for authentication

## ADDED Requirements

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
- GIVEN `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` or `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` is set to zero, a negative number, a non-integer number, or non-numeric text
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
- GIVEN failed attempts were submitted for `User@Example.com`, ` user@example.com ` and `USER@EXAMPLE.COM`, 5 in total within the window
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

## MODIFIED Requirements

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
