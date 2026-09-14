# Design: System-Admin Review History Scope

## Technical Approach

The fourth scope on the already-shipped `review-history` surface, at exactly
the seam the three prior slices built: one repository method pair, one role
branch, one `ROLE_PERMISSIONS` entry, two web role-list widenings. No schema
change, no new port, no new primitive, no new page.

The whole slice hinges on one property: this is the app's **first read with no
scope narrowing**, and "no `WHERE` scope" must be impossible to confuse with
"forgot the `WHERE` scope" — in the port, at the call site, and in the test
suite. Everything below is shaped by that.

The slice's rules, each in exactly one place:

| Rule | Where it is enforced | How it is auditable |
|---|---|---|
| Caller holds `reviewSession:read` | `PermissionsGuard` + `@RequirePermission` (Layer 1) | `ROLE_PERMISSIONS` gains one entry |
| A `SYSTEM_ADMIN`'s scope is the whole installation | The port method **name**, `…AcrossInstallation` (Decision 1) | Two methods, two `WHERE status='completed'` clauses, nothing else |
| No Layer 2 call for this role | The branch calls the repository directly (Decision 3) | Unit test asserts neither scope checker is touched |
| The unscoped pair has exactly one caller | `ReviewHistoryAccessService`'s `SYSTEM_ADMIN` branch | Source-scan call-site guard test (Decision 2) |
| The other three scopes are byte-unchanged | Their branches and their four methods are untouched | E2E four-role matrix, no sampling |

**Verified on `main` before designing, not assumed**: `ReviewSessionRepository`
has 8 read methods, every one carrying a performer, community or company scope;
the port-surface guard test (`prisma-review-session.repository.integration.spec.ts:742`)
enumerates them as an **exact allowlist** and asserts `not.toContain('findById')`.
`ReviewHistoryAccessService` dispatches `SYSTEM_ADMIN` and `MANAGER` through a
shared fallthrough returning `[]`/`null`. `ROLE_PERMISSIONS.SYSTEM_ADMIN` holds
27 permissions, no `reviewSession:*`. `AuthenticatedGuard` verifies the token
and checks the denylist — it does **not** re-read the `User` row. `HealthPage`
renders links from two role `Set`s; a `SYSTEM_ADMIN` currently renders **none**.

## Architecture Decisions

### Decision 1 — the pair is named for the scope it has, not for the check it lacks (open question 1)

**Choice**: two new methods on the shipped `ReviewSessionRepository`, following
the established one-named-method-per-(scope × shape) convention:

```ts
// review-history-admin-scope design.md Decision 1/2: the SYSTEM_ADMIN scope.
// The scope IS the installation — `WHERE status = 'completed'` and nothing
// else. This is the ONLY read on this port with no narrowing conjunct, and
// that is DELIBERATE, not an omission: total-oversight audit is the whole
// point of the SYSTEM_ADMIN scope (proposal "Total oversight, no
// exceptions"). Deactivated communities and soft-deleted maintenance
// companies are INCLUDED on purpose — deleted context must not hide a
// compliance record from the auditor. Callable from exactly ONE place:
// ReviewHistoryAccessService's SYSTEM_ADMIN branch. Do NOT reach for this
// pair for a scoped need; use the …InCommunities/…ForPerformer/…ForCompany
// method for that scope. Same COMPLETED_HISTORY_ORDER_BY as every other
// list method.
findCompletedAcrossInstallation(): Promise<ReviewSession[]>;
findCompletedByIdAcrossInstallation(id: string): Promise<ReviewSession | null>;
```

**Alternatives considered**: `findCompletedByIdUnrestricted` /
`…Unscoped` / `…ForAdmin` / `findAllCompleted`.

**Rationale**: the port's three shipped suffixes (`InCommunities`,
`ForPerformer`, `ForCompany`) each name **a scope dimension**. `AcrossInstallation`
is the fourth value of that same dimension, so the pair reads as *"the
installation-wide scope"* — a positive statement about the data set — and slots
into the existing convention rather than fracturing it. The rejected names all
describe the **absence of a check**: `…Unrestricted`/`…Unscoped` read as an
escape hatch and actively invite the misuse this slice must prevent ("I just
need the row, I'll use the unrestricted one"); `…ForAdmin` names a role, which
couples the persistence port to the authorization model and lets a future caller
reason "my caller is admin-ish, close enough"; `findAllCompleted` is exactly the
bare name the proposal's open question 1 rules out, and is what autocomplete
offers first to someone typing `findAll`. Nobody reaching for a scoped read
types "AcrossInstallation".

### Decision 2 — the "no identifier-only read" invariant is restated, not abandoned (open question 2 — the slice's biggest decision)

`findCompletedByIdAcrossInstallation(id)` **is** an identifier-only read. The
shipped property cannot survive verbatim, so it is restated precisely:

> Every by-id read on `ReviewSessionRepository` **names its scope in its own
> name**, and takes that scope as a required parameter **unless the named scope
> is the whole installation** — in which case the method is reachable from
> exactly one call site: the `SYSTEM_ADMIN` branch of
> `ReviewHistoryAccessService`. `findById` still does not exist, and never will.

Three enforcement mechanisms, in order of strength:

1. **The port-surface guard test is an exact allowlist** (already shipped).
   `expect(readMethods.sort()).toEqual([...])` grows from 8 names to 10. Any
   eleventh read method — including a bare `findById` — fails the suite until
   someone amends the allowlist deliberately. `expect(readMethods).not.toContain('findById')`
   stays.
2. **A new call-site guard test**: scan `apps/api/src/**/*.ts`, excluding
   `*.spec.ts` and `**/testing/**`, for `findCompletedAcrossInstallation` and
   `findCompletedByIdAcrossInstallation`; assert the matching files are exactly
   the port, the two adapters and `review-history-access.service.ts`. A
   second production caller fails the build. Precedent for reading source from a
   test: `review-session-migration.integration.spec.ts`.
3. **The comment quoted in Decision 1** states *why* the `WHERE` is bare, so a
   reviewer or a later slice reading "no scope clause" finds the intent in place
   rather than inferring a bug and "fixing" it.

**Alternative considered and rejected**: put the pair on a **separate port**
(`InstallationWideReviewHistoryReader`, its own DI symbol, injected only into
`ReviewHistoryAccessService`), leaving `ReviewSessionRepository` literally free
of any unscoped read. Rejected: the structural gain is largely illusory —
`PrismaReviewSessionRepository` would still carry both methods on the same
class, so the port-surface guard test sees them either way — while the cost is
real: a second injection, a second fake, a second binding, and a fracture of the
one-port convention three slices built, for one role. ADR-006: the naming plus
two guards buy the same property at a fraction of the structure. Also rejected:
having the admin branch call the list method and filter by id in memory — that
is caller-side narrowing, which the shipped spec requirement *"History Scope Is
Carried by the Query, Not by the Caller"* forbids outright.

### Decision 3 — the admin branch makes no Layer 2 call and no extra guard (open question 3)

**Choice**: the shared `SYSTEM_ADMIN`/`MANAGER` fallthrough is **split**; the
admin branch calls the repository directly, with no checker and no
early return. `MANAGER` keeps its own `case` and its own comment, so its `[]`
still reads as intentional:

```ts
// NEW (review-history-admin-scope design.md Decision 1/3): the ONLY branch
// in this service with no scope resolution at all. There is no
// AdminScopeChecker to call — a checker that always answers "everything"
// would be ceremony that dilutes the meaning of the two real checkers. The
// ROLE *is* the scope (proposal "No scope predicate at all"), so there is
// nothing to fail closed ON, and no early return belongs here.
case 'SYSTEM_ADMIN':
  return this.repository.findCompletedAcrossInstallation();

// Still no history scope for this role (proposal non-goal: MANAGER +
// VIEW_ALL_REVIEWS is a separate, unbuilt slice) — intentionally [], not
// forgotten. MANAGER never reaches a repository call.
case 'MANAGER':
  return [];
```

`loadByRole` changes identically, to `findCompletedByIdAcrossInstallation(sessionId)`
and `case 'MANAGER': return null`. The exhaustive `switch` and its
`satisfies never` backstop stay.

**Stated explicitly rather than left to the absence** (open question 3): a
`SYSTEM_ADMIN` who is soft-deleted mid-session keeps reading until their access
token expires (≤2h) or their `jti` is revoked, because `AuthenticatedGuard`
verifies the token without re-reading the `User` row and this branch makes no
per-request DB check. That is **not** a new precedent: it is the same staleness
already accepted for the `role` claim (ADR-011's 2026-08-22 addendum), and the
`MAINTENANCE_TECHNICIAN` branch has likewise made no per-request re-read since
the 2026-09-09 reversal. The remedy, when it comes, is ADR-011's unbuilt
`User.sessionsValidFrom` follow-up — installation-wide, not admin-specific. No
extra guard ships here.

### Decision 4 — one permission, and the row shape is unchanged (open question 4)

`ROLE_PERMISSIONS.SYSTEM_ADMIN` gains `'reviewSession:read'` as its 28th entry
— its first `reviewSession:*` ever — with a comment stating that this is
read-only and that **which** sessions it reaches is decided by
`ReviewHistoryAccessService`, never by this table (mirroring the manager's
shipped comment). `MANAGER` stays `[]`. No `/review-sessions*` write route is
widened.

`ReviewHistoryRowDto`/`ReviewHistoryDetailResponseDto` are **unchanged**: no
company column, no admin variant (ADR-006 — the slice's success criteria do not
require it; the rows already carry community and performer, which the manager's
slice shipped for every actor).

## Data Flow

    GET /review-history        (AuthenticatedGuard -> PermissionsGuard: reviewSession:read)
      -> ReviewHistoryAccessService.listForActor(actor)
           switch(role)  [exhaustive, `satisfies never`, scope resolved INSIDE each branch]
             MAINTENANCE_TECHNICIAN      -> findCompletedForPerformer(userId)     [unchanged]
             COMMUNITY_REPRESENTATIVE    -> listAssignedCommunityIds -> [] ==> [] [unchanged]
             MAINTENANCE_COMPANY_MANAGER -> resolveCompanyScope -> null ==> []    [unchanged]
             SYSTEM_ADMIN                -> findCompletedAcrossInstallation()     [NEW: no Layer 2 call,
                                                                                   no early return, no
                                                                                   scope parameter]
             MANAGER                     -> []                                    [still unbuilt]
      -> communityRepository.findById   once per distinct community in the RESULT  (now installation-wide)
      -> userDirectory.findEmailsByIds  ONE query for all distinct performers
      -> rows, completedAt DESC, id DESC

## File Changes

| File | Action | Description |
|---|---|---|
| `.../review-session/application/ports/review-session.repository.port.ts` | Modify | +2 methods (Decision 1) and the restated invariant comment (Decision 2); **still no `findById`** |
| `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` | Modify | `where: { status: 'completed' }`, shared `COMPLETED_HISTORY_ORDER_BY`; by-id hydrates entries like the other detail reads |
| `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` | Modify | Same pair, same ordering, same completed-only filter |
| `.../review-session/application/services/review-history-access.service.ts` | Modify | Split the `SYSTEM_ADMIN`/`MANAGER` fallthrough in both switches (Decision 3) |
| `.../review-session/application/services/session-access.service.ts` | **Unchanged** | Write-path gate, byte-untouched |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `SYSTEM_ADMIN` gains `reviewSession:read` — nothing else (Decision 4) |
| `apps/web/src/App.tsx` | Modify | `SYSTEM_ADMIN` added to both `/review-history*` `allowedRoles` (3 roles -> 4); `/review-sessions*` untouched |
| `apps/web/src/pages/HealthPage.tsx` | Modify | `SYSTEM_ADMIN` added to `REVIEW_HISTORY_ROLES` |
| `apps/web/src/pages/ReviewHistory{,Detail}Page.tsx` | **Unchanged** | Reused verbatim, no admin variant |
| `.../prisma-review-session.repository.integration.spec.ts` | Modify | Allowlist 8 -> 10 names; new installation-wide describe block |
| `.../review-history-access.service.spec.ts` | Modify | Admin branch: reaches the pair, touches neither checker |
| `apps/web/src/pages/HealthPage.test.tsx`, `auth/ProtectedRoute.test.tsx` | Modify | Admin sibling assertions (see Testing Strategy) |
| `apps/api/test/review-history.e2e-spec.ts` | Modify | Four-role matrix + deactivated/soft-deleted visibility |
| `openspec/specs/{review-history,review-history-ui,authorization}/spec.md` | Modify | Delta specs (owned by `sdd-spec`) |
| `docs/requirements/functional-requirements.md` | Modify | FR-008 status |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (api) | `ReviewHistoryAccessService` admin dispatch | Admin reaches `findCompletedAcrossInstallation`/`…ById…` with **no** arguments beyond the id; `communityScopeChecker` and `companyScopeChecker` mocks assert `not.toHaveBeenCalled()`; `MANAGER` still reaches no repository call |
| Unit (api) | The other three branches | Byte-identical behaviour assertions kept, re-run after the switch split |
| Unit (api) | In-memory fake parity | Installation-wide pair returns every completed session regardless of community/company/performer; a draft never surfaces; ordering identical to the other list methods |
| Integration (api) | Port-surface guard | The allowlist grows to exactly 10 named reads; `findById` still absent |
| Integration (api) | **Call-site guard** (Decision 2) | Source scan: the two names appear in production code only in the port, both adapters, and `review-history-access.service.ts` |
| Integration (api) | Installation-wide queries, real Postgres | Returns rows across ≥2 companies and ≥2 communities including one whose **community is deactivated/soft-deleted** and one whose **maintenance company is soft-deleted**; never a draft; `completedAt DESC, id DESC` |
| E2E (api) | Four-role visibility matrix, no sampling | Admin sees every seeded completed session incl. the deactivated/soft-deleted cases; technician/representative/manager each still see exactly their shipped scope after this change; admin gets 404 on a draft and on a nonexistent id |
| E2E (api) | Scope guards | `SYSTEM_ADMIN` holds `reviewSession:read` and no other `reviewSession:*`; 403 on every `/review-sessions*` write route; `MANAGER` still `[]`; no `ManagerCapability`/`managerCapabilities`/`VIEW_ALL_REVIEWS` symbol exists; no filter/sort/page parameter accepted |
| Unit (web) | Routes | `ProtectedRoute` family: all four roles reach `/review-history*`; admin still blocked from `/review-sessions*` |
| Unit (web) | `HealthPage` | **Note for `sdd-tasks`**: the manager's link-enumeration test (`HealthPage.test.tsx:137-153`) stays **passing and unmodified** — widening `REVIEW_HISTORY_ROLES` does not change the manager's render. Add an admin **sibling**: for `SYSTEM_ADMIN`, `hrefs` equals exactly `['/review-history']` (from none today) and one button, the logout control |
| Browser | CLAUDE.md | Real dev server, `SYSTEM_ADMIN` login: entry link from `/`, installation-wide list at realistic volume, drill-in, a deactivated-community session visible, empty state; regression pass for the other three roles |

## Migration / Rollout

**No migration. No schema change.** Delivery follows the proposal's
`stacked-to-main` sketch, branches `review-history-admin-scope/<NN>-<slug>`;
`sdd-tasks` owns the split and the 400-line forecast.

## Rollback

`git revert` the branch — lossless and symmetric, unlike the company-scope
slice. Reverting removes the two port methods and their adapters, restores the
shared `SYSTEM_ADMIN`/`MANAGER` fallthrough, drops the `ROLE_PERMISSIONS` entry
and the two web widenings; no shipped signature breaks and the other three
roles' paths never moved. Spec amendments and the FR-008 status revert **with**
the code, or the specs will claim a grant the code no longer honours. Each PR in
the chain reverts independently.

## Open Questions

- [x] **Naming of the unscoped pair** — resolved, Decision 1
      (`…AcrossInstallation`, the fourth value of the port's existing scope
      dimension).
- [x] **How the "no identifier-only read" invariant is restated** — resolved,
      Decision 2 (restated wording + allowlist guard + call-site guard +
      an intent comment at the bare `WHERE`).
- [x] **Whether the admin branch needs any guard beyond the role** — resolved,
      Decision 3: no. The ≤2h soft-deleted-admin window is stated and accepted,
      not left to the absence.
- [x] **Whether the existing row shape suffices** — resolved, Decision 4:
      unchanged, no company column (ADR-006).
- [ ] **Watch item, not a blocker — installation-wide list volume.** This is now
      by far the largest list in the app, with no filter, sort or pagination by
      settled decision, and (unlike the manager's) not even one indexed equality
      to narrow it. Measure it during browser verification at realistic seeded
      volume rather than assuming it; the app-wide filtering initiative named in
      `review-history-company-scope` remains the named remedy. Nothing to build
      in this slice.
