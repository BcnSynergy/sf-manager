# Proposal: Representative keeps access to their own performed sessions

## Intent

A `COMMUNITY_REPRESENTATIVE` can perform and sign sessions, but once their assignment is deactivated, their own sessions and documents return `404` (review-export open question; tech-debt #6). Technicians already keep their own work since 2026-09-09. The user confirmed on 2026-10-08 that the same rule applies to representatives.

## Scope

### In Scope
- A representative's own performed `completed` sessions stay in their history list, detail and document, with or without an active assignment.
- Other performers' sessions still require an active representative assignment.
- Everything else returns the uniform `404 REVIEW_SESSION_NOT_FOUND`.
- Sessions on deactivated or soft-deleted communities stay visible, as for technicians.
- Docs:
  - An ADR-011 addendum.
  - FR-010 gets a deferred note: a document link on the field-flow session page.

API-only is deliberate and user-confirmed. The existing history and document UI renders whatever the API returns, so it needs no web change. It still gets a browser pass.

### Out of Scope
- The field-flow session page document link.
- The write surface. It still requires an active assignment.
- New permissions.
- Other roles.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `authorization`: the representative row of the scope table becomes "active communities ∪ own performed". The L1064-1070 paragraph and its scenarios change.
- `review-history`: the representative requirement (L84) and the active-assignment exception (L941) change, and possibly the entry-level table (L648, L727-728).
- `review-document`: the scope text (L127-128) changes, and the scenario at L171-174 is reversed.

## Approach

- The representative branches of `review-history-access.service.ts` change: `listForActor` (L79-89) and `loadByRole` (L175-188).
  - With no active assignment, they fall through to the existing `findCompletedForPerformer` / `findCompletedByIdForPerformer` methods (`prisma-review-session.repository.ts:312-336`).
  - With an assignment, they use the union.
- Design will choose between a new OR-predicate port method and merging two queries. Keeping the current sort order favours the OR method.
- The document reuses `loadCompletedForActor` (`read-review-document.use-case.ts:104`), so it inherits the change.
- Strict TDD applies (ADR-016). References: ADR-006, ADR-011.

## Affected Areas

| Area | Impact |
|------|--------|
| `apps/api/src/modules/review-session/application/services/review-history-access.service.ts` | Modified |
| `.../ports/review-session.repository.port.ts`, `.../infrastructure/persistence/prisma-review-session.repository.ts`, `.../use-cases/testing/in-memory-review-session.repository.ts` | Modified (if a new method is added) |
| `apps/api/test/review-history.e2e-spec.ts`, repository `*.integration.spec.ts` | Modified |
| `docs/adr/ADR-011-...md`, `docs/requirements/functional-requirements.md` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The union leaks other performers' sessions | Med | Unit, integration and e2e negatives |
| The order differs from the current sort | Low | The OR query keeps `COMPLETED_HISTORY_ORDER_BY` |
| The detail page's element-history link returns 404 for a deactivated representative | Med | Question 1 below |

## Rollback Plan

Revert the PR. There is no migration and no data change.

## Success Criteria

- [ ] A deactivated representative still lists and reads their own session and its document. Others' sessions on that community return `404`.
- [ ] Writes are still refused.
- [ ] Browser-verified as `rep@sf-manager.example` with the assignment deactivated.

## Size

About 40-80 code lines, 250-400 test lines and about 40 doc lines. Hermetic integration tests are needed if a Prisma method is added. Delivery: `representative-retained-access/01-retained-own-sessions`, then `02-archive`, stacked-to-main, ask-on-risk.

## Proposal question round

1. Should the element-keyed history also return a deactivated representative's own entries (the technician rule, L654-658)? Assumption: yes, own entries only, because the detail page links to it (`ReviewHistoryDetailPage.tsx:152`).
