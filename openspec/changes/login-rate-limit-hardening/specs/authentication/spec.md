# Delta for Authentication

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
evaluating the credentials. The counter for one client key MUST NOT affect
any other client key. The counters MUST persist across an API restart and
MUST be shared by all API instances that use the same database, and
concurrent attempts MUST NOT cause attempts to go uncounted. If the client
IP of a request cannot be determined, the request MUST still be
rate-limited and MUST NOT cause an error. The limit MUST apply only to the
login endpoint; no other endpoint MUST be throttled by this requirement.
The 429 response contract (status, generic message, `Retry-After` header)
is unchanged.
(Previously: the counter was keyed by the plain client IP, held in
process memory (reset by a restart, not shared across instances), and
IPv6 clients were not grouped by prefix.)

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
- WHEN a different client key submits a login attempt
- THEN the attempt MUST be processed normally and MUST NOT be rejected with 429

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
