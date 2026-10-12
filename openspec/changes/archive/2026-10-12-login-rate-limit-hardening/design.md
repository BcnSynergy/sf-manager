# Design: Login rate-limit hardening (TD-28, TD-29, TD-30)

## Technical Approach

Three independent hardening steps on the existing `POST /auth/login` throttle,
mapped one-to-one to the proposal and the `authentication` delta spec:

1. **TD-28.** `getTrustProxySetting()` returns `false | number` and accepts a
   positive integer hop count. Express already interprets a numeric
   `trust proxy` as a hop count, so `main.ts` keeps passing the value through
   unchanged.
2. **TD-29.** A `LoginThrottlerGuard` subclass of `ThrottlerGuard` overrides
   only `getTracker`, delegating to a pure `toClientKey(ip)` function that maps
   IPv4 to itself, IPv4-mapped IPv6 to IPv4, IPv6 to its `/64` prefix, and an
   undefined or unparsable address to one shared fallback key.
3. **TD-30.** A `PrismaThrottlerStorage` adapter implements the library's
   `ThrottlerStorage` interface with one atomic
   `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` statement against a new
   `ThrottleCounter` table, using the database clock. A bounded,
   best-effort, `SKIP LOCKED` delete of expired rows runs on increments that
   open a new window. No cron, timer or Redis. It is wired through
   `ThrottlerModule.forRootAsync({ inject: [PrismaService], ... })`.

Facts verified in the installed `@nestjs/throttler` 6.4.0
(`node_modules/@nestjs/throttler/dist/`):

- `ThrottlerStorage.increment(key, ttl, limit, blockDuration, throttlerName): Promise<ThrottlerStorageRecord>`
  (`throttler-storage.interface.d.ts:3`). `ttl` and `blockDuration` are in
  milliseconds.
- `ThrottlerStorageRecord = { totalHits, timeToExpire, isBlocked, timeToBlockExpire }`
  (`throttler-storage-record.interface.d.ts`). `timeToExpire` and
  `timeToBlockExpire` are whole seconds, `Math.ceil(ms / 1000)`
  (`throttler.service.js:19-24`).
- **The guard already hashes the key.** `ThrottlerGuard.generateKey` returns
  `sha256(\`${Class}-${handler}-${name}-${tracker}\`)` as hex
  (`throttler.guard.js:142-145`, `hash.js`). The storage only ever receives a
  64-character hex string, never the raw tracker.
- `blockDuration` defaults to `ttl` when unset (`throttler.guard.js:83`).
- `Retry-After` is set from `timeToBlockExpire` only when `isBlocked` is true
  (`throttler.guard.js:117-118`). `X-RateLimit-Remaining` is
  `max(0, limit - totalHits)`.
- Reference semantics of the in-memory store (`throttler.service.js:48-86`):
  blocked once `totalHits > limit`; hits are not counted while blocked; when
  the block expires, the count resets and the current hit counts as 1.
- `ThrottlerStorageProvider` returns `options.storage` when the options are in
  object form, otherwise a new in-memory `ThrottlerStorageService`
  (`throttler.providers.js:16-24`). `ThrottlerModule` is `@Global()` and
  exports the `ThrottlerStorage` token (`throttler.module.js:23-31, 61`).
- `getTracker(req)` is `protected async`, defaults to `req.ip`, and is used
  when no module-level `getTracker` option is set (`throttler.guard.js:56, 135-137`).

## Architecture Decisions

### Decision 1: TRUST_PROXY parsing — strict, `false | number`

**Choice**: `getTrustProxySetting(env): false | number`.

| Raw value | Result |
|---|---|
| unset, `''`, `'false'` | `false` |
| `'true'` | `1` |
| matches `/^[1-9]\d*$/` and `Number.isSafeInteger` | that integer |
| anything else (`'0'`, `'-1'`, `'1.5'`, `'01'`, `' 2'`, `'TRUE'`, `'loopback'`, CIDR, ...) | throws `Error` naming `TRUST_PROXY` and the raw value |

`main.ts` keeps `app.set('trust proxy', getTrustProxySetting(process.env))`.
Only its comment changes. The throw happens before `app.listen`, so the
rejected `bootstrap()` promise ends the process without serving requests. This
is the same fail-fast path the current `'yes'` case already uses.

**Alternatives considered**: accept Express's full syntax (CIDR, `loopback`,
comma lists), which the user rejected; a lenient parse such as `parseInt`,
which accepts `'2abc'` and `'1.5'`; a production default hop count, which
would be a guess about an unknown topology.

**Rationale**: a hop count is topology-agnostic and needs no production facts.
Exact-match parsing makes every typo a boot failure instead of a silently
spoofable or shared key. `'1'` and `'true'` intentionally mean the same thing.

### Decision 2: Tracker in a guard subclass in `auth/presentation/guards/`

**Choice**: `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts`:

```ts
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(toClientKey(req.ip));
  }
}
```

There is no constructor. Nest resolves the inherited constructor parameter
metadata (`@InjectThrottlerOptions()`, `@InjectThrottlerStorage()`,
`Reflector`), which is the pattern the library documents for proxy-aware
guards. `AuthController.login` switches from `@UseGuards(ThrottlerGuard)` to
`@UseGuards(LoginThrottlerGuard)`. The OpenAPI 429 description changes from
"this IP" to "this client".

**Alternatives considered**:
- A module-level `getTracker` option in `forRootAsync`. It works, but it is
  implicit: it would apply to any future `ThrottlerGuard` use, and it is not
  visible at the route.
- Overriding `generateKey`. That would also take over the hashing the library
  already does correctly.
- Placing the guard in `shared/`. Only the auth login route uses it (ADR-006).

**Rationale**: smallest override (one method). It sits next to the existing
`authenticated.guard.ts` and `permissions.guard.ts`. The address logic stays
in a pure function that can be unit-tested without Nest.

### Decision 3: `toClientKey` — pure normalization with `node:net`, no library

**Choice**: `apps/api/src/modules/auth/presentation/guards/client-key.ts`
exports `toClientKey(ip: unknown): string` and
`UNRESOLVED_CLIENT_KEY = 'unresolved'`.

Algorithm:

1. If `ip` is not a non-empty string, return `UNRESOLVED_CLIENT_KEY`.
2. Strip any zone id: take the part before the first `%`
   (`fe80::1%eth0` becomes `fe80::1`).
3. If `isIP(s) === 4`, return `s`. IPv4 behavior is unchanged.
4. If `isIP(s) === 6`, expand to 8 sixteen-bit groups. Split on `::` and fill
   the gap with zero groups. A trailing dotted quad becomes two groups. Hex
   parsing is case-insensitive.
   - If groups 0-4 are `0` and group 5 is `0xffff` (IPv4-mapped), return the
     dotted IPv4 from groups 6-7, so `::ffff:198.51.100.7` and
     `::FFFF:c633:6407` both give `198.51.100.7`.
   - Otherwise return the canonical `/64` key: groups 0-3 in lowercase hex
     without leading zeros, followed by `::/64`, for example
     `2001:db8:0:1::/64`. All compressed and uncompressed spellings of one
     prefix produce the same string.
5. Otherwise (unparsable), return `UNRESOLVED_CLIENT_KEY`.

**Fallback semantics (undefined or unparsable `req.ip`)**: every such request
shares the single `'unresolved'` bucket. The function never throws, and the
request is still counted and limited. Keying unparsable values by their raw
text was rejected. Under a misconfigured `TRUST_PROXY`, a client controls the
leftmost `X-Forwarded-For` entry and could mint unlimited buckets with
arbitrary strings. A shared bucket makes that strictly worse for the
attacker. In a correct deployment `req.ip` is always a valid address, so
legitimate traffic never lands in this bucket.

**Alternatives considered**: `ipaddr.js`, which is already a transitive
dependency through `proxy-addr`. Using it directly would mean relying on a
transitive dependency or adding a new direct dependency, and the proposal
says no new library. `net.SocketAddress.parse` does not produce prefixes. A
`/56` prefix was considered; the user settled on `/64`.

**Rationale**: about 40 lines of deterministic code with exhaustive table
tests. `node:net`'s `isIP` does the validation, so the expansion only handles
well-formed input.

### Decision 4: `ThrottleCounter` Prisma model — hashed key, DB-clock timestamps

**Choice**:

```prisma
// login-rate-limit-hardening/design.md Decision 4: persisted counters for
// ThrottlerStorage. `key` is ThrottlerGuard.generateKey's sha256 hex — never
// a raw IP. Rows are written only by raw SQL using the DB clock (now()), so
// both timestamps are timestamptz to avoid any session-timezone ambiguity.
model ThrottleCounter {
  key          String    @id
  hits         Int
  windowEndsAt DateTime  @db.Timestamptz(3)
  blockedUntil DateTime? @db.Timestamptz(3)

  // Opportunistic cleanup filters on windowEndsAt (Decision 6).
  @@index([windowEndsAt])
}
```

Migration `apps/api/prisma/migrations/<timestamp>_add_throttle_counter/migration.sql`
is purely additive: `CREATE TABLE "ThrottleCounter"` plus the index. It does
not touch existing data.

**Key hashing (no raw IPs at rest)**: confirmed above. The guard stores
`sha256("AuthController-login-default-<clientKey>")`, so the adapter adds no
hashing of its own. **Known limitation**: an unsalted SHA-256 of an IPv4
address can be reversed by enumerating 2^32 candidates. At rest the value is
pseudonymized, not anonymized. Retention is short: rows are reused or deleted
after their window ends.

**Alternatives considered**:
- An HMAC with a new secret env var. That adds secret management and grows
  scope; it is recorded as an open question.
- A row per hit (sliding log). Unbounded writes and more cleanup.
- `timestamp(3)` without time zone, the house default. It is safe for
  Prisma-written columns, but these columns are compared against `now()` in
  raw SQL, so `timestamptz` removes a whole class of time-zone bugs.
- Storing `throttlerName` in its own column. It is already part of the hashed
  key, and only `'default'` exists.

**Rationale**: one row per client key and window gives bounded size and an
O(1) indexed upsert. Using the DB clock means every instance agrees on window
boundaries even when instance clocks drift.

### Decision 5: Atomic increment — single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`

**Choice**: `PrismaThrottlerStorage.increment` runs one `$queryRaw` statement.
In `ON CONFLICT DO UPDATE SET`, every right-hand expression reads the old row
(`t`), so all four `CASE` branches see a consistent pre-image:

```sql
INSERT INTO "ThrottleCounter" AS t ("key", "hits", "windowEndsAt", "blockedUntil")
VALUES (${key}, 1, date_trunc('milliseconds', now()) + ${ttl}::bigint * interval '1 millisecond', NULL)
ON CONFLICT ("key") DO UPDATE SET
  "hits" = CASE
    WHEN t."blockedUntil" > now() THEN t."hits"                       -- (A) still blocked: not counted
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN 1 -- (B/C) block or window over: new window
    ELSE t."hits" + 1                                                  -- (D) live window
  END,
  "windowEndsAt" = CASE
    WHEN t."blockedUntil" > now() THEN t."windowEndsAt"
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now()
      THEN date_trunc('milliseconds', now()) + ${ttl}::bigint * interval '1 millisecond'
    ELSE t."windowEndsAt"
  END,
  "blockedUntil" = CASE
    WHEN t."blockedUntil" > now() THEN t."blockedUntil"
    WHEN t."blockedUntil" IS NOT NULL OR t."windowEndsAt" <= now() THEN NULL
    WHEN t."hits" + 1 > ${limit}::int
      THEN date_trunc('milliseconds', now()) + ${blockDuration}::bigint * interval '1 millisecond'
    ELSE NULL
  END
RETURNING
  "hits" AS "totalHits",
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("windowEndsAt" - now()))))::int AS "timeToExpire",
  ("blockedUntil" IS NOT NULL AND "blockedUntil" > now()) AS "isBlocked",
  CASE WHEN "blockedUntil" > now()
    THEN CEIL(EXTRACT(EPOCH FROM ("blockedUntil" - now())))::int ELSE 0 END AS "timeToBlockExpire";
```

`ttl` and `blockDuration` are cast to `bigint`, not `int`, so a value above
2^31-1 ms cannot overflow and fail every login closed (`interval * bigint` is
evaluated as double precision). Window and block ends are anchored on
`date_trunc('milliseconds', now())` because the columns are `timestamptz(3)`,
which rounds: an untruncated `now() + ttl` could be stored up to 0.5 ms late
and make `CEIL` of the remaining seconds report `ttl + 1` (observed: 61 for a
60 s window). Comparisons against the stored columns still use plain `now()`.
Both refinements came out of the PR 2 implementation and review.

The adapter maps the single returned row to `ThrottlerStorageRecord`. The
`throttlerName` argument is ignored because it is already part of the hashed
key. The exact casts and parameter types under `@prisma/adapter-pg` are
confirmed by the RED integration tests. Raw-query errors surface as `P2010`
(see the note in `prisma-review-template.repository.ts`).

**Block semantics** (identical to the reference store): the hit that takes
`hits` above `limit` sets `blockedUntil = date_trunc('milliseconds', now()) + blockDuration`,
where `blockDuration` equals `ttl` because no `blockDuration` is configured. That
same hit returns `isBlocked = true`, so the 11th attempt gets 429. Attempts
during the block are rejected and not counted. The first attempt after the
block expires opens a new window with `hits = 1`, which covers the spec's
"Window elapsed" scenario. The window is fixed and anchored at the first hit,
which matches the spec text "within a fixed time window".

**Concurrency**: under READ COMMITTED, Postgres guarantees that
`INSERT ... ON CONFLICT DO UPDATE` ends in exactly one insert or one update
per statement. Concurrent statements on the same key serialize on the row
lock, and each re-reads the latest committed version, so no hit is lost. This
holds across connections, instances and restarts.

**Failure mode**: errors propagate, and the guard surfaces a 500. This fails
closed. Failing open (skipping the limit when the store errors) was rejected,
because an attacker who can degrade the DB would also disable the throttle.
Login already needs the DB, so availability does not get worse.

**Alternatives considered**:
- Prisma `upsert` with `{ increment: 1 }`. It cannot express the
  conditional window reset or block in one statement, and a
  read-then-write would race.
- `SERIALIZABLE` transactions with retry. More round trips and retry
  handling, which the house already found deadlock-prone
  (`prisma-review-template.repository.ts` C-1 note).
- `SELECT ... FOR UPDATE` followed by an update. Two statements and the
  same guarantee.

**Rationale**: one round trip, atomic by construction, no retry logic, and the
same observable semantics as the in-memory store, so the existing e2e
expectations (`Retry-After` within the window, recovery after the window)
still hold.

### Decision 6: Cleanup — bounded, best-effort, on new-window increments only

**Choice**: after the upsert, when the returned `totalHits === 1` (a new row
or a reset window), the adapter runs:

```sql
DELETE FROM "ThrottleCounter" WHERE "key" IN (
  SELECT "key" FROM "ThrottleCounter"
  WHERE "windowEndsAt" < now()
    AND ("blockedUntil" IS NULL OR "blockedUntil" < now())
  LIMIT 100
  FOR UPDATE SKIP LOCKED
);
```

The delete is awaited, and any error is caught and swallowed. This follows
the precedent of `LoginUseCase` and `LogoutUseCase` calling
`tokenDenylist.deleteExpired()` inside `try/catch` ("must never gate an
otherwise-successful login").

Correctness under races:

- `SKIP LOCKED` never waits on a row that a concurrent upsert holds.
- `FOR UPDATE` re-checks the `WHERE` clause against the newest row version
  (EvalPlanQual), so a row that a concurrent upsert just revived is not
  deleted.
- If the delete wins the row lock first, the waiting `INSERT ... ON CONFLICT`
  sees the row gone and inserts a fresh one, which is correct because the
  window had expired.
- Only expired rows are ever deleted, so live counts are never lost.

Bound: the table only grows through inserts, each insert path can remove up
to 100 expired rows, and expired rows that are hit again are reused in place.
The table therefore stays within roughly the live keys plus a backlog that
drains much faster than it fills.

**Alternatives considered**:
- Cron or `setInterval`. This needs a long-lived process, which is ruled out
  because the deploy may be serverless.
- A cleanup in a data-modifying CTE inside the upsert. That is one round
  trip, but a cleanup failure would fail the login.
- Probabilistic cleanup (1 in N). Non-deterministic and harder to test.
- Cleanup on every increment. This adds a second statement to every
  attempt, including blocked ones that attackers generate.

**Rationale**: no infrastructure, deterministic, cheap (indexed and bounded),
and isolated from the outcome of the login.

### Decision 7: Wiring — `forRootAsync` with `inject: [PrismaService]`

**Choice** in `auth.module.ts`:

```ts
ThrottlerModule.forRootAsync({
  inject: [PrismaService],
  useFactory: (prisma: PrismaService) => {
    const { maxAttempts, windowMs } = getLoginRateLimitConfig();
    return {
      throttlers: [{ name: 'default', ttl: windowMs, limit: maxAttempts }],
      storage: new PrismaThrottlerStorage(prisma),
    };
  },
}),
```

`PrismaService` is resolvable because `PrismaModule` is `@Global()`
(`shared/infrastructure/persistence/prisma.module.ts`). The throttler stays
named `'default'`, keeping the plain `Retry-After` header. Moving from array
options to object options is supported: `onModuleInit` builds `commonOptions`
from the object, and `getTracker` stays unset, so the subclass override
applies.

**Port/adapter placement**: `PrismaThrottlerStorage` lives in
`apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts`,
next to `PrismaTokenDenylistAdapter`, and implements `ThrottlerStorage` from
`@nestjs/throttler` directly. The library interface is the port. Its only
consumer is the library guard, so there is no application-layer use case to
shield, and a wrapper port would add no value (ADR-006). It is
constructed manually in `forRootAsync` with `PrismaService` passed in (the class
does carry `@Injectable()`, but Nest does not resolve it). Tests use
`new PrismaThrottlerStorage(prisma)`, exactly like the token-denylist
integration spec.

**Alternatives considered**:
- `inject: [PrismaThrottlerStorage]` with an extra provider module in
  `imports`. More wiring for the same result.
- An env switch to select the memory store, such as
  `LOGIN_RATE_LIMIT_STORE=memory`. It would let production silently fall
  back to TD-30's behavior, so it is rejected.

### Decision 8: Test isolation — e2e keeps in-memory storage, integration uses key isolation

The e2e suites (`jest-e2e.json`) override `PrismaService` with a mock that
only has `$queryRaw → [{ '?column?': 1 }]` (12 suites, verified by grep).
Once the Prisma storage is wired, any e2e login would hit that mock.

**Choice**:

- **E2E (no database)**: every e2e suite whose app serves `POST /auth/login`
  adds
  `.overrideProvider(ThrottlerStorage).useFactory({ factory: () => new ThrottlerStorageService() })`.
  Both names come from `@nestjs/throttler`. The factory form gives every
  compiled app a fresh store, which preserves `login-rate-limit.e2e-spec.ts`'s
  per-app isolation (its D10 comment). Nest calls `onApplicationShutdown` on
  factory-provided instances (`@nestjs/core/hooks/on-app-shutdown.hook.js:33-44`),
  so `app.close()` still clears the store's timers and Jest does not hang.
  The e2e tests keep proving HTTP behavior (429, `Retry-After`, tracker and
  hop logic). Persistence is proven by the integration tier.
- **Integration (hermetic per-run DB, `--runInBand`)**: suites run
  sequentially on one database per run, so counters persist across suites
  within that run.
  - Isolation is by key, not by truncation. The new app-level integration
    spec sets `trust proxy` to `1` and sends a run-unique documentation-range
    address in `X-Forwarded-For` for each test case. Each test gets its own
    IPv6 `/64` in `2001:db8::/32` built from `randomUUID()` bytes, or its own
    IPv4 in `203.0.113.0/24` where IPv4 is the point of the test. It never
    uses the socket address `127.0.0.1` that other integration specs log in
    from.
  - The adapter integration spec calls the adapter directly with
    `randomUUID()` keys.
  - A new `test/test-database/rate-limit-env.setup.ts`, registered in
    `jest-integration.json` `setupFiles`, sets
    `LOGIN_RATE_LIMIT_MAX_ATTEMPTS=1000`, mirroring `e2e-env.setup.ts`. As a
    result, the cumulative `127.0.0.1` logins of other integration specs
    (today `review-schedule.integration.spec.ts`) can never reach a 429. The
    rate-limit integration spec sets and restores its own small limit
    explicitly.
  - Leftover rows are harmless, because every run gets a fresh database.

**Alternatives considered**:
- `TRUNCATE "ThrottleCounter"` in hooks. That is a global side effect on a
  shared per-run database and depends on suite order.
- A shared e2e app-builder helper refactor. Wider churn than the
  per-suite override.
- Wiring the real store into e2e. There is no database in e2e.

## Data Flow

```
POST /auth/login
  │
  ├─ Express: trust proxy = getTrustProxySetting()  (false | N hops)
  │     └─ req.ip = socket address, or the address N hops back in X-Forwarded-For
  │
  ├─ AuthenticatedGuard (@Public → pass) / PermissionsGuard
  │
  ├─ LoginThrottlerGuard.canActivate  (inherited)
  │     ├─ getTracker(req) ──→ toClientKey(req.ip)
  │     │        "203.0.113.7" | "2001:db8:0:1::/64" | "198.51.100.7" (mapped) | "unresolved"
  │     ├─ generateKey()  ──→ sha256("AuthController-login-default-<clientKey>")   (library)
  │     └─ storage.increment(hashKey, ttlMs, limit, blockMs, 'default')
  │              │
  │              ▼
  │        PrismaThrottlerStorage ──(1 statement: INSERT..ON CONFLICT..RETURNING)──→ Postgres "ThrottleCounter"
  │              │   if totalHits === 1: bounded DELETE .. SKIP LOCKED (errors swallowed)
  │              ▼
  │        { totalHits, timeToExpire, isBlocked, timeToBlockExpire }
  │     isBlocked → 429 + Retry-After (unchanged contract); else X-RateLimit-* headers
  │
  └─ ZodValidationPipe → LoginUseCase (unchanged)
```

## File Changes

| File | Action | PR | Description |
|------|--------|----|-------------|
| `apps/api/src/shared/infrastructure/env/trust-proxy.ts` | Modify | 1 | `false \| number`, strict hop-count parsing (Decision 1) |
| `apps/api/src/shared/infrastructure/env/trust-proxy.spec.ts` | Modify | 1 | Table tests for accepted and rejected values |
| `apps/api/src/main.ts` | Modify | 1 | Comment only (N hops); call unchanged |
| `apps/api/src/modules/auth/presentation/guards/client-key.ts` | Create | 1 | Pure `toClientKey` + `UNRESOLVED_CLIENT_KEY` (Decision 3) |
| `apps/api/src/modules/auth/presentation/guards/client-key.spec.ts` | Create | 1 | Table tests: IPv4, IPv6 forms, mapped, zone id, undefined, garbage |
| `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.ts` | Create | 1 | `ThrottlerGuard` subclass overriding `getTracker` (Decision 2) |
| `apps/api/src/modules/auth/presentation/guards/login-throttler.guard.spec.ts` | Create | 1 | `getTracker` delegates; missing `req.ip` resolves without throwing and is still counted |
| `apps/api/src/modules/auth/presentation/auth.controller.ts` | Modify | 1 | `@UseGuards(LoginThrottlerGuard)`, 429 description wording |
| `apps/api/test/login-rate-limit.e2e-spec.ts` | Modify | 1, 3 | PR 1: `TRUST_PROXY=2` and spoofed-prefix cases, IPv6 `/64` share and isolate, mapped IPv4. PR 3: `ThrottlerStorage` in-memory override |
| `README.md` | Modify | 1, 3 | PR 1: `TRUST_PROXY` values and topology table. PR 3: counters persisted in Postgres |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md` | Modify | 1, 3 | New addendum: PR 1 answers open questions 2 and 3, with the topology table. PR 3 answers question 4 and records ADR-001/serverless and question 1 as still open |
| `apps/api/prisma/schema.prisma` | Modify | 2 | `ThrottleCounter` model (Decision 4) |
| `apps/api/prisma/migrations/<ts>_add_throttle_counter/migration.sql` | Create | 2 | Additive table and index |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts` | Create | 2 | `ThrottlerStorage` implementation (Decisions 5 and 6) |
| `apps/api/src/modules/auth/infrastructure/persistence/prisma-throttler-storage.adapter.integration.spec.ts` | Create | 2 | Atomicity, window, block, expiry and cleanup against real Postgres |
| `apps/api/src/modules/auth/auth.module.ts` | Modify | 3 | `forRootAsync` object options with `storage` (Decision 7) |
| `apps/api/test/*.e2e-spec.ts` (suites that log in) | Modify | 3 | In-memory `ThrottlerStorage` override (Decision 8) |
| `apps/api/test/login-rate-limit.integration.spec.ts` | Create | 3 | Restart, two instances, concurrent attempts via real `AppModule` and DB |
| `apps/api/test/test-database/rate-limit-env.setup.ts` | Create | 3 | Raise the login limit for integration suites |
| `apps/api/test/jest-integration.json` | Modify | 3 | Register the setup file in `setupFiles` |
| `openspec/specs/authentication/spec.md` | Modify | archive | Delta merged |
| `docs/technical-debt.md` | Modify | archive | TD-28, TD-29 and TD-30 to Resolved with PR numbers; TD-31 stays open; possible new EN/TD entries (see Open Questions) |

## Interfaces / Contracts

```ts
// shared/infrastructure/env/trust-proxy.ts
export function getTrustProxySetting(env: { TRUST_PROXY?: string | undefined }): false | number;

// auth/presentation/guards/client-key.ts
export const UNRESOLVED_CLIENT_KEY = 'unresolved';
export function toClientKey(ip: unknown): string;

// auth/presentation/guards/login-throttler.guard.ts
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string>;
}

// auth/infrastructure/persistence/prisma-throttler-storage.adapter.ts
export class PrismaThrottlerStorage implements ThrottlerStorage {
  constructor(prisma: PrismaService);
  increment(key: string, ttl: number, limit: number, blockDuration: number,
            throttlerName: string): Promise<ThrottlerStorageRecord>;
}
```

The HTTP contract is unchanged: 429 with the generic message and
`Retry-After` in seconds.

## Testing Strategy

Strict TDD (ADR-016): each row's test is written RED before the production
change it covers.

| Layer | What to Test | Approach and seam |
|-------|-------------|----------|
| Unit | `getTrustProxySetting` | `it.each` accepted: unset, `''`, `'false'` → false; `'true'` → 1; `'1'`, `'2'`, `'10'` → n. Rejected (throws `/TRUST_PROXY/`): `'0'`, `'-1'`, `'1.5'`, `'01'`, `' 2'`, `'2 '`, `'TRUE'`, `'loopback'`, `'10.0.0.0/8'`, `'1,2'`, `'9007199254740993'` |
| Unit | `toClientKey` | Table: IPv4 passthrough; `2001:db8::1` and `2001:0DB8:0:0:ffff::2` share `2001:db8:0:0::/64`; different `/64` values differ; `::ffff:198.51.100.7` and `::ffff:c633:6407` → `198.51.100.7`; `fe80::1%eth0` → `fe80:0:0:0::/64`; `::1`; `::`; embedded dotted tail that is not mapped (`64:ff9b::1.2.3.4`) → its `/64`; `undefined`, `''`, `42`, `'not-an-ip'` → `'unresolved'`; never throws |
| Unit | `LoginThrottlerGuard` | Construct with a fake storage and the options array, call `getTracker({})` and `getTracker({ ip: '2001:db8::5' })`. Also run `canActivate` with a stub `ExecutionContext` and no `req.ip`: the storage fake receives a key (counted), and nothing throws |
| Integration (adapter, real Postgres) | `PrismaThrottlerStorage` | `new PrismaThrottlerStorage(new PrismaService())` with `randomUUID()` keys. (1) First hit: `{1, ≈ttl s, false, 0}`. (2) `limit + 1` hits: the last is `isBlocked` with `timeToBlockExpire ≥ 1`. (3) Hits while blocked are not counted. (4) Window expiry with ttl 1000 ms, wait about 1.2 s → `totalHits` 1. (5) Block expiry → reset to 1, not blocked. (6) **Concurrency**: 50 parallel `increment` calls with limit 1000 → returned `totalHits` values are exactly the set {1..50}, and the row has `hits = 50`. (7) Concurrent `limit + 5` with limit 10 → exactly 10 unblocked results. (8) Cleanup: seed expired rows and one live row with `prisma.throttleCounter.createMany` using past and future dates, increment a new key → expired rows gone (at most 100 per call), live row intact. (9) A hashed key is stored verbatim (no raw IP column exists) |
| Integration (app, real Postgres) | Spec scenarios on persistence | `test/login-rate-limit.integration.spec.ts`: real `AppModule`, `trust proxy` 1, unique `X-Forwarded-For` per case, limit 3 via env. **Restart**: app A exhausts the key → `close()` → app B on the same DB → 429. **Two instances**: A gets 2 attempts and B gets 1, then the next attempt on either → 429. **Concurrent**: 3 parallel attempts → none 429, the 4th → 429. Failed logins (unknown email, 401) count, so no user seeding is needed |
| E2E (mocked Prisma, in-memory store) | Tracker and hop logic over HTTP | Existing cases kept. New cases: `TRUST_PROXY=2` with `X-Forwarded-For: client, proxy` keys on `client`; a spoofed prefix `spoof, client, proxy` still keys on `client`; IPv6 same `/64` → 429 on rotation; different `/64` → 200; `::ffff:198.51.100.7` shares with `198.51.100.7` (with `TRUST_PROXY=true`). Startup failure for invalid values stays at the unit level, because `main.ts` is not exercised by e2e |

The undefined-IP scenario cannot be produced through supertest (`req.ip` is
always set). It is covered by the guard unit test above. This seam is the
reason `toClientKey` is pure and the guard override is trivial.

## Threat Matrix

N/A: there is no routing, shell, subprocess, VCS or PR automation,
executable-file classification, or process-integration boundary. The
security-relevant inputs are the HTTP `X-Forwarded-For` and `TRUST_PROXY`
values, and they are covered by Decisions 1 and 3 and their tests.

## Migration / Rollout

- **PR 1**: no schema change. Deploy note: a numeric `TRUST_PROXY` is new.
  Before reverting PR 1, reset it to `true` or unset it, otherwise boot
  fails, as intended.
- **PR 2**: additive migration (`CREATE TABLE "ThrottleCounter"` and an
  index), applied by the normal `prisma migrate deploy`. The adapter is not
  wired yet, so there is no runtime change. Rollback: revert the code. The
  empty table is harmless, or a follow-up migration can drop it.
- **PR 3**: wiring switches the runtime from memory to Postgres. Counters
  start empty on first deploy, the same as today's restart. Rollback: revert
  PR 3. The module returns to the in-memory default, and counters reset once.
  The table can stay.
- Each PR reverts independently. PR 2 and PR 3 do not depend on PR 1. They
  store whatever key the tracker produces.

## PR Slicing (final split is decided in sdd-tasks)

| PR | Branch | Content | Rough lines (code / tests+docs) |
|---|---|---|---|
| 1/4 | `login-rate-limit-hardening/01-trust-proxy-hops-ipv6-key` | TD-28 + TD-29: trust-proxy, `client-key`, guard, controller swap, unit and e2e tests, README table, ADR addendum (questions 2 and 3) | ≈ 90 / 220 → **~310** |
| 2/4 | `login-rate-limit-hardening/02-prisma-throttler-storage` | TD-30 storage: model, migration, adapter, adapter integration spec (not wired) | ≈ 110 / 200 → **~310** |
| 3/4 | `login-rate-limit-hardening/03-wire-persistent-throttle` | Wiring, e2e storage overrides (≈ 12 suites × 3 lines), app-level integration spec, integration setup file, README and ADR (question 4, ADR-001 note) | ≈ 20 / 230 → **~250** |
| 4/4 | `login-rate-limit-hardening/04-archive` | Spec merge, TD register moves, archive | docs only |

This revises the proposal's 3-PR hint. Combining TD-30 into one PR forecasts
about 560 lines, and the excess would be e2e wiring rather than fixtures, so
the size exception does not apply cleanly. Splitting storage from wiring keeps
each PR under about 400 lines, with an autonomous scope and an independent
revert. The alternative is a single TD-30 PR under the size-exception rule, if
the user prefers fewer PRs.

## Open Questions

- [ ] Non-blocking: should keys at rest use an HMAC with a secret instead of
      the library's unsalted SHA-256, which is enumerable for IPv4? The
      recommendation is to record it as an `EN-<n>` entry in the archive PR
      and not do it now.
- [ ] Non-blocking (already in the proposal): production topology, and the
      ADR-001 revisit if a serverless or shared platform is chosen.
      Recorded in the ADR-011 addendum.
- [ ] Non-blocking: fixed-window semantics allow up to about 2 × limit
      attempts around a window boundary (for example 10 at the end of one
      window and 10 at the start of the next). This matches the spec's
      "fixed time window". It is noted in the ADR addendum, with no change
      planned.
