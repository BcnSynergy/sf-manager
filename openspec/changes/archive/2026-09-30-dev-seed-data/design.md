# Design: Dev Seed Data

## Technical Approach

`prisma/seed.ts` keeps its admin bootstrap byte-for-byte. After it, one
allow-list gate (`shouldSeedDevData(NODE_ENV)`, true only for
`'development'`) decides whether to run `seedDevDataset`. If the gate is
closed, the seed logs a skip line instead. The technician leaves `seed.ts`
and becomes an ordinary dataset user created through `CreateUser`.

The dataset has three parts, all under `apps/api/src/shared/seeding/`:

- a declarative constant (`DEV_DATASET`);
- pure decision functions, one per entity kind (skip / create / resume);
- a thin orchestrator. It resolves use cases and repository ports from any
  Nest context, looks up each entity by natural key, and calls the
  application use cases only for what is missing. Each planned session runs
  inside one fail-soft guard (Decision 12).

No Prisma access outside the existing adapters (ADR-013). No new use case,
port method, schema change or UI.

## Evidence (verified in code)

| # | Fact | Source |
|---|---|---|
| E1 | Every create use case is non-idempotent. `CreateUser` inserts (`userRepository.create`) and runs `PlainPassword.create` (min 10 chars, a letter, a digit). | `create-user.use-case.ts:63,97`, `password.schema.ts:8-16` |
| E2 | `RecordEntry` and `CompleteReviewSession` load through `SessionAccess.loadForActor`, which reads `findByIdForPerformer(id, actor.userId)`. Only the performer can record and complete. | `session-access.service.ts:36-54` |
| E3 | `Complete` rejects when an active element of the community is not covered (`UnreviewedElementsWithoutReasonError`). | `complete-review-session.use-case.ts:77-88` |
| E4 | The session port offers `findDraftsByPerformer` and `findCompletedForPerformer`. There is no unscoped `findById`. | `review-session.repository.port.ts:50,131` |
| E5 | Lookups exist for every other natural key: `findByEmail`, `MaintenanceCompanyRepository.findAll`, `CommunityRepository.findAll`, `findByCommunityAndUser` (representative and technician), `findAllByCommunity` (elements), `ChecklistQuestionRepository.findAll`, `ReviewTemplateRepository.findAll`. | ports under `modules/*/application/ports` |
| E6 | `OpenReviewSession` snapshots `performedByCompanyId` from the performer's user row. | `open-review-session.use-case.ts:112-113` |
| E7 | Integration specs build `Test.createTestingModule({ imports: [AppModule] })` against the hermetic per-run database. That database is shared by every spec in the run. | `test/app.integration.spec.ts:30-32`, hermetic design Decision 1 |
| E8 | Only `seed.ts` imports `src/shared/seeding`. The build already excludes `src/shared/testing`. | grep, `tsconfig.build.json:13` |

## Architecture Decisions

| # | Question | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Module location and shape | `src/shared/seeding/`: `dev-dataset.ts` (constant plus `DEV_SEED_PASSWORD`), `dev-seed-plan.ts` (pure decisions), `seed-dev-dataset.ts` (orchestrator plus `resolveDevSeedDeps(ctx)`). Add `src/shared/seeding` to `tsconfig.build.json`'s exclude list. | `apps/api/prisma/` (outside the Jest roots, so the integration spec cannot reach it). Inlining the dataset into `seed.ts` (untestable, and it mixes the prod-safe bootstrap with public credentials). | Follows the gate's existing home and the `shared/testing` pattern: pure logic plus thin glue. Dev-only code with a public password does not ship in `dist` (E8). |
| 2 | How `seed.ts` invokes it | After `userRepository.save(admin)`: `await runDevSeed(process.env.NODE_ENV, describeDatabaseHost(process.env.DATABASE_URL), resolveDevSeedDeps(app), DEV_DATASET, console.log)`, which checks the gate, logs the skip (with the database host) when it is closed, and otherwise logs the start line (with the host) and calls `seedDevDataset`. `resolveDevSeedDeps` takes `{ get<T>(token): T }` and resolves by class or token. | A second npm script or a `DEV_SEED` flag. | `prisma db seed` alone produces a QA-ready database. Prisma 7 does not auto-seed after `migrate reset` (the installed `prisma ^7.9.1` CLI has no `--skip-seed`, and the README already documents two steps), so the flow is `prisma migrate reset` and then `prisma db seed`. The structural `get` type fits both `INestApplicationContext` (seed) and `TestingModule` (integration spec). |
| 3 | Gate | Rename to `should-seed-dev-data.ts` / `shouldSeedDevData(nodeEnv) => nodeEnv === 'development'`. It no longer uses `isProduction`. The spec flips: `undefined`, `'test'`, `'staging'`, `'production'`, `''` and `'Development'` are false; only `'development'` is true. Skip log: `Skipping dev seed data (technician and dataset): NODE_ENV is "<value>" (or unset); set NODE_ENV=development in apps/api/.env to seed it. Target database host: <host>.` The start log line also prints the target database host. The host comes from `describeDatabaseHost(url: string | undefined): string` (pure, in `describe-database-host.ts`): it returns host and port only, never credentials, and returns `'unknown'` for an unset or malformed URL without throwing. `seed.ts` computes it from `DATABASE_URL` and passes it into `runDevSeed`. | Keeping the name `shouldSeedDevAccount` (it now gates a dataset, not one account). Normalizing case or whitespace (an allow-list should be exact). | Binding user decision. An exact match fails closed. |
| 4 | Natural keys and skip-if-exists | Company: upper-cased `taxId` among live rows. User: `email`. Community: `name`. Assignment: `(communityId, userId)`, any state; an existing assignment is never reactivated or modified. A deactivated seeded assignment needs no pre-check: the session use cases throw `CommunityNotInScopeError` / `ReviewSessionNotFoundError`, which the general session guard turns into a warning and a skip (Decision 12). Element: `(communityId, name)`. Question: `(elementType, text)`. Template: see row 5. Session: see row 6. Profile: none, it is always overwritten. | Fixed UUIDs through `save()` (bypasses use cases and invariants). | These keys are what a person recognizes. The existing ports cover all of them (E5), so no new port methods are needed. All dataset names carry a `Dev Seed` marker to avoid clashing with other data. **Blocked entities:** a seeded user that cannot be created or has drifted (Decision 11) is *blocked* (pre-check, because writing sessions for it would persist a null company snapshot). Every assignment and session that depends on a blocked user is skipped and logged. The rest of the run continues. **Soft-deleted emails:** `findByEmail` filters `deletedAt: null` (`prisma-user.repository.ts:47-53`) but the `User.email` unique index also covers soft-deleted rows, so `CreateUser` can throw `EmailAlreadyInUseError` for a seeded email. The orchestrator catches that error for a seeded email only, logs a warning naming the email and pointing to `migrate reset` then `db seed`, and blocks that user. Any other error propagates. |
| 5 | Template (EXTINGUISHER × MONTHLY) | `planTemplate(templatesOfLineage)`: an active one exists → use it if its frozen snapshot (`findFrozenWithSnapshot`) has at least one question; an active template whose snapshot has zero questions is unusable (other integration specs leave such a template in the shared per-run DB, for example `prisma-review-session.repository.integration.spec.ts` around lines 284-330 and 1520-1560, and `RecordEntry` rejects empty answers), so the seed logs it and skips every new `open` plan that depends on it (fail-soft, `skip-unusable-active`). `skip-unusable-active` and `skip-foreign-draft` block only new `open` plans; resuming a draft bound to a still-valid older template version is unaffected (Decision 6). A draft exists → resume it only if its name carries the seed marker (`Dev Seed`): `SetQuestions` and `Activate` it. A draft without the marker belongs to someone else: log it, leave it untouched, skip the template, and skip every new `open` plan (no seeded active template to open against). Neither → `CreateDraft`, `SetQuestions`, `Activate`. Answers come from the frozen snapshot (`findFrozenWithSnapshot`), not from the seeded question ids. | Always creating a template (fails on the one-draft-per-lineage index, and activating again bumps the version). | Reruns and resumes after a partial failure add nothing. It also survives a shared integration database whose other specs may already own this lineage. These template pre-checks stay because they prevent writing to someone else's draft and opening drafts that can never be filled. |
| 6 | Session keys and resume | Key = `(performer, community)` only, never the template (a new template version must not open a second draft or session). `planSession(plan, completedOfPerformer, draftsOfPerformer)`. **Completed plan:** a completed session exists in the community -> skip; a draft exists in the community -> resume it (record the planned elements that have no entry yet, then complete); otherwise open, record, complete. **Draft plan:** a completed session already exists for the `(performer, community)` pair (for example QA completed the seeded draft in the browser) -> skip; else a draft exists -> resume it (record its planned element if it has no entry); else open and record 1 entry. The resume plan is `{ kind: 'resume', sessionId }`. **Resume mechanics:** `findDraftsByPerformer` hydrates no entries (`apps/api/src/modules/review-session/infrastructure/persistence/prisma-review-session.repository.ts:139-145`, `toDomain(record, [])`), so the orchestrator finds the draft there and then loads it through `findByIdForPerformer(sessionId, performerId)` (same file, lines 122-135), which does hydrate entries (`loadEntriesWithAnswers`). It builds the answers from `findFrozenWithSnapshot(session.templateId)`, the session's OWN template version (not the active one, matching `RecordEntry`, `record-entry.use-case.ts:86-88`), and records only the planned elements whose id is absent from `session.entries`. Existing entries, including QA edits, are never overwritten. A crash between open and record heals on the next run, and a rerun never hits `OpenDraftAlreadyExistsError`. Draft and completed plans never share a `(performer, community)` pair, and a unit spec asserts this. Sessions of a blocked performer are skipped (Decision 4). Any error inside a session falls to the guard (Decision 12). | A marker column or name (no such field exists, and adding one is a schema change). Keying on the template id (after a new version, a rerun would add sessions). Re-recording every planned entry (would overwrite QA edits). Building answers from the active template (a draft bound to an older version would fail `AnswersDoNotMatchTemplateError`). | Resume turns a crash between open and complete (or open and record) into a fill-the-gap step. The order "completed, else draft, else open" survives QA completing the draft. |
| 7 | Actor | The performer: `{ userId, role }` of the seeded technician or representative. It opens, records and completes. | The admin (`SessionAccess` rejects it, E2). | This is forced by the access model. It also exercises the real scope checks. |
| 8 | Entries | Every planned entry targets an element by its dataset name (natural key `(communityId, name)`), never by query order: `findActiveByCommunityAndType` has no `orderBy` (`prisma-inspectable-element.repository.ts:177-188`), so positional picks are nondeterministic. Each planned entry is `reviewed` with `YES` for each snapshot question. S2 (`technician@`/C2, which has 2 extinguishers) has one named element with a `NO` answer and the other `unreviewed` with an observation, for variety. `ElementReviewEntry` is unique per (session, element) (`schema.prisma:425`), so this needs two elements in the community. Any other active element of the community (for example one QA added) is covered at run time as `reviewed` with `YES` so `Complete` succeeds (E3). | Picking elements by list position. Recording only the seeded elements (`Complete` fails if other active elements exist, E3). | Coverage is computed at run time; the named picks keep reruns and resumes deterministic. |
| 9 | Password and capability | `DEV_SEED_PASSWORD = 'sf-manager-dev-1'` goes through `CreateUser`, so `PlainPassword` validates it (E1). A unit spec asserts that `passwordSchema` accepts it. `VIEW_ALL_REVIEWS`: if the granted manager lacks it, call `UpdateUser({ id, managerCapabilities: ['VIEW_ALL_REVIEWS'] })`. | Hashing directly (today's technician path, which skips the policy). A per-role password. | Binding user decision. The grant is idempotent by check. |
| 10 | Canonical literals | A unit spec parses every dataset literal through the shared request schemas and asserts the output is unchanged: `createUserSchema`, `createMaintenanceCompanySchema`, and the community, element, question and profile schemas. | Parsing at runtime. | Use cases trust input that the HTTP pipe has already canonicalized. Without this check, a lower-case tax id would silently defeat the skip key. |
| 11 | Pre-existing drift | If a user exists with a different role or company, the seed logs a warning that tells the operator to run `migrate reset` then `db seed`, blocks the user, and skips that user's assignments and sessions (logging why). It does not repair the row. Sessions are immutable snapshots, so writing them with `performedByCompanyId = null` would be permanent. | Repairing the row (not additive). Failing the seed. Writing sessions for a drifted user. | The current dev technician has no company and the old password. It would silently empty the company-manager scope. |
| 12 | General fail-soft guard per session | Each planned session (open, resume, record, complete) runs inside one guard, `runSessionGuarded`, in `seed-dev-dataset.ts`. It catches the expected domain errors of the session use cases, decided by the pure predicate `isExpectedSessionError(error)` in `dev-seed-plan.ts`: `ReviewSessionNotFoundError`, `CommunityNotInScopeError`, `ActiveTemplateNotFoundError`, `InspectableElementNotFoundError`, `AnswersDoNotMatchTemplateError`, `ReviewSessionNotEditableError`, `UnreviewedElementsWithoutReasonError`, `OpenDraftAlreadyExistsError`. On a match it logs a warning naming the session plan, the performer, the community and the error, skips that session, and the run continues. Any other (non-domain) error propagates. **Pre-checks that remain**, only where they prevent writing bad or foreign data: user drift and soft-deleted email (Decisions 4 and 11; opening would snapshot a null company, which is immutable), and the template plan (Decision 5; never touch a foreign draft, never open a draft that cannot be filled). Everything else falls to the guard: a deactivated seeded assignment, a deactivated or removed seeded element (`InspectableElementNotFoundError` via `findReviewableById`), a QA-changed template or session state. | One branch per case (a growing list that misses the next QA change). Catching all errors (hides real bugs). | QA changes state in unforeseeable ways; a skip with a warning is always safe because a skipped session leaves at most a draft that the next run resumes. Class evidence: `session-access.service.ts:42,51`; `open-review-session.use-case.ts:87,96,104`; `record-entry.use-case.ts:90,107,142,187`; `complete-review-session.use-case.ts:70,85,98`; `prisma-review-session.repository.ts:114`. |

## Dataset

| Kind | Rows |
|---|---|
| Companies | A `Dev Seed Fire Safety A`, B `Dev Seed Fire Safety B` |
| Users (`@sf-manager.example`; the dataset seeds the 4 non-admin roles, the `SYSTEM_ADMIN` comes from the `seed.ts` bootstrap) | `technician@` (A), `technician2@` (B), `companymgr@` (MAINTENANCE_COMPANY_MANAGER, A), `rep@`, `manager@` (VIEW_ALL_REVIEWS), `manager-nocap@` |
| Communities | C1 `Dev Seed Residences North` (2 extinguishers), C2 `Dev Seed Residences South` (2 extinguishers) |
| Assignments | `rep@` → C1; `technician@` → C1, C2; `technician2@` → C2 |
| Questions / template | 3 EXTINGUISHER questions with MONTHLY; 1 active template |
| Completed | S1 `technician@`/C1, S2 `technician@`/C2 (with the NO and the unreviewed entry, one per extinguisher), S3 `technician2@`/C2 |
| Draft | `rep@`/C1, 1 of 2 entries recorded |

Expected scopes:

| User | Sees |
|---|---|
| `technician@` | S1, S2 |
| `companymgr@` | S1, S2 |
| `rep@` | S1 |
| `technician2@` | S3 |
| `manager@` | Same as the admin |
| `manager-nocap@` | Nothing |

## Data Flow

    prisma db seed → seed.ts
      admin bootstrap (unchanged)
      runDevSeed: shouldSeedDevData(NODE_ENV) ── false → log skip + host, exit
      seedDevDataset(deps, DEV_DATASET, log)   (blocked users skip their dependents;
                                                each session runs in runSessionGuarded)
        profile → companies → users(+grant) → communities → assignments
        → elements → questions → template → sessions
        each step: lookup by natural key → plan* (pure) → use case | log "exists"

## File Changes

| File | Action |
|---|---|
| `apps/api/src/shared/seeding/should-seed-dev-account{,.spec}.ts` | Rename to `should-seed-dev-data{,.spec}.ts`. Allow-list logic; the spec flips. |
| `apps/api/src/shared/seeding/dev-dataset.ts` (+ spec) | Create: the dataset, the password, the canonical-literal spec |
| `apps/api/src/shared/seeding/dev-seed-plan.ts` (+ spec) | Create: `planTemplate`, `planSession`, `findByNaturalKey` helpers, `describeUserDrift`, `isExpectedSessionError` |
| `apps/api/src/shared/seeding/describe-database-host.ts` (+ spec) | Create: `describeDatabaseHost` pure helper (host and port only, `'unknown'` on unset or malformed URL) |
| `apps/api/src/shared/seeding/seed-dev-dataset.ts` | Create: orchestrator, `runSessionGuarded`, `runDevSeed` (gate plus dataset) and `resolveDevSeedDeps` (glue) |
| `apps/api/src/shared/seeding/seed-dev-dataset.integration.spec.ts` | Create |
| `apps/api/prisma/seed.ts` | Modify: remove the technician block, compute `describeDatabaseHost(process.env.DATABASE_URL)`, add the `runDevSeed` call |
| `apps/api/tsconfig.build.json` | Modify: exclude `src/shared/seeding` |
| `apps/api/.env.example` | Create (tracked): `NODE_ENV=development`, the existing keys with placeholder values |
| `README.md` | Modify: `.env` setup (`NODE_ENV`), dev accounts and password, reset section (`migrate reset` then `db seed` yields the dataset) |
| `CLAUDE.md` | Modify: the *Dev data is nearly empty* bullet becomes a description of the seeded dataset |

## Interfaces / Contracts

```ts
export function shouldSeedDevData(nodeEnv: string | undefined): boolean;
export function seedDevDataset(deps: DevSeedDeps, data: DevDataset, log: (line: string) => void): Promise<void>;
export function runDevSeed(nodeEnv: string | undefined, databaseHost: string, deps: DevSeedDeps, data: DevDataset, log: (line: string) => void): Promise<'seeded' | 'skipped'>;
export function describeDatabaseHost(url: string | undefined): string;
export function isExpectedSessionError(error: unknown): boolean;
export function resolveDevSeedDeps(ctx: { get<T>(token: unknown): T }): DevSeedDeps;
export type TemplatePlan = { kind: 'use-active'; id: string } | { kind: 'finish-draft'; id: string } | { kind: 'create' } | { kind: 'skip-foreign-draft'; id: string } | { kind: 'skip-unusable-active'; id: string };
export type SessionPlan = { kind: 'skip' } | { kind: 'resume'; sessionId: string } | { kind: 'open' };
// planSession(plan, completedOfPerformer, draftsOfPerformer): no template argument.
// Resume reads the session's own templateId; only `open` needs the active template.
```

## Testing Strategy (Strict TDD, ADR-016)

| Layer | What | How |
|---|---|---|
| Unit (red first) | Gate allow-list, including the flipped cases. `planTemplate` with fake ports for all branches: use-active, finish-draft, create, foreign draft left alone (`skip-foreign-draft`) and active template without questions (`skip-unusable-active`). `planSession` for completed-skip, resume, open, draft-skip-when-completed, draft-resume and draft-open, with `skip-unusable-active` blocking only `open` plans and not resumes. Resume records only missing planned elements from the session's own template (fake deps: existing entries, including a QA edit, are never re-recorded). `isExpectedSessionError`: true for each class in Decision 12, false for a generic `Error`. `runSessionGuarded` with fakes: a domain error logs a warning naming plan, performer, community and error and the next session still runs; a non-domain error propagates. Blocked-user propagation. `EmailAlreadyInUseError` handling. `runDevSeed(nodeEnv, databaseHost, deps, data, log)` (extracted from `seed.ts`; returns `'seeded'` or `'skipped'`): with a closed gate it calls no dev use case (fake deps that throw) and logs the skip line with the host; with an open gate it logs the start line with the host. `describeDatabaseHost`: credentials stripped (`user:pass@` never appears), host and port kept, malformed URL and unset both return `'unknown'` without throwing. The draft and completed plans share no pair. Password accepted. Canonical literals. `describeUserDrift`. | `npm test` |
| Integration | Run `seedDevDataset` twice on `AppModule` in the per-run database (E7). Row counts filtered to the seeded natural keys are identical after run 1 and run 2 (not global counts, because the database is shared). The draft exists exactly once. A soft-deleted seeded email is skipped with a warning while the rest is seeded. A drifted user gets no assignments or sessions. Organization profile: a pre-modified profile holds the seeded values after the run. **Session scenarios** (`ListReviewHistory` per seeded actor matches the scope table, `manager@` equals the admin's list, `manager-nocap@` is empty; a crash between open and record heals on rerun; a rerun after the draft is completed opens no new draft; a resume after a newer template version opens no second draft and keeps the session's own template; a QA-edited entry survives a rerun; a seeded session whose preconditions QA changed, for example a deactivated seeded assignment or element, is skipped with a warning and the run completes) run against whatever template the lineage holds, see the lineage handling below. No backdating: every session created by a given run has a timestamp at or after a `Date` captured just before that run. | `test:integration` |
| Static file check | A small unit spec reads two files by exact path, resolved from the spec's `__dirname` (`apps/api/src/shared/seeding`; Jest `rootDir` is `src`, so `process.cwd()` must not be assumed): `path.resolve(__dirname, '../../../.env.example')` (`apps/api/.env.example`) must contain `NODE_ENV=development`, and `path.resolve(__dirname, '../../../../../README.md')` (repo-root `README.md`) must contain each seeded account email AND the `DEV_SEED_PASSWORD` value. | `npm test` |
| Manual | `migrate reset` then `db seed` with `NODE_ENV=development`, then log in as each role in the browser. `NODE_ENV` unset: only the admin is seeded and the skip line is printed. The admin-still-seeded path stays manual because `seed.ts` is the untested composition root (Nest context plus database connection), as it is today. The untracked `apps/api/.env` is verified through `.env.example`, the README and the skip log, not by reading it. | apply-progress |

Test details:

- **Reading data without raw Prisma (ADR-013):** assertions go through ports and list use cases resolved from the `TestingModule` (`UserRepository`, `MaintenanceCompanyRepository`, `CommunityRepository`, `ChecklistQuestionRepository`, `ReviewTemplateRepository`, `ListReviewHistory`, `GetOrganizationProfileUseCase`), never `PrismaService`.
- **Shared per-run database:** counts, role checks and "exactly one `MANAGER` holds `VIEW_ALL_REVIEWS`" are all filtered to the seeded natural keys (`@sf-manager.example` emails, `Dev Seed` names), never global.
- **Per-test isolation:** seeded natural-key rows persist across tests in the shared database. The spec therefore uses a `buildDataset(suffix)` helper (in the spec file or `src/shared/seeding` test support) that derives a full dataset per scenario with unique emails, company and community names, and tax IDs from a suffix. Because the natural keys are unique per scenario, scenarios do not see each other's rows.
- **Template lineage across tests:** the EXTINGUISHER x MONTHLY lineage is global (one active per lineage), cannot be suffixed and may hold other specs' leftovers, so the integration spec never depends on a lineage it did not create. Deterministic approach: in `beforeAll` the spec calls `planTemplate` against whatever the DB holds (through ports, no `PrismaService`, ADR-013) and records the resulting kind. Seeded-key assertions that hold for every plan kind (companies, users, communities, assignments, elements, questions, profile, drift, soft-deleted email, idempotent counts) always run. Session scenarios branch on the kind: when it is `use-active`, `finish-draft` or `create`, the spec asserts the full session outcomes; when it is `skip-foreign-draft` or `skip-unusable-active`, it asserts the opposite deterministic outcome (no session rows for the seeded performers and a logged skip reason). The unusable-template branches themselves are covered by the `planTemplate` unit specs with fake ports, not by DB scenarios. Run alone (`--runTestsByPath`), the lineage is empty (`create`), so the full session outcomes are exercised at least in the apply-time verification.
- **Admin comparison:** `seedDevDataset` does not create the `SYSTEM_ADMIN`. The integration test builds its own `SYSTEM_ADMIN` `Actor` (a fixed `{ userId, role: 'SYSTEM_ADMIN' }`) to call `ListReviewHistory` for "the admin's list", and compares `manager@` against it.
- **Harness setup:** booting `AppModule` needs `process.env.JWT_SECRET` and `process.env.CORS_ORIGIN` set before `Test.createTestingModule` (see `test/app.integration.spec.ts:24-27`). Argon2id hashing for 6 users, the serializable template activation and the sessions likely exceed Jest's 5 s default, and `test/jest-integration.json` sets no `testTimeout`. The spec therefore calls `jest.setTimeout(60_000)` (or passes a per-test timeout) for the seeding tests.

The integration spec calls `seedDevDataset` directly (Jest's `NODE_ENV=test`
would close the gate). The gate and `runDevSeed` are covered by unit specs.

Scenario coverage by level (spec scenario -> level): gate, skip message with
host, `describeDatabaseHost` -> unit; foreign template draft left alone and
active template without questions -> unit (`planTemplate`, fake ports);
skipped-with-warning general guard -> unit (`runSessionGuarded`, fakes) plus
one integration scenario; partial data completed, resume with own template,
new template version, completed draft not reopened -> unit for the plan,
integration for the DB effect; drift, soft-deleted email, second run, profile,
scopes, no backdating -> integration; password and README/`.env.example`
content -> unit (static file check).

## Migration / Rollout

No schema change. Suggested slices (`stacked-to-main`), finalized at
`sdd-tasks`:

| PR | Scope | Est. code / test |
|---|---|---|
| 1 (acceptance: after merge, reset the dev DB with `prisma migrate reset` then `prisma db seed`, with the user's OK, because the existing technician row has drifted) | Gate rename and flip; `describeDatabaseHost`; `runDevSeed` and `seed.ts` wiring and skip log; companies, users and the grant; drift and soft-delete handling; `.env.example`; README env and accounts; a minimal run-twice integration test | ~170 / ~230 |
| 2 | Communities, assignments, elements, questions, template, profile | ~150 / ~150 |
| 3 | Sessions (`planSession`, entries, resume, `runSessionGuarded`); scope assertions; README reset and CLAUDE.md | ~120 / ~180 |

Between PR 1 and PR 3, `technician@` exists but has no sessions. That
state is valid, just less useful. Rollback means reverting the PRs;
seeded rows stay until the next `migrate reset`.

## Open Questions

- [ ] The local `apps/api/.env` is untracked. Apply adds `NODE_ENV=development` to it only with the user's OK; otherwise the user adds it.
- [ ] The user must run `migrate reset` and then `db seed` once after PR 1 (an explicit PR 1 acceptance step), because the existing technician row has drifted (Decision 11).
- [ ] If QA edits a seeded question so it no longer lists MONTHLY while a Dev Seed draft template is unfinished, `finish-draft` throws an uncaught domain error from `setTemplateQuestions` and the seed aborts. The window is narrow (a draft only exists after a crash between create and activate). Not handled.

## Accepted Limitations

- `AddRepresentative` displaces an incumbent QA-assigned representative if the seeded representative assignment is missing (rare partial-run case).
- Drift detection covers role and company only. A QA-granted capability on `manager-nocap@` or a changed password is not detected, so README credentials may then fail. The fix is `migrate reset` then `db seed`.
- The gate keys only on `NODE_ENV`. An existing non-development database that already holds the old technician is not cleaned up. The seed log prints the target database host so the operator can see where it runs.
- The session guard catches a fixed list of expected domain errors (Decision 12). A new domain error thrown by a session use case in the future is not on the list and would abort the run until the list is extended.
- `src/shared/seeding` imports module use cases and ports, an accepted exception to the current `src/shared` to `modules` direction (an alternative location would be a top-level `apps/api/src/seeding/`, deferred).
