# Proposal: Element Code and Single-Element Label Printing

## Intent

FR-006 is the bridge between the asset registry and the field workflow. An
extinguisher registered under `inspectable-elements` exists in the database and
nowhere on the wall: there is no way to walk up to a physical unit and know
which row it is. `serialNumber` is explicitly ruled out as that link — the
domain model calls it unreliable and hard to read on the unit, which is exactly
why `code` was designed.

`code` does not exist yet. Verified by direct read:
`inspectable-element.entity.ts` carries `id`, `communityId`, `elementType`,
`name`, `description`, `location`, `installedAt`, `serialNumber`, `deletedAt`
and nothing else — matching `inspectable-elements`' explicit non-goal ("`code`
generation, QR rendering, label printing — all of FR-006"). No QR library
exists anywhere in the monorepo: `apps/web/package.json` has 5 runtime
dependencies and none of them renders a code. This proposal introduces the
first one.

Success looks like: a `SYSTEM_ADMIN` opens a community's elements list, sees
each element's short public `code`, clicks Print on one, and gets a physical
label carrying a QR of that code plus the code in readable characters — which
they stick on the extinguisher. From that moment the physical unit is
identifiable, and FR-007 has the input its own spec demands ("scan/enter each
element's `code`").

This unblocks FR-007, which was deliberately sequenced behind it rather than
building an interim element picker (Engram `sdd/review-session/product-decisions`).

Per ADR-006's 2026-08-25 addendum the minimal web UI ships **in this change**.
Fourth slice under that rule, no retrofit backlog behind it.

Context: `[[sdd/label-printing/explore]]`,
`openspec/changes/archive/2026-09-02-inspectable-elements/`,
`openspec/changes/archive/2026-09-04-checklist-management/`, ADR-006, ADR-008,
ADR-009, ADR-010, ADR-013, ADR-015,
`docs/architecture/domain-model-inspections.md` §InspectableElement,
`docs/requirements/functional-requirements.md` FR-006.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **Code type: QR** | Not an open decision — FR-006 mandates it verbatim ("renders the element's `code` as a QR plus the code as plain text"), as does the domain model. Confirmed technically appropriate independently: universal smartphone-camera support with no dedicated scanner (unlike 1D barcodes), error correction that survives a label degrading on a physical unit in a stairwell, and far more capacity than a 10-character payload needs. |
| **QR payload: the bare `code`, not a URL** | The QR encodes the 10-character `code` as plain text. **Not** `.../elements/{code}`. That route belongs to FR-007 (review session), which has not started; encoding a deep link to a page that 404s would ship a broken promise on a physical, permanent artifact. This **contradicts `docs/architecture/domain-model-inspections.md`**, which currently specifies a URL payload — a source-of-truth correction this slice must make, the same kind of edit `checklist-management` made to the `text`/i18n-key wording. See Risks: the reprint consequence is real and accepted. |
| **Backfill, not lazy generation** | The migration generates a unique `code` for **every existing `InspectableElement` row** at deploy time. The column ends **`NOT NULL` and `UNIQUE`** — no permanent nullable window, no "generate on first print" path, no unprintable element. Every element is printable the moment this lands. |
| **Scope: single-element only** | This slice ships **single-element label printing**. FR-006's other named half — the community batch sheet — is **explicitly deferred as a named follow-up**. Multi-label print layout (page breaks, grid consistency across browsers/printers) is its own non-trivial UI problem, and bundling it onto a slice that already carries a migration, a backfill, a generator and a new dependency violates ADR-006. FR-006 therefore stays **deliberately half-satisfied**, exactly as FR-004 does today. |
| **`code` is immutable** | Assigned once at element registration, never regenerated, never editable — not on the update endpoint, not in the UI. Rationale: the printed label is a durable physical artifact; regenerating a code silently orphans every label already applied to a wall. A lost or damaged label is answered by **reprinting the same code**, which this slice supports natively. *Derived from the physical-artifact constraint, not explicitly stated by the product owner — flagged in the question round below.* |
| **Generation timing** | At creation, inside `CreateInspectableElementUseCase`, via an injected generator port — never lazily, never the raw `id` UUID. |
| **Authorization: unchanged** | Printing reuses the existing `inspectableElement:read`. Verified current state: `role-permission.checker.ts` grants `inspectableElement:create\|read\|update\|delete` to `SYSTEM_ADMIN` only; the other four roles are `[]`. **No new permission, no `Permission` union change, no role activation.** The `authorization` capability is untouched by this slice — the first slice in four that leaves it alone. |
| **`InspectableElement.active` stays out** | Assessed, not inherited. Observation `sdd/review-session/product-decisions` left `active` for "whichever slice first needs it". **Printing does not need it.** Label printing lists and selects non-soft-deleted elements; `deletedAt` (ADR-010) already satisfies that filter completely. `active` means "keeps its history but stops appearing in **new reviews**" — a concept with no referent until `ReviewSession` exists. It stays FR-007's call, per `inspectable-elements`' recorded revisit trigger. |
| **Print mechanism: browser print** | `window.print()` against a print stylesheet, not a server-generated PDF. No PDF/headless-browser infrastructure exists in the repo; printing a single label does not justify introducing it. Browser print-to-PDF remains available to the user for free. |
| **Web UI** | In scope, minimal: `code` shown on the existing elements list, a Print action per row, and one print/label view. |

## Scope

### In Scope

- **Prisma**: `code` column on `InspectableElement` — fixed-length 10, **`NOT
  NULL` + `UNIQUE`**. Hand-written unique index in `migration.sql` per ADR-013,
  following the existing `communityId`-index precedent, plus the
  **backfill step** that assigns a valid unique code to every pre-existing row
  before the constraints are applied.
- **Domain**: `code` as a `readonly` field on `InspectableElement`; the
  alphabet constant (10 characters, excluding `0`/`O` and `1`/`I`/`L` per the
  domain model) and its format predicate as a domain-owned artifact. Zero
  Prisma dependency (ADR-013).
- **Application**: an `ElementCodeGenerator` port + `ELEMENT_CODE_GENERATOR`
  token mirroring the shipped `IdGenerator` / `ID_GENERATOR` shape
  (`shared/application/ports/id-generator.port.ts`) — a DI'd generator, never
  an inline `Math.random()` in the use case.
  `CreateInspectableElementUseCase` generates the code and **handles the unique
  collision deterministically** (bounded retry against the constraint, not
  "random enough"); the in-memory fake reproduces the uniqueness contract.
- **Infrastructure**: the concrete generator adapter (cryptographic RNG over
  the restricted alphabet) and the mapper carrying `code` both ways.
- **Presentation**: `code` added to `InspectableElementResponseDto` (and the
  Swagger annotation). `UpdateInspectableElementRequestDto` is **not**
  extended — immutability is enforced by the write contract, not by the UI.
  **No new endpoint**: the print view reuses the existing
  `GET /communities/:communityId/inspectable-elements` and selects client-side,
  the documented precedent from `inspectable-elements` (Approach 3 — there is
  no `GET /:id` in this codebase).
- **Shared validation** (`packages/validation`, ADR-015): the `code` format
  schema, shared web/API, deriving from one alphabet declaration.
- **Web**: the QR dependency added to `apps/web`; a label/print view rendering
  the QR plus the code as readable plain text plus the minimum identifying
  context (element name, location, community); a print stylesheet
  (`@media print`) that suppresses app chrome; a `code` column and a Print
  action on `CommunityElementsListPage`; one role-gated route in `App.tsx`,
  all under `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`.
- **i18n**: real `en`/`es`/`ca` translations for the new keys, parity-enforced
  by `locales.test.ts`.
- **Docs**: correct `docs/architecture/domain-model-inspections.md`
  §InspectableElement — the QR payload is the bare `code`, not
  `.../elements/{code}` — and record `code` immutability and the batch-sheet
  deferral there.
- Unit, integration and E2E tests per the `inspectable-elements` conventions
  (including a migration test asserting the unique index survives, mirroring
  the shipped `inspectable-element-migration.integration.spec.ts`), plus
  **browser verification** of every UI criterion — including an actual print
  preview — per CLAUDE.md.

### Out of Scope

- **The community batch sheet** — FR-006's other half. Named, deliberate
  follow-up (see Settled decisions). No multi-label page, no page-break CSS,
  no "print all" action.
- **Server-side PDF generation**, download endpoints, emailing a label,
  `pdfkit`/`puppeteer` — no PDF infrastructure is introduced.
- **Any code-lookup route** (`/inspectable-elements/by-code/{code}`,
  `/elements/{code}`, `/e/{code}`) and any scan/deep-link handler. With a bare
  code payload this slice needs none; resolving a code to an element is FR-007's
  job. `inspectable-elements` Open Question 3 is therefore **not** answered
  here — it moves to FR-007 intact.
- **Any `ReviewSession` / `ElementReviewEntry` / `QuestionAnswer` surface.**
- **`InspectableElement.active`** — assessed and kept deferred, see above.
- **Regenerating, editing or reassigning a `code`**; bulk reprint; a print
  history/audit trail; label size/stock configuration.
- **Any `Permission`, `ROLE_PERMISSIONS` or role change**, and any change to
  `community`, `maintenance-company`, `users`, `auth`, `checklist-question` or
  `review-template`.
- **A global nav bar** — pre-existing gap, carried forward unchanged (the
  elements list is already reachable from `CommunityDetailPage`).

### Why this scope and not more (ADR-006)

Two temptations, both declined for the same reason: this slice's real payload
is a **schema change with a backfill on live data plus a permanent physical
artifact**. Both are one-way doors. Wrapping the batch sheet (a genuinely
separate layout problem) or a code-lookup route (whose handler belongs to a
slice that has not started) around them raises the cost of getting the one-way
parts wrong without making them any more likely to be right.

What ships is independently useful the day it lands: every registered element
becomes physically identifiable, which is a real operational gain even before
any review workflow exists — and it is the exact input FR-007 was deferred
waiting for.

## Capabilities

### New Capabilities

- `element-label-printing`: the label surface — what a label contains (QR +
  the code as readable plain text + minimum identifying context), the QR
  payload contract (the bare `code`, nothing else), single-element scope, the
  print trigger, and the print-stylesheet behaviour.

### Modified Capabilities

- `inspectable-element-management`: elements gain an app-generated `code` —
  10 characters over an unambiguous alphabet, globally unique, assigned at
  registration, **immutable**, backfilled for pre-existing rows, and exposed
  on every element response. Collision handling and the not-editable-on-update
  rule are requirements, not implementation details.
- `inspectable-element-admin-ui`: the elements list shows each element's `code`
  and offers a per-element Print entry point.

*(`authorization` is deliberately **not** modified — see Settled decisions.)*

## Approach

Extend `apps/api/src/modules/inspectable-element/**` in place. Same bounded
context, same aggregate, one new field plus a generation rule — a new module
would fragment one entity across two.

Four proposal-level choices:

1. **The generator is a port, not a helper.** `ElementCodeGenerator` +
   `ELEMENT_CODE_GENERATOR`, copying the shipped `IdGenerator` / `ID_GENERATOR`
   shape verbatim. Tests get a deterministic fake — including a
   collision-forcing one, which is the only honest way to test the retry path.
2. **Uniqueness is enforced by the database, not by a pre-check.** A unique
   index plus bounded retry on violation. A `SELECT`-then-`INSERT` pre-check is
   the exact check-then-act race `maintenance-company` PR7 shipped and PR8 had
   to fix, and that `inspectable-elements` then avoided by construction. Third
   slice, same lesson — do not re-ship a known bug.
3. **Client-side QR, no new API surface.** The exploration's recommendation,
   validated and **adopted**: the API already returns everything a label needs
   once `code` is on the response DTO, so the entire print path is one web
   route with zero new endpoints. Server-side PDF (its alternative) buys
   pixel-consistent multi-page layout — which only the *deferred* batch sheet
   needs — at the cost of the repo's first PDF/headless-browser dependency.
   Wrong trade for a single label. *Adopted with one narrowing*: the exact
   package (a framework-agnostic renderer such as `qrcode` producing an SVG
   string, vs. a React component wrapper) is `sdd-design`'s call, constrained
   to a library that renders deterministically into the print stylesheet and is
   assertable in the existing jsdom/Vitest setup.
4. **Reprint over regenerate.** Losing a physical label is a printing problem,
   not an identity problem. Keeping `code` immutable means a label is valid for
   the element's whole life, and reprint is free.

### PR chain sketch

One `stacked-to-main` chain (project convention, CLAUDE.md), each PR merging to
`main` in order. `sdd-tasks` owns the exact split and must forecast against the
400-line budget; this is the shape, not a contract.

| PR | Content |
|---|---|
| ~1 | Alphabet + format schema (`packages/validation`), generator port + adapter, domain field — with unit tests |
| ~2 | Migration + backfill + unique index, mapper, create use case wiring, response DTO, E2E |
| ~3 | QR dependency, label/print view + print stylesheet, list `code` column + Print action, route, i18n |
| ~4 | Docs correction, browser verification, final checks |

PRs ~1–2 are independently shippable: elements carry codes and expose them via
the API before any UI exists.

### Deferred to `sdd-spec` / `sdd-design` (do not resolve here)

- Whether `code` becomes a Value Object or pure functions + a plain field
  (ADR-006 addendum — per slice; `installed-at.ts` chose pure functions and
  that reasoning likely carries).
- The exact alphabet string and whether generation uses `crypto.randomInt`
  or equivalent; the retry bound and what happens when it is exhausted.
- **How the backfill physically runs** — pure SQL inside `migration.sql` vs. a
  scripted data-migration step between two migrations — and how it guarantees
  uniqueness and the correct alphabet for existing rows.
- The QR package choice, error-correction level, and physical rendering size.
- Whether the label view is a route, a modal, or a hidden print-only region on
  the list page; and what identifying context beyond name/location the label
  carries.
- Whether the label view fetches via the list (the `use-community.ts`
  precedent) or the list passes the element through router state.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma`, `migrations/` | Modified | `code` column (10 chars, `NOT NULL`, `UNIQUE`), hand-written unique index, backfill of existing rows |
| `.../inspectable-element/domain/inspectable-element.entity.ts` | Modified | `readonly code: string` |
| `.../inspectable-element/domain/element-code.ts` | New | Alphabet constant + format predicate |
| `.../inspectable-element/application/ports/element-code-generator.port.ts` | New | Port + `ELEMENT_CODE_GENERATOR` token, mirrors `id-generator.port.ts` |
| `.../inspectable-element/infrastructure/code/*.generator.ts` | New | Cryptographic RNG adapter over the alphabet |
| `.../application/use-cases/create-inspectable-element.use-case.ts` | Modified | Generate `code`, bounded collision retry |
| `.../application/use-cases/testing/in-memory-inspectable-element.repository.ts` | Modified | Reproduce the uniqueness contract |
| `.../infrastructure/persistence/inspectable-element.mapper.ts` | Modified | Map `code` both ways |
| `.../presentation/dto/inspectable-element-response.dto.ts` | Modified | `+ code` (+ Swagger) |
| `.../inspectable-element.module.ts` | Modified | Bind the generator |
| `packages/validation/src/inspectable-element/**` | Modified | `code` format schema, shared web/API |
| `apps/web/package.json` | Modified | The repo's first QR dependency |
| `apps/web/src/pages/InspectableElementLabelPage.tsx` (name TBD) | New | QR + plain-text code + identifying context |
| `apps/web/src/inspectable-element/**` | Modified/New | Print stylesheet + any label helpers |
| `apps/web/src/pages/CommunityElementsListPage.tsx` | Modified | `code` column + Print action |
| `apps/web/src/App.tsx` | Modified | One role-gated route, static-before-dynamic |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Real translations |
| `apps/api/test/inspectable-element.e2e-spec.ts` | Modified | `code` presence, uniqueness, immutability on update |
| `docs/architecture/domain-model-inspections.md` | Modified | QR payload = bare `code`; record immutability + batch deferral |

Untouched by design: `modules/community/**`, `modules/maintenance-company/**`,
`modules/users/**`, `modules/auth/**`, `modules/checklist-question/**`,
`modules/review-template/**`, `shared/application/authorization/permission.ts`
and `role-permission.checker.ts`. Unlike the previous three slices, this one
adds no permission and no cross-module guard.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Labels printed now are scan-to-text; if FR-007 later wants deep-link QR, every already-applied physical label needs reprinting.** The one genuinely irreversible consequence of this slice — a URL payload can become a bare code silently, but not the reverse | Med | Accepted deliberately (Settled decisions): a QR deep-linking to a 404 is worse than one that scans to text, and the domain model already guarantees the code works as a manually entered lookup value on any surface. Reprint cost is bounded while the deployment is small; **the window closes the day labels go on walls at scale**, so this is called out for explicit confirmation in the question round below |
| **Backfill leaves a row without a valid, unique `code`** — the migration runs against live data and ends with a `NOT NULL UNIQUE` constraint | Med | Backfill and constraints ship in one migration; an integration test asserts every row has a well-formed code, that the unique index exists (mirroring the shipped migration test), and that the migration is re-runnable from empty |
| **Code collision handled by a check-then-act pre-check** — the `maintenance-company` PR7 race, third time around | Med | Proposal-level choice 2: DB unique index + bounded retry. `sdd-design` picks the retry bound; a test with a collision-forcing generator fake proves the path, not a vacuous assertion |
| **`code` becomes mutable by accident** — added to the update DTO or the edit form "for completeness" | Med | Not in `UpdateInspectableElementRequestDto`. E2E asserts a `code` in an update payload does not change the stored value; `sdd-verify` greps the edit form |
| **A code contains ambiguous characters** and a field technician mistypes `0` for `O` — the exact failure the alphabet exists to prevent | Low | One alphabet declaration, shared via `packages/validation`; a test asserts the excluded characters never appear across a large generated sample |
| **Scope creep into the batch sheet** — "it's the same page, just N of them" | High | Explicit non-goal. `sdd-verify` asserts no multi-element print route, no page-break CSS, no print-all action |
| **Scope creep into FR-007** — a code exists, so a lookup route "obviously" follows | Med | Explicit non-goal. `sdd-verify` asserts no by-code lookup route, use case or repository method exists |
| **The printed label is unusable in practice** — QR too small or low-contrast to scan, or clipped by the browser's print margins | Med | Browser verification includes an actual print preview, not only a rendered page; error-correction level and physical size are named `sdd-design` decisions, not defaults |
| **The QR library drags in a heavy or React-19-incompatible dependency** — the first runtime dependency added to `apps/web` in this project | Low | `sdd-design` picks the package against explicit constraints (deterministic render into the print stylesheet, jsdom/Vitest-assertable, React 19 compatible); a framework-agnostic renderer is preferred precisely to avoid React-version coupling |
| ES/CA translations stubbed with English placeholders | Med | Real translations in scope; `locales.test.ts` parity guard extends to the new keys |

## Rollback Plan

Revert the branch and roll back the migration (`prisma migrate reset` in dev),
dropping the `code` column and its unique index. The backfilled codes are lost
with the column — **and any physical label printed from them becomes
meaningless**, which is the one part of this slice a `git revert` cannot undo.
That is a deployment-sequencing concern, not a code one: do not print labels
at scale until the slice is verified.

Everything else is additive and self-contained: a new port + adapter, one new
domain file, one new page, one new dependency, new locale keys. Changes to
existing files are narrow — one entity field, one mapper line, one DTO field,
one use-case step, one list column, one route. Nothing changes existing
behaviour: no signature change to a shipped port, no permission change, no
cross-module guard. Reverting restores current behaviour verbatim.

If the chain is split as sketched, each PR reverts independently, with the
migration PR the only one carrying schema state.

## Dependencies

- **One new runtime dependency**: a QR renderer in `apps/web` — the first
  dependency this project adds for a feature, and the only new dependency here.
  Package choice is `sdd-design`'s (see Approach 3).
- Otherwise reuses `IdGenerator` (ADR-009), `SoftDeletableRepository` (ADR-010),
  `ZodValidationPipe`, `buildCodedError`, `AuthenticatedGuard` +
  `PermissionsGuard` + `@RequirePermission`, `apiFetch` / `ApiError`,
  `ProtectedRoute allowedRoles`, `NotAuthorized`.
- Reachable PostgreSQL for the migration **and representative existing rows**
  to exercise the backfill against — an empty database does not test it.
- A running dev server (`npm run dev`), an authenticated `SYSTEM_ADMIN`
  session, and a print preview for the browser verification CLAUDE.md requires.

## Success Criteria

- [ ] Every `InspectableElement` created after this change gets a `code`:
      10 characters, drawn only from the unambiguous alphabet, globally unique
      across the whole installation — not per community.
- [ ] Every element that existed **before** this change also has a valid, unique
      `code` after the migration; no row is left null, and the column is
      `NOT NULL UNIQUE` in the final schema.
- [ ] No generated code contains `0`, `O`, `1`, `I` or `L`, proven over a large
      sample.
- [ ] A code collision on insert is retried and resolved, not surfaced as a
      500 — proven with a collision-forcing generator fake, not a
      probability argument.
- [ ] `code` is returned on every element response, and **cannot be changed**:
      an update request carrying a `code` leaves the stored value untouched,
      and no UI control edits it.
- [ ] `code` is never derived from `id`, and two elements never share a code.
- [ ] A `SYSTEM_ADMIN` can print a label for one element from the community's
      elements list, and the printed output contains **both** a QR and the same
      code as readable plain text.
- [ ] The QR encodes **exactly the bare `code`** — scanning it yields the code
      string, not a URL. Asserted by decoding the rendered QR in a test, not by
      inspecting the input passed to the library.
- [ ] The print output suppresses app chrome (nav, buttons, layout) and fits
      the label content — verified in a real browser print preview.
- [ ] Soft-deleted elements are not printable and do not appear in the list.
- [ ] `ROLE_PERMISSIONS` is **byte-identical** to its pre-change state: no new
      `Permission`, no role activated, all four non-admin roles still `[]`, and
      `PermissionChecker.can`'s signature unchanged.
- [ ] Unauthenticated requests get 401; authenticated non-`SYSTEM_ADMIN`
      requests get 403; the web app shows `NotAuthorized`, not a redirect.
- [ ] No batch/multi-element print route, page or action exists; no by-code
      lookup route, use case or repository method exists; no `active` column or
      field exists.
- [ ] No PDF or headless-browser dependency was added.
- [ ] Zero hardcoded UI strings; the new keys have real `en`/`es`/`ca`
      translations, parity test-enforced.
- [ ] `no-restricted-imports` passes — no `@prisma/client` outside
      `infrastructure/persistence/**` (ADR-013).
- [ ] The hand-written unique index survives the migration, proven by an
      integration test reading `pg_indexes` / `pg_constraint`.
- [ ] `docs/architecture/domain-model-inspections.md` no longer specifies a URL
      QR payload, and records `code` immutability.
- [ ] API and web suites, lint and build all pass.
- [ ] Every UI criterion is **browser-verified** against a running dev server,
      including an actual print preview — not only test-verified (CLAUDE.md).

## Proposal question round

Four product questions this executor could not put to the product owner
directly. None blocks `sdd-spec`/`sdd-design` — each has a stated working
assumption — but answers may change the proposal.

1. **Bare-code QR: do you accept the reprint consequence?** The settled
   decision is correct for today. The cost is that labels applied to walls now
   are scan-to-text forever unless reprinted, should FR-007 later want
   deep-link QRs. *Assumption*: accepted, and label rollout stays small until
   FR-007 ships.
2. **Is `code` immutable, or is regeneration an expected operation?**
   *Assumption*: immutable; a lost or damaged label is answered by reprinting
   the same code. If an admin should be able to "reissue" a code, that is a new
   use case, endpoint and UI control not currently in scope.
3. **What else belongs on the physical label?** *Assumption*: element name,
   location and community, plus the QR and the code. If a logo, an installation
   date, or a "report a problem" line is expected, say so — label content is
   cheap to decide now and awkward to retrofit onto printed stock.
4. **Is browser print acceptable, or is a downloadable/emailable PDF expected
   from day one?** *Assumption*: browser print, with the user's own
   print-to-PDF as the escape hatch. A required PDF artifact changes the
   approach materially (server-side generation, a new dependency and endpoint).

## Next step

Run `sdd-spec` and `sdd-design` — they can run in parallel; no blocking product
input is outstanding. `sdd-spec` writes the settled decisions above as
already-decided requirements across the new `element-label-printing` capability
plus the `inspectable-element-management` and `inspectable-element-admin-ui`
deltas, and must state code immutability, global uniqueness and the bare-code
QR payload as requirements in their own right, not implementation notes.
`sdd-design` owns the alphabet and generation algorithm, the collision-retry
bound, the backfill mechanism, the Value-Object call on `code`, the QR package
choice with its error-correction and sizing, and the print-view shape.
