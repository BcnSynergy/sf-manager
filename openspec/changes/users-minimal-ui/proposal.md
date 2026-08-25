# Proposal: Minimal Web UI for the `users` Domain

## Intent

Two consecutive slices (`user-management-roles`, `community`) shipped API-only.
The only web change in either was propagating `role` through `AuthProvider`.
That drifted from ADR-006's own premise — "thinnest possible end-to-end slice =
API + one client" — and left two domains of backend surface with no real UI
consumer validating their contracts. ADR-006's 2026-08-25 addendum records the
course correction: retrofit minimal web UI for `users`, then `community`, then
never batch backend-only domains again.

This slice is the first half of that correction. It has two jobs:

1. **Validate the already-built `users` API against a real consumer.** Four
   endpoints exist (`POST` / `GET` / `PATCH` / `DELETE /users`). A UI is the
   first thing that will find out whether that contract is actually usable —
   notably that there is **no `GET /users/:id`**, and that the API's 409 carries
   two distinct business meanings behind one opaque message string.
2. **Establish the base web patterns** that `community` (the next retrofit) and
   every future domain slice will reuse: permission-gated route section, list
   screen, create form, edit form, destructive-action confirm, and API-error →
   localized-message mapping.

Success looks like: a `SYSTEM_ADMIN` logs in, sees the active users, creates
one, edits one, deactivates one, is told precisely *why* when the API refuses —
and a non-admin never reaches the section at all.

Context: `[[sdd/users-minimal-ui/explore]]` (grounded API + web-conventions
survey). ADR-006 addendum "Course Correction — UI Fell Behind (2026-08-25)".

## Settled product decisions

Closed with the product owner. Inputs, not open items.

| Decision | Resolution |
|---|---|
| Initial password | The admin **types the initial password directly** in the create-user form. Matches the existing `POST /users` contract (`{ email, password, role }`) — zero new API surface. Validated client-side with the shared `passwordSchema`. *Explicitly temporary — see Open Questions.* |
| Deactivated users in the list | **Hidden.** The list shows active users only. `GET /users` already excludes soft-deleted rows server-side (ADR-010), so this is the API's own default, not a client-side filter. No "show deactivated" toggle, no restore. |
| Self-deactivation | **Forbidden from this UI.** The deactivate action is hidden/disabled on the row representing the currently logged-in user (compared against `AuthProvider`'s `user.id`). This is a UI guardrail on top of — not a replacement for — the server's last-admin invariant. |
| Self-role-edit | **Forbidden from this UI.** The role field is disabled on the edit form when editing the currently logged-in user's own row — same guardrail pattern as self-deactivation, for consistency. This is additive, not a substitute for the server's last-admin invariant. |
| Non-admin access to `/users` | **Explicit denial, not a silent redirect.** A non-`SYSTEM_ADMIN` who reaches `/users` sees a clear "not authorized" message/page, not a silent bounce to `/`. Silent redirects leave a confused user (e.g. one following a stale link) with no explanation. |
| 409 error messaging | The UI must show a **specific message per business cause** (duplicate email vs. last-admin lockout), never a generic "conflict". See the constraint below — this is not free. A genuine `TransactionConflictError` (concurrent-write retry, not a business rule) shows a distinct "please try again" message — **no automatic retry**, to keep this first UI slice simple and predictable. |
| Password editing | Not offered. `updateUserSchema` has **no password field**; the edit form exposes `email` and `role` only. |

### Constraint discovered while writing this proposal: the 409 is not machine-readable

`users.controller.ts` maps every conflict via `new ConflictException(error.message)`
and the API installs **no global exception filter**. The response body is
therefore NestJS's default — `{ statusCode: 409, error: 'Conflict', message: <string> }` —
where `message` is a raw English domain string (`'Email is already in use'`,
`'At least one active SYSTEM_ADMIN user must remain'`). There is **no error
code, type, or discriminator field**.

Consequences the UI must live with:

- **`POST /users` → 409 is unambiguous by context.** Create can only throw
  `EmailAlreadyInUseError`; the last-admin policy is never reached on create.
  The UI can map it deterministically without parsing the body.
- **`PATCH`/`DELETE` → 409 is ambiguous.** It is either `LastSystemAdminError`
  or `TransactionConflictError` (concurrent-write retry), and only the English
  message string tells them apart. String-matching a server message from the
  client is a brittle, un-i18n-able coupling.

Satisfying the settled decision therefore requires a choice, deferred to
`sdd-design` (see Open Questions).

## Scope

### In Scope

- **Permission-gated `/users` route section**, reachable only by
  `SYSTEM_ADMIN`. Non-admins are denied client-side with an explicit
  "not authorized" message (not a silent redirect — they already get 403
  server-side; the UI must not present a section that cannot work, but it
  also must not leave the user guessing why).
- **List active users** — `GET /users`, rendering `{ id, email, role }`, with
  loading, empty and error states.
- **Create user** — `email`, `role`, `password`; client-side validation with
  `createUserSchema` / `passwordSchema` from `@sf-manager/validation` (the
  exact schemas the API enforces), following the `LoginPage` precedent.
- **Edit user** — `email` and `role` only, validated with `updateUserSchema`.
  Intended approach: **prefill from the already-fetched list data**, adding no
  new API surface (see Open Questions). The `role` field is disabled when
  editing the logged-in user's own row (self-role-edit guard).
- **Deactivate user** — `DELETE /users/:id` behind an explicit confirmation
  step; action hidden/disabled for the logged-in user's own row.
- **API-error → localized-message mapping** for 400 (weak password), 404 (not
  found), 409 (both business causes, distinguished), and network/unknown
  failures. This is new ground — `LoginPage` handles exactly one generic case.
- **i18n**: new `users.*` and `common.*` keys added to **all three** locale
  files (`en`, `es`, `ca`) with real translations. Zero hardcoded UI strings,
  matching both existing pages.

### Out of Scope

- Pagination, filtering, sorting, search, bulk actions.
- Avatars / profile pictures; any user profile surface beyond `{ email, role }`.
- Self-service password change, password reset, forgot-password.
- Restoring or listing deactivated users (no restore capability exists in the
  API — confirmed, only the in-memory test fake implements `restore`).
- Audit-log UI.
- Per-user language preference UI — ADR-007 already defers this; `i18n`
  stays pinned to `lng: 'en'` at init.
- Any change to `packages/validation/src/users/**` (read-only reuse).
- Any change to `apps/api/**` — **except** the possible minimal error-code
  addition, which is an explicit design-phase decision, not an assumed one.
- The `community` UI. It is the *next* slice and must not creep into this one.

### Why this scope and not more (ADR-006)

The point of a retrofit slice is to validate an **existing** contract, not to
grow it. Every excluded item above either (a) needs API surface that does not
exist, or (b) is UI polish that would not teach us anything new about the
contract. Four screens against four endpoints is the smallest thing that proves
the round trip and produces reusable patterns for `community`.

## Capabilities

### New Capabilities

- `user-admin-ui`: the `SYSTEM_ADMIN`-gated web surface for managing users —
  route gating, active-user list, create form, edit form, confirmed
  deactivation, self-deactivation guard, and the API-error → localized-message
  contract.

### Modified Capabilities

- `user-management`: **confirmed by `sdd-design`** (Decision 3, Q5). Adds an
  additive, non-breaking `code` field to `POST`/`PATCH`/`DELETE /users` 409
  responses, discriminating `EMAIL_ALREADY_IN_USE`, `LAST_SYSTEM_ADMIN`, and
  `TRANSACTION_CONFLICT`. Design rejected the no-API-change alternatives:
  context-inference only works for `POST` (both ambiguous errors are
  reachable on `PATCH`/`DELETE`), and "retry once and see" is itself the
  automatic retry the proposal forbids. See
  `openspec/changes/users-minimal-ui/specs/user-management/spec.md`.

## Approach

Follow the existing web conventions rather than inventing a second style:

| Existing precedent | Reused for |
|---|---|
| `LoginPage.tsx` — controlled inputs, `noValidate`, Zod `safeParse` against the API's own schema before any fetch | Create and edit forms |
| `AuthProvider.tsx` / `HealthPage.tsx` — `fetch(url, { credentials: 'include' })` against `VITE_API_BASE_URL` | All four `users` calls |
| `useTranslation()` + flat namespaced locale JSON (`auth.*`, `health.*`) | New `users.*` / `common.*` namespaces |
| `ProtectedRoute.tsx` | Extended or wrapped for role-gating |
| `@sf-manager/validation` imports already used by the web app | `createUserSchema`, `updateUserSchema`, `passwordSchema`, `Role` |

Two deliberate proposal-level choices:

1. **Validate client-side with the API's own schemas, never a hand-written
   copy.** The shared-validation package (ADR-015) exists precisely so the two
   sides cannot drift. Client validation is a UX affordance; the server stays
   the authority.
2. **The UI's self-deactivation guard is additive, not a substitute.** The
   server's last-admin invariant remains the real protection. `sdd-verify`
   should confirm the API still rejects the case independently.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/App.tsx` | Modified | New `/users` routes under a role-gated section |
| `apps/web/src/auth/ProtectedRoute.tsx` | Modified | Role-awareness (mechanism is a design decision) |
| `apps/web/src/pages/**` | New | List, create, edit surfaces |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | `users.*` + `common.*` keys, real ES/CA translations |
| `apps/web/package.json` | Possibly modified | Only if `sdd-design` adopts a data-fetching library |
| `apps/web/src/**` (shared) | New | Possible fetch helper, confirm dialog, error-mapping module |
| `packages/validation/src/users/**` | Unchanged | Read-only reuse |
| `apps/api/src/modules/users/presentation/**` | Modified | Confirmed by `sdd-design`: additive `code` field on 409 responses (`users.controller.ts` `mapMutationError`/`create`) |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 409 disambiguation resolved by string-matching the server's English message, silently coupling the UI to prose and breaking i18n | High | Called out above as a discovered constraint; `sdd-design` must choose explicitly and record the rationale. `sdd-verify` should reject any English-message string comparison in client code |
| Role-gating assumed trivial and hacked inline in `App.tsx`, so `community` inherits a non-reusable gate | Med | Named as an explicit design decision; the mechanism must be reusable by the next slice by construction |
| Four hand-rolled `useEffect` + `fetch` + `useState` blocks duplicated across screens, cementing a pattern `community` will multiply | Med | Data-layer approach is a named design question. Whatever is chosen becomes the documented base pattern, not an accident |
| Scope creep into `community` UI or per-user language preference | Med | Both are explicit non-goals; ADR-006 discipline applies |
| ES/CA translations stubbed with English placeholders | Med | Real translations are an in-scope deliverable; `sdd-verify` checks all three locale files for parity |
| Temporary admin-types-the-password flow hardens into the permanent answer | Med | Recorded as a deferred decision with a named future home (ADR-011); revisit before the product ships to real admins |
| No confirm-dialog precedent exists, so deactivate ships with bare `window.confirm` and later needs rework | Low | Acceptable for the slice; the choice must be conscious and recorded, since `community` has more destructive actions |

## Rollback Plan

Revert the branch. The slice is additive and web-only: new pages and routes
under `apps/web/src/**`, new keys appended to three locale JSON files, and one
modification to `ProtectedRoute.tsx`. Reverting restores the current two-route
app verbatim. No database migration, no API contract change (unless the
design-gated 409 discriminator is adopted — in which case that single,
additive, non-breaking response-field change reverts with the same commit). No
data is reshaped, so there is no state to unwind.

## Dependencies

- The `users` API (`user-management`) must be running and reachable at
  `VITE_API_BASE_URL`; the caller must have an authenticated `SYSTEM_ADMIN`
  session (cookie-based, ADR-011).
- `@sf-manager/validation` exports `createUserSchema`, `updateUserSchema`,
  `passwordSchema`, `Role` — already true, no changes required.
- `react-i18next` with `en`/`es`/`ca` resources — already wired.
- No new API endpoints are required by the intended approach.

## Success Criteria

- [ ] A `SYSTEM_ADMIN` sees a list of active users (`id`, `email`, `role`) with
      distinct loading, empty and error states.
- [ ] Deactivated users never appear in the list.
- [ ] A `SYSTEM_ADMIN` creates a user with `email`, `role` and an initial
      password; the new user appears in the list without a manual page reload.
- [ ] Client-side validation rejects a weak password using the same
      `passwordSchema` the API enforces, before any network call.
- [ ] A duplicate email on create shows a **specific** "email already in use"
      message, not a generic conflict message.
- [ ] A `SYSTEM_ADMIN` edits a user's `email` and `role`; no password field is
      present on the edit form.
- [ ] Demoting the last `SYSTEM_ADMIN` shows a **specific** last-admin message,
      distinguishable from the duplicate-email case and from a concurrency
      conflict.
- [ ] Deactivation requires an explicit confirmation step and removes the user
      from the list on success.
- [ ] The deactivate action is unavailable on the logged-in admin's own row.
- [ ] The `role` field is disabled when a `SYSTEM_ADMIN` edits their own row.
- [ ] An authenticated non-`SYSTEM_ADMIN` who reaches `/users` sees an explicit
      "not authorized" message, not a silent redirect; an unauthenticated
      visitor is redirected to `/login`.
- [ ] A genuine concurrency conflict (`TransactionConflictError`) on
      `PATCH`/`DELETE` shows a distinct "please try again" message, with no
      automatic retry.
- [ ] Zero hardcoded UI strings; `users.*` and `common.*` keys exist with real
      translations in `en`, `es` **and** `ca`.
- [ ] No client code compares against a server-supplied English message string.
- [ ] Web suite and lint pass.

## Open Questions / Deferred

| # | Question | Status | Owner |
|---|---|---|---|
| 1 | **Password-assignment strategy.** Admin-typed initial password is deliberately temporary. Alternatives: auto-generate + show-once, email invite link, forced change on first login. Each implies real API and possibly mail-delivery surface. | **Deferred beyond this slice** — likely touches ADR-011. Do not solve here. | Future slice / ADR |
| 2 | **Role-gating mechanism.** Extend `ProtectedRoute` with a role/permission prop, or add a separate wrapper component? `ProtectedRoute` today checks authentication only; `AuthUser.role` is already on the context but nothing reads it. Must be reusable by `community`. | **Open — `sdd-design` decides.** | `sdd-design` |
| 3 | **Data-fetching approach.** Introduce a library (e.g. TanStack Query) or a small hand-rolled fetch helper, or keep repeating the raw `useEffect` + `fetch` pattern? A real architectural choice: whatever ships here becomes the base pattern for `community` and every later slice. | **Open — `sdd-design` decides.** Not a proposal-level call. | `sdd-design` |
| 4 | **Edit-form data source.** Prefill from already-fetched list data, or add a `GET /users/:id` endpoint? | **Direction set, not fully open:** prefill from list. This slice validates the existing contract; adding an endpoint contradicts that framing and costs a spec delta. Design owns the implementation (and may flag the deep-link limitation). | `sdd-design` (bounded) |
| 5 | **409 disambiguation on `PATCH`/`DELETE`.** The body has no discriminator — only an English message. Add a minimal, additive error-code field to the API response, or resolve it client-side? Create is already unambiguous by context; only update/deactivate are affected. | **Open — `sdd-design` decides**, and this decision determines whether `user-management` gets a spec delta. String-matching the English message is not acceptable. | `sdd-design` |
| 6 | **Confirmation-dialog pattern.** No dialog/modal component exists anywhere in the web app. Plain `window.confirm` or a reusable component? | **Open — `sdd-design` decides.** Low stakes here, higher for `community`. | `sdd-design` |

## Next step

Run `sdd-spec` and `sdd-design` (they can run in parallel). `sdd-design` owns
Open Questions 2, 3, 5 and 6, and bounds 4. `sdd-spec` writes the settled
decisions — active-only list, no self-deactivation, cause-specific 409
messaging, no password on edit — as explicit, already-decided requirements.
