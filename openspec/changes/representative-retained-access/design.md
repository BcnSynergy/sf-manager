# Design: Representative keeps access to their own performed sessions

Revision 2 (2026-10-08, after fresh-context risk review): D2 null handling, lazy D3, D8 hand-edit list, tie and e2e negative test cases.

## Technical Approach

Only the three `COMMUNITY_REPRESENTATIVE` branches of `ReviewHistoryAccessService` change (`review-history-access.service.ts:79-89`, `:175-188`, `:259-279`). Each branch composes two reads that already exist and are already integration-tested: the community-scoped read (`…InCommunities`) and the performer-scoped read (`…ForPerformer`, the technician's methods at `prisma-review-session.repository.ts:312-336,451-456`). The port, both adapters and the Prisma schema stay unchanged. The document read follows with no change, because `ReadReviewDocumentUseCase` gates on `loadCompletedForActor` (`read-review-document.use-case.ts:104`).

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|----------|----------|-----------|
| D1 | Compose in the service: the union of the two existing scoped reads. No new port method. | A new OR-predicate method family (`…ForRepresentative(performedById, communityIds)`, `WHERE status='completed' AND (communityId IN … OR performedById = …)`) | Each operand is already scoped and integration-tested, including the leak negatives, so the union cannot widen beyond "assigned communities ∪ own". The OR family needs three methods on two adapters, plus hermetic integration tests, the port-enumeration guard and the full `jest.fn()` port stub in `record-entry.use-case.spec.ts:283-295`. Following the `review-history-company-scope` 3.6 precedent (port comment `:107-114`), it would also require deleting the `…InCommunities` trio. That is about 3x the diff for the same behaviour. The cost here is one extra query per representative request; with no pagination (the `list-review-history.use-case.ts:46-47` caller has no limit or cursor), that is acceptable. |
| D2 | `listForActor`: resolve `communityIds`. `own = findCompletedForPerformer(userId)`. `community = communityIds.length ? findCompletedInCommunities(communityIds) : []`. Merge, dedupe by `id`, and sort with a private `completedHistoryOrder` comparator: `completedAt` DESC, then `id` DESC. `completedAt` is `Date | null` (`domain/review-session.entity.ts:19`), so the comparator uses `(s.completedAt?.getTime() ?? 0)` (epoch fallback), with no non-null assertion. The fallback is unreachable: both operands filter `status='completed'`, and completion always writes `completedAt` (`prisma-review-session.repository.ts:245`; the port's own projection types it non-null, `review-session.repository.port.ts:17`). | Concatenation without a re-sort; importing the adapter's `COMPLETED_HISTORY_ORDER_BY`; a `!` assertion | Concatenation breaks the documented order. ADR-013 and `no-restricted-imports` forbid importing from infrastructure. The `elementHistoryOrder` comparator (`read-element-review-history.use-case.ts:49-59`) is the precedent. Ids are lowercase UUIDv7 strings, so string comparison matches Postgres order on ties. The empty-scope guard keeps the existing "no `…InCommunities` call on an empty scope" discipline. |
| D3 | `loadByRole`: call `findCompletedByIdForPerformer(id, userId)` first; on a hit, return it. Only on a miss resolve `communityIds` (lazily); if non-empty, call `findCompletedByIdInCommunities`, otherwise return `null`. A unit test asserts `listAssignedCommunityIds` is not called on an own hit. | Resolving `communityIds` up front; running both repository calls every time | Both methods hydrate entries. With lazy resolution, an own-session hit issues no Layer 2 lookup at all (now actually true, and test-pinned). The misses still collapse to the single throw site (`:156-159`), so the 404 stays non-disclosing. |
| D4 | `listElementHistoryForActor`: if `communityIds.includes(element.communityId)`, the branch is **unchanged** (reachable; empty is allowed). Otherwise it mirrors the technician branch (`:248-257`): `findCompletedEntriesForElementForPerformer(element.id, userId)`, and an empty result is `{ reachable: false }`. | A union in the assigned case too | An entry's session is always on the element's community: `record-entry.use-case.ts:101-105` resolves the element via `session.communityId`. So when the representative is assigned, the community read already contains their own entries. |
| D5 | The write surface is unchanged. `SessionAccessService.loadForActor` still requires `isAssignedTo` (`session-access.service.ts:45-52`), and so does `OpenReviewSessionUseCase` (`open-review-session.use-case.ts:90`). | — | The proposal keeps writes out of scope. |
| D6 | The `in-memory-review-session.repository.ts` fake needs no change, because it already implements every method used. | — | No port change (D1). |
| D7 | Docs in PR 1: an ADR-011 addendum (2026-10-08) states the rule "representative read scope = active communities ∪ own performed `completed` sessions; writes still require an active assignment" and cites D1. The FR-010 row (`functional-requirements.md:47`) gets a deferred note for the field-flow session-page document link. | — | Proposal. |
| D8 | The archive PR (`02-archive`) hand-edits exactly two Purpose passages, because deltas carry only `### Requirement:` blocks. (a) `openspec/specs/review-history/spec.md` L10-11 ("sees the sessions performed on **their** actively assigned communities…") gains "plus the sessions they performed themselves, with or without an assignment". (b) `openspec/specs/authorization/spec.md` L15 ("a representative's scope is their actively assigned communities") gets the same addition. Not hand edits: review-history L931-935 (scenario "Another community's completed session is not disclosed") is carried by the new MODIFIED delta for "An Out-of-Scope Historical Session Is Indistinguishable From a Nonexistent One". Checked, no edit needed: review-history L464-465, L490-491; authorization ~L611, ~L969, L1424, L1446; `review-document` Purpose L9-11 ("exactly who may open the same session in review history"). | Delta blocks for Purpose prose | The same pattern as web-locale-switch D9. `sdd-tasks` MUST turn (a) and (b) into one explicit archive-PR task each; a generic "merge deltas" task does not cover them. |

## Data Flow

    rep request -> listAssignedCommunityIds(userId)   (list, elem: up front; by-id: only on own miss)
       list : ForPerformer(userId) ∪ (ids ? InCommunities(ids) : []) -> dedupe(id) -> sort
       by-id: ByIdForPerformer ?? (resolve ids; ids ? ByIdInCommunities : null) -> null => 404
       elem : element.communityId ∈ ids ? InCommunities (unchanged) : ForPerformer, [] => 404

## File Changes

| File | Action | Est. lines |
|------|--------|-----------|
| `apps/api/src/modules/review-session/application/services/review-history-access.service.ts` | 3 branches + comparator + comments | code ~45 |
| `.../services/review-history-access.service.spec.ts` | Rewrite `:179-189` (an empty scope now calls `findCompletedForPerformer` and does not call `findCompletedInCommunities`); add union, dedupe, order, by-id and element cases | test ~150 |
| `apps/api/test/review-history.e2e-spec.ts` | Reverse `:3845-3908`; add list, by-id and element-history cases to the `:1389` block | test ~170 |
| `docs/adr/ADR-011-expanded-roles-and-auth-architecture.md`, `docs/requirements/functional-requirements.md` | D7 | docs ~35 |

Totals: about 45 lines of code, 320 of tests and 35 of docs, roughly 400 in all. If it goes over, the excess is tests, so the CLAUDE.md size-exception rule applies (report the code vs test split). Delivery is stacked-to-main: `representative-retained-access/01-retained-own-sessions`, titled `feat(review-history): PR 1/2 — representative keeps own performed sessions`, then `02-archive` (D8).

## Testing Strategy (Strict TDD, RED first)

| Layer | Cases |
|-------|-------|
| Unit (in-memory repository + `FakeCommunityScopeChecker`) | No assignment: the list returns only the rep's own sessions, never another performer's session on the same community, and `findCompletedInCommunities` is not called. Assigned: the union holds own sessions elsewhere plus everything in the assigned communities, an own session inside an assigned community appears once, and the order is `completedAt` DESC then `id` DESC across both sources. The equal-`completedAt` tie case MUST span both sources (one own session outside the assigned communities, one community session by another performer, same `completedAt`), so the `id` tiebreak is exercised across the merge. By-id: an own hit resolves and `listAssignedCommunityIds` is not called (D3); own session without assignment resolves; another performer's session without assignment gives `ReviewSessionNotFoundError`; an own session misses then the community read resolves. Element: unassigned with own entries is reachable and returns own entries only; unassigned with no own entries is `{reachable:false}`; the assigned case is unchanged (empty is reachable). |
| Integration | None. No new or changed Prisma query (D1). The existing `…ForPerformer` and `…InCommunities` integration coverage is the leak proof per operand. |
| E2E (`npm run test:e2e --workspace=apps/api`) | Covers a rep who opened and completed a session on community X, then had their assignment deactivated. The list still holds the own session and not a technician's session on X. By-id returns 200 for the own session and `404 REVIEW_SESSION_NOT_FOUND` for the technician's. The document returns 200, reversing the `:3845-3908` test; that reversed test MUST keep a negative: after deactivation, the same rep still gets `404 REVIEW_SESSION_NOT_FOUND` on the document of a technician-performed session on the same community. Element history for X's element returns 200 with only the rep's own entries, while an element where the rep has no entries returns `404 INSPECTABLE_ELEMENT_NOT_FOUND`. A write to X is refused. The tests at `:1575`, `:3067` and `:3799` stay green unchanged, because those reps performed nothing. |

## Browser Verification

1. With the user's OK, deactivate `rep@sf-manager.example`'s assignment through the admin UI. Before that, make sure the rep has performed one completed session; if needed, the rep opens and signs one on a seeded community.
2. The user logs in as the rep.
3. Check the history list: only the rep's own sessions, none of the seeded technician sessions.
4. Open the detail, the document and the element-history link (`ReviewHistoryDetailPage.tsx:152`); each renders.
5. Paste a seeded technician session URL (id from `psql`); it shows the not-found state.
6. Restore the assignment.

## Migration / Rollout

No migration is required. Revert PR 1 to roll back.

## Open Questions

None blocking. The field-flow document link is deferred (D7).
