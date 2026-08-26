# Proposal: Minimal Web UI for the `community` Domain

## Intent

`community` shipped API-only on 2026-08-25, deferring its web UI with the
explicit note that "the API contract is what the next slices consume". ADR-006's
2026-08-25 addendum recorded that as a drift from the walking-skeleton premise
("thinnest possible end-to-end slice = API + one client") and scheduled two
retrofit slices: `users-minimal-ui`, then this one. `users-minimal-ui` is done
and archived. **This slice is the second half of that correction — the last
backlogged UI gap.** After it lands, "new domain slice = domain + UI together"
becomes the steady state with nothing queued behind it.

It has two jobs:

1. **Validate the `community` API against a real consumer.** Sixteen endpoints
   exist (4 CRUD + 6 representative + 6 technician). A UI is the first thing
   that will find out whether that contract is usable — notably that there is
   **no `GET /communities/:id`**, **no cross-community assignment listing**, and
   that assignment 409s carry three distinct business meanings behind one opaque
   message string.
2. **Prove the `users-minimal-ui` web foundation generalizes.** `apiFetch`,
   role-gated `ProtectedRoute`, `ConfirmDialog` and the `ApiError → i18n key`
   contract were built to be reused. This slice is their first reuse; anything
   that has to be forked instead of reused is a finding, not a chore.

Success looks like: a `SYSTEM_ADMIN` creates a community, opens it, appoints its
representative, swaps that representative and watches the previous one move to
the deactivated list, reactivates the original, attaches two technicians at
once — and is told precisely *why* when the API refuses.

Context: `[[sdd/community-minimal-ui/explore]]` (grounded API + web-foundation
survey), `openspec/changes/archive/2026-08-25-community/`,
`openspec/changes/archive/2026-08-26-users-minimal-ui/`, ADR-006 addendum
"Every domain slice includes its own UI (2026-08-25)".

## Settled product decisions

Closed with the product owner. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Assignment targeting UX** | The admin **pastes a `userId` (UUID)** copied from `/users` into a plain text input. No email lookup, no autocomplete, no eligible-user picker — none exists anywhere in the app and building one is a search-UI slice of its own. The server already rejects ineligible and unknown users; the UI reports the refusal. *Explicitly minimal — see Open Questions.* |
| **Multi-community representative warning** | **Not surfaced in this slice.** `POST`/`reactivate` may return `warning: { code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES', communityCount }`. The original `community` proposal shipped it noting "no web consumer exists yet to break"; this slice deliberately stays that consumer's non-reader. The warning stays a typed, documented, tested API field. |
| **API error-code scope** | The additive `code` discriminator (mirroring `users-minimal-ui` PR1) is added to **409 responses on the assignment routes only** — `ASSIGNMENT_ALREADY_EXISTS`, `INELIGIBLE_ROLE`, `TRANSACTION_CONFLICT`. Not the three 404 causes. Reasoning below. |
| **Page set** | `CommunitiesListPage`, `CommunityCreatePage`, `CommunityEditPage` (mirroring `users-minimal-ui`) **plus a new `CommunityDetailPage`** carrying both assignment sections. |
| **Deactivated *assignments* are visible** | Unlike deactivated *users* (hidden in `users-minimal-ui`), deactivated assignments **are listed**. `GET /communities/:id/{representatives,technicians}` returns both by design, reactivation is a real supported capability, and hiding deactivated rows would make the reactivate action unreachable. |
| **Deactivated *communities* are hidden** | The list shows active communities only — `GET /communities` already excludes soft-deleted rows server-side (ADR-010). No restore, no toggle. Same as `users`. |
| **`locale` is a displayed label, not a language switch** | The community's `locale` is rendered and edited as a closed-set field. It does **not** change the admin's UI language — ADR-007 defers per-entity i18n rendering, and `community-management`'s spec says `locale` is stored verbatim with no rendering behavior. |
| **Non-admin access to `/communities`** | Explicit `NotAuthorized` denial, never a silent redirect. Reused verbatim from `users-minimal-ui`. |
| **User creation from the community flow** | Not in this slice — inherited non-goal from the original `community` proposal. Assignments target existing users only. |

### Why the error-code scope is narrowed to three 409 causes

`community.controller.ts`'s `mapAssignmentError` maps six domain errors to bare
`ConflictException(error.message)` / `NotFoundException(error.message)` — no
discriminator, exactly the gap `users-minimal-ui` PR1 closed for `users`. But
`users-minimal-ui`'s design set the rule that governs how far to go: **only a
status with more than one reachable cause on the same call gets a code**.

Applying that rule to the real routes:

| Status | Causes reachable on one call | Verdict |
|---|---|---|
| **409** on `POST` assign | `AssignmentAlreadyExistsError`, `IneligibleRoleError`, `TransactionConflictError` — **all three**, on the same request | **Codes required.** Each demands a different admin action: reactivate instead / fix the user's global role / retry. Indistinguishable without a code. |
| **409** on `reactivate` | `IneligibleRoleError`, `TransactionConflictError` | **Covered by the same three codes.** |
| **404** on assign / deactivate / reactivate | `CommunityNotFoundError`, `UserNotFoundError`, `AssignmentNotFoundError` | **No codes.** Effectively unambiguous by context, the same reasoning `users-minimal-ui` used for `POST /users`: the community was just loaded by the page's own route, and on deactivate/reactivate the `userId` comes from a rendered row. A 404 in these flows means "the ID you pasted is unknown, or this page is stale" — one honest message, not three. |
| **400** | Zod validation only | **No codes.** Single cause. |

Adding codes to the 404s would be inventing precision the UI cannot act on
differently — the exact scope creep ADR-006 forbids. The 404 call is recorded as
a deferred open question with a named revisit trigger, not as an oversight.

## Scope

### In Scope

- **Permission-gated `/communities` route section**, `SYSTEM_ADMIN` only, using
  the existing `ProtectedRoute allowedRoles` + `NotAuthorized` pattern.
- **List active communities** — `GET /communities`, rendering
  `{ id, name, address, locale }`, with distinct loading, empty and error states.
- **Create community** — `name`, `address`, `locale`; validated client-side with
  `createCommunitySchema` / `localeSchema` from `@sf-manager/validation` (already
  exported, already shared with the API — zero new validation surface).
- **Edit community** — `name`, `address`, `locale`, validated with
  `updateCommunitySchema`. Prefilled from the already-fetched list, mirroring
  `users-minimal-ui` Decision 5 (there is no `GET /communities/:id`).
- **Soft-delete community** — `DELETE /communities/:id` behind `ConfirmDialog`;
  the row disappears from the list on success.
- **`CommunityDetailPage`** — the community's fields plus **two assignment
  sections** (Representatives, Technicians). Each section lists active **and**
  deactivated rows (`userId`, status), offers an assign-by-`userId` input, and
  per-row deactivate (behind `ConfirmDialog`) / reactivate actions.
- **Representative lifecycle in the UI** — assign, deactivate, reactivate, with
  the server's exclusivity rule made *visible*: after assigning or reactivating,
  the refetched list shows the previously-active representative as deactivated.
- **Technician lifecycle in the UI** — assign, deactivate, reactivate, with no
  exclusivity: several technicians stay active simultaneously.
- **Additive API `code` on assignment 409s** —
  `apps/api/src/modules/community/presentation/community-error-code.ts` +
  `mapAssignmentError` supplying `{ statusCode, error, message, code }`. Additive
  and non-breaking (existing e2e assertions are status-only).
- **`ApiError` → localized-message mapping** for the three codes, 400, 404 and
  network/unknown failures, reading only `status`/`code` — never `.message`.
- **i18n**: new `community.*` keys in **all three** locale files (`en`, `es`,
  `ca`) with real translations, **including label maps for every enum-like
  value** — `locale` (`en`/`es`/`ca`) and assignment status
  (`active`/`deactivated`) — following the `role-labels.ts` pattern from day one
  rather than as a follow-up fix (see Risks).

### Out of Scope

- **Surfacing `REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES`** (settled above).
- **Any user search, autocomplete, email lookup or eligible-user picker.**
- **Cross-community assignment views** ("all communities user X represents") — no
  endpoint exists; adding one contradicts the retrofit framing.
- **Community-scoped authorization.** Assignments still grant no API permission;
  `ROLE_PERMISSIONS` keeps the four non-admin roles at `[]`.
- Pagination, filtering, sorting, search, bulk assignment.
- Restoring soft-deleted communities (no API capability exists).
- Creating a user from inside the community flow.
- Per-entity or per-user language switching driven by `locale` (ADR-007).
- Audit log / assignment history UI.
- A global nav bar. None exists in `apps/web` today and `users-minimal-ui` added
  none either — a pre-existing gap, not this slice's to close (Open Questions).
- Any change to `packages/validation/src/community/**` (read-only reuse).
- Any change to `apps/api/**` **except** the additive assignment-409 `code`.
- Changes to `users` UI or API.

### Why this scope and not more (ADR-006)

A retrofit slice validates an **existing** contract; it does not grow one. Every
excluded item either needs API surface that does not exist, or is polish that
teaches nothing about the contract.

`CommunityDetailPage` deserves an explicit nod, since it has no
`users-minimal-ui` precedent: it is **structurally required, not scope creep**.
Assignment listing is only available scoped to one community (`GET
/communities/:id/representatives`), so "assignments are actions on a community
detail view" is the only shape the real API supports. The alternative — folding
assignment controls into list rows — would need the same 12 API calls in a worse
place.

## Capabilities

### New Capabilities

- `community-admin-ui`: the `SYSTEM_ADMIN`-gated web surface for communities —
  route gating, active-community list, create/edit forms, confirmed soft-delete,
  the community detail view with both assignment sections, the assignment
  lifecycle actions, and the `ApiError` → localized-message contract (including
  the no-server-message-string-coupling rule and enum label mapping).

### Modified Capabilities

- `community-assignments`: 409 responses on the assignment routes gain an
  additive `code` field discriminating `ASSIGNMENT_ALREADY_EXISTS`,
  `INELIGIBLE_ROLE` and `TRANSACTION_CONFLICT`. `statusCode`, `error` and
  `message` are unchanged; 404 and 400 responses are untouched. Non-breaking.
- `community-management`: **None.** Community CRUD responses and errors are
  unchanged — `mapMutationError` maps a single 404 cause.

## Approach

Reuse the `users-minimal-ui` foundation first; write community-specific code
only where the domain genuinely differs.

### Reused as-is (zero changes)

| Existing asset | Reused for |
|---|---|
| `apps/web/src/api/client.ts` — `apiFetch` / `ApiError` | All 12 community calls. Fully domain-agnostic; still the **only** place that parses an error body |
| `apps/web/src/auth/ProtectedRoute.tsx` (`allowedRoles`) + `NotAuthorized.tsx` | `allowedRoles={['SYSTEM_ADMIN']}` on all four routes, verbatim |
| `apps/web/src/components/ConfirmDialog.tsx` | Community soft-delete **and** both assignment deactivations |
| `apps/web/src/pages/LoginPage.tsx` / `UserCreatePage.tsx` form pattern | Controlled inputs, `noValidate`, Zod `safeParse` before any fetch |
| `@sf-manager/validation` `createCommunitySchema` / `updateCommunitySchema` / `localeSchema` | Client-side validation, identical to what the API enforces |
| `apps/web/src/users/role-labels.ts` | Untouched. Not reused — this slice's UI shows `userId`, not roles |

### New, community-specific parallels

| New file | Mirrors | Difference |
|---|---|---|
| `apps/web/src/api/community.ts` | `api/users.ts` | 12 typed calls instead of 4 |
| `apps/web/src/community/error-messages.ts` | `users/error-messages.ts` | New `CommunityErrorCode` union; same `status`/`code`-only rule |
| `apps/web/src/community/locale-labels.ts`, `assignment-status-labels.ts` | `users/role-labels.ts` | Enum → i18n key maps, written **with** the pages, not after |
| `apps/web/src/pages/CommunityDetailPage.tsx` | — | No precedent; structurally required (see above) |

Two deliberate proposal-level choices:

1. **Mutations refetch, they do not patch local state.** Representative
   exclusivity means one `POST` changes *two* rows server-side. Optimistically
   patching the clicked row would silently hide the auto-deactivation — the
   single most important behavior this UI exists to validate. Every assignment
   mutation refetches its section's list.
2. **The UI adds no client-side exclusivity logic.** It never pre-deactivates,
   pre-checks eligibility, or predicts which row will flip. The server owns the
   invariant; the UI renders the outcome. Any client-side re-implementation would
   be a second source of truth for a rule the domain already enforces
   transactionally.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/src/modules/community/presentation/community-error-code.ts` | New | `CommunityErrorCode` union (3 values) |
| `apps/api/src/modules/community/presentation/community.controller.ts` | Modified | `mapAssignmentError` supplies `code` on 409s; Swagger conflict responses document it |
| `apps/api/test/community.e2e-spec.ts` | Modified | Assert `body.code` per 409 cause (anti-drift guard) |
| `apps/web/src/api/community.ts` | New | 12 typed calls + mirrored `CommunityErrorCode` |
| `apps/web/src/community/error-messages.ts` | New | `ApiError` → i18n key map |
| `apps/web/src/community/*-labels.ts` | New | `locale` and assignment-status enum label maps |
| `apps/web/src/pages/CommunitiesListPage.tsx` | New | List, states, row actions |
| `apps/web/src/pages/CommunityCreatePage.tsx` | New | `createCommunitySchema` |
| `apps/web/src/pages/CommunityEditPage.tsx` | New | `updateCommunitySchema`, prefill from list |
| `apps/web/src/pages/CommunityDetailPage.tsx` | New | Community info + both assignment sections |
| `apps/web/src/App.tsx` | Modified | 4 role-gated routes |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real `community.*` translations, all 3 locales |
| `apps/web/src/api/client.ts`, `auth/**`, `components/ConfirmDialog.tsx` | Unchanged | Reused as-is — any needed change is a finding to report |
| `packages/validation/src/community/**` | Unchanged | Read-only reuse |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Enum-like values rendered raw again.** `users-minimal-ui` shipped raw `Role` enum text and had to fix it in a PR9 follow-up. This slice has **two** enum-like value sets (`locale`, assignment status) | High | Named as an in-scope deliverable, not a polish item: label-map modules ship **with** their pages, and the success criteria call it out explicitly. `sdd-verify` greps rendered cells for raw enum values |
| Exclusivity hidden by optimistic local-state updates, so the UI never proves the auto-deactivation happens | Med | Proposal-level choice above: mutations refetch. Success criteria demand the previous representative be *observed* moving to the deactivated list |
| Client-side re-implementation of exclusivity/eligibility drifts from the domain | Med | Explicit non-goal above; `sdd-verify` should reject any client code deciding assignment outcomes |
| 409 disambiguation resolved by string-matching the English message | Med | Forbidden by the inherited `user-admin-ui` requirement; guarded by a differential unit test and a `.message` grep, exactly as in `users-minimal-ui` PR9 |
| Two near-identical assignment sections copy-pasted, or prematurely abstracted into one generic component that hides the exclusivity asymmetry | Med | The original `community` proposal already flagged this at domain level. Named as a `sdd-design` decision with required rationale — neither outcome is assumed |
| Twelve API calls across four pages multiply the hand-rolled `useEffect` + `useState` pattern; `users-minimal-ui`'s design named *this slice* as the likely trigger to reconsider a data-fetching library | Med | Named as an explicit `sdd-design` question with the prior decision's own stated trigger. Decide with evidence, not habit |
| ES/CA translations stubbed with English placeholders | Med | Real translations are in scope; the existing `locales.test.ts` key-set parity test extends to `community.*` |
| Slice grows toward user search / cross-community views because the paste-a-UUID UX feels crude | Med | Explicit non-goals; recorded as a deferred question with a named future home |
| Reviewer overload — 4 pages, 12 API calls, 1 API change in one PR | High | `sdd-tasks` must forecast against the 400-line budget; chained PRs are the expected outcome (`stacked-to-main`, as in both prior chains) |

## Rollback Plan

Revert the branch. The slice is additive: new files under
`apps/web/src/{api,community,pages}/**`, four new routes in `App.tsx`, new keys
appended to three locale JSONs, and one additive `code` field on assignment 409
bodies (new `community-error-code.ts` + `mapAssignmentError`). Reverting restores
the current app and the current API response shapes verbatim. **No migration, no
schema change, no data reshaped** — no state to unwind. If the chain is split
across PRs, each PR reverts independently; the API PR is safe to keep or drop on
its own, since old clients ignore an unknown response field.

## Dependencies

- The `community` API must be running and reachable at `VITE_API_BASE_URL`, with
  an authenticated `SYSTEM_ADMIN` session (cookie-based, ADR-011).
- `@sf-manager/validation` already exports `createCommunitySchema`,
  `updateCommunitySchema`, `localeSchema` — no changes required (ADR-015).
- The `users-minimal-ui` web foundation (`apiFetch`, `ProtectedRoute`
  `allowedRoles`, `NotAuthorized`, `ConfirmDialog`) is merged on `main`. **Met.**
- Exercising the assignment flows needs seeded users with global roles
  `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN`, created via `/users`.
- No new API endpoints are required.

## Success Criteria

1. [ ] A `SYSTEM_ADMIN` sees a list of active communities (`name`, `address`,
   `locale`) with distinct loading, empty and error states.
2. [ ] Soft-deleted communities never appear in the list, and a soft-delete
   performed from the UI removes the row without a manual page reload.
3. [ ] A `SYSTEM_ADMIN` creates a community with `name`, `address` and `locale`;
   it appears in the list without a manual reload. Client-side validation uses
   `createCommunitySchema` from `@sf-manager/validation` and blocks the request
   before any network call when invalid.
4. [ ] A `SYSTEM_ADMIN` edits a community's `name`, `address` and/or `locale`
   (validated with `updateCommunitySchema`); the change is visible on return to
   the list.
5. [ ] Soft-deleting a community requires an explicit confirmation step
   (`ConfirmDialog`, reused unmodified).
6. [ ] `CommunityDetailPage` shows the community's fields plus two clearly
   separated sections — Representatives and Technicians — each listing **active
   and deactivated** rows with a visible status.
7. [ ] A `SYSTEM_ADMIN` assigns a representative by pasting a `userId`; the new
   representative appears active without a manual reload.
8. [ ] Assigning a **second** representative to the same community shows the
   previously-active one **moved to deactivated** (not removed) in the same
   refreshed section — the exclusivity rule is observable in the UI.
9. [ ] Deactivating a representative requires confirmation and moves the row to
   deactivated rather than removing it.
10. [ ] Reactivating a deactivated representative makes it active **and** shows
    whoever was active at that moment as deactivated.
11. [ ] Two technicians are active in the same community simultaneously —
    assigning the second does **not** deactivate the first (no exclusivity, no
    warning surface).
12. [ ] A technician can be deactivated (with confirmation) and reactivated,
    with no effect on any other technician's status.
13. [ ] Assigning a user whose global role is wrong shows a **specific**
    ineligible-role message, distinguishable from the already-assigned message.
14. [ ] Assigning a user who already has an assignment (active **or**
    deactivated) shows a **specific** message telling the admin to reactivate the
    existing record instead of a generic conflict.
15. [ ] A `TransactionConflictError` on a representative operation shows a
    distinct "please try again" message, with **no automatic retry** anywhere in
    the web app.
16. [ ] No client code compares against a server-supplied English message string;
    `community/error-messages.ts` reads only `ApiError.status` and `.code`,
    guarded by a differential unit test and a `.message` grep over
    `apps/web/src`.
17. [ ] Zero hardcoded UI strings: `community.*` keys exist with real
    translations in `en`, `es` **and** `ca`, and locale-file key-set parity is
    test-enforced.
18. [ ] **No enum-like value is rendered raw.** `locale` and assignment status
    are displayed through i18n label maps (`role-labels.ts` pattern) in every
    surface — table cells and `<select>` option labels alike; the raw enum value
    only ever backs `<option value>` and API payloads.
19. [ ] An authenticated non-`SYSTEM_ADMIN` reaching any `/communities` route
    sees the explicit `NotAuthorized` surface, not a silent redirect; an
    unauthenticated visitor is redirected to `/login`.
20. [ ] Assignment 409 responses carry `code`
    (`ASSIGNMENT_ALREADY_EXISTS` / `INELIGIBLE_ROLE` / `TRANSACTION_CONFLICT`)
    with `statusCode`, `error` and `message` unchanged; asserted in
    `community.e2e-spec.ts`. 404 and 400 bodies are untouched.
21. [ ] Web and API suites, lint and build pass
    (`npm run test --workspace=apps/web`, `npm run test --workspace=apps/api`,
    `npm run lint --workspace=apps/web`, `npm run build`).
22. [ ] Every UI criterion above is **browser-verified** against a running dev
    server (`npm run dev`), not only test-verified — per CLAUDE.md's "Verifying
    UI Changes" rule.

## Open Questions / Deferred

| # | Question | Status | Owner |
|---|---|---|---|
| 1 | **Multi-community representative warning.** `POST`/`reactivate` may return `warning: { code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES', communityCount }`. Should the admin see an inline banner when an activation makes someone a representative of N communities? | **Deferred beyond this slice** — settled with the product owner. The original `community` proposal shipped the field noting no web consumer existed; this slice stays that non-consumer. The field remains typed, documented and e2e-tested, so adding the banner later is UI-only. *Revisit trigger*: the first report of an unnoticed multi-community representative. | Future slice |
| 2 | **404 disambiguation on assignment routes.** `CommunityNotFoundError` / `UserNotFoundError` / `AssignmentNotFoundError` all return an undiscriminated 404. This slice adds `code` to 409s only. | **Deferred, deliberately** — see "Why the error-code scope is narrowed". A 404 in these flows is effectively unambiguous by context and maps to one honest message. *Revisit trigger*: if browser verification (criterion 22) shows an admin cannot tell a mistyped UUID from a stale page, add `USER_NOT_FOUND` / `COMMUNITY_NOT_FOUND` as a follow-up — the mechanism will already exist. | Future slice |
| 3 | **User-targeting UX.** Pasting a UUID is deliberately crude. Alternatives: email input resolved server-side, or a picker filtered by eligible global role. Each implies real API surface (user lookup by email, or a filtered list endpoint). | **Deferred beyond this slice** — settled. Do not solve here. | Future slice |
| 4 | **Error-code contract location.** `users-minimal-ui`'s design mirrored `UserErrorCode` as a literal union in web code and named an explicit rule-of-three trigger: *"hoist a shared error-code contract when `community` adds its own codes"*. **This slice is that trigger.** Hoist into `@sf-manager/validation` (ADR-015), or mirror again? | **Open — `sdd-design` decides**, and must address the trigger explicitly rather than silently repeating the mirror. | `sdd-design` |
| 5 | **Data-fetching approach.** `users-minimal-ui`'s design deferred TanStack Query with the trigger *"two or more collections whose mutations invalidate each other — `community` is the likely first real case"*. This slice has three collections per detail page and mutations that change rows the client did not touch. **Also that trigger.** | **Open — `sdd-design` decides** with evidence. Keeping `apiFetch` + refetch is a legitimate answer; making it by default is not. | `sdd-design` |
| 6 | **Two assignment sections: one shared component or two?** They share a shape but not their rules (exclusivity, warning, and `TransactionConflictError` apply to representatives only). The original `community` proposal already flagged premature generic abstraction as a domain-level risk. | **Open — `sdd-design` decides**, with rationale. Neither duplication nor abstraction is assumed. | `sdd-design` |
| 7 | **Detail/edit page data source.** There is no `GET /communities/:id`; direction is set (fetch the list and select by `:id`, mirroring `users-minimal-ui` Decision 5), but the detail page needs the community *and* two assignment lists — up to three requests per navigation. | **Direction set, bounded** — no new endpoint; this slice validates the existing contract and must *surface* the missing endpoint as evidence, not paper over it. Design owns request sequencing and the not-found state. | `sdd-design` (bounded) |
| 8 | **No navigation entry point.** `apps/web` has no nav bar; `users-minimal-ui` added no `/` → `/users` link either. `/communities` will be equally unreachable without typing the URL. | **Pre-existing gap, out of scope** — flagged, not introduced here. *Revisit trigger*: it now affects two sections, so the next UI slice should either add a minimal nav or record why not. | Future slice |

## Next step

Run `sdd-spec` and `sdd-design` (they can run in parallel). `sdd-design` owns
Open Questions 4, 5 and 6, and bounds 7. `sdd-spec` writes the settled decisions
— visible deactivated assignments, hidden deactivated communities, paste-a-userId
assignment, no warning surface, cause-specific 409 messaging on three codes,
enum label mapping — as explicit, already-decided requirements, plus the
`community-assignments` delta for the additive 409 `code`.
