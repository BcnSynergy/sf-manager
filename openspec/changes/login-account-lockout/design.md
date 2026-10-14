# Design: Per-email login failure limiting (TD-31)

## Technical Approach

Explore Approach A, as fixed by the binding decision answers (explore.md,
2026-10-13) and the proposal. A second, independent limit is added to
`POST /auth/login`, keyed on the normalized email instead of the client key:

1. **Shared normalization.** `packages/validation` exports a
   `loginEmailSchema` (`z.string().trim().toLowerCase().pipe(z.email())`);
   `loginRequestSchema.email` is that schema. The use case receives the email
   already normalized by `ZodValidationPipe`, and the guard parses the raw
   body with the very same schema, so the two can never drift.
2. **Application port in the use case.** A new `LoginFailureLimiter` port
   (`auth/application/ports/`) has three operations: read the block state,
   record a failure, and reset. `LoginUseCase` checks the block first (before
   any user lookup or password verification), records a failure on every
   `InvalidCredentialsError` path, and resets on success. Unknown and
   soft-deleted emails take exactly the same path.
3. **Sibling Postgres adapter on the same table.**
   `PrismaLoginFailureLimiter` (`auth/infrastructure/persistence/`) stores one
   `ThrottleCounter` row per email under the key
   `sha256("login-email:" + normalizedEmail)`. Recording a failure is one
   atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE` on the database clock,
   reusing the TD-35 patterns (blocked rows are not rewritten, the trigger owns
   `expiresAt`). Reset is a `DELETE` by key. Expired rows are removed by the
   existing bounded cleanup in `PrismaThrottlerStorage`. No migration.
4. **Email 429 from the controller.** The use case throws a new domain error,
   `LoginBlockedError(retryAfterSeconds)`. `AuthController` maps it to the
   `Retry-After` header plus the library's `ThrottlerException`, so the body
   is byte-identical to the per-client-key 429.
5. **Larger `Retry-After` when both limits block.** When the per-client-key
   limit blocks, `LoginThrottlerGuard` (which runs first) reads the email
   block state for a valid email in the body and raises `Retry-After` to the
   larger of the two values before throwing.
6. **Config.** `getLoginEmailRateLimitConfig()` in
   `login-rate-limit.config.ts` reads `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES`
   (default 5) and `LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (default 900) with
   the existing `parsePositiveInteger`.

Facts verified in the code and in `@nestjs/throttler` 6.4.0:

- `ThrottlerGuard.handleRequest` sets `Retry-After` (no suffix for the
  `default` throttler) and then awaits
  `this.throwThrottlingException(context, detail)`, where
  `detail.timeToBlockExpire` is the per-client-key value in seconds
  (`throttler.guard.js:117-128`). Overriding that protected method is the
  seam for the combined header.
- `ThrottlerException` is an `HttpException(message, 429)` with the default
  message `ThrottlerException: Too Many Requests` when no `errorMessage`
  option is set (`throttler.exception.js`, `throttler.guard.js:149-158`).
  `auth.module.ts` sets none. There is no global exception filter in
  `apps/api/src`, so throwing the same exception from the controller yields
  the same body.
- `InjectThrottlerOptions` and `InjectThrottlerStorage` are exported from the
  package index (`throttler.decorator.d.ts`), so the guard can declare its
  own constructor and still receive the library's dependencies.
- Guards run before pipes: the guard sees the raw `req.body.email`
  (`login-rate-limit.e2e-spec.ts` "a malformed body is still 429").
- `LoginUseCase` already returns `InvalidCredentialsError` identically for an
  unknown email, a soft-deleted user and a wrong password, and runs
  `verifyAgainstDummy` for unknown emails.
- `ThrottleCounter.expiresAt` is set by the `ThrottleCounter_set_expires_at`
  BEFORE trigger (`20261013120000_throttle_counter_expires_at`), and the
  cleanup in `PrismaThrottlerStorage.deleteExpired` deletes any row with
  `expiresAt < now()`, whatever its key.
- All 12 e2e suites mock `PrismaService` and override `ThrottlerStorage` with
  the in-memory store (`grep overrideProvider(ThrottlerStorage)`).

## Architecture Decisions

### Decision 1: The check and the hooks live in `LoginUseCase` behind an application port

**Choice**: a `LoginFailureLimiter` port injected into `LoginUseCase`:

```
execute(email, password):
  block = await limiter.getBlock(email)          // fail closed on error
  if block.blocked: throw new LoginBlockedError(block.retryAfterSeconds)
  user = await userRepository.findByEmail(email)
  isValid = user ? verify(...) : verifyAgainstDummy(...)   // unchanged
  if (!user || !isValid):
    await limiter.recordFailure(email)            // fail closed on error
    throw new InvalidCredentialsError()
  try { await limiter.reset(email) } catch { logger.warn(...) }   // user decision 2026-10-13
  ... existing denylist cleanup and token signing (unchanged)
```

`LoginBlockedError` is a new domain error in
`auth/domain/login-blocked.error.ts`, next to `InvalidCredentialsError`. It
carries `retryAfterSeconds` and no email.

**Alternatives considered**:
- *Extend `LoginThrottlerGuard` to do the check.* The guard runs before the
  Zod pipe, so it would need its own normalization and its own handling of
  non-string and missing emails. It also cannot see the outcome of the
  credential check, so the failure and reset hooks would still need a second
  place (controller or use case), splitting one rule across two layers.
- *Controller-level hooks* (`AuthController.login` calls the limiter around
  `loginUseCase.execute`). Workable, but it moves a business rule ("failures
  count, success resets, blocked attempts evaluate no credentials") into the
  presentation layer, where it can only be tested through Nest. The use case
  already owns the anti-enumeration rule, which this limit must preserve.
- *Count before credentials, then reset on success* (pessimistic
  reservation). It makes the limit exact under concurrency, but it counts
  attempts that fail for non-credential reasons (a 500 from the user
  repository), and contradicts the proposal's "count after credentials".
  The overshoot it would remove is bounded (see Decision 4).

**Rationale**:
- Hexagonal boundaries: the rule lives in the application layer with a port,
  the same shape as `TokenDenylist`. The use case stays framework-free in
  logic and is unit-tested with a mocked port.
- Anti-enumeration: one code path for every email. A blocked email is
  rejected before `findByEmail`, so a blocked unknown email and a blocked
  existing email do the same work (one read). An unblocked failed attempt
  does one read, one lookup, one argon2 verify (real or dummy) and one upsert
  for both. Only a valid credential reaches the reset, which is not an
  enumeration signal.
- No new normalization: the use case receives the pipe's output.

**Consequence for the proposal text** (spec must align): with the check in
the use case, a request whose `email` is missing, not a string or not a
valid email is rejected with 400 by the pipe before any credential
evaluation, and never reads or writes an email bucket. The proposal's "non-
string or missing emails map to one fixed bucket" is therefore unnecessary:
there is no credential evaluation to limit. See Open Questions.

### Decision 2: One shared email schema in `packages/validation`

**Choice**:

```ts
// packages/validation/src/auth/login.schema.ts
export const loginEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const loginRequestSchema = z.object({
  email: loginEmailSchema,
  password: z.string().min(1),
});
```

The pipe produces the normalized email for the use case. The guard (Decision
5) calls `loginEmailSchema.safeParse(req.body?.email)` and uses the email only
on success. There is no separate `normalizeEmail` function.

**Alternatives considered**:
- *A plain `normalizeLoginEmail(raw: unknown): string` helper* used by both
  the schema (`z.preprocess`) and the guard. It would also normalize strings
  that later fail email validation, which nothing needs, and it changes the
  schema's shape for the web client.
- *Repeat `String(email).trim().toLowerCase()` in the guard.* That is the
  drift risk the proposal names.

**Rationale**: one Zod value is the single source of truth (ADR-015); the web
form keeps its current behavior because the schema output is unchanged.

### Decision 3: A sibling adapter on `ThrottleCounter`, not an extension of `PrismaThrottlerStorage`

**Choice**: `PrismaLoginFailureLimiter implements LoginFailureLimiter` in
`apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts`.
It is constructed with `PrismaService` and the email config. It hashes keys
itself:

```ts
const EMAIL_KEY_PREFIX = 'login-email:';
const keyFor = (email: string) =>
  createHash('sha256').update(EMAIL_KEY_PREFIX + email).digest('hex');
```

The raw email never reaches SQL, a row or a log. The library's per-client-key
keys are `sha256("AuthController-login-default-<clientKey>")`. The preimage
prefixes differ, so the two namespaces can only collide through a SHA-256
collision.

**Alternatives considered**:
- *Add the three methods to `PrismaThrottlerStorage`.* That class implements
  the library's `ThrottlerStorage` with library semantics (every hit counts,
  block when `hits > limit`, `ThrottlerStorageRecord` results). The email
  limit has different semantics (failures only, block on reaching the limit,
  reset, read-only state). One class with two contracts would be harder to
  read and to test.
- *A new table* (`LoginFailureCounter`). Needs a migration and its own
  cleanup, for the same columns and the same lifecycle.
- *Columns on `User`* (explore Approach B). Rejected by decision answer 1.

**Rationale**: same table, same trigger, same cleanup, no migration; a small
class whose contract is the port.

**Cleanup**: the sibling runs no cleanup of its own. Every login attempt
passes the per-client-key guard first, and `PrismaThrottlerStorage` runs the
bounded cleanup whenever a client key opens a window. That cleanup deletes
any expired row, email rows included. Email rows live at most
window + block (30 minutes by default) after their last write.

### Decision 4: Storage semantics — fixed window, block on reaching the limit, db clock

**Read block state** (`getBlock`):

```sql
SELECT CEIL(EXTRACT(EPOCH FROM ("blockedUntil" - now())))::int AS "retryAfterSeconds"
FROM "ThrottleCounter"
WHERE "key" = ${key} AND "blockedUntil" > now()
```

No row means not blocked. A row returns `{ blocked: true, retryAfterSeconds }`
with `retryAfterSeconds >= 1`. It is a single primary-key read and writes
nothing.

**Record a failure** (`recordFailure`), one statement:

```sql
INSERT INTO "ThrottleCounter" AS t ("key", "hits", "windowEndsAt", "blockedUntil")
VALUES (
  ${key}, 1,
  date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond',
  CASE WHEN 1 >= ${maxFailures}::int
    THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond' END
)
ON CONFLICT ("key") DO UPDATE SET
  "hits" = CASE
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN 1
    ELSE t."hits" + 1
  END,
  "windowEndsAt" = CASE
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()
      THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
    ELSE t."windowEndsAt"
  END,
  "blockedUntil" = CASE
    WHEN (t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()) AND 1 >= ${maxFailures}::int
      THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN NULL
    WHEN t."hits" + 1 >= ${maxFailures}::int
      THEN date_trunc('milliseconds', now()) + ${windowMs}::bigint * interval '1 millisecond'
    ELSE NULL
  END
WHERE t."blockedUntil" IS NULL OR t."blockedUntil" <= now()
RETURNING ("blockedUntil" IS NOT NULL) AS "blocked"
```

- The window is fixed and anchored on the first failure; the block lasts one
  window from the failure that reaches the limit ("block equal to the
  window"). Both use `date_trunc('milliseconds', now())` for the same
  `timestamptz(3)` rounding reason as `PrismaThrottlerStorage`.
- **Block on reaching the limit** (`>=`), unlike the library's `>`: the 5th
  failure is evaluated, returns 401 and sets the block; the 6th attempt is
  rejected by `getBlock` with 429. This matches "after 5 failed attempts,
  further attempts get 429".
- **Blocked rows are not rewritten** (TD-35 pattern): the `DO UPDATE ...
  WHERE` skips a still-blocked row, so a failure recorded during a block
  writes no tuple, does not count and does not extend the block. The
  statement then returns no row. An expired block opens a new window
  (`hits = 1`).
- **`expiresAt` is not written**; the trigger derives it.
- **Transition detection**: a returned row with `blocked = true` can only
  come from this statement blocking the bucket, because a row that was
  already blocked is skipped and returns nothing. Exactly one concurrent
  failure sees the transition. That is where the warn log is emitted
  (Decision 7). An empty result needs no retry here (unlike
  `PrismaThrottlerStorage.increment`, nothing is returned to the caller): it
  always means the row is blocked by another statement.

**Reset** (`reset`): `DELETE FROM "ThrottleCounter" WHERE "key" = ${key}`.

**Concurrency** (READ COMMITTED, as in the hardening design Decision 5):
- *N concurrent failures below the limit*: the upserts serialize on the row
  lock, each re-reads the latest version, so all N are counted.
- *Concurrent failures crossing the limit*: exactly the failure that reaches
  `maxFailures` sets the block; later ones in the same burst are absorbed by
  the `WHERE` (not counted, block not extended).
- *Check-then-verify gap*: `getBlock` and `recordFailure` are separate
  statements around the argon2 verify, so requests already past the check
  when the bucket blocks still have their credentials evaluated. Per window,
  at most `maxFailures + (in-flight requests at that moment - 1)` credential
  evaluations happen for one email. The per-client-key limit bounds each
  source. Accepted; recorded in the ADR addendum.
- *A success concurrent with a failure*: the `DELETE` and the upsert
  serialize on the row. If the reset lands last the counter is 0; if the
  failure lands last the counter is 1 in a fresh window. Either outcome is
  correct: no failure is double-counted and no block survives a reset that
  ran after it.
- *A success after a concurrent block*: a request that passed the check and
  presents the correct password succeeds and its reset deletes the block.
  This follows from decision answer 3 (success resets), because the holder of
  the correct password is not the threat this limit addresses.

**Clock**: every comparison and every stored instant uses the database's
`now()`, so all instances agree, as for the per-client-key counter.

**Alternatives considered**:
- *A `SERIALIZABLE` transaction around read, verify and record.* It would
  hold a transaction open during argon2 (tens of milliseconds) on the shared
  pool; rejected for the same reasons as the hardening design.
- *Block when `hits > maxFailures`* (library semantics). It would allow a 6th
  evaluated failure, contradicting the success criterion.
- *Extending the block on failures during the block.* Turns the bounded DoS
  into an indefinite one for anyone who keeps sending failures; the block is
  temporary by decision.

### Decision 5: Combined `Retry-After` — the per-client-key guard reads the email block

**Choice**: `LoginThrottlerGuard` overrides `throwThrottlingException`:

```ts
protected override async throwThrottlingException(
  context: ExecutionContext,
  detail: ThrottlerLimitDetail,
): Promise<void> {
  const { req, res } = this.getRequestResponse(context);
  const parsed = loginEmailSchema.safeParse(req.body?.email);
  if (parsed.success) {
    const block = await this.failureLimiter.getBlock(parsed.data);
    if (block.blocked && block.retryAfterSeconds > detail.timeToBlockExpire) {
      res.header('Retry-After', block.retryAfterSeconds);
    }
  }
  return super.throwThrottlingException(context, detail);
}
```

The guard gains a constructor that re-declares the inherited dependencies
(`@InjectThrottlerOptions()`, `@InjectThrottlerStorage()`, `Reflector`) plus
`@Inject(LOGIN_FAILURE_LIMITER)`.

Why this is the only place the larger value must be computed:

| Client key | Email | Who answers | `Retry-After` |
|---|---|---|---|
| blocked | not blocked | guard | client key's |
| blocked | blocked, shorter | guard | client key's (already the larger) |
| blocked | blocked, longer | guard, overridden | email's (the larger) |
| not blocked | blocked | use case, via controller | email's (the client key is not blocked, so there is nothing to combine) |

So "both blocked" is only ever answered by the guard, and the larger value is
**not** reached naturally: without the override, a client blocked for 100 s
on its key and 800 s on its email would be told 100 s, then 700 s. The
override costs one primary-key read, and only on requests the per-client-key
limit already rejects with a valid email in the body. Nothing is written on
that path, so the TD-35 cheap-blocked-path property is kept (no tuple
writes). A rejected request evaluates no credentials and records no email
failure, as before.

A storage error in that read propagates and becomes a 500. This keeps one
rule for every email read and write: fail closed.

**Alternatives considered**:
- *Compute the max on the email 429 by reading the per-client-key bucket.*
  The use case only runs when the client key is not blocked, so that read
  would never find a block; it computes nothing.
- *Ignore the case and rely on the client retrying.* Contradicts decision
  answer 9.
- *Swallow a read error and keep the client key's value.* The request is
  refused either way, but this creates a second error policy for the same
  port; rejected for consistency.
- *Override `handleRequest`.* Re-implements library code that sets headers
  and counts; the protected `throwThrottlingException` hook is narrower.

### Decision 6: Error and response mapping

| Situation | Status | Body | Headers | Credentials evaluated | Email failure recorded |
|---|---|---|---|---|---|
| Client key blocked | 429 | `ThrottlerException` (library) | `Retry-After` = max(key, email) | no | no |
| Email blocked | 429 | `ThrottlerException` (same) | `Retry-After` = email's | no | no |
| Invalid body | 400 | unchanged | unchanged | no | no |
| Wrong password / unknown / soft-deleted | 401 | unchanged | unchanged | yes | yes |
| Success | 200 | unchanged | unchanged | yes | no (reset) |
| `getBlock` or `recordFailure` storage error | 500 | Nest default | — | `getBlock`: no; `recordFailure`: yes | — |
| `reset` storage error | 200 | unchanged | — | yes | — (`warn` logged) |

`AuthController.login` adds one branch:

```ts
if (error instanceof LoginBlockedError) {
  response.setHeader('Retry-After', String(error.retryAfterSeconds));
  throw new ThrottlerException();
}
```

`@Res({ passthrough: true })` gives access to the response; Nest's default
exception handler keeps headers already set, which is how the library guard's
own 429 carries `Retry-After`. The email 429 sets no `X-RateLimit-*`
headers. The per-client-key guard already set them on that request (it
passed), so headers are identical between an unknown and an existing email.
The OpenAPI 429 description becomes "Too many login attempts from this client
or for this email; see Retry-After."

**Alternatives considered**: a dedicated 429 body or message for the email
limit (would reveal which limit fired, and it would need a web change);
throwing `ThrottlerException` from the use case (leaks a Nest/library type
into the application layer).

### Decision 7: Logging

- **Block transition**: `PrismaLoginFailureLimiter.recordFailure` logs once,
  through its own `Logger`, when the statement returns `blocked = true`:
  `Login email limit reached; bucket <sha256 key> blocked for <window>s`.
  The adapter is the only component that knows the hash, so the log lives
  there; the raw email is never passed to the logger.
- **Reset failure**: `LoginUseCase` catches the error and logs a `warn`
  (`Login failure counter reset failed: <error message>`) without the email,
  then completes the login. This differs from the silent `deleteExpired`
  catch on purpose: a persistently failing reset is worth seeing.
- Nothing else is logged on the hot path.

### Decision 8: Configuration

**Choice**: in `login-rate-limit.config.ts`, beside the existing function:

```ts
export interface LoginEmailRateLimitConfig {
  maxFailures: number;
  windowMs: number;
}
export function getLoginEmailRateLimitConfig(): LoginEmailRateLimitConfig;
```

It reads `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` (default 5) and
`LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` (default 900) through the existing
module-private `parsePositiveInteger`: unset or empty uses the default,
anything else must match `^\d+$` and be at least 1, otherwise boot fails with
the variable name and raw value. Both variables also have an upper bound, so
a misconfiguration fails at boot instead of at the first failed login:
`LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES` is at most 2147483647 (the adapter casts
the limit with `::int`, the int4 maximum) and
`LOGIN_EMAIL_RATE_LIMIT_WINDOW_SECONDS` is at most 86400 (24 hours). The window
cap exists because a block lasts as long as the window and any third party who
knows an email can trigger it, so the cap bounds the account-lockout denial of
service a misconfiguration could cause; it also keeps the timestamptz
arithmetic in range. Values above the bound throw `<NAME> must be at most
<max>, got "<raw>"`. Wiring in `auth.module.ts`:

```ts
{
  provide: LOGIN_FAILURE_LIMITER,
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) =>
    new PrismaLoginFailureLimiter(prisma, getLoginEmailRateLimitConfig()),
},
```

The factory runs at module compile, like the throttler's `forRootAsync`, so
tests that set env before `compile()` see their values.

**Test env**: `apps/api/test/e2e-env.setup.ts` and
`apps/api/test/test-database/rate-limit-env.setup.ts` set
`LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES=1000`, so suites that fail a login
repeatedly with one email (for example "wrong password" cases) never trip the
new limit. Dedicated suites set and restore low values explicitly.

**Alternatives considered**: extending `LoginRateLimitConfig` with nested
email fields (touches the existing function and its spec for no gain); a
separate config file (duplicates `parsePositiveInteger` or forces exporting
it).

### Decision 9: Test seams — fake for e2e, real store for integration

The e2e suites mock `PrismaService` (`$queryRaw` resolves
`[{ '?column?': 1 }]`), so the Prisma adapter cannot run there; its
`getBlock` would even misread that mock row. Following the hardening design
Decision 8:

- An `InMemoryLoginFailureLimiter` (in
  `auth/application/use-cases/testing/`, next to the precedent
  `users/application/use-cases/testing/in-memory-user.repository.ts`)
  implements the port with the same rules (fixed window from the first
  failure, block on reaching the limit, failures during a block ignored,
  reset deletes) using `Date.now()` and the env config.
- Every e2e suite that overrides `ThrottlerStorage` also adds
  `.overrideProvider(LOGIN_FAILURE_LIMITER).useFactory({ factory: () => new InMemoryLoginFailureLimiter(getLoginEmailRateLimitConfig()) })`,
  giving each compiled app a fresh store.
- The integration tier uses the real adapter and the real `AppModule`, so
  the security-critical scenarios (distributed client keys, reset, parity,
  restart and instances, concurrency, fail closed) are proven against
  Postgres, not against the fake.

## Data Flow

```
POST /auth/login
  │
  ├─ AuthenticatedGuard (@Public → pass) / PermissionsGuard
  │
  ├─ LoginThrottlerGuard.canActivate (inherited; every attempt counts per client key)
  │     storage.increment(sha256("AuthController-login-default-<clientKey>"), ...)
  │     └─ isBlocked ─→ throwThrottlingException (override)
  │                       ├─ loginEmailSchema.safeParse(req.body.email)
  │                       ├─ ok → limiter.getBlock(email) ──→ SELECT by sha256("login-email:"+email)
  │                       │        email longer → Retry-After = email's
  │                       └─ 429 ThrottlerException (no credentials, no email failure)
  │
  ├─ ZodValidationPipe(loginRequestSchema)  ── invalid → 400 (no email bucket touched)
  │        email = loginEmailSchema → trim().toLowerCase(), valid email
  │
  └─ AuthController.login → LoginUseCase.execute(email, password)
        ├─ limiter.getBlock(email) ── blocked → LoginBlockedError(n)
        │                                     → controller: Retry-After n + 429 ThrottlerException
        ├─ userRepository.findByEmail(email)            (unchanged)
        ├─ verify / verifyAgainstDummy                   (unchanged)
        ├─ failure → limiter.recordFailure(email)  ──→ INSERT .. ON CONFLICT .. DO UPDATE .. WHERE
        │            │                                  (on transition: warn with key hash)
        │            └─ InvalidCredentialsError → 401
        └─ success → limiter.reset(email) ──→ DELETE by key (error → warn, continue)
                     → denylist cleanup, token, cookie   (unchanged) → 200

Postgres "ThrottleCounter": client-key rows and email rows side by side;
expiresAt trigger; bounded cleanup driven by PrismaThrottlerStorage.
```

## File Changes

| File | Action | PR | Description |
|------|--------|----|-------------|
| `packages/validation/src/auth/login.schema.ts` | Modify | 1 | Export `loginEmailSchema`; `loginRequestSchema.email` uses it (Decision 2) |
| `packages/validation/src/auth/login.schema.spec.ts` | Create | 1 | Vitest: trim/lowercase, invalid and non-string rejected, request schema uses the same output |
| `apps/api/src/modules/auth/application/ports/login-failure-limiter.port.ts` | Create | 1 | Port, `LoginBlock` type, `LOGIN_FAILURE_LIMITER` token |
| `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.ts` | Modify | 1 | `getLoginEmailRateLimitConfig()` (Decision 8) |
| `apps/api/src/modules/auth/infrastructure/config/login-rate-limit.config.spec.ts` | Modify | 1 | Defaults, valid values, rejected values for both new variables |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts` | Create | 1 | Hashing, `getBlock`, `recordFailure`, `reset`, transition log (Decisions 3, 4, 7) |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.integration.spec.ts` | Create | 1 | Real Postgres (see Testing Strategy) |
| `apps/api/src/modules/auth/application/use-cases/testing/in-memory-login-failure-limiter.ts` | Create | 1 | Fake for e2e (Decision 9) |
| `apps/api/src/modules/auth/domain/login-blocked.error.ts` | Create | 2 | Domain error with `retryAfterSeconds` |
| `apps/api/src/modules/auth/application/use-cases/login.use-case.ts` | Modify | 2 | Check, record, reset (Decision 1) |
| `apps/api/src/modules/auth/application/use-cases/login.use-case.spec.ts` | Modify | 2 | Port mock; ordering and error cases |
| `apps/api/src/modules/auth/presentation/auth.controller.ts` | Modify | 2 | `LoginBlockedError` → `Retry-After` + `ThrottlerException`; OpenAPI wording |
| `apps/api/src/modules/auth/presentation/auth.controller.spec.ts` | Modify | 2 | Mapping test |
| `apps/api/src/modules/auth/auth.module.ts` | Modify | 2 | `LOGIN_FAILURE_LIMITER` provider |
| `apps/api/test/*.e2e-spec.ts` (12 suites overriding `ThrottlerStorage`) | Modify | 2 | Fake limiter override |
| `apps/api/test/e2e-env.setup.ts`, `apps/api/test/test-database/rate-limit-env.setup.ts` | Modify | 2 | `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES=1000` |
| `apps/api/test/login-email-limit.e2e-spec.ts` | Create | 2 | HTTP contract with the fake (block, body identity, reset, parity) |
| `apps/api/test/login-email-limit.integration.spec.ts` | Create | 2 | Real `AppModule` + Postgres scenarios |
| `apps/api/test/login-rate-limit.integration.spec.ts` | Modify | 2 | "never stores the raw client address" now expects two rows per failed attempt (client key + email), both 64-char hex, neither containing the raw email |
| `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts` | Modify | 3 | Constructor + `throwThrottlingException` override (Decision 5) |
| `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts` | Modify | 3 | Four-argument construction; combined header cases |
| `apps/api/test/login-email-limit.e2e-spec.ts` | Modify | 3 | Both-limits `Retry-After` |
| `README.md` | Modify | 3 | Two new env vars |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modify | 3 | Addendum (Approach A, failures only, reset on success, no stored lock, SHA-256 with prefix, combined `Retry-After`, check-then-verify bound, bounded DoS) |
| `docs/technical-debt.md`, `docs/enhancements.md` | Modify | 3 | TD-31 Resolved; EN-6 extended to email keys; new ENs (admin unlock, audit table) |
| `openspec/specs/authentication/spec.md` | Modify | archive | Delta merged |

`apps/api/prisma/schema.prisma`, migrations, `apps/web/**` and i18n: unchanged.

## Interfaces / Contracts

```ts
// packages/validation/src/auth/login.schema.ts
export const loginEmailSchema: z.ZodPipe<...>; // string → trimmed, lowercased, valid email

// auth/application/ports/login-failure-limiter.port.ts
// `email` is always the normalized output of loginEmailSchema.
export type LoginBlock =
  | { blocked: false }
  | { blocked: true; retryAfterSeconds: number }; // integer >= 1

export interface LoginFailureLimiter {
  // Block state on the store's clock. Read-only. Errors propagate (fail closed).
  getBlock(email: string): Promise<LoginBlock>;
  // Counts one failed credential check. Atomic; a failure recorded while the
  // bucket is blocked is not counted and does not extend the block.
  // Errors propagate (fail closed).
  recordFailure(email: string): Promise<void>;
  // Clears the bucket after a successful login. Errors propagate; the caller
  // decides (LoginUseCase logs and continues).
  reset(email: string): Promise<void>;
}
export const LOGIN_FAILURE_LIMITER = Symbol('LOGIN_FAILURE_LIMITER');

// auth/domain/login-blocked.error.ts
export class LoginBlockedError extends Error {
  constructor(readonly retryAfterSeconds: number);
}

// auth/infrastructure/persistence/prisma-login-failure-limiter.adapter.ts
export class PrismaLoginFailureLimiter implements LoginFailureLimiter {
  constructor(prisma: PrismaService, config: LoginEmailRateLimitConfig);
}

// auth/infrastructure/config/login-rate-limit.config.ts
export interface LoginEmailRateLimitConfig { maxFailures: number; windowMs: number }
export function getLoginEmailRateLimitConfig(): LoginEmailRateLimitConfig;
```

HTTP contract: unchanged statuses and bodies; a new 429 cause with the same
body as the existing 429 and an integer `Retry-After` in seconds.

## Testing Strategy

Strict TDD (ADR-016): each row's test is written RED before the production
change it covers. Commands: `npm run test --workspace=apps/api`,
`npm run test:integration` (hermetic database), the api e2e script, and
`npm run test --workspace=packages/validation`.

| Layer | What to Test | Approach and seam |
|-------|-------------|----------|
| Unit (Vitest) | `loginEmailSchema` | `'  Admin@Example.COM '` → `'admin@example.com'`; `42`, `undefined`, `''`, `'not-an-email'` fail; `loginRequestSchema` output email equals `loginEmailSchema` output for the same input |
| Unit | `getLoginEmailRateLimitConfig` | Unset/empty → 5 / 900 000 ms; `'3'`, `'60'` accepted; `'0'`, `'-1'`, `'1.5'`, `'abc'` throw naming the variable; `2147483647` failures and `86400` s accepted, `2147483648` failures and `86401` s throw naming the variable and the maximum; the existing `LOGIN_RATE_LIMIT_*` variables reject values above `Number.MAX_SAFE_INTEGER` |
| Unit | `LoginUseCase` | Mocked port. (1) Blocked → `LoginBlockedError(n)`; `findByEmail`, `verify`, `verifyAgainstDummy`, `recordFailure` not called. (2) Wrong password, unknown email and soft-deleted (repo returns null) each call `recordFailure(email)` once and throw `InvalidCredentialsError`; call sequence identical for unknown and existing. (3) Success calls `reset(email)`, not `recordFailure`. (4) `getBlock` rejects → rejects, no credential evaluation. (5) `recordFailure` rejects → rejects (not `InvalidCredentialsError`). (6) `reset` rejects → login still returns the token, `Logger.prototype.warn` called, message without the email |
| Unit | `AuthController.login` | `LoginBlockedError(42)` → `ThrottlerException` (429, default message) and `Retry-After: 42` set on the response |
| Unit | `LoginThrottlerGuard` | Fake storage returning blocked with `timeToBlockExpire` 100. Email blocked 800 → header 800. Email blocked 50 → header stays 100. Not blocked → 100. Invalid or missing body email → `getBlock` not called. Not blocked by key → `getBlock` not called. `getBlock` rejects → rejects (500). Existing tracker tests kept |
| Integration (adapter, real Postgres) | `PrismaLoginFailureLimiter` | `randomUUID()` emails, small config. (1) Fresh email → not blocked. (2) `maxFailures - 1` failures → not blocked; the next → blocked, `retryAfterSeconds` in `[1, window]`. (3) Failures while blocked: `hits` unchanged and `blockedUntil` unchanged (no rewrite). (4) Window expiry (window 3 s; 1 s raced slow CI runners, see EN-26) → count restarts at 1. (5) Block expiry → not blocked, next failure opens a new window. (6) `reset` deletes the row; reset of a missing key resolves. (7) **Concurrency**: 50 parallel `recordFailure` with max 1000 → `hits = 50`. (8) Parallel `maxFailures + 5` → blocked and exactly one transition `warn`. (9) Stored key is `sha256("login-email:" + email)` hex; no column contains the email; the warn log contains the hash and not the email. (10) `expiresAt` is set by the trigger and an expired email row is removed by `PrismaThrottlerStorage`'s cleanup. (11) Case/whitespace variants only meet in one bucket through `loginEmailSchema` (documented as a schema-level guarantee; the adapter receives normalized input) |
| Integration (app, real Postgres) | Spec scenarios | `test/login-email-limit.integration.spec.ts`, real `AppModule`, `trust proxy` 1, `LOGIN_EMAIL_RATE_LIMIT_MAX_FAILURES=3`, a unique email and unique `X-Forwarded-For` client per failure. (1) **Distributed**: 3 failures for one email from 3 client keys → 4th from a 4th key → 429 + `Retry-After`. (2) **Reset**: seeded user (via Prisma, unique email), 2 failures, success, then 2 more failures → 401, not 429. (3) **Successes do not count**: 4 successes → still 200. (4) **Parity**: unknown email vs seeded email, same steps → identical status sequence, bodies and `Retry-After` presence. (5) **Restart and two instances**: block in app A, 429 in app B. (6) **Concurrency**: 3 parallel failures → all 401, next → 429. (7) **Fail closed**: `getBlock` and `recordFailure` spied to reject once → 500; `reset` rejects → 200. (8) Mixed-case/whitespace email variant hits the same bucket |
| E2E (mocked Prisma, fakes) | HTTP contract | `test/login-email-limit.e2e-spec.ts`, `TRUST_PROXY=true`, email max 2. Block after 2 failures across two `X-Forwarded-For` values; the 429 body equals the per-client-key 429 body from the same app; a request rejected by the email limit does not evaluate credentials (spy on the hasher); the email limit does not block another email. PR 3: both limits blocked (client key max 3 with a 1 s window, email blocked for 900 s) → `Retry-After` > 1. Timing parity is not asserted at e2e (non-deterministic); parity is proven by call-sequence equality in the use-case unit test and status/body equality at integration |

Existing suites (`login-rate-limit.e2e-spec.ts`, `login-rate-limit.integration.spec.ts`,
`auth.e2e-spec.ts`) stay green; the per-client-key rules are unchanged.

## Threat Matrix

N/A: no routing, shell, subprocess, VCS or PR automation, executable-file
classification, or process-integration boundary. The security-relevant input
is the HTTP body `email`, handled by the shared schema (Decision 2) and
hashed before storage (Decision 3); the attack surface (distributed guessing,
enumeration, bounded DoS) is covered by Decisions 1, 4 and 5 and their tests.

## Migration / Rollout

- **No schema migration.** Email rows reuse `ThrottleCounter` with its
  existing trigger, index and cleanup.
- **PR 1**: adds the port, adapter, fake and config, not wired. No runtime
  change. Rollback: revert.
- **PR 2**: wires the limit. Counters start empty. Rollback: revert PR 2 (and
  PR 3 if merged); leftover email rows are harmless and expire through the
  trigger and cleanup; the env vars become unused.
- **PR 3**: combined `Retry-After` and docs. Rollback: revert; the email limit
  keeps working with the client key's `Retry-After` on doubly blocked
  requests.
- If reverted after archive, the revert PR also restores the main spec, moves
  TD-31 back to Open and marks the ADR-011 addendum as reverted.

## PR Slicing (final split is decided in sdd-tasks)

| PR | Branch | Content | Rough lines (code / tests / docs) |
|---|---|---|---|
| 1/4 | `login-account-lockout/01-email-failure-store` | Change artifacts (incl. `explore.md`), shared email schema, config, port, Prisma adapter, in-memory fake, unit and adapter integration tests | ≈ 190 / 260 / – → **~450** (excess is tests) |
| 2/4 | `login-account-lockout/02-email-login-limit` | Domain error, use case, controller, module wiring, e2e overrides (12 suites × ~3), env setups, use-case/controller unit, e2e and app-level integration tests | ≈ 110 / 300 / – → **~410** |
| 3/4 | `login-account-lockout/03-combined-retry-after` | Guard override and tests, both-limits e2e, README, ADR-011 addendum, registers | ≈ 40 / 100 / 110 → **~250** |
| 4/4 | `login-account-lockout/04-archive` | Spec merge, archive | docs only |

Planning artifacts in PR 1 are not counted above. This revises the proposal's
3-PR hint: with the guard, wiring and all tests in one PR, the forecast is
about 650 lines, most of it tests but also about 150 lines of logic and
wiring, so the size exception would not apply cleanly. The alternative,
if the user prefers fewer PRs, is the proposal's 3-PR split with PR 2 under
the size-exception rule.

## Open Questions

- [x] Spec alignment (non-blocking for design): the proposal says non-string
      or missing emails map to one fixed bucket. With the check in the use
      case (Decision 1), such requests get 400 from validation before any
      credential evaluation and touch no email bucket. Recommendation: the
      delta spec states "a request whose email fails validation is rejected
      without evaluating credentials and does not affect any email counter"
      instead of a fixed bucket. Confirm in `sdd-spec`. Resolved 2026-10-13:
      the delta spec says invalid emails get 400 and count as no failure.
- [x] Spec alignment: the email limit blocks on reaching the limit (5th
      failure evaluated and blocks; 6th rejected), unlike the per-client-key
      limit (11th rejected). The spec should state this explicitly. Resolved:
      the delta spec's "Email blocked after the failure limit" scenario.
- [ ] Non-blocking: under concurrency, up to `maxFailures + in-flight - 1`
      credential evaluations can happen per window for one email (Decision 4).
      Recorded in the ADR addendum; no change planned.
- [x] Confirm the 4-PR chain versus the proposal's 3 PRs in `sdd-tasks`.
      Resolved 2026-10-13: the user accepted 4 PRs.
