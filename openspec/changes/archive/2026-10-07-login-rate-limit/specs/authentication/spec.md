# Delta for Authentication

## ADDED Requirements

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

## MODIFIED Requirements

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
