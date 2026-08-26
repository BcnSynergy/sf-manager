# Design: Minimal Web UI for the `community` Domain

## Technical Approach

Four routes (`/communities`, `/communities/new`, `/communities/:id`,
`/communities/:id/edit`) added to the flat `Routes` block in `App.tsx`, each
wrapped in `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}` — reused verbatim,
zero changes to `auth/**`. All 12 calls go through the existing `apiFetch` seam,
still the only place in the web app that parses an error body. The one API
change is an additive `code` on assignment 409s, built exactly as
`UsersController.buildConflictException` already builds it. Forms follow
`UserCreatePage` verbatim: controlled inputs, `noValidate`, Zod `safeParse`
against `@sf-manager/validation`'s own schemas before any network call.

This design **reuses** `users-minimal-ui` Decisions 1 (`allowedRoles`), 2 (no
data-fetching library), 3 (additive 409 `code`), 4 (`ConfirmDialog`) and 5
(fetch-the-list-and-select) unchanged. It **diverges** on exactly one point:
the fetch/state boilerplate is collapsed into a container component
(Decision 3), because this slice instantiates it twice on one page.

## Architecture Decisions

### Decision 1 (Q4): Local `CommunityErrorCode`, mirrored — codified as a convention, not deferred silently

`users-minimal-ui` named a rule-of-three trigger: *"hoist a shared error-code
contract when `community` adds its own codes."* Firing it requires separating
two things the trigger conflated.

| What is duplicated | Option | Tradeoff | Verdict |
|---|---|---|---|
| **The code union** | Hoist into `@sf-manager/validation` | Kills API↔web mirror drift. But the unions **share no values** except `TRANSACTION_CONFLICT`: a "shared" home becomes either a god-union coupling every module's presentation layer, or per-module files in a package chartered (ADR-015) for *validation*, not error taxonomy. Inverts the module boundary — `shared` would know each module's presentation errors | **Rejected** |
| **The code union** | `apps/api/src/modules/community/presentation/community-error-code.ts`, mirrored as a literal union in `apps/web/src/api/community.ts` | 3 values, file-for-file with `users`. Drift guarded by the same proven mechanism: an e2e assertion on `body.code` per cause | **Chosen** |
| **The `{statusCode, error, message, code}` builder** | Extract now to `apps/api/src/shared/presentation/http/` | Genuinely identical 8 lines. But the proposal fences `users` API as unchanged, so `UsersController` cannot be migrated in this chain — leaving a "shared" helper with one caller and an identical private copy next door. Worse than two honest copies | **Rejected (scheduled)** |
| **The builder** | Private `buildConflictException(error, code)` on `CommunityController`, mirroring `UsersController` | Second occurrence. Rule of three is not met by the *helper*; extracting at n=2 across a scope fence buys nothing | **Chosen** |

**Rationale**: the trigger fired and the answer is "still local" — but the
deferral is no longer implicit. This design **codifies the convention** so the
duplication is deliberate rather than accidental:

> **Coded-conflict convention (API).** A module that needs machine-readable
> conflict causes declares `modules/{domain}/presentation/{domain}-error-code.ts`
> exporting a literal union; the controller emits
> `new ConflictException({ statusCode: 409, error: 'Conflict', message, code })`;
> **only a status with more than one reachable cause on the same call gets a
> code**; every code is asserted in that module's e2e spec; the web mirror is a
> literal union in `apps/web/src/api/{domain}.ts`.

*Extraction trigger (mechanical, pre-designed so nobody re-litigates it)*: at
the **third** module needing coded conflicts, create
`apps/api/src/shared/presentation/http/coded-conflict.ts` exporting
`buildCodedConflict(message: string, code: string): ConflictException`, and
migrate **all** existing callers in that same PR. The per-module unions stay
where they are — only the envelope builder moves.

| Domain error | Routes | `code` |
|---|---|---|
| `AssignmentAlreadyExistsError` | `POST` reps / techs | `ASSIGNMENT_ALREADY_EXISTS` |
| `IneligibleRoleError` | `POST`, `reactivate` (both) | `INELIGIBLE_ROLE` |
| `TransactionConflictError` | `POST`, `reactivate` (reps) | `TRANSACTION_CONFLICT` |

404s and 400s are untouched (proposal, "Why the error-code scope is narrowed").

### Decision 2 (Q5): No data-fetching library — the stated trigger was checked and is **not** met

`users-minimal-ui` deferred TanStack Query with the trigger *"two or more
collections whose mutations invalidate each other."* Enumerating this slice's
actual invalidation matrix retires that trigger rather than confirming it:

| Mutation | Collections it invalidates **in a rendered view** |
|---|---|
| assign / deactivate / reactivate representative | representatives — **only** |
| assign / deactivate / reactivate technician | technicians — **only** |
| create / update / soft-delete community | communities list — **only** (the server-side representative cascade on soft-delete is not rendered anywhere at that moment; the row simply disappears) |

The exclusivity swap is an *intra*-collection effect: one `POST` changes two
rows of the **same** list. Representatives and technicians are **co-located, not
coupled** — zero cross-collection invalidations exist. `community` is not the
case that trigger was written for.

| Option | Tradeoff | Verdict |
|---|---|---|
| `apiFetch` + per-section refetch; state owned by `AssignmentSection` | Zero dependencies. Refetching the whole affected list is *precisely* what makes the swap observable | **Chosen** |
| TanStack Query | Buys cache coherence for zero cross-collection invalidations — and its ergonomic path (`setQueryData`, optimistic mutations) actively tempts an implementer toward the **one** behaviour the proposal forbids: patching the clicked row and hiding the auto-deactivation (proposal Risk 2). Here a cache is a *hazard*, not just overhead | **Rejected (deferred)** |
| Keep hand-rolling `useEffect`/`useState` per section (2× on the detail page) | Cements the boilerplate the risk register flagged; two copies of the same refetch/error logic drift | **Rejected** — superseded by Decision 3 |

Guard: while a mutation is in flight the section's action buttons are
`disabled`, so double-submits cannot race two refetches. That is a UI
affordance, never a substitute for the server's transactional invariant.

*New deferred trigger (the old one is retired)*: adopt a query cache when a
**single** mutation must invalidate collections rendered by **different**
components or routes at the same time — the realistic first case is
community-scoped authorization, where an assignment change alters the caller's
own permissions and therefore route gating.

### Decision 3 (Q6): One `AssignmentSection` container — with **no** behavioural props, ever

Enumerating what actually differs between the two sections *in the UI*, given
the proposal's rule that the client adds no exclusivity logic:

| Aspect | Representatives | Technicians | Difference kind |
|---|---|---|---|
| Endpoints (list/assign/deactivate/reactivate) | 4 | 4 | data (injected functions) |
| Row rendering (`userId`, status label, actions) | identical | identical | none |
| Post-mutation behaviour (refetch this list) | identical | identical | none |
| Section title, empty text, ineligible-role copy, `data-testid` prefix | different | different | copy (i18n keys) |
| Exclusivity, warning, transaction conflict | server-side | server-side | **not in the UI at all** |

| Option | Tradeoff | Verdict |
|---|---|---|
| One `AssignmentSection`, parameterized **only** by operations + i18n keys + testid prefix; owns its own list/loading/error state | Written once, instantiated twice. Cannot hide the exclusivity asymmetry because it never encodes it | **Chosen** |
| One component with `isExclusive` / `mode: 'representative' \| 'technician'` | This is exactly the abstraction the proposal warned about: it re-expresses a server invariant as a client branch, creating a second source of truth | **Rejected** |
| Two separate components | ~120 duplicated lines each; every a11y/error/refetch fix done twice — and neither file expresses the exclusivity difference either, so the duplication buys **nothing** | **Rejected** |

**Rationale**: the risk the proposal named is *hiding the asymmetry*, not
sharing a component. A component that has no knowledge of exclusivity cannot
hide it. **Hard rule for `sdd-apply` and `sdd-verify`**: `AssignmentSection`
takes no boolean or mode prop that changes behaviour. If one is ever needed,
that is the signal to split into two components — not to add the prop.

### Decision 4 (Q7, bounded): `useCommunity(id)` — `listCommunities()` + client-side select, three parallel requests

| Option | Tradeoff | Verdict |
|---|---|---|
| `apps/web/src/community/use-community.ts` calls `listCommunities()` and selects `:id`; used by **both** the detail and edit pages | One code path; deep-link and hard-refresh safe; always fresh. Extracted (not duplicated) because the not-found **guardrail** must behave identically in both places, and duplicated guardrails drift | **Chosen** |
| `navigate(..., { state: community })` from the list row | `state` is `null` on refresh or a pasted link → blank page, and still needs the fallback path → two divergent paths per screen | Rejected |
| Add `GET /communities/:id` | Contradicts the retrofit framing: this slice exists to *surface* the missing endpoint as evidence, not paper over it | Rejected (deferred) |

**Request sequencing** — three **independent, parallel** requests on mount, each
with its own loading/error state; never `Promise.all` and never sequential. The
assignment lists take the route `:id` directly, so they do **not** wait on the
community fetch, and a failing assignment list must not blank the community
header (or vice versa).

**Not-found guardrail** (mirrors `users-minimal-ui` Decision 5, extended): if
`:id` is absent from the list — soft-deleted or unknown — the page renders an
explicit not-found state and **renders neither assignment section**. No silent
redirect. Suppressing the sections matters here specifically: the assignment
endpoints are not gated on the community being listed, so they would happily
return rows and offer actions on a community the admin cannot see.

**Evidence this slice is built to surface**: one detail navigation costs
`GET /communities` (unpaginated) + 2 assignment lists = **3 requests**; opening
edit costs another full list. *Deferred trigger for adding `GET /communities/:id`*:
when `GET /communities` is paginated or outgrows a full fetch, **or** — the
community-specific one, stronger than `users`' — when any non-`SYSTEM_ADMIN`
role gains detail access, since a representative must not fetch every community
to view the one they represent.

## Data Flow — representative exclusivity swap (the load-bearing interaction)

    CommunityDetailPage
      └─ <AssignmentSection ops={representativeOps} keys="community.representatives.*">
             │ paste userId ──▶ assign(userId)
             │                     │ apiFetch POST /communities/:id/representatives
             ▼                     ▼
        buttons disabled     201 ──┴── !ok ──▶ ApiError{status, code}
             │                │                      │
             │                │      409 ASSIGNMENT_ALREADY_EXISTS ──▶ community.error.assignmentExists
             │                │      409 INELIGIBLE_ROLE           ──▶ community.error.ineligibleRepresentative
             │                │      409 TRANSACTION_CONFLICT      ──▶ community.error.tryAgain  (NO auto-retry)
             │                │      404                           ──▶ community.error.assignmentTargetNotFound
             │                │      0 / other                     ──▶ common.error.network
             ▼                ▼
        await list()   GET /communities/:id/representatives
             │                │
             └────────────────┴──▶ re-render BOTH rows from the server:
                                     B  deactivatedAt: null      → status "Active"
                                     A  deactivatedAt: <time>    → status "Deactivated"   ← the swap, observed

Nothing in the client predicted A's deactivation; it is read back from the
server. `warning` is present on the 201 body and deliberately ignored (proposal,
settled decision). The technician section runs the identical code path — no
second row ever flips, because no client rule says it should.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/modules/community/presentation/community-error-code.ts` | Create | `CommunityErrorCode` union (3 values) |
| `apps/api/src/modules/community/presentation/community.controller.ts` | Modify | `mapAssignmentError` → `buildConflictException`; `@ApiConflictResponse` documents `code` |
| `apps/api/src/modules/community/presentation/community.controller.spec.ts` | Modify | Each 409 cause maps to its own `code`; 404/400 bodies unchanged |
| `apps/api/test/community.e2e-spec.ts` | Modify | Assert `body.code` per 409 cause (anti-drift guard) |
| `apps/web/src/api/community.ts` | Create | 12 typed calls, `Community`/`Assignment` types, mirrored `CommunityErrorCode` |
| `apps/web/src/community/error-messages.ts` | Create | `ApiError{status,code}` → i18n key; never reads `.message` |
| `apps/web/src/community/locale-labels.ts` | Create | `Locale` → i18n key (`role-labels.ts` pattern) |
| `apps/web/src/community/assignment-status-labels.ts` | Create | `deactivatedAt` → active/deactivated i18n key |
| `apps/web/src/community/use-community.ts` | Create | Decision 4 — list-and-select + not-found state |
| `apps/web/src/community/AssignmentSection.tsx` | Create | Decision 3 — container: own list state, refetch, assign form, row actions |
| `apps/web/src/pages/CommunitiesListPage.tsx` | Create | List, loading/empty/error states, edit/detail links, confirmed soft-delete |
| `apps/web/src/pages/CommunityCreatePage.tsx` | Create | `createCommunitySchema` + `localeSchema` `<select>` |
| `apps/web/src/pages/CommunityEditPage.tsx` | Create | `updateCommunitySchema`; prefill via `useCommunity` |
| `apps/web/src/pages/CommunityDetailPage.tsx` | Create | Community header + 2 `AssignmentSection` instances |
| `apps/web/src/App.tsx` | Modify | 4 `SYSTEM_ADMIN`-gated routes |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `community.*` translations, 3 locales |
| `apps/web/src/community/*.test.ts(x)`, `apps/web/src/pages/Community*.test.tsx` | Create | Per Testing Strategy |
| `apps/web/src/api/client.ts`, `auth/**`, `components/ConfirmDialog.tsx`, `users/**`, `packages/validation/**`, `apps/api/**/users/**` | Unchanged | Reused as-is — any needed change is a **finding to report**, not a quiet edit |

## Interfaces / Contracts

```ts
// apps/api/src/modules/community/presentation/community-error-code.ts
export type CommunityErrorCode =
  'ASSIGNMENT_ALREADY_EXISTS' | 'INELIGIBLE_ROLE' | 'TRANSACTION_CONFLICT';

// apps/web/src/api/community.ts — mirror of the union above, plus:
export type Community = { id: string; name: string; address: string; locale: Locale };
export type Assignment = { communityId: string; userId: string; deactivatedAt: string | null };
// list/create/update/softDelete + {list,add,deactivate,reactivate}×{Representative,Technician}
// `warning` on the add/reactivate representative body is typed but unread (settled decision).

// apps/web/src/community/AssignmentSection.tsx — Decision 3
type AssignmentOps = {
  list: () => Promise<Assignment[]>;
  assign: (userId: string) => Promise<unknown>;
  deactivate: (userId: string) => Promise<unknown>;
  reactivate: (userId: string) => Promise<unknown>;
};
type AssignmentSectionProps = {
  ops: AssignmentOps;
  testIdPrefix: string;                    // 'representatives' | 'technicians'
  keys: { title: string; empty: string; assignLabel: string;
          confirmTitle: string; confirmMessage: string; ineligible: string };
};
// NO isExclusive / mode / allowsMultipleActive prop — Decision 3, hard rule.
```

Route order note: `/communities/new` and `/communities/:id` coexist safely —
React Router ranks the static segment above the dynamic one.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (API) | Each 409 cause → its own `code`; 404/400 bodies unchanged | `community.controller.spec.ts`, mocked use cases |
| E2E (API) | Real `body.code` per cause; `statusCode`/`error`/`message` unchanged | `apps/api/test/community.e2e-spec.ts` |
| Unit (web mapping) | **Differential**: 409 `ASSIGNMENT_ALREADY_EXISTS` vs `INELIGIBLE_ROLE` vs `TRANSACTION_CONFLICT` yield three **distinct** keys; identical `.message` strings across two codes do not change the result | vitest, `community/error-messages.test.ts` |
| Unit (web labels) | Every `Locale` and both assignment statuses map to a key that exists in all 3 locale files | vitest, table-driven |
| Unit (component) | `AssignmentSection`: loading/empty/error; assign refetches; **a mocked assign whose refetch returns the incumbent deactivated renders that row as deactivated** (the swap, at component level); confirm required before deactivate; buttons disabled while pending | RTL, mocked `api/community` |
| Unit (pages) | List states; client validation blocks before any `fetch`; `useCommunity` not-found renders no assignment sections; role gating via `ProtectedRoute` | RTL + `MemoryRouter` |
| Unit (i18n) | `en`/`es`/`ca` key-set parity incl. `community.*` | existing `locales.test.ts` |
| Static guard | No `.message` read on `ApiError` anywhere in `apps/web/src`; no raw enum value in a rendered cell | grep, run by `sdd-verify` |
| Browser | Criteria 1–19 exercised against `npm run dev` (CLAUDE.md "Verifying UI Changes") | manual, `claude-in-chrome` |

Strict TDD is active: tests precede implementation per slice.

## Spec Delta (read this, `sdd-spec`)

Decision 1 confirms `community-assignments` is a **modified capability**:

> `POST /communities/:id/{representatives,technicians}` and
> `POST /communities/:id/{representatives,technicians}/:userId/reactivate` 409
> responses MUST include a `code` field discriminating
> `ASSIGNMENT_ALREADY_EXISTS`, `INELIGIBLE_ROLE` and `TRANSACTION_CONFLICT`.
> `statusCode`, `error` and `message` are unchanged; 404 and 400 responses are
> untouched (additive, non-breaking).

## Migration / Rollout

No migration. The API change is additive to a response body; old clients ignore
the new field. Rollback = revert the branch (proposal, Rollback Plan). Expected
delivery: chained PRs, `stacked-to-main` — `sdd-tasks` forecasts against the
400-line budget.

## Open Questions

- [ ] Confirm at apply time that `IneligibleRoleError` is actually reachable on
      technician `reactivate` (the controller maps it; the use case may not throw
      it). If unreachable, the e2e assertion covers only the representative path
      and that is fine — do not invent a scenario to hit it.
- [ ] `community.error.assignmentTargetNotFound` is one message for three 404
      causes (proposal Open Question 2). Browser verification (criterion 22) is
      the check on whether that is honest enough; if not, the `code` mechanism
      already exists to extend.
