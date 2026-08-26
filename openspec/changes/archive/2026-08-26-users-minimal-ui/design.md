# Design: Minimal Web UI for the `users` Domain

## Technical Approach

Three routes (`/users`, `/users/new`, `/users/:id/edit`) added to the existing
flat `Routes` block in `App.tsx`, gated by a role-aware `ProtectedRoute`. All
four API calls go through one ~40-line `apiFetch` seam that is the **only**
place in the web app that parses an error response body — which is what makes
the "no English-message string comparison" success criterion auditable rather
than aspirational. The one API change is an additive `code` field on the 409
body, because the ambiguity the proposal discovered is not solvable on the
client. Forms follow `LoginPage` verbatim: controlled inputs, `noValidate`,
Zod `safeParse` against the API's own schema before any network call.

## Architecture Decisions

### Decision 1 (Q2): Optional `allowedRoles` prop on `ProtectedRoute`, not a second wrapper

| Option | Tradeoff | Verdict |
|---|---|---|
| `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}` | One component owns the 401-before-403 precedence; existing `/` route untouched (prop optional) | **Chosen** |
| Separate `<RequireRole>` composed with `<ProtectedRoute>` | Must re-read `useAuth()` and re-implement the `isLoading` gate. Two wrappers per route means nesting order is load-bearing: get it backwards and a **logged-out** visitor sees "not authorized" instead of being sent to `/login` | Rejected |
| Inline `user.role !== 'SYSTEM_ADMIN'` check inside each page | Non-reusable by `community`; the proposal names this as an explicit risk | Rejected |

**Rationale**: `openspec/specs/authorization/spec.md` ("Permission Check Order")
requires 401 to be evaluated strictly before 403 server-side. The client must
mirror that ordering, and precedence rules belong in **one** place. Composition
sounds cleaner but here it distributes an ordering invariant across call sites.

**Roles, not permissions**: the `Permission` type and `ROLE_PERMISSIONS` table
live in `apps/api/src/shared/application/authorization/**` — not in
`@sf-manager/validation`. Making the web permission-aware means hoisting the
authorization table into the shared package, a real change to the
`authorization` capability that this slice does not need (ADR-006). `Role` is
already exported and already on `AuthUser`. *Deferred trigger*: when a slice
needs finer-grained gating, hoist `ROLE_PERMISSIONS` and swap `allowedRoles`
for `requirePermission` — the call sites change, the precedence logic does not.

Denial renders a shared `NotAuthorized` component (`common.notAuthorized*`
keys), never `<Navigate>` — per the settled product decision.

### Decision 2 (Q3): Hand-rolled `apiFetch` seam + local `useState`, no data-fetching library

| Option | Tradeoff | Verdict |
|---|---|---|
| `apps/web/src/api/client.ts` (`apiFetch`) + `api/users.ts` (4 typed calls); pages keep `useState`; mutations refetch the list | ~40 lines, no new dependency, nothing new to learn beyond `fetch`. Manual refetch after each mutation | **Chosen** |
| TanStack Query / SWR | Cache coherence, dedup, retries — none of which this slice has a problem for. Adds a dependency, a `QueryClientProvider`, and a caching mental model | Rejected (deferred) |
| Keep duplicating raw `fetch` + `useEffect` 4× | Cements the pattern `community` multiplies; and with error parsing scattered across 4 screens, Decision 3 becomes unenforceable | Rejected |

**Rationale**: ADR-006. A query cache earns its keep when many components share
server state; this slice has **one** server collection read by one route
subtree. Installing a cache before there is a cache problem would make
"infrastructure ahead of need" the pattern `community` inherits. The helper
does not foreclose the library — `apiFetch` becomes the `queryFn` if the
library ever lands, and only page-level state changes.

*Deferred trigger*: adopt TanStack Query when a slice has two or more
collections whose mutations invalidate each other — `community` (assignments
mutating community lists) is the likely first real case. Decide then, with
evidence.

### Decision 3 (Q5): Additive `code` field on the 409 body — `user-management` spec delta

Confirmed by reading `users.controller.ts`: `mapMutationError` (lines 161-172)
maps both `LastSystemAdminError` and `TransactionConflictError` to
`new ConflictException(error.message)`. No global exception filter exists. The
body carries no discriminator.

| Option | Tradeoff | Verdict |
|---|---|---|
| Add `code` to the 409 body | One API file changes; UI maps `code` → i18n key deterministically | **Chosen** |
| Client string-matches the English message | Couples the UI to server prose, un-i18n-able. Explicitly forbidden by the proposal | Rejected |
| Infer from context, as `POST` does | Works for create only. On `PATCH`/`DELETE` **both** errors are reachable on the same call — there is no context to infer from. Genuinely impossible | Rejected |
| Retry once; if it succeeds it was a concurrency conflict | This *is* an automatic retry, which the proposal forbids — with worse semantics: it re-issues a mutation to learn why the first failed | Rejected |
| Distinct status for concurrency (e.g. 503) | Breaking status-code change, and 409 is semantically correct for both causes | Rejected |

**Non-breaking guarantee**: `ConflictException(object)` uses the object
*verbatim* as the body, so the controller re-supplies the default fields and
only **adds** one:

```ts
new ConflictException({ statusCode: 409, error: 'Conflict', message, code });
```

| Domain error | Routes | `code` |
|---|---|---|
| `EmailAlreadyInUseError` | `POST` | `EMAIL_ALREADY_IN_USE` |
| `LastSystemAdminError` | `PATCH`, `DELETE` | `LAST_SYSTEM_ADMIN` |
| `TransactionConflictError` | `PATCH`, `DELETE` | `TRANSACTION_CONFLICT` |

Existing e2e assertions are `.expect(409)` only (`users.e2e-spec.ts:192, 370,
397`) — no body-shape assertion breaks. **Only 409 gets a code**: it is the
only ambiguous status. 400 (weak password) and 404 (not found) each have a
single reachable cause; adding codes there is scope creep.

The union lives in `apps/api/src/modules/users/presentation/user-error-code.ts`
and is **mirrored** as a literal union in `apps/web/src/api/users.ts`. Hoisting
it into `@sf-manager/validation` is tempting (ADR-015) but the proposal lists
that package as unchanged, and one 3-value union is honest duplication. An e2e
assertion on `body.code` is the anti-drift guard. *Deferred trigger*: hoist a
shared error-code contract when `community` adds its own codes (rule of three).

> **Spec impact**: `user-management` **does** get a delta. See "Spec Delta" below.

### Decision 4 (Q6): Reusable `ConfirmDialog` on the native `<dialog>` element

| Option | Tradeoff | Verdict |
|---|---|---|
| `apps/web/src/components/ConfirmDialog.tsx` over native `<dialog>` | ~30 lines, no dependency; browser supplies modality, focus trap and Esc. Fully i18n'd and RTL-testable | **Chosen** |
| `window.confirm()` | Zero components — but its **OK/Cancel labels come from the browser locale, not i18next** | Rejected |

**Rationale**: the deciding factor is not `community`'s future destructive
actions — arguing from a future slice's needs is exactly the speculative
scoping ADR-006 forbids. It is that `window.confirm` breaks *this* slice's own
success criteria: "zero hardcoded UI strings" and real `en`/`es`/`ca` coverage.
A destructive confirmation whose buttons ignore the user's app language is a
defect now, not later. The native `<dialog>` keeps the cost near-zero, so
proportionality holds. `community` reuse is a bonus, not the justification.

### Decision 5 (Q4, bounded): Edit page fetches `GET /users` and selects by `:id`

Direction was set by the proposal (prefill from list, no new endpoint). Given
Decision 2 (no shared cache), the implementation is:

| Option | Tradeoff | Verdict |
|---|---|---|
| Edit route calls `listUsers()`, finds `:id` client-side | One code path; deep-link and hard-refresh safe; always fresh. Costs one extra unpaginated list request | **Chosen** |
| `navigate(..., { state: user })` from the list row | Zero extra request, but `state` is `null` on refresh or a pasted link → blank form, and needs a fallback path anyway → two divergent paths for one screen | Rejected |
| Shared list context/provider | A cache by another name; contradicts Decision 2 | Rejected |

If `:id` is absent from the list (deactivated or gone), the page renders the
same not-found state as a 404 — no silent redirect. **This is the concrete
evidence the slice was built to surface**: the missing `GET /users/:id` is
paid for here, once per edit navigation. *Deferred trigger*: add the endpoint
when the list is paginated or grows past a reasonable full fetch.

## Data Flow — deactivate

    UsersListPage ──click──▶ ConfirmDialog ──confirm──▶ deactivateUser(id)
         │                                                    │ apiFetch DELETE /users/:id
         │                                                    ▼
         │                                    204 ────────────┴──── !ok → ApiError{status,code}
         ▼                                     │                          │
    await listUsers()  ◀───────────────────────┘                          ▼
    (row disappears)                                    409 LAST_SYSTEM_ADMIN   → users.error.lastSystemAdmin
                                                        409 TRANSACTION_CONFLICT → users.error.tryAgain (no retry)
                                                        404                      → users.error.notFound
                                                        network/parse failure    → common.error.network

Row-level guard: the deactivate button is not rendered when
`row.id === auth.user.id`; the `role` field is `disabled` on the edit form
under the same comparison. Both are UI affordances layered on the server's
last-admin invariant, never a replacement for it.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/modules/users/presentation/user-error-code.ts` | Create | `UserErrorCode` union (3 values) |
| `apps/api/src/modules/users/presentation/users.controller.ts` | Modify | 409s carry `code`; Swagger conflict responses document it |
| `apps/api/test/users.e2e-spec.ts` | Modify | Assert `body.code` per 409 cause |
| `apps/web/src/api/client.ts` | Create | `apiFetch`, `ApiError` — the only error-body parser |
| `apps/web/src/api/users.ts` | Create | `listUsers/createUser/updateUser/deactivateUser` + mirrored `UserErrorCode` |
| `apps/web/src/auth/ProtectedRoute.tsx` | Modify | Optional `allowedRoles?: Role[]` |
| `apps/web/src/auth/NotAuthorized.tsx` | Create | Explicit denial surface |
| `apps/web/src/components/ConfirmDialog.tsx` | Create | Native `<dialog>` confirm |
| `apps/web/src/pages/UsersListPage.tsx` | Create | List, empty/loading/error states, row actions |
| `apps/web/src/pages/UserCreatePage.tsx` | Create | `createUserSchema` + `passwordSchema` |
| `apps/web/src/pages/UserEditPage.tsx` | Create | `updateUserSchema`; prefill per Decision 5 |
| `apps/web/src/users/error-messages.ts` | Create | `ApiError` → i18n key map (no string matching) |
| `apps/web/src/App.tsx` | Modify | 3 gated routes |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `users.*` / `common.*` translations |

## Interfaces

```ts
// apps/web/src/api/client.ts
export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: string) { super(`API ${status}`); }
}
// status 0 === network/parse failure. `code` is present only on 409s.

// apps/web/src/auth/ProtectedRoute.tsx
type ProtectedRouteProps = { children: ReactNode; allowedRoles?: Role[] };
// isLoading → null · !user → <Navigate to="/login"> · allowedRoles &&
// !allowedRoles.includes(user.role) → <NotAuthorized /> · else children
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (component) | `ProtectedRoute` precedence: loading → null, unauth → `/login`, wrong role → `NotAuthorized`, allowed → children, no prop → legacy behaviour | RTL + `MemoryRouter`, extending `ProtectedRoute.test.tsx` |
| Unit (client) | `apiFetch`: 204 → `undefined`; 409 → `ApiError.code`; malformed body → `ApiError` without `code`; network throw → `status 0` | vitest + mocked `fetch` (`AuthProvider.test.tsx` precedent) |
| Unit (pages) | List states; client validation blocks before any fetch; self-row guards; each `code` → its own message; confirm required before `DELETE` | RTL, mocked `api/users` module |
| Unit (i18n) | `en`/`es`/`ca` have identical key sets | Key-set equality test over the 3 locale JSONs |
| E2E (API) | Each 409 returns its `code`; `statusCode`/`error`/`message` unchanged | `apps/api/test/users.e2e-spec.ts` |

Strict TDD is active for this project: tests precede implementation per slice.

## Spec Delta (read this, `sdd-spec`)

Decision 3 makes `user-management` a **modified capability**, resolving the
proposal's conditional in "Capabilities". The delta is one requirement:

> `POST`, `PATCH` and `DELETE /users` 409 responses MUST include a `code` field
> discriminating `EMAIL_ALREADY_IN_USE`, `LAST_SYSTEM_ADMIN` and
> `TRANSACTION_CONFLICT`. `statusCode`, `error` and `message` are unchanged
> (additive, non-breaking).

## Migration / Rollout

No migration. The API change is additive to a response body; old clients
ignore the new field. Rollback = revert the branch.

## Open Questions

- [ ] Verify at apply time that `ConflictException(object)` emits the object
      verbatim on this NestJS version (expected — the e2e `body.code` assertion
      is the guard either way).
- [ ] Native `<dialog>` needs `HTMLDialogElement` support in jsdom 30; if
      absent, add a minimal `showModal`/`close` polyfill in `src/test/setup.ts`
      rather than abandoning the component.
