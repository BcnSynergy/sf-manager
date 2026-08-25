# Proposal: Community + Representative/Technician Assignments

## Intent

`Community` sits at the center of the ER diagram, and nothing in the codebase
knows it exists — no Prisma model, no module, zero references to `Community`
or `communityId` in `apps/api/src`. Because of that absence,
`user-management-roles` had to ship `COMMUNITY_REPRESENTATIVE` and
`MAINTENANCE_TECHNICIAN` as declared-but-inert roles: a user can hold one of
those roles globally, but there is no way to record **which community** they
represent or service. That is the gap this slice closes.

This slice makes two things true end-to-end for the first time:

1. A `Community` exists as a real entity (Prisma → domain → use cases → REST).
2. A user can be **assigned** to a community as its representative or as one of
   its technicians, with the assignment lifecycle (add / deactivate /
   reactivate) enforced in the domain.

Success looks like: an admin can create a community, appoint exactly one
active representative for it, attach several technicians to it, swap the
representative later, and reactivate a previously deactivated one — with the
one-active-representative-per-community invariant holding at all times.

Context: `[[sdd/community/explore]]` (codebase/pattern context only — its
`contactInfo` field and its three open questions are superseded by the settled
decisions below).

## Settled product decisions

These were closed with the product owner. They are inputs, not open items.

| Decision | Resolution |
|---|---|
| Entity shape | `Community` = `id`, `name`, `address`, `locale`, `deletedAt`. **No `contactInfo`** — replaced by the assignment lists. |
| Assignment model | **Two distinct concepts**, not one generic "membership": community **representatives** and community **technicians**. |
| Representative exclusivity | Exactly **one active representative per community** at any time. Activating one auto-deactivates the currently-active representative *of that same community*. |
| Deactivation semantics | Deactivated representative records **persist and can be reactivated at any time** — reversible toggle, not a one-way historical close-out. Reactivation re-applies the exclusivity rule. |
| Representative in multiple communities | **Allowed**, not blocked. The activation call that creates this situation returns a **warning in its response**; the activation still succeeds (warning, not a validation error). |
| Technician exclusivity | **None.** Many active technicians per community; a technician may be active in many communities, **with no warning**. The multi-community warning applies to representatives only. |
| Eligibility gate | A user may join a community's representative list only if their global `role` is exactly `COMMUNITY_REPRESENTATIVE`; the technician list only if it is exactly `MAINTENANCE_TECHNICIAN` (`apps/api/src/modules/users/domain/role.ts`). |
| User creation | **Not in this slice.** Reuse the existing `users` CRUD from `user-management-roles`. This slice only links an *existing* user to a community. |
| Permission enforcement | **Out of scope.** `COMMUNITY_REPRESENTATIVE` and `MAINTENANCE_TECHNICIAN` stay functionally inert (`[]` in `role-permission.checker.ts`) after this slice. |
| Eligibility drift (role change while actively assigned) | **Accepted for now, documented as a gap.** The real rule — block removal/role-change once the user has performed a `ReviewSession` for that community (any community, for role changes) — depends on `ReviewSession`, which does not exist yet (deferred entity). Until that slice ships, a `SYSTEM_ADMIN` may freely change an actively-assigned user's global role; the assignment is left as-is (no cascade deactivation, no block). Revisit this policy when `ReviewSession` lands. |
| Reactivation precondition | A soft-deleted user **stays deleted permanently** — no restore capability exists anywhere in `users` (confirmed: only the in-memory test fake implements `restore`). Reactivating an assignment for a soft-deleted user must therefore be rejected. |

## Scope

### In Scope

- **Prisma**: `Community` model (`id` UUIDv7, `name`, `address`, `locale`,
  `deletedAt` — ADR-010 soft delete) + the representative/technician
  assignment storage and migration.
- **Domain**: hand-written `Community` entity with zero Prisma dependency
  (ADR-013), plus the assignment aggregate and the
  one-active-representative-per-community invariant expressed in the domain
  layer, not in the controller.
- **Application**: repository port(s) + use cases for community CRUD
  (create / list / update / deactivate) and for assignments
  (add representative, deactivate representative, reactivate representative,
  add technician, deactivate technician, reactivate technician, list a
  community's assignments).
- **Eligibility check**: reject assignment when the target user's global role
  is not the exact role required by that list.
- **Multi-community representative warning**: surfaced in the activation
  response payload; a successful (non-error) outcome.
- **Presentation**: REST endpoints for `/communities` and its assignment
  sub-resources, Zod validation via
  `shared/presentation/pipes/zod-validation.pipe.ts`, Swagger annotations,
  domain-error → HTTP mapping (mirroring `UsersController`).
- **Authorization for the new endpoints**: extend the `Permission` union and
  grant the new permissions to `SYSTEM_ADMIN` only in `ROLE_PERMISSIONS`; all
  other roles stay `[]` (declared, inert) — same shape as today.
- **Shared validation**: `packages/validation/src/community/*.schema.ts`
  (ADR-015 precedent from `packages/validation/src/users/`).
- Unit, integration and E2E tests matching the `user-management-roles`
  testing conventions.

### Out of Scope

- **Community-scoped authorization.** An active representative or technician
  assignment grants **no** API access in this slice. Wiring
  `role-permission.checker.ts` so assignments confer real permissions is a
  future slice. This slice builds the data model and the assignment state
  machine only.
- **User creation from within the community flow.** The combined "create a
  user while creating/managing a community" UX is a future idea, not this
  slice — assignments target existing users by id.
- **Web admin UI.** API-only, matching the `user-management-roles` precedent
  (which shipped no admin screen, only `AuthProvider` role propagation).
- `InspectableElement`, `ReviewSession`, `ChecklistQuestion`,
  `ReviewTemplate`, `ElementReviewEntry`, `QuestionAnswer`.
- `MaintenanceCompany` / `CommunityMaintenanceAssignment` — the company side
  does not exist (FR-002, unbuilt); a company↔community join is meaningless
  without it. Note this is a *different* concept from the technician
  assignment in this slice, which links a **user** to a community.
- `PropertyManagementCompany` (ADR-012) — unrelated singleton, no dependency
  on `Community`.
- `User.managerCapabilities` / `MANAGE_COMMUNITIES` wiring — its own
  mechanism, its own slice.
- `locale`'s actual i18n behavior — store the field, change no rendering.
- List pagination/filtering, audit logging, assignment history reporting.

### Why this scope and not more (ADR-006)

`Community` is the hub of the ER diagram, so every neighbor is one step away
and each one is tempting. The walking-skeleton rule says a slice earns a
concept only when the slice needs it:

- **Permission wiring is excluded** because there is still no
  community-scoped *resource* for a representative or technician to act on.
  Granting permissions now would mean inventing the scoping rules for
  endpoints that do not exist. The assignment data must exist before
  authorization can meaningfully consume it — that ordering is the point.
- **`MaintenanceCompany` is excluded** because half the relationship is
  missing; a join table with one real side is speculative schema.
- **The web UI is excluded** because the API contract is what the next slices
  consume, and `user-management-roles` already set the API-first precedent.

What this slice *does* need — and therefore takes on — is the assignment
state machine, because the exclusivity and reactivation rules are real
business rules that cannot be deferred without shipping a `Community` that
records nothing meaningful about who runs it.

## Capabilities

### New Capabilities

- `community-management`: admin CRUD over communities (create, list, update,
  soft-delete), with `locale` and `address` as plain stored attributes.
- `community-assignments`: representative and technician assignment lifecycle
  — add, deactivate, reactivate — including the single-active-representative
  invariant, role eligibility gating, and the multi-community representative
  warning.

### Modified Capabilities

- `authorization`: the `Permission` union and the `SYSTEM_ADMIN` row of
  `ROLE_PERMISSIONS` gain the new community permissions. Non-breaking and
  additive; the four inert roles remain `[]`.

## Approach

Mirror the `users` module **exactly**. `user-management-roles` produced a
reviewed, archived Clean Architecture reference implementation; this slice
copies its layering rather than inventing a second style:

| `apps/api/src/modules/users/**` | → mirrored under `apps/api/src/modules/community/**` |
|---|---|
| `domain/user.entity.ts` (no Prisma, ADR-013) | `domain/community.entity.ts` + assignment domain type(s) |
| `domain/errors/*.error.ts` | assignment/eligibility/not-found domain errors |
| `application/ports/user.repository.port.ts` | community + assignment repository port(s) with a `Symbol` token |
| `application/use-cases/*.use-case.ts` | community CRUD + assignment lifecycle use cases |
| `application/use-cases/testing/in-memory-user.repository.ts` | in-memory fake for the same port, with invariant parity |
| `infrastructure/persistence/prisma-user.repository.ts` (extends `soft-deletable.repository.ts`) | Prisma adapter with the same default `deletedAt: null` filter (ADR-010) |
| `infrastructure/persistence/user.mapper.ts` | persistence ↔ domain mapper |
| `presentation/users.controller.ts` + `dto/**` | `community.controller.ts` + assignment routes + DTOs |
| `users.module.ts` | `community.module.ts` |

Three deliberate choices at proposal level:

1. **Exclusivity lives in the domain/application layer, transactionally.**
   The "activating one representative deactivates the other" rule is a
   read-then-write on sibling rows — exactly the write-skew shape the
   `users` slice already solved with `transactional()` +
   `SERIALIZABLE` + `TransactionConflictError`. Reuse that seam rather than
   relying on a DB partial-unique index alone.
2. **The warning is part of the success response**, not an error channel.
   The DTO carries the assignment result plus an optional warning payload, so
   the API can tell the caller "this succeeded, and by the way this user now
   represents N communities" without the caller having to distinguish a 2xx
   from a 4xx.
3. **Eligibility is checked against the user's current global role at
   assignment time** via the existing `users` repository port — no new
   coupling beyond a read.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- **Two tables (`CommunityRepresentative`, `CommunityTechnician`) vs. one
  table with a discriminator column.** This is a persistence/modeling
  tradeoff — the two concepts share a shape but not their rules (exclusivity
  applies to one only), and the choice affects the partial-unique-index
  strategy and the port surface. It is a `sdd-spec`/`sdd-design` decision,
  explicitly **not** a proposal-level one.
- Whether the "active" flag is a boolean, a `deactivatedAt` timestamp, or an
  ADR-010-style `deletedAt` — and how that interacts with reactivation.
- Whether `locale` / `address` are Value Objects or plain fields (ADR-006
  addendum: decided per slice).
- Exact route shapes for the assignment sub-resources.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `Community` model + assignment storage |
| `apps/api/src/modules/community/domain/**` | New | Entity, assignment domain, invariant, errors |
| `apps/api/src/modules/community/application/**` | New | Port(s), CRUD + assignment use cases, in-memory fake |
| `apps/api/src/modules/community/infrastructure/persistence/**` | New | Prisma adapter (extends `soft-deletable.repository.ts`), mapper |
| `apps/api/src/modules/community/presentation/**` | New | Controller, assignment routes, DTOs |
| `apps/api/src/modules/community/community.module.ts` | New | Providers + controller wiring |
| `apps/api/src/shared/application/authorization/permission.ts` | Modified | Extend `Permission` union |
| `apps/api/src/modules/auth/infrastructure/authorization/role-permission.checker.ts` | Modified | Grant new permissions to `SYSTEM_ADMIN` only |
| `apps/api/src/modules/users/application/ports/user.repository.port.ts` | Possibly modified | Read access for the eligibility check (may already suffice via `findById`) |
| `packages/validation/src/community/**` | New | Zod schemas shared web/API |
| `apps/api/test/**` | New | E2E suite for community + assignments |

Untouched by design: `apps/web/**` (API-only slice), `uuid-v7.id-generator.ts`
(reused as-is via the global `IdGeneratorModule`).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Race on representative activation — two concurrent activations both observe "no active rep" and both commit, breaking the one-active invariant | Med | Reuse the `users` `transactional()` + `SERIALIZABLE` seam and surface `TransactionConflictError` as 409; back it with a DB-level constraint decided in `sdd-design` |
| Eligibility drift — a user is assigned as representative, then their global role is changed to something else via `/users`, leaving an active assignment held by an ineligible user | Med | **Resolved at proposal level**: drift is accepted for now (no block, no cascade). The real rule — block once the user has performed a `ReviewSession` — is deferred to the `ReviewSession` slice and documented as a known gap in the Settled decisions table. `sdd-spec` writes this as an explicit accepted-drift scenario, not an accident |
| Reactivation resurrects an assignment for a user who has since been soft-deleted | Low | **Resolved at proposal level**: soft-deleted users stay deleted permanently (no restore capability exists in `users`); reactivating an assignment for a soft-deleted user must be rejected. `sdd-spec` writes this as an explicit scenario |
| Two-tables-vs-one-table decision made implicitly during `sdd-apply` instead of `sdd-design` | Med | Flagged above as an explicit design-phase decision with a required rationale |
| Scope creep toward permission wiring — "assignments exist now, let's make the role real" | High | Permission enforcement is an explicit non-goal; `ROLE_PERMISSIONS` keeps the four non-admin roles at `[]` and `sdd-verify` should assert that |
| Two similar assignment concepts invite a premature generic abstraction that hides the exclusivity asymmetry | Med | Treat them as two named concepts in the domain language; any shared implementation must be justified in `sdd-design`, not assumed |
| The warning payload is silently dropped by clients, so multi-community representatives go unnoticed | Low | Ship it as a typed, documented field in the response DTO + Swagger; no web consumer exists yet to break |

## Rollback Plan

Revert the branch and roll back the single migration (`prisma migrate reset`
in dev) to drop `Community` and the assignment table(s). Everything else is
additive: the new module is self-contained under
`apps/api/src/modules/community/**`, and the authorization change is one
permission-union extension plus new entries on the `SYSTEM_ADMIN` row —
removing them restores the current table verbatim. No existing data is
migrated or reshaped, and no existing contract changes, so there is no
API/web skew to unwind.

## Dependencies

- None new. Reuses `IdGenerator` (UUIDv7, ADR-009),
  `SoftDeletableRepository` (ADR-010), `ZodValidationPipe`,
  `AuthenticatedGuard` + `PermissionsGuard` + `@RequirePermission`, and the
  existing `users` module for user lookup.
- The `users` module must remain the sole owner of user creation and role
  assignment — this slice reads it, never writes it.
- Reachable PostgreSQL for the migration.

## Success Criteria

- [ ] `SYSTEM_ADMIN` can create, list, update and soft-delete a `Community`
      with `name`, `address`, `locale`.
- [ ] A user whose global role is `COMMUNITY_REPRESENTATIVE` can be added as
      a community's representative; any other role is rejected.
- [ ] A user whose global role is `MAINTENANCE_TECHNICIAN` can be added as a
      community technician; any other role is rejected.
- [ ] Activating a second representative for the same community
      auto-deactivates the previously active one; exactly one remains active.
- [ ] A deactivated representative record still exists and can be reactivated
      later; reactivating it deactivates whoever is active at that moment.
- [ ] Activating a representative who is already active in another community
      succeeds **and** returns a warning in the response body.
- [ ] Multiple technicians are active in the same community simultaneously,
      and one technician is active in multiple communities — with **no**
      warning emitted in either case.
- [ ] `ROLE_PERMISSIONS` still maps `MANAGER`,
      `MAINTENANCE_COMPANY_MANAGER`, `MAINTENANCE_TECHNICIAN` and
      `COMMUNITY_REPRESENTATIVE` to `[]` — no assignment grants any
      permission in this slice.
- [ ] Unauthenticated requests get 401; authenticated non-`SYSTEM_ADMIN`
      requests get 403 on every community endpoint.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] Reactivating an assignment for a soft-deleted user is rejected.
- [ ] Changing an actively-assigned user's global role succeeds and leaves
      the assignment untouched (accepted drift, not blocked or cascaded).
- [ ] API suite passes (`npm run test --workspace=apps/api`).

## Next step

Run `sdd-spec` and `sdd-design` (they can run in parallel). `sdd-design` owns
the two-tables-vs-one-table decision and the concurrency strategy for the
exclusivity invariant; `sdd-spec` writes the accepted-drift and
soft-deleted-reactivation scenarios as explicit, already-decided requirements
(policy is settled — see Settled product decisions table).
