# Proposal: Per-Element Review History

## Intent

FR-008 reads *"View review history, **per element** and per community"*. The
per-community half shipped across four slices (`review-history` 2026-09-09,
`review-history-company-scope` 2026-09-13, `review-history-admin-scope`
2026-09-14, `review-history-manager-capability` 2026-09-15). All five
visibility scopes are live. **The per-element half has never been built**, and
every one of those four slices punted it in the same words:

- `review-history`/proposal.md: *"Narrowing a history list to one element's
  past reviews is deferred, deliberately and explicitly."*
- `review-history-manager-capability`/proposal.md: *"FR-008's role-based
  visibility axis closes with this slice. FR-008 itself closes only after
  per-element history lands."*
- `review-history`/spec.md and `review-session-management`/spec.md carry
  positive guards — *"No per-element review history surface exists"*, *"WHEN
  they are searched for a view of one inspectable element's past reviews /
  THEN none MUST be found."*
- `docs/requirements/functional-requirements.md` FR-008 status: *"per-element
  history remains the only deferred piece — FR-008 does not close until it
  lands."*

No deferral note ever cited a technical blocker; it was pure ADR-006 scope
discipline. Verified today: `ElementReviewEntry.inspectableElementId` is
already a stable FK on every recorded entry, and
`InspectableElementRepository.findByIdInCommunity` already does the
community-scoped, indistinguishable-404 element lookup. **This is one new
read query and one new page — no schema change, no new aggregate, no new
authorization primitive.**

Today the compliance question *"show me everything that has ever been
recorded against extinguisher `K7M2XQ4PTR`"* — the question a RIPCI
inspection actually asks — can only be answered by opening every past session
of that community one by one and scanning for the element's row. The data is
there; the query is not.

Success looks like: from a community's element list (admin) or from any entry
row inside a session's history (all five roles), one click opens that
element's own chronological record — every past review of that one element,
across every session, filtered by exactly the scope the actor already has.

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change**.

Context: `[[sdd/review-history-per-element/explore]]`,
`openspec/changes/archive/2026-09-15-review-history-manager-capability/`,
`openspec/changes/archive/2026-09-14-review-history-admin-scope/`,
`openspec/changes/archive/2026-09-13-review-history-company-scope/`,
`openspec/changes/archive/2026-09-09-review-history/`,
`openspec/changes/archive/2026-09-02-inspectable-elements/`, ADR-006, ADR-010,
ADR-011, ADR-013, ADR-014, FR-004, FR-008,
`docs/architecture/domain-model-inspections.md`.

## Settled scope decisions

Closed with the product owner before this proposal, or resolved by direct code
reading where noted. **Inputs, not open items — do not re-litigate in
`sdd-spec`/`sdd-design`.**

| Decision | Resolution |
|---|---|
| **Entry point: from the element, not from a session list** | The primary entry point is the element itself. **Verified: no inspectable-element detail page exists** — `apps/web/src/pages/` has `CommunityElementsListPage`, `InspectableElementCreatePage`, `InspectableElementEditPage` and `InspectableElementLabelPage`, and the API exposes no `GET` by-id element route at all (only `POST`/`GET`-list/`PATCH`/`DELETE`). Rather than build a general element detail page (scope this slice does not need), the slice ships **one** new page that **is** the element's detail-plus-history view: element header (code, name, type, location, state, community) + its full review record, at `/communities/:communityId/inspectable-elements/:elementId/history` — a sibling of the shipped depth-5 `/edit` and `/label` routes. |
| **Second entry link, because otherwise four of five scopes have no UI path** | Every route under `/communities/:communityId/inspectable-elements/**` is `SYSTEM_ADMIN`-only today, and `inspectableElement:read` is held by `SYSTEM_ADMIN` **alone** (verified in `role-permission.checker.ts`). An element-list-only entry point would ship a five-scope API behind an admin-only UI — exactly the "API-only drift" CLAUDE.md's 2026-08-25 course correction forbids. So a **second** entry link ships: a per-entry *"this element's full history"* link on the existing `ReviewHistoryDetailPage`, which all five roles already reach. Two links, **one** new page. |
| **Gated on `reviewSession:read`, never on `inspectableElement:read`** | This is a review-history read that happens to be keyed by an element, not an element-management read. `reviewSession:read` is exactly the permission all five history roles already hold. Shipped precedent: the review-session write flow reads elements through `findReviewableByCode`/`findReviewableById` without `inspectableElement:read`. **No permission table row changes in this slice.** |
| **Reuse the five existing scopes, applied at entry level** | Technician → their own recorded entries; representative → their actively-assigned communities; company manager → their company's sessions; `SYSTEM_ADMIN` → everything; `MANAGER` → everything **iff** `VIEW_ALL_REVIEWS`, fail-closed. Same `CommunityScopeChecker` / `CompanyScopeChecker` / `ManagerCapabilityChecker`, same per-branch resolution, same exhaustive `switch` with the `satisfies never` backstop. **No new, narrower technician rule is invented.** |
| **Element reachability decides 404 vs. empty state** | Unknown, wrong-community or soft-deleted element → `404 INSPECTABLE_ELEMENT_NOT_FOUND`, indistinguishable (the shipped `findByIdInCommunity` contract). Beyond that: `SYSTEM_ADMIN` and a granted `MANAGER` reach any existing element (empty history renders as an empty state); a representative reaches any element in an actively-assigned community (same); a technician and a company manager reach the element **iff** the scoped entry set is non-empty, otherwise 404 — their scope is session-derived, so "no entries in scope" *is* "not reachable". An **ungranted** `MANAGER` always gets 404. |
| **Element reassignment between communities is impossible today — resolved by reading code, not assumed** | `communityId` is **not** an updatable field: `InspectableElementRepository.updateById`'s `changes` type excludes it, with the explicit port comment *"an element does not move between communities and does not change type in this slice"*, mirrored verbatim in `UpdateInspectableElementUseCase`. No reassignment or transfer endpoint exists anywhere, and `code` is immutable with *"no regeneration/reassignment endpoint"* (`domain-model-inspections.md`). The only mention of reassignment in the whole repo is a **hypothetical** justification for globally-unique codes (*"avoids ambiguity **if** an element is ever reassigned"*). **So: an element belongs to exactly one community for its entire lifetime, every entry ever recorded against it belongs to a session in that one community, and there is no pre-reassignment-entry question to answer.** This slice therefore scopes the read through the element's current (= only) community and adds no cross-community logic. Recorded as a standing assumption a future reassignment slice must revisit — this proposal's authorization model would need an explicit decision then, not now. |
| **Rows link out to the session; answers are not re-rendered here** | Each row shows when, who, reviewed/unreviewed, and observations, and links to the already-shipped `/review-history/:sessionId`. Rendering every answer per element would mean loading one frozen template snapshot **per row** — real cost, zero product need this slice's success criteria name. Invariant that makes this safe: every row an actor can see belongs to a session that same actor can open, by construction of the five scopes. |
| **Decommissioned elements keep their history; soft-deleted ones do not** | `deactivatedAt` is domain state, not a delete (`review-session` design Decision 3) — a decommissioned extinguisher's compliance record must stay readable. `deletedAt` is the administrative delete and 404s, consistent with every other read (ADR-010). |
| **No pagination, filter, sort or search** | Same discipline as all four shipped slices; `review-history-ui`'s *"No Filtering, Analytics or Adjacent Controls Ship"* stays in force unchanged. Explicit non-goal below. |

## Scope

### In Scope

**API read side (`apps/api/src/modules/review-session/`)**

- New `ReviewSessionRepository` port methods for the element-keyed read — one
  named method per real scope, **scope in the signature**, following the
  shipped `findCompletedForPerformer` / `findCompletedInCommunities` /
  `findCompletedForCompany` / `findCompletedAcrossInstallation` convention.
  Four methods (admin and granted `MANAGER` share one, as they already do).
  The port's standing invariant — **no identifier-only read** — is preserved:
  every new method carries a performer, community or company scope as a
  required parameter alongside the element id.
- Prisma adapter + in-memory fake + repository integration tests against real
  Postgres, per the shipped precedent.
- A `ReadElementReviewHistoryUseCase` that resolves the element via the
  existing `findByIdInCommunity`, resolves the actor's scope through
  `ReviewHistoryAccessService`'s existing checkers, and returns the element
  header plus the scoped, deterministically ordered entry list
  (most-recent-first by `recordedAt`, tiebroken by id).
- An element-keyed branch set on `ReviewHistoryAccessService` mirroring
  `listForActor`/`loadByRole`'s per-branch scope resolution exactly — same
  fail-closed early returns **before** any repository call, same exhaustive
  `switch` + `satisfies never` backstop.
- One route, `GET /communities/:communityId/inspectable-elements/:elementId/review-history`,
  declared in the review-session module's history controller (so the
  `reviewSession:read` gate and the use case stay in one family), with a
  single coded-404 throw site.

**Web (`apps/web/`)**

- One new page at
  `/communities/:communityId/inspectable-elements/:elementId/history`:
  element header + chronological review record, distinct loading / empty /
  error states, every row linking to `/review-history/:sessionId`. No
  controls beyond the links.
- `ProtectedRoute allowedRoles` = the same five roles as `/review-history*`
  — **deliberately different from every other route in the
  `inspectable-elements` URL family**, which is `SYSTEM_ADMIN`-only. Carries
  an explicit comment and a `ProtectedRoute` test so a future reader does not
  "fix" it in either direction.
- Two entry links, no new pages: a per-row *History* link on
  `CommunityElementsListPage` (same shape as the shipped *Print* link), and a
  per-entry link on `ReviewHistoryDetailPage`.
- Real `en`/`es`/`ca` translations for every new key, parity test-enforced.

**Documentation + cross-cutting**

- **FR-008 closes.** Its status column records per-element history as shipped.
- Narrowing (not deleting) the shipped guards this slice makes false:
  `review-history`'s and `review-session-management`'s *"No per-element review
  history surface exists"* scenarios, `review-history-ui`'s *"Scenario: No
  per-element history view exists"*, and `authorization`'s per-element clause
  in *"The Deferred Review Visibility Scopes Grant Nothing"*.
- Unit, repository integration, a **five-scope** E2E matrix (including
  ungranted `MANAGER`, null-company manager, deactivated-assignment
  representative), and **browser verification** against a running dev server
  (CLAUDE.md) for at least an admin and a technician.

### Out of Scope (non-goals)

- **Pagination, filtering, sorting, date ranges or search** on the new view —
  the app-wide filtering initiative named since `review-history-company-scope`
  still owns this; a long-lived element's list is accepted as-is, exactly like
  the installation-wide session list.
- **Rendering each past review's answers inline** — settled decision above;
  rows link to the shipped session detail view.
- **A general-purpose inspectable-element detail page** — FR-004's admin
  surfaces (list/create/edit/label) already ship; this slice adds no element
  management capability, no new element-management route and no `GET` by-id
  element endpoint.
- **Cross-community or cross-element aggregation** ("all extinguishers in this
  community, last review each") — a different query, a different screen, and
  FR-009's territory.
- **Trend charts, analytics, or "overdue" computation** — FR-009; deriving
  `lastInspectedAt` is explicitly a query, not a stored field
  (`domain-model-inspections.md`), and this slice adds no projection.
- **PDF/document export or signing of an element's record** — FR-010.
- **Any element-reassignment support**, or any pre-reassignment-entry
  semantics — impossible today (settled decision above); designing for it now
  would be designing for a feature that does not exist.
- **Any change to the five scopes themselves**, to `ROLE_PERMISSIONS`, to the
  write path, or to `SessionAccessService` (byte-unchanged).
- **Any new permission**, capability, or role.
- **Demo-mode-specific logic** of any kind.

### Why this scope and not more (ADR-006)

The expensive thing here is the *authorization* of an element-keyed read, and
it is paid for exactly once — four port methods and one branch set, all
shaped by conventions four shipped slices already proved. Everything else on
the table (filters, charts, export, an element management detail page,
cross-element rollups) is a **different question** whose answer would not be
reused by this one. Re-rendering answers per element would multiply the read
cost by the row count to duplicate a page that already exists and is already
reachable by exactly the actors who can see the rows.

## Capabilities

### New Capabilities

- None. Every surface, route family, permission and page family this slice
  touches already exists.

### Modified Capabilities

- `review-history` — the element-keyed read as a requirement in its own
  right: the five scopes applied at entry level, the reachability/404 matrix,
  deterministic ordering, decommissioned-visible / soft-deleted-404; amend the
  now-false *"No per-element review history surface exists"* guard.
- `review-history-ui` — the new page, its five-role route gate, both entry
  links, its loading/empty/error states; amend *"Scenario: No per-element
  history view exists"*; keep the no-filtering guard intact.
- `review-session-management` — narrow its FR-008 deferral row and its *"No
  per-element review history surface exists"* scenario.
- `authorization` — record that the element-keyed history read is gated on
  `reviewSession:read` and **not** on `inspectableElement:read`, with the
  scope decided by `ReviewHistoryAccessService`; narrow the per-element clause
  of *"The Deferred Review Visibility Scopes Grant Nothing"*. **No
  `ROLE_PERMISSIONS` change.**
- `inspectable-element-admin-ui` — the per-row *History* link on the community
  element list.

## Approach

Extend the seams the four shipped history slices built; add nothing new.

1. **Scope in the port signature, not in the caller.** The new reads are four
   named `…ForElement…` methods, each carrying its scope as a required
   parameter. This keeps the invariant that has held since `review-session`:
   `ReviewSessionRepository` exposes no identifier-only read, so a caller
   cannot widen its own scope by forgetting an argument.
2. **The element lookup is the community gate.** Resolving through the
   existing `findByIdInCommunity(communityId, elementId)` makes the
   `:communityId` URL segment *verified*, not decorative — wrong community,
   unknown id and soft-deleted all collapse into the one indistinguishable
   404 the element module already ships. This is why the route is nested
   rather than a flat `/review-history/elements/:elementId`: a flat route
   would require a new unscoped `findById` on the element port and break that
   port's "scope is a property of the port" design.
3. **Authorization mirrors `listForActor` branch for branch.** Same checkers,
   same per-branch resolution, same fail-closed early return **before** any
   repository call, same `satisfies never` backstop. A reviewer should be able
   to diff the new branch set against the shipped one and see only the
   element-id parameter.
4. **`reviewSession:read`, not `inspectableElement:read`.** Chosen
   deliberately: the alternative collapses a five-scope feature to
   `SYSTEM_ADMIN` alone, since no other role holds any `inspectableElement:*`
   permission. The permission table is untouched by this slice — a property
   `sdd-verify` can assert cheaply.
5. **One page, two entry links.** The element-side link satisfies FR-008's
   "per element" reading; the session-side link is what makes the four
   non-admin scopes reachable in a browser at all. Neither adds a page, a
   layout or a control.

### PR chain sketch

One `stacked-to-main` chain (CLAUDE.md), branches
`review-history-per-element/<NN>-<slug>`, titles
`feat(review-history-per-element): PR N/M — ...`. Chained PRs are needed;
`sdd-tasks` owns the final split and the binding 400-line forecast.

| PR | Content | Rough size |
|---|---|---|
| ~1 | Four port methods + Prisma adapter + in-memory fake + repository integration tests | ~250–350 |
| ~2 | Access-service element branches + use case + route + DTO + unit tests + five-scope E2E matrix | ~350–450 |
| ~3 | Web page + route gate + both entry links + i18n + component tests + spec merges + FR-008 closure + browser verification | ~350–450 |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `.../review-session/application/ports/review-session.repository.port.ts` | Modified | Four `…ForElement…` methods, scope in each signature |
| `.../review-session/infrastructure/persistence/prisma-review-session.repository.ts` | Modified | Element-filtered joins over `ElementReviewEntry.inspectableElementId` |
| `.../review-session/application/use-cases/testing/` (in-memory fake) | Modified | Same four methods |
| `.../review-session/application/services/review-history-access.service.ts` | Modified | Element-keyed branch set, mirroring `listForActor` |
| `.../review-session/application/use-cases/read-element-review-history.use-case.ts` | New | Element header + scoped, ordered entry list |
| `.../review-session/presentation/**` (history controller + DTO) | Modified/New | One nested route, `reviewSession:read`, one coded-404 site |
| `.../inspectable-element/application/ports/**` | **Untouched** | `findByIdInCommunity` reused verbatim; no new method |
| `apps/web/src/pages/ElementReviewHistoryPage.tsx` (+ test) | New | The one new page |
| `apps/web/src/pages/CommunityElementsListPage.tsx` (+ test) | Modified | Per-row *History* link |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) | Modified | Per-entry element-history link |
| `apps/web/src/App.tsx`, `auth/ProtectedRoute.test.tsx` | Modified | New depth-5 route, five-role gate + its guard test |
| `apps/web/src/api/review-history.ts`, `i18n/locales/{en,es,ca}.json` | Modified | Client call + real translations |
| `openspec/specs/{review-history,review-history-ui,review-session-management,authorization,inspectable-element-admin-ui}/spec.md` | Modified | Delta specs |
| `docs/requirements/functional-requirements.md` | Modified | **FR-008 closes** |
| `apps/api/test/*.e2e-spec.ts` | New/Modified | Five-scope element-history matrix |

**Untouched**: `prisma/schema.prisma` and `prisma/migrations/**` (no schema
change, no migration), `role-permission.checker.ts`, `SessionAccessService`,
the whole review-session write path, the `InspectableElementController` and
every element-management route, all three scope/capability checkers.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The element-keyed read leaks entries outside the actor's scope** — the whole point of the feature is cross-session reach, so a missing conjunct exposes other communities' or other technicians' records | High | Scope is a required parameter of every new port method (no identifier-only read); branches mirror the shipped ones one-for-one; the five-scope E2E matrix asserts each role against an element reviewed by **two different** performers from **two different** companies in a community the actor does not own |
| **A technician sees another technician's entries for the same element** — the most likely misreading of "all history for this element" | High | Settled decision: technician scope is their own entries, entry-level, unchanged from the session-level rule; E2E asserts a two-performer element shows exactly one row to each technician |
| **The 404-vs-empty matrix is inconsistent between roles**, leaking element existence to a role that should not reach it | Med | Matrix is a settled decision above and becomes explicit spec scenarios; every 404 path collapses to one throw site and one code, per the shipped indistinguishable-404 convention |
| **The five-role web route inside a `SYSTEM_ADMIN`-only URL family is copied by a future route** | Med | Explicit in-file comment + a `ProtectedRoute` test naming both the five allowed roles and the family's default; called out in the spec delta |
| **A new unscoped `findById` is added to the element port** to make a flat route work | Med | Approach decision 2 makes the nested route binding; `sdd-verify` asserts `InspectableElementRepository` gained no method |
| **`inspectableElement:read` is quietly granted to another role** to make the page work | Med | Approach decision 4; `sdd-verify` asserts `ROLE_PERMISSIONS` is byte-unchanged |
| **The element-filtered join is slow** on an installation with many sessions — the existing composite index is `(status, completedAt, id)` on `ReviewSession`, not on `ElementReviewEntry.inspectableElementId` | Med | Named for `sdd-design`: confirm the FK's index coverage against a real `EXPLAIN` before deciding whether an index ships; an index-only change is additive and independently revertable |
| **Scope creep into filters/charts/export** once a per-element timeline exists on screen | Med | Explicit non-goals; `sdd-verify` asserts no filter, sort, pagination or date control ships on any history surface |
| ES/CA translations stubbed with English placeholders | Low | Real translations in scope; `locales.test.ts` parity guard covers new keys |

## Rollback Plan

`git revert` the branch. **There is no migration and no data change**, which
makes this the cleanest rollback of the five history slices:

- Reverting removes four port methods and their adapter/fake implementations,
  one use case, one branch set, one route, one page, two links and the i18n
  keys. Nothing else read them.
- No schema object, index or column is created by default (should
  `sdd-design` decide an index is warranted, it ships as its own reversible
  migration in its own PR and can be dropped independently).
- The four shipped scopes and the session-level history surface are untouched,
  so reverting cannot regress them.
- Spec amendments and the FR-008 status must be reverted **with** the code, or
  the specs will claim a surface the code no longer has — and will have
  deleted the guards that keep it unbuilt.
- Each PR in the sketched chain reverts independently.

## Dependencies

- **All four archived history slices** — `ReviewHistoryAccessService`, the
  three checkers, the `findCompleted…` naming convention, `/review-history/:sessionId`
  (every new row links to it), and the four-then-five-role E2E matrix this
  slice mirrors.
- **`inspectable-elements` (archived 2026-09-02)** — `findByIdInCommunity`'s
  indistinguishable-404 contract, the element list page, and the depth-5
  `/edit`//`label` routing precedent this slice's route follows.
- **`review-session` (archived 2026-09-08)** — `ElementReviewEntry` and its
  `inspectableElementId` FK; `deactivatedAt` as domain state.
- **No new runtime dependency.** Reuses `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `buildCodedError`,
  `apiFetch`/`ApiError`, `ProtectedRoute allowedRoles`.
- **For browser verification**, a running dev server plus seeded data:
  `prisma/seed.ts` creates **only** a `SYSTEM_ADMIN`, so this slice needs one
  element reviewed in **at least two completed sessions by two different
  performers**, plus a never-reviewed element (empty state), a decommissioned
  element with history, and a technician account that performed exactly one of
  those sessions.

## Success Criteria

**Reading one element's record**

- [ ] From a community's element list, a `SYSTEM_ADMIN` opens any element's
      history and sees **every** past review of that element, across all its
      sessions, most-recent-first.
- [ ] From any entry row inside a session's history, all five roles reach the
      same page for that entry's element.
- [ ] Each row shows when, who, reviewed/unreviewed and observations, and
      opens the corresponding session's shipped detail view.
- [ ] A never-reviewed element renders an empty state, not an error, for every
      role that reaches it.
- [ ] A **decommissioned** element's history is fully readable; a
      **soft-deleted** element returns `404 INSPECTABLE_ELEMENT_NOT_FOUND`.

**Scope (the regression that matters most)**

- [ ] A technician sees **only their own** entries for an element reviewed by
      two different performers.
- [ ] A representative sees every entry for an element in an actively-assigned
      community, and 404 for an element in any other community — including one
      whose assignment was deactivated.
- [ ] A company manager sees only entries from their own company's sessions;
      a manager with a `null` company reaches no repository call and gets 404.
- [ ] A `SYSTEM_ADMIN` and a **granted** `MANAGER` see identical, complete
      results.
- [ ] An **ungranted** `MANAGER` gets 404 on every element and reaches no
      repository call.
- [ ] A wrong-`communityId`/`elementId` pairing is indistinguishable from an
      unknown element.

**Scope guards**

- [ ] `ROLE_PERMISSIONS` is **unchanged**; the new route is gated on
      `reviewSession:read` and no role gained `inspectableElement:read`.
- [ ] `InspectableElementRepository` gained **no** method; no `GET` by-id
      element endpoint exists.
- [ ] No schema change and no migration ship (index excepted, only if
      `sdd-design` justifies one).
- [ ] No pagination, filter, sort, search, chart or export control ships on
      any history surface.
- [ ] Every new `ReviewSessionRepository` method carries a scope parameter;
      no identifier-only read exists.
- [ ] The four shipped session-level scopes behave identically to before.
- [ ] No demo-mode-specific branch was added.

**Documentation & quality**

- [ ] **FR-008's status records it as closed**, with per-element history
      shipped.
- [ ] Zero hardcoded UI strings; every new key has real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] API and web suites, lint and build all pass.
- [ ] The new page is **browser-verified** against a running dev server for at
      least a `SYSTEM_ADMIN` and a technician — not only test-verified
      (CLAUDE.md).

## Open questions for `sdd-spec` / `sdd-design`

Each has a working assumption; none blocks the next phases.

1. **Exact shape of the four port methods.** *Working assumption*:
   `findCompletedForElementForPerformer(elementId, performedById)`,
   `…ForElementInCommunities(elementId, communityIds)`,
   `…ForElementForCompany(elementId, companyId)`,
   `…ForElementAcrossInstallation(elementId)`, each returning the matching
   sessions with their entries, the use case flattening to that element's
   entries. `sdd-design` may instead return flattened entry rows — the
   tradeoff is payload shape vs. reuse of the existing `ReviewSession`
   mapping.
2. **Where the element-keyed branches live.** *Working assumption*: new
   methods on `ReviewHistoryAccessService` beside `listForActor`/`loadByRole`,
   not a new service — same invariants, same checkers.
3. **Index coverage for the element-filtered join.** *Working assumption*: the
   `ElementReviewEntry.inspectableElementId` FK's index suffices; `sdd-design`
   must confirm with a real `EXPLAIN` before shipping or skipping an index,
   given ADR-013's hand-written-index convention.
4. **What the element header carries, and where it comes from.**
   *Working assumption*: code, name, element type (through the shipped label
   map, never the raw enum), location, state and community, all from the
   `findByIdInCommunity` result — no extra query, no community name lookup
   unless `sdd-spec` judges the community id unusable in the UI.
5. **Representative reachability for a never-reviewed element.** *Working
   assumption*: `CommunityScopeChecker` decides it, giving an empty state
   rather than a 404 (settled matrix above). `sdd-design` must confirm this
   costs no query the branch does not already make.

## Deferred by this slice (ADR-006 record)

Not designed here, deliberately:

- **App-wide filtering/sorting/pagination/search** — the cross-cutting
  initiative named since `review-history-company-scope`.
- **Overdue/upcoming computation and reminders** — FR-009.
- **Export and signing of a compliance record** — FR-010.
- **A general inspectable-element detail/management page** beyond FR-004's
  shipped admin surfaces.
- **Element reassignment between communities** — impossible today; if it ever
  ships, it must decide explicitly whether per-element history spans the
  element's former community, and that decision belongs to that slice.

**FR-008 closes with this slice.**

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking
product input is outstanding. `sdd-design` owns OQ1 and OQ3 above all: the
port shape is what keeps scope un-widenable, and the index question is the
only one whose wrong answer degrades silently.
