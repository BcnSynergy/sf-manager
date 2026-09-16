# Design: Per-Element Review History

## Technical Approach

FR-008's last deferred piece, at the seams four shipped history slices already
built: four new port methods, one new branch set on `ReviewHistoryAccessService`,
one use case, one route, one page. No new authorization primitive, no new
permission, no new checker, no new aggregate.

There is **one** schema object this design does add, and the proposal
explicitly left the call here: a single-column index on
`ElementReviewEntry.inspectableElementId` (Decision 3). It is justified below
against the actual shipped indexes, not added reflexively.

The whole design is shaped by one property the four shipped slices never had
to face: **this is the first read in the app whose scope is applied to
`ElementReviewEntry` rows rather than to `ReviewSession` rows.** Every shape
below is picked so the element conjunct and the scope conjunct are both
un-forgettable, and so "not reachable" can never be mistaken for "reachable
and empty".

The slice's rules, each in exactly one place:

| Rule | Where it is enforced | How it is auditable |
|---|---|---|
| Caller holds `reviewSession:read` | `PermissionsGuard` + `@RequirePermission`, on `ReviewHistoryController` (Decision 6) | `ROLE_PERMISSIONS` is byte-unchanged; the route is not on `InspectableElementController` |
| The `:communityId` segment is verified, not decorative | `findByIdInCommunity` runs **first**, before any scope checker (Decision 5) | Wrong-community pairing is indistinguishable from an unknown id |
| A caller never sees an entry outside their scope | The scope conjunct is a **required parameter of every new port method** and lives in SQL, never in the caller (Decision 1/2) | The port's "no identifier-only read" enumeration test grows by exactly 4 named methods |
| A technician sees only their own entries | `findCompletedEntriesForElementForPerformer(elementId, performedById)` — `performedById` is in the `WHERE`, not in a post-filter (Decision 2) | E2E: a two-performer element shows exactly one row to each technician |
| "Unreachable" is never confused with "reachable, no entries" | A **discriminated union**, not `[]` vs `null` (Decision 4) | Type-level; `{ reachable: false }` has no `entries` property to read |
| Every 404 cause collapses to one code | ONE `throw new InspectableElementNotFoundError()` site in the use case (Decision 5) | Unknown id, foreign community, soft-deleted element, out-of-scope caller and ungranted `MANAGER` are byte-identical responses |
| The five-role web route does not leak into its admin-only URL family | `ProtectedRoute allowedRoles` declared inline with a naming comment + its own guard test (Decision 7) | `ProtectedRoute.test.tsx` names both the five roles and the family default |
| The four shipped session-level scopes are untouched | `listForActor`/`loadByRole` and their six methods are byte-unchanged | Five-scope E2E regression matrix, no sampling |

**Verified on `main` before designing, not assumed**:

- `ElementReviewEntry` carries **exactly one** index beyond its PK:
  `@@unique([reviewSessionId, inspectableElementId])`. Its leading column is
  `reviewSessionId`. There is no index on `inspectableElementId`. The FK to
  `InspectableElement(id)` is hand-written and Prisma-invisible, and this
  schema's own standing note — repeated on `User`, `InspectableElement`,
  `ReviewSession` and `ReviewTemplateQuestion` — is *"Postgres does not
  auto-index FK columns"*.
- **The review-session FKs are Prisma-invisible (no `@relation`)**, so the
  adapter *cannot* express a join. `loadEntriesWithAnswers` already loads
  entries and answers as separate queries and assembles them in memory. This
  is not a style preference here; it is a hard constraint on the read shape
  (Decision 2).
- `findByIdInCommunity` applies `SoftDeletableRepository.withDefaultFilter`,
  i.e. `deletedAt: null` **only** — it returns a decommissioned
  (`deactivatedAt` set) element normally. That is exactly the settled
  decommissioned-visible / soft-deleted-404 matrix, for free, with no new
  method (OQ4 confirmed).
- `AssignmentCommunityScopeChecker.listAssignedCommunityIds` returns the
  representative's **currently active** assignment community ids and reaches
  no repository at all for the other three roles (OQ5 traced below).
- `InspectableElementController` declares **no `@Get(':elementId')`** — only
  `@Post()`, `@Get()`, `@Patch(':elementId')`, `@Delete(':elementId')`. A
  depth-5 `…/:elementId/review-history` GET cannot collide with any of them
  under any registration order.
- `ReviewSessionModule` already imports `InspectableElementModule`,
  `CommunityModule` and `UsersModule`, and already injects
  `INSPECTABLE_ELEMENT_REPOSITORY`, `COMMUNITY_REPOSITORY` and
  `USER_DIRECTORY`. **No new DI wiring direction** is introduced.
- The shipped `…AcrossInstallation` call-site guard matches on the literal
  regex `/findCompletedAcrossInstallation|findCompletedByIdAcrossInstallation/`.
  The new `findCompletedEntriesForElementAcrossInstallation` does **not**
  match it, so that guard and its file allowlist are unaffected.
- The shipped *"no repository port method returns a session or a list from an
  identifier alone"* test enumerates every `find*` on the Prisma adapter
  prototype **by name**. It WILL fail unless the four new names are added —
  called out here so `sdd-tasks` budgets for it rather than discovering it as
  a red test.
- An entry can only reference an element in its own session's community:
  `RecordEntryUseCase` resolves through
  `findReviewableById(session.communityId, …)`. Combined with the settled
  no-reassignment decision, **every entry for element E belongs to a session
  in E's one community** — structurally, not by convention.

## Architecture Decisions

### Decision 1 — the four new port methods return **flattened entry rows**, not sessions with nested entries (OQ1)

**Choice**: four methods on `ReviewSessionRepository`, each returning a
projection row type owned by the port, with the element id and the scope both
required parameters:

```ts
// review-history-per-element/design.md Decision 1/2: the element-keyed
// reads. FLATTENED projection rows, not ReviewSession aggregates — the
// element conjunct and the scope conjunct are both in the adapter's WHERE,
// so no caller can forget either one, and a session's OTHER elements'
// entries are never loaded in the first place (they could not be filtered
// out wrongly if they are never read). `answers` is deliberately absent:
// this surface renders no answers (proposal non-goal), so QuestionAnswer is
// not touched at all. `reviewed` is NOT a column here — the application
// layer derives it (Decision 5), keeping the adapter a dumb projection
// (ADR-013).
export interface ElementReviewEntryRow {
  entryId: string;
  reviewSessionId: string;
  performedById: string;
  completedAt: Date;   // non-null: every one of these carries status='completed'
  recordedAt: Date;
  observations: string | null;
}

// MAINTENANCE_TECHNICIAN — own recorded entries for this element, nothing else.
findCompletedEntriesForElementForPerformer(
  elementId: string,
  performedById: string,
): Promise<ElementReviewEntryRow[]>;

// COMMUNITY_REPRESENTATIVE — entries whose session is in one of the caller's
// currently active communities. `communityIds = []` is the fail-closed empty
// scope (Prisma's `{ in: [] }` is already a false predicate).
findCompletedEntriesForElementInCommunities(
  elementId: string,
  communityIds: readonly string[],
): Promise<ElementReviewEntryRow[]>;

// MAINTENANCE_COMPANY_MANAGER — entries whose session was performed by the
// caller's own company (the snapshotted performedByCompanyId, no other
// conjunct — review-history-company-scope Decision 9, unchanged).
findCompletedEntriesForElementForCompany(
  elementId: string,
  companyId: string,
): Promise<ElementReviewEntryRow[]>;

// SYSTEM_ADMIN, and MANAGER holding VIEW_ALL_REVIEWS. The scope IS the
// installation — same deliberate carve-out from the "no identifier-only
// read" invariant that findCompletedAcrossInstallation already carries, and
// reachable from exactly those two branches of the one service.
findCompletedEntriesForElementAcrossInstallation(
  elementId: string,
): Promise<ElementReviewEntryRow[]>;
```

Ordering is a new shared adapter constant,
`ELEMENT_HISTORY_ORDER_BY = recordedAt DESC, id DESC` (`id` is a UUIDv7,
ADR-009 — deterministic on equal timestamps), applied by the **use case**
after the in-memory join (Decision 2), so all four scopes are identical by
construction rather than by four copies of an `orderBy`.

**Alternatives considered**: the proposal's working assumption — return
`ReviewSession[]` with entries hydrated and let the use case flatten to the
element's entries. Rejected on three counts, in order of weight:
(a) **the filter becomes a caller discipline check** — the port would hand
back every sibling entry of every matching session and trust the use case to
drop them, which is exactly the "scope in the caller" shape this port has
refused since `review-session` Decision 4; (b) it would load every
`QuestionAnswer` row of every matching session to render a page that shows no
answers — the proposal's own rejected "one snapshot per row" cost, in a
different disguise; (c) **there is no existing mapping to reuse anyway** —
every shipped `findCompleted…` *list* method calls
`ReviewSessionMapper.toDomain(record, [])`, i.e. hydrates no entries. The
"reuse the existing `ReviewSession` mapping" half of the proposal's tradeoff
turns out to be worth nothing here.

### Decision 2 — two queries, entry-first, joined in the application layer

**Choice**, forced by the verified constraint that this schema's review FKs
are Prisma-invisible and no `include`/`join` is expressible:

```
1. elementReviewEntry.findMany({ where: { inspectableElementId } })
       -> the candidate set: every entry ever recorded against this element
2. reviewSession.findMany({
       where: { id: { in: candidateSessionIds },
                status: 'completed',
                <the scope conjunct for this method> },
       select: { id, performedById, completedAt } })
3. keep only candidate entries whose reviewSessionId survived step 2
```

**Entry-first, not session-first, and that direction is the decision.** The
reverse order — resolve the scope's sessions, then fetch entries `WHERE
inspectableElementId = X AND reviewSessionId IN (…)` — is correct but
degenerates for the two unscoped branches: `findCompletedEntriesForElementAcrossInstallation`
would build an `IN` list of *every completed session in the installation* and
ship it to Postgres on every page load. Entry-first bounds step 1 by the
number of times this one element has ever been reviewed (review frequency ×
years — tens, maybe low hundreds), and bounds step 2's `IN` list by the same
number.

Step 3 is an in-memory `Set` membership test over that bounded candidate set,
and it is a **narrowing** filter only: an entry can only survive if its
session survived the scoped SQL query. There is no code path in which step 3
can widen anything, which is why the scope-leak risk is closed by the shape
rather than by the test suite.

`$queryRaw` with a real SQL join was considered and rejected: no adapter in
this codebase uses raw SQL, `no-restricted-imports` and ADR-013 keep Prisma
inside `infrastructure/persistence/**` precisely so the typed API is the only
surface, and the two-query shape is already the shipped precedent
(`loadEntriesWithAnswers`).

### Decision 3 — add `@@index([inspectableElementId])`, single-column, NOT composite (OQ3)

**Choice**: one additive index, its own hand-written migration, its own PR.

```prisma
model ElementReviewEntry {
  // ...
  @@unique([reviewSessionId, inspectableElementId])

  // review-history-per-element/design.md Decision 3: Prisma-VISIBLE regular
  // index. Postgres does not auto-index FK columns (same standing note as
  // ReviewSession's three FK indexes), and the @@unique above CANNOT serve
  // this filter: its LEADING column is reviewSessionId, so an equality
  // predicate on inspectableElementId alone has no usable prefix and
  // degrades to a full index scan of the app's fastest-growing table. Every
  // read before this slice filtered this table by reviewSessionId — covered
  // by that leading column — which is exactly why no index was needed until
  // now. SINGLE-COLUMN on purpose: see design.md for why the sort is not
  // covered.
  @@index([inspectableElementId])
}
```

**The reasoning, stated so it would survive a planner**:

- *Query 1* is `WHERE "inspectableElementId" = $1`. Available access paths
  today: the PK on `id` (useless), and the btree on
  `(reviewSessionId, inspectableElementId)`. Postgres cannot do an index
  *search* on a non-leading column; the best it can do is a full index-only
  scan of every tuple in that index, then a filter — O(all entries ever
  recorded), growing as *elements × sessions*, on every page load. With the
  new index it is a bounded index scan + heap fetch of tens of rows.
- *Query 2* is `WHERE "id" IN (…) AND "status" = 'completed' AND <scope>`.
  The `IN` list is on the primary key and is already bounded by query 1's
  result — the most selective access path in the table. **No index is needed
  or added for query 2**, and the shipped `(status, completedAt, id)`
  composite is irrelevant to it (it exists for the *unfiltered*
  installation-wide list, which this query is not).
- **Why not composite `(inspectableElementId, recordedAt, id)`, mirroring the
  admin-scope precedent?** Two independent reasons, either sufficient. First,
  the precedent does not transfer: `(status, completedAt, id)` was added
  because the admin list had *no* selective filter at all — seq scan +
  filesort over the whole table — whereas this filter is extremely selective
  and leaves a few dozen rows to sort. Second, and decisively: **an
  index-provided sort order cannot survive to the response here.** Decision 2
  makes the final ordering an application-level sort applied *after* the
  in-memory join with query 2's result, so covering `recordedAt` in the index
  buys literally nothing while adding write amplification on
  `upsertEntry` — the hottest write path in the app, executed once per
  element per review.

This is the slice's only schema change. It is additive, carries no backfill,
and `DROP INDEX` is a complete and independent rollback.

### Decision 4 — the element-keyed branches live on `ReviewHistoryAccessService` and return a **discriminated union**, not an array-or-null (OQ2)

**Choice**: a new public method and its private role-dispatcher beside
`listForActor`/`loadByRole`. No new service (the proposal's working
assumption, confirmed): the same three checkers, the same fail-closed early
returns before any repository call, the same exhaustive `switch` with the
`satisfies never` backstop. A reviewer diffing the new dispatcher against the
shipped one should see only the element parameter and the reachability shape.

```ts
// The reachability verdict is a DISCRIMINATED UNION, deliberately NOT
// `ElementReviewEntryRow[] | null` and deliberately NOT a bare array
// (review-history-per-element/design.md Decision 4). This surface is the one
// place in the app where "no rows" means TWO different things:
//   - SYSTEM_ADMIN / granted MANAGER / assigned REPRESENTATIVE: the element
//     is reachable and has never been reviewed -> 200 with an empty state.
//   - TECHNICIAN / COMPANY_MANAGER: their scope IS session-derived, so "no
//     entries in scope" IS "not reachable" -> 404.
// An empty array is TRUTHY, so a `null`-based shape would sit one typo away
// from turning a 404 into a 200 that confirms the element exists to a caller
// who must not learn that. `{ reachable: false }` has no `entries` property
// to read at all — the wrong branch does not compile.
export type ElementHistoryScope =
  | { reachable: false }
  | { reachable: true; entries: ElementReviewEntryRow[] };
```

| Branch | Scope resolution | Repository call | Empty result means |
|---|---|---|---|
| `MAINTENANCE_TECHNICIAN` | none (Layer 3 identity, as shipped) | `…ForPerformer(element.id, actor.userId)` | **unreachable** (404) |
| `COMMUNITY_REPRESENTATIVE` | `listAssignedCommunityIds` — the **same one call** the shipped list branch makes | skipped unless the list contains `element.communityId` | reachable, empty state |
| `MAINTENANCE_COMPANY_MANAGER` | `resolveCompanyScope`; `null` ⇒ unreachable **before any query** | `…ForCompany(element.id, companyId)` | **unreachable** (404) |
| `SYSTEM_ADMIN` | none (the role is the scope) | `…AcrossInstallation(element.id)` | reachable, empty state |
| `MANAGER` | `hasManagerCapability(…, 'VIEW_ALL_REVIEWS')`; ungranted ⇒ unreachable **before any query** | `…AcrossInstallation(element.id)` | reachable, empty state |

The representative branch, written out because OQ5 asked for it traced rather
than assumed:

```ts
case 'COMMUNITY_REPRESENTATIVE': {
  const communityIds = await this.communityScopeChecker
    .listAssignedCommunityIds(actor.userId, actor.role);
  // The REACHABILITY gate, and the reason a never-reviewed element in an
  // assigned community renders an empty state instead of a 404: this test
  // consults the ASSIGNMENT, never the entry set. Without it the branch
  // would answer `reachable: true, entries: []` for an element in a
  // community the caller is not assigned to — leaking that the element
  // exists (the proposal's Med "404-vs-empty matrix" risk).
  if (!communityIds.includes(element.communityId)) {
    return { reachable: false };
  }
  // The SQL `communityId IN (…)` conjunct is NOT redundant with the check
  // above: it is the defence-in-depth that keeps the scope in the port's
  // signature, and it is the ONLY thing standing between a future caller
  // and a widened read. Both stay.
  return {
    reachable: true,
    entries: await this.repository
      .findCompletedEntriesForElementInCommunities(element.id, communityIds),
  };
}
```

**OQ5 resolved: this costs zero queries the shipped branch does not already
make.** `listAssignedCommunityIds` is the identical single Layer-2 call
`listForActor`'s representative branch already issues; `element.communityId`
is already in hand from the element lookup the use case ran first; the
`includes` is an in-memory array test. A never-reviewed element in an
assigned community therefore reaches the repository, gets `[]`, and returns
`{ reachable: true, entries: [] }` — an empty state, never a 404 — with no
extra round trip.

### Decision 5 — `ReadElementReviewHistoryUseCase`: element first, scope second, **one** throw site

**Choice**: the element lookup runs before any scope resolution, and every
rejection cause collapses into a single `throw`.

```ts
async execute(
  communityId: string,
  elementId: string,
  actor: Actor,
): Promise<ReadElementReviewHistoryResult> {
  // FIRST, always. This is what makes the `:communityId` segment VERIFIED
  // rather than decorative, and it means an out-of-community or soft-deleted
  // element never reaches a scope checker at all. Returns a DECOMMISSIONED
  // element normally (deletedAt-only filter, verified) — settled matrix.
  const element = await this.elementRepository
    .findByIdInCommunity(communityId, elementId);

  const scope = element
    ? await this.accessService.listElementHistoryForActor(element, actor)
    : null;

  // THE ONE THROW SITE. Unknown id, wrong community, soft-deleted element,
  // out-of-scope caller, ungranted MANAGER and a technician with no entries
  // of their own on this element are all the SAME response, byte for byte
  // (404 INSPECTABLE_ELEMENT_NOT_FOUND) — there is exactly one failing path,
  // so this use case cannot distinguish "why" and therefore cannot leak it.
  // The `!element` conjunct is TypeScript narrowing, not a second cause.
  if (!element || !scope.reachable) {
    throw new InspectableElementNotFoundError();
  }
  ...
}
```

The result then assembles, in this order:

1. **Header**, entirely from the `InspectableElement` already in hand — `id`,
   `code`, `name`, `elementType`, `location`, `communityId`,
   `deactivatedAt`. **No extra element query, and no new method on
   `InspectableElementRepository`** (OQ4's working assumption, confirmed: the
   shipped return shape carries every field the proposal's header names).
2. **`communityName`**, via ONE `CommunityRepository.findById` call, `''`
   when unresolvable — the same batched-then-placeholder treatment
   `ListReviewHistoryUseCase` already applies. This is a **deliberate
   deviation from OQ4's working assumption**, which left the community name
   out: the page is reached by five roles, two of which (technician, company
   manager) have no community-name context anywhere on their route, and
   rendering a raw UUID as the element's community is not a usable header.
   The cardinality argument that made the list-page loop a review finding
   does not apply — an element belongs to exactly one community, so this is
   bounded at exactly one call, forever.
3. **`performedByEmail` per row**, via ONE batched
   `UserDirectory.findEmailsByIds` over the distinct `performedById` values,
   `''` when unresolvable — the shipped company-scope Decision 8 pattern
   verbatim.
4. **`reviewed` per row**, derived in the application layer as
   `row.observations === null`. The domain invariant makes this exact:
   `ElementReviewEntry` has no public constructor, and `.reviewed()` /
   `.unreviewed()` guarantee `answers.length > 0 ⟺ observations === null`.
   Deriving it here rather than in SQL means `QuestionAnswer` is never
   queried by this surface at all. Guarded by a repository integration test
   asserting the derivation agrees with `answers.length > 0` for both an
   reviewed and an unreviewed entry, so the day the invariant is weakened,
   this fails loudly instead of silently mislabelling a row.
5. **Sort**, `recordedAt DESC, entryId DESC`, applied once, after the join.

### Decision 6 — one route on the history controller, one coded 404

`GET /communities/:communityId/inspectable-elements/:elementId/review-history`
is declared on **`ReviewHistoryController`**, not on
`InspectableElementController`. That placement is the mitigation, not a
filing preference: it puts the route in the family whose class-level idiom is
`@RequirePermission('reviewSession:read')`, and it leaves
`InspectableElementController` — every route of which is
`inspectableElement:*`-gated and `SYSTEM_ADMIN`-only — **byte-unchanged**.
`ROLE_PERMISSIONS` is not touched; no role gains `inspectableElement:read`.

`ReviewHistoryController`'s `mapError` gains one branch mapping
`InspectableElementNotFoundError` to `404 INSPECTABLE_ELEMENT_NOT_FOUND`,
reusing `buildCodedError` and the code string
`InspectableElementController` already emits, so the client needs no second
mapping. No route collision is possible: the element controller declares no
`@Get(':elementId')`, and this path is depth-5 with a literal final segment.

### Decision 7 — web: one page, a deliberately anomalous route gate, two entry links

**`ElementReviewHistoryPage.tsx`** at
`/communities/:communityId/inspectable-elements/:elementId/history` — a
sibling of the shipped depth-5 `/edit` and `/label` routes. Element header
(code, name, type **through `mapElementTypeToLabelKey`, never the raw enum**,
location, decommissioned state, community name) + the chronological record.
Distinct loading / empty / error states, every row linking to
`/review-history/:sessionId`. No control of any kind beyond the links.

**The route gate is the anomaly, and it is labelled as one in-file:**

```tsx
{/* review-history-per-element/design.md Decision 7: DELIBERATELY five
    roles, unlike EVERY other route in this `inspectable-elements` family,
    which is SYSTEM_ADMIN-only. This is a review-history read that happens
    to be keyed by an element, gated server-side on `reviewSession:read`
    (never `inspectableElement:read`, which SYSTEM_ADMIN alone holds) —
    so this list matches /review-history*, not its URL neighbours. Do NOT
    "harmonize" it downward to SYSTEM_ADMIN, and do NOT copy it upward
    onto /edit, /label or the element list. ProtectedRoute.test.tsx pins
    both facts. */}
```

Two entry links, no second page: a per-row *History* link on
`CommunityElementsListPage` (the shipped *Print* link's shape verbatim), and
a per-entry link on `ReviewHistoryDetailPage` — the latter is what makes the
four non-admin scopes reachable in a browser at all. The API client gains one
function in `apps/web/src/api/review-history.ts`, beside the two shipped
ones. Real `en`/`es`/`ca` translations for every new key.

## Data Flow

    GET /communities/:cid/inspectable-elements/:eid/review-history
      (AuthenticatedGuard -> PermissionsGuard: reviewSession:read)
      -> ReadElementReviewHistoryUseCase.execute(cid, eid, actor)
           1. elementRepository.findByIdInCommunity(cid, eid)
                null (unknown | wrong community | soft-deleted) ==> 404
                decommissioned element ==> RETURNED, history readable
           2. ReviewHistoryAccessService.listElementHistoryForActor(element, actor)
                switch(role)  [exhaustive, `satisfies never`, scope INSIDE each branch]
                  TECHNICIAN      -> ForPerformer(el.id, userId)
                                       [] ==> { reachable: false }
                  REPRESENTATIVE  -> listAssignedCommunityIds
                                       !includes(el.communityId) ==> { reachable: false }
                                       else InCommunities(el.id, ids)   [] ==> empty state
                  COMPANY_MANAGER -> resolveCompanyScope
                                       null ==> { reachable: false }   (no query)
                                       else ForCompany(el.id, companyId)
                                       [] ==> { reachable: false }
                  SYSTEM_ADMIN    -> AcrossInstallation(el.id)         [] ==> empty state
                  MANAGER         -> hasManagerCapability('VIEW_ALL_REVIEWS')
                                       false ==> { reachable: false }  (no query)
                                       true  -> AcrossInstallation(el.id)
              each adapter method:  (a) entries WHERE inspectableElementId = el.id
                                    (b) sessions WHERE id IN (a) AND status='completed'
                                                       AND <scope conjunct>
                                    (c) keep entries whose session survived (b)
           3. { reachable: false } ==> the SAME 404, one throw site
           4. communityRepository.findById   ONE call (the element's one community)
           5. userDirectory.findEmailsByIds  ONE call, distinct performers
           6. reviewed := observations === null;  sort recordedAt DESC, entryId DESC
      -> { element: {...header...}, entries: [ {sessionId, performedBy*,
           completedAt, recordedAt, reviewed, observations} ] }

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `@@index([inspectableElementId])` on `ElementReviewEntry` + its intent comment (Decision 3). Nothing else. |
| `apps/api/prisma/migrations/20260915…_add_element_review_entry_inspectable_element_index/migration.sql` | Create | Hand-written `CREATE INDEX`, mirroring `20260913210000_…`'s header and its `migrate dev` warning |
| `.../review-session/application/ports/review-session.repository.port.ts` | Modify | `ElementReviewEntryRow` + four `findCompletedEntriesForElement…` methods; extend the "no identifier-only read" note to name the installation-scope carve-out for the new method too (Decision 1) |
| `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` | Modify | The four two-query implementations + `ELEMENT_HISTORY_ORDER_BY` (Decision 2) |
| `.../review-session/application/use-cases/testing/in-memory-review-session.repository.ts` | Modify | Fake parity for the four methods, including the `communityIds = []` false-predicate case |
| `.../review-session/application/services/review-history-access.service.ts` | Modify | `ElementHistoryScope` + `listElementHistoryForActor` + private role dispatcher (Decision 4); `listForActor`/`loadByRole` **untouched** |
| `.../review-session/application/use-cases/read-element-review-history.use-case.ts` | Create | Element-first resolution, one throw site, header + scoped ordered rows (Decision 5) |
| `.../review-session/presentation/review-history.controller.ts` | Modify | One nested `@Get`, `@RequirePermission('reviewSession:read')`, one new `mapError` branch (Decision 6) |
| `.../review-session/presentation/dto/element-review-history-response.dto.ts` | Create | Header + rows; Swagger annotations mirroring `ReviewHistoryDetailResponseDto` |
| `.../review-session/review-session.module.ts` | Modify | Provide the new use case. **No new import** — all three dependencies are already imported |
| `.../inspectable-element/**` | **Untouched** | `findByIdInCommunity` reused verbatim; no new port method, no `GET` by-id route, controller byte-unchanged |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | **Untouched** | No permission table change |
| `apps/web/src/pages/ElementReviewHistoryPage.tsx` (+ test) | Create | The one new page (Decision 7) |
| `apps/web/src/pages/CommunityElementsListPage.tsx` (+ test) | Modify | Per-row *History* link, the *Print* link's shape |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) | Modify | Per-entry element-history link |
| `apps/web/src/App.tsx`, `auth/ProtectedRoute.test.tsx` | Modify | Depth-5 route, five-role gate, the anomaly comment + its guard test |
| `apps/web/src/api/review-history.ts` | Modify | `ElementReviewHistory` types + `readElementReviewHistory(communityId, elementId)` |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real translations, parity test-enforced |
| `.../persistence/prisma-review-session.repository.integration.spec.ts` | Modify | Four new method suites; **the `find*` enumeration test's expected list grows by 4** (it fails otherwise) |
| `apps/api/test/review-history.e2e-spec.ts` | Modify | Five-scope element-history matrix |
| `openspec/specs/{review-history,review-history-ui,review-session-management,authorization,inspectable-element-admin-ui}/spec.md` | Modify | Delta specs (owned by `sdd-spec`) |
| `docs/requirements/functional-requirements.md` | Modify | **FR-008 closes** |

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit (api) | `ReviewHistoryAccessService.listElementHistoryForActor` | Table-driven over all five roles: ungranted `MANAGER`, `null`-company manager and unassigned representative each resolve `{ reachable: false }` **and** the repository mock asserted `not.toHaveBeenCalled()`; assigned representative with `[]` resolves `{ reachable: true, entries: [] }`; technician and company manager with `[]` resolve `{ reachable: false }`; each branch asserted to call **its own** method with **its own** scope argument |
| Unit (api) | The four shipped session-level branches | Existing `review-history-access.service.spec.ts` re-run **unmodified** — byte-identical behaviour |
| Unit (api) | `ReadElementReviewHistoryUseCase` | Element lookup runs **before** the access service (mock call order asserted); unknown element ⇒ no scope-checker call at all; every rejection cause produces the identical error instance; header fields come from the element with no second query; `reviewed` derived from `observations`; `communityName`/`performedByEmail` fall back to `''`; ordering `recordedAt DESC, entryId DESC` incl. the equal-timestamp tiebreak |
| Unit (api) | In-memory fake parity | Same four suites as the Prisma adapter, same fixtures — including `communityIds: []` returning `[]`, never everything |
| Integration (api) | The four adapter methods, real Postgres | An element reviewed in **two** completed sessions by **two** performers from **two** companies, plus one draft session (must never surface), plus one entry for a *different* element in the same session (must never surface); each method asserted to return exactly its scope's rows |
| Integration (api) | `reviewed` derivation | `observations === null` agrees with `answers.length > 0` for a reviewed and an unreviewed entry (Decision 5, step 4) |
| Integration (api) | Migration, real Postgres | `ElementReviewEntry_inspectableElementId_idx` exists in `pg_indexes`; the `@@unique` index, the hand-written CHECK and both hand-written FKs are intact; pre-migration state simulated with `DROP INDEX` inside a transaction, per the `review-session-migration.integration.spec.ts` precedent |
| Integration (api) | The shipped port-surface guards | The `find*` enumeration test lists exactly the 4 new names beside the 10 shipped ones and still `not.toContain('findById')`; the `…AcrossInstallation` call-site guard's file allowlist is **unchanged** (the new name does not match its regex) |
| E2E (api) | **Five-scope matrix, no sampling** | Against one element reviewed by two performers from two companies in a community the actor does not own: technician sees exactly **their own** row; representative sees **both** rows for an assigned community and 404 for any other, including a deactivated assignment; company manager sees only their company's row, and a `null`-company manager gets 404 with no repository call; `SYSTEM_ADMIN` and a **granted** `MANAGER` return byte-identical bodies; an **ungranted** `MANAGER` gets 404 on every element |
| E2E (api) | The 404-vs-empty matrix | Never-reviewed element ⇒ `200` + empty `entries` for admin, granted manager and assigned representative; ⇒ `404` for technician and company manager; decommissioned element ⇒ full history; soft-deleted element ⇒ `404`; wrong `communityId`/`elementId` pairing indistinguishable from an unknown id (same status, same code, same body) |
| E2E (api) | Scope guards | `ROLE_PERMISSIONS` unchanged and no role holds `inspectableElement:read` beyond `SYSTEM_ADMIN`; no `GET /communities/:c/inspectable-elements/:e` route exists; `InspectableElementRepository` gained no method; no filter/sort/page/search parameter is accepted or honoured; no demo-mode branch |
| Unit (web) | `ElementReviewHistoryPage` | Loading / empty / error states distinct; element type rendered through the label map, never the raw enum; every row links to `/review-history/:sessionId`; a decommissioned element's badge; no filter/sort control rendered |
| Unit (web) | Routes | `ProtectedRoute.test.tsx` asserts all five roles reach `/…/:elementId/history` **and** that `/…/:elementId/edit` and `/…/:elementId/label` still admit `SYSTEM_ADMIN` only — the anomaly pinned in both directions |
| Unit (web) | Entry links | `CommunityElementsListPage` renders the per-row link with the right href; `ReviewHistoryDetailPage` renders the per-entry link and existing assertions pass otherwise unmodified |
| Unit (web) | i18n | `locales.test.ts` parity for every new key |
| Browser | CLAUDE.md | Real dev server: a `SYSTEM_ADMIN` from the element list → full history, a never-reviewed element's empty state, a decommissioned element's history; a **technician** from `ReviewHistoryDetailPage`'s per-entry link → exactly their own row on a two-performer element, and a 404 for an element they never reviewed. Seed needs one element in ≥2 completed sessions by 2 performers, one never-reviewed element, one decommissioned element with history, and a technician account |

## Migration / Rollout

One additive index migration (Decision 3), applied with
`prisma migrate deploy`. No backfill, no column, no enum, no downtime — an
index build on `ElementReviewEntry` at this installation's size is
sub-second, and nothing reads it until the four port methods ship in the same
PR. Delivery follows the proposal's `stacked-to-main` sketch, branches
`review-history-per-element/<NN>-<slug>`, titles
`feat(review-history-per-element): PR N/M — …`. The proposal's **3-PR** shape
is right and this design does not grow it; the index migration and its guard
spec land inside PR 1, which already owns the port and the adapter.
`sdd-tasks` owns the final split and the binding 400-line forecast — chained
PRs are clearly needed.

## Rollback

`git revert` the branch. No data change of any kind: the index is the only
schema object, and `DROP INDEX "ElementReviewEntry_inspectableElementId_idx"`
is a complete, independent, lossless rollback that can also be deferred (a
stale index costs write amplification, never correctness). Reverting the code
removes four port methods and their two adapter implementations, one
reachability type, one branch set, one use case, one route, one DTO, one
page, two links and the i18n keys — nothing else reads any of them, and the
five shipped session-level scopes are untouched, so reverting cannot regress
them. Spec amendments and the FR-008 status must revert **with** the code, or
the specs will claim a surface the code no longer has *and* will have deleted
the guards that keep it unbuilt. Each PR reverts independently.

## Open Questions

- [x] **OQ1 — shape of the element-keyed port methods**: resolved, Decision 1
      + 2. **Overrides the proposal's working assumption**: flattened
      projection rows, not sessions-with-nested-entries. The filter moves out
      of the caller and into SQL, no `QuestionAnswer` row is read, and the
      "reuse the existing `ReviewSession` mapping" half of the tradeoff turns
      out to be worth nothing — the shipped list methods hydrate no entries
      either.
- [x] **OQ2 — where the element-keyed branches live**: resolved, Decision 4.
      Confirms the proposal: new methods on `ReviewHistoryAccessService`
      beside `listForActor`/`loadByRole`, same checkers, same invariants. One
      departure from that service's own shipped shape, and it is deliberate:
      the verdict is a discriminated union rather than `T | null`, because
      this is the first branch set where `[]` and "unreachable" are different
      answers and an empty array is truthy.
- [x] **OQ3 — index coverage**: resolved, Decision 3. **Overrides the
      proposal's working assumption that the FK's index suffices — there is
      no FK index.** `ElementReviewEntry`'s only non-PK index is
      `@@unique([reviewSessionId, inspectableElementId])`, whose leading
      column is the wrong one, so `WHERE inspectableElementId = $1` has no
      usable prefix. Ship a single-column `@@index([inspectableElementId])`;
      do **not** make it composite, because Decision 2's in-memory join makes
      the sort an application-level sort that no index can serve.
- [x] **OQ4 — the element header**: resolved, Decision 5.
      `findByIdInCommunity`'s existing return shape carries every field the
      header names, with no extra query and no new port method — and its
      `deletedAt`-only filter delivers the decommissioned-visible /
      soft-deleted-404 matrix for free. One deviation: `communityName` is
      resolved with ONE `CommunityRepository.findById` call, because two of
      the five roles that reach this page have no community-name context and
      a raw UUID is not a usable header.
- [x] **OQ5 — representative reachability for a never-reviewed element**:
      resolved, Decision 4, traced not assumed.
      `listAssignedCommunityIds` — the identical single call the shipped list
      branch already makes — plus an in-memory `includes` against the
      `communityId` already in hand from step 1. Reachability is decided by
      the **assignment**, never by the entry set, so a never-reviewed element
      in an assigned community yields `{ reachable: true, entries: [] }` and
      renders an empty state. **Zero extra queries.**
- [ ] **Watch item, not a blocker — the element-keyed read is the first
      consumer of `ElementReviewEntry` as a queryable table in its own
      right.** Every read before this slice reached it through its parent
      session. FR-009's overdue/upcoming computation and any future
      cross-element rollup will want the same access path, and may want the
      composite index this design declined. Named so the next slice
      re-derives it against *its* query shape rather than inheriting this
      one's conclusion.
- [ ] **Watch item, not a blocker — a long-lived element's record has no
      bound.** A monthly-reviewed extinguisher accrues ~12 rows a year with
      no pagination, exactly as the installation-wide session list does. The
      app-wide filtering initiative remains the named remedy; this slice
      accepts the unbounded list deliberately (explicit non-goal) and the
      list is far smaller than the one already shipped.
