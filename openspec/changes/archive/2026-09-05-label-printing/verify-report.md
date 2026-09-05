# Verification Report — `label-printing` (FR-006)

**Change**: `label-printing` — element `code` + QR + single-element label printing
**Verified against**: `main` @ `638bc40` (all 7 PRs merged: `f844044` → `514e147` → `0c35f2c` → `0182438` → `17894d6` → `36823e6` → `638bc40`)
**Date**: 2026-09-05
**Mode**: Strict TDD
**Artifact store**: hybrid (canonical files under `openspec/changes/label-printing/`, Engram mirrors under `sdd/label-printing/*`)

## Verdict

**PASS WITH WARNINGS**

Every requirement across the three delta specs is implemented and covered by tests
that pass on current `main`. All 45 tasks are checked and genuinely done. All
numbered design decisions (1–9, 4a, and the addendum's 10–12) are followed by the
shipped code, including the three that required a fix during fresh-context review.
No CRITICAL findings; no scope drift; no unaddressed review WARNING in the code.

The warnings are about **evidence and record-keeping**, not implementation: the
Engram apply-progress mirror lost its detailed history, and the one criterion this
slice cannot prove with automated tests — that a *physically printed* label is clean
and scannable — rests on a browser verification performed *before* the print-CSS fix
that shipped, and which did not cover a phone scan or both OS colour schemes.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 45 |
| Tasks complete | 45 |
| Tasks incomplete | 0 |

Note: prior records (Engram `#183`, and the verify request) state "38/38 tasks". The
actual count in `tasks.md` is **45** (Phase 1: 4, Phase 2: 6, Phase 3: 10, Phase 4: 7,
Phase 5: 4, Phase 6: 8, Phase 7: 6). All 45 are `[x]`; only the reported total was wrong.

Sampled and independently verified across all seven phases (not checkbox trust):

| Task | Evidence |
|------|----------|
| 1.1 / 1.2 | `apps/api/prisma/migrations/20260904090000_add_inspectable_element_code/migration.sql` reproduces design.md's SQL block verbatim: add nullable `VARCHAR(10)` → `CREATE UNIQUE INDEX "InspectableElement_code_key"` → `DO $$` backfill with 10 retries/row → `SET NOT NULL`. `schema.prisma` declares `code String @unique @db.VarChar(10)`. |
| 1.3 / 1.4 | `inspectable-element-migration.integration.spec.ts` adds 4 label-printing cases (unique index present + UNIQUE + `(code)`; `character varying(10)` + `is_nullable = 'NO'`; every row matches `^[2-9A-HJKMNP-Z]{10}$` and `Set(codes).size === codes.length` with `rows.length > 0`). Passes against the real DB holding representative rows. |
| 2.1 / 2.2 | `packages/validation/.../inspectable-element.schema.ts` holds the single declaration (`ELEMENT_CODE_ALPHABET` = 31 chars, `ELEMENT_CODE_LENGTH` = 10, `elementCodeSchema`); `domain/element-code.ts` re-exports and derives `isElementCode()` from that same schema. No second declaration exists. |
| 2.3 / 2.5 | `element-code-generator.port.ts` mirrors `id-generator.port.ts`; `random-element-code.generator.ts` uses `node:crypto` `randomInt(0, 31)` per character — not `randomBytes % 31`. |
| 2.4 | `random-element-code.generator.spec.ts`: 10,000-sample run asserting length 10, alphabet-only, `^[2-9A-HJKMNP-Z]{10}$`, all distinct. |
| 3.1 / 3.2 / 3.3 | `create-inspectable-element.use-case.spec.ts` seeds a colliding element and drives a duplicate-then-fresh generator fake: asserts `generate` called twice and the **second** code is stored; an always-duplicate fake asserts `ElementCodeGenerationFailedError`. `MAX_CODE_GENERATION_ATTEMPTS = 3` in the use case. |
| 3.5 | The review CRITICAL fix is real: `prisma-inspectable-element.repository.ts` reads `meta.driverAdapterError.cause.constraint.fields` (not `meta.target`), narrowed step-by-step with no `any`, and the design-mandated integration test (`create() throws ElementCodeAlreadyExistsError for a real duplicate code collision`) exists and passes against real Postgres. |
| 3.10 | `20260904150000_drop_inspectable_element_code_bridge/migration.sql` drops the DEFAULT first, then `DROP FUNCTION temp_bridge_random_inspectable_element_code()`. Two integration tests assert `column_default IS NULL` and that the function is gone from `pg_proc`. |
| 4.4 | Controller has the unpiped `@Body() rawBody: Record<string, unknown>` + `Object.hasOwn(rawBody ?? {}, 'code')`; `createInspectableElementSchema` is a plain `z.object` (not `.strict()`); `@ApiBody` still documents exactly six properties, none of them `code`. |
| 5.1 | `apps/web/package.json`: runtime `qrcode@^1.5.4`; dev `@types/qrcode`, `jsqr`. No PDF/headless package anywhere. |
| 6.7 | `en`/`es`/`ca` all carry real, distinct translations for the 7 `inspectableElement.label.*` keys and the 3 new list keys; `locales.test.ts` parity guard extended to all 10. |
| 7.1 | `docs/architecture/domain-model-inspections.md` §InspectableElement rewritten: URL payload removed, bare-`code` payload stated, immutability and batch-sheet deferral recorded. |
| 7.2–7.5 | Re-ran the greps independently — clean (see Scope Guards below). |

---

## Build & Tests Execution

All commands re-run on `main` @ `638bc40`. No prior claim trusted.

**Build**: PASS — `npm run build` (turbo, 4 tasks: validation `tsc`, api `prisma generate && nest build`, web `tsc -b && vite build`). Exit 0.

**Lint**: PASS — `npm run lint` (turbo, 3 workspaces). `0 errors, 4 warnings`. All 4 warnings are pre-existing `@typescript-eslint/no-unsafe-argument` in `apps/api/src/modules/auth/presentation/auth.controller.spec.ts`, untouched by this change. `no-restricted-imports` (ADR-013) passes — no `@prisma/client` outside `infrastructure/persistence/**`.

| Suite | Command | Result |
|-------|---------|--------|
| API unit | `npm run test --workspace=apps/api` | PASS — 83 suites / **580 tests** |
| API e2e | `npm run test:e2e --workspace=apps/api` | PASS — 8 suites / **244 tests** |
| API integration | `npm run test:integration --workspace=apps/api` | 15/16 suites — **1 pre-existing flake** (see W-5) |
| API integration (serial) | same, `--runInBand` | PASS — 16 suites / **78 tests** |
| Web | `npm run test --workspace=apps/web` | PASS — 38 files / **514 tests** |

**Coverage**: not run — no coverage threshold is configured for this project and `test:cov` is not part of the change's Testing Strategy. Informational only.

---

## Spec Compliance Matrix

### `element-label-printing` (new capability)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Print a Label For a Single Element | Admin prints a label for one element | `InspectableElementLabelPage.test.tsx > renders the code, name, location, and community…` + `> calls window.print when the Print button is clicked` | COMPLIANT |
| | A label view carries exactly one element | Page resolves one `elementId` via `.find()`; renders a single element block | COMPLIANT |
| | Soft-deleted elements are not printable | Chain: API e2e proves soft-deleted are excluded from the list response; `InspectableElementLabelPage.test.tsx > shows a not-found state when :elementId is absent from the list` proves absent-from-list means no code is rendered | COMPLIANT |
| Label Content | Label shows QR, readable code, and context | `InspectableElementLabelPage.test.tsx` asserts `element-qr-code`, `…-label-code`, `…-label-name`, `…-label-location`, `…-label-community` | COMPLIANT |
| | Readable code and QR payload agree with the stored code | Same test asserts the plain-text node carries the stored code; `ElementQrCode.test.tsx` decodes the rendered QR to the same string | COMPLIANT |
| | Identification does not depend on serial number | `serialNumber` is not rendered on the label at all (`InspectableElementLabelPage.tsx`) | COMPLIANT |
| QR Payload Is the Bare Code | Decoding the rendered QR yields the bare code | `ElementQrCode.test.tsx > decodes to the exact code, not a URL` — reads rects out of the DOM, rebuilds the matrix, rasterizes, jsQR decodes. Asserts the OUTPUT, not the input, exactly as the spec demands | COMPLIANT |
| | No URL payload anywhere in the label path | Same file, second case `> decodes a second, different code correctly (triangulation)`; `ElementQrCode.tsx` passes `code` straight to `QRCode.create` with no wrapper | COMPLIANT |
| Print Output Suppresses Application Chrome | Printed output excludes app chrome | `index.css` `@media print` hides `[data-print-hide]` (the h1 and the Print button carry it) plus `#root:has(.label-print){border:none}`. Browser-verified in commit `36823e6` (2nd commit) — but BEFORE the `#root` fix landed | PARTIAL — W-2, W-3 |
| | QR and code survive the print layout | Not directly evidenced. `@page{margin:10mm}`, 25 mm QR and the 6 mm quiet-zone wrapper make clipping implausible, but no print-preview inspection of the shipped CSS is recorded | PARTIAL — W-2, W-4 |
| Printing Reuses the Existing Element Read Permission | Admin may print | `App.tsx` wraps the label route in `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`; `ProtectedRoute.test.tsx > renders the protected content when the role is in allowedRoles` | COMPLIANT |
| | Authenticated non-admin denied explicitly | `ProtectedRoute.test.tsx > renders NotAuthorized when authenticated but role is not in allowedRoles` | COMPLIANT |
| | Unauthenticated visitor redirected to login | `ProtectedRoute.test.tsx > redirects to /login when unauthenticated, even with allowedRoles set (401 before 403)` | COMPLIANT |
| | No new permission is introduced | `git diff f844044~1..638bc40 -- apps/api/src/shared/application/authorization/` is EMPTY. The `Permission` union still holds the same four `inspectableElement:*` values; `role-permission.checker.ts` byte-identical | COMPLIANT |
| No Batch or Multi-Element Printing | No print-all control exists | `CommunityElementsListPage.test.tsx > does not render a list-level print-all control` plus a repo-wide grep | COMPLIANT |
| | No multi-label layout exists | Grep for page-break / break-after / break-inside / printAll / batch-sheet across `apps/web/src` and `apps/api/src`: zero hits outside the guard test itself | COMPLIANT |
| No Server-Generated Label Artifact | No label download or export endpoint | Route-decorator diff on the controller is empty — the same 4 endpoints as before | COMPLIANT |
| | No PDF or headless-browser dependency added | Grep across every `package.json`: no pdfkit, puppeteer, playwright, jspdf, pdf-lib, html2canvas, chrome-launcher | COMPLIANT |
| No Code-Lookup or Scan-Handling Surface | No by-code lookup exists | Grep for byCode / findByCode / elements/:code / regenerateCode / reissue across `apps/api/src` and `apps/web/src`: zero hits | COMPLIANT |
| Documented QR Payload Matches the Implemented One | Docs no longer specify a URL payload | `docs/architecture/domain-model-inspections.md` — "Rendered as a QR code encoding a URL (.../elements/{code})" replaced with "encoding the bare `code` string itself (not a URL)" | COMPLIANT |
| | Docs record immutability and the batch deferral | Same hunk records that `code` is immutable with no regeneration/reassignment endpoint, and that a batch/multi-element print sheet is explicitly deferred | COMPLIANT |
| Internationalization Coverage | All label UI text is translated in every locale | `locales.test.ts` parity guard covers all 10 new keys; `InspectableElementLabelPage.test.tsx > locale parity` renders under `es` and `ca`. Values verified real and distinct per locale, not English placeholders | COMPLIANT |

### `inspectable-element-management` (delta)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Element Code | A created element carries a well-formed code | e2e: create response `code` matches `^[2-9A-HJKMNP-Z]{10}$` | COMPLIANT |
| | Generated codes never contain ambiguous characters | `random-element-code.generator.spec.ts > never emits the visually-ambiguous characters 0, O, 1, I, L` over 10,000 samples | COMPLIANT |
| | Codes are globally unique across communities | DB UNIQUE index (no `communityId` in it) + e2e `assigns distinct, well-formed codes across two creates` + integration `count(distinct) === count(*)` | COMPLIANT |
| | Code is not derived from the element id | Structural only: `generate()` takes no argument, and the alphabet excludes lowercase and hyphen so no UUID substring is expressible. No direct assertion exists | PARTIAL — S-3 |
| Code Collisions Resolved Deterministically | A collision on insert is retried and resolved | `create-inspectable-element.use-case.spec.ts > regenerates and retries once when the first generated code collides, storing the second code` | COMPLIANT |
| | Exhausted retries fail deterministically | `> throws ElementCodeGenerationFailedError after exactly 3 attempts when every candidate collides`; the controller maps it to a plain 500 | COMPLIANT |
| | Uniqueness is not established by a pre-read | `PrismaInspectableElementRepository.create()` inserts and catches P2002 — no SELECT precedes it. The integration test proves the real constraint fires and maps to `ElementCodeAlreadyExistsError` | COMPLIANT |
| Element Code Is Immutable | An update request carrying a code does not change it | e2e `> leaves the stored code untouched when a PATCH body carries a code key` | COMPLIANT |
| | No regeneration or reassignment operation exists | Grep clean; `updateInspectableElementSchema` has no `code`; `updateById`'s `changes` type has no `code` member | COMPLIANT |
| | Soft-delete leaves the code intact | `softDeleteById` writes only `deletedAt`; `soft-delete-inspectable-element.use-case.spec.ts` updated for `code` | COMPLIANT |
| | Reprinting yields the same code | The label route reads the stored `code` on every render; nothing regenerates | COMPLIANT |
| Pre-Existing Elements Are Backfilled | Every pre-existing row ends with a valid unique code | Integration `> every existing row has a well-formed code and all codes are distinct` (asserts `rows.length > 0` first, so it is not vacuous) | COMPLIANT |
| | No row is left without a code | Integration `> the code column is character varying(10) and NOT NULL` | COMPLIANT |
| | The unique index survives the migration | Integration `> the InspectableElement_code_key unique index is present` | COMPLIANT |
| | Migration succeeds against an empty database | No automated test; the DO block is a provable no-op at zero rows. Task 1.4 records a manual confirmation | PARTIAL — S-2 |
| | No lazy generation path exists | SET NOT NULL in the same migration; the PR1 bridge DEFAULT was dropped in PR3 and is asserted gone (`column_default IS NULL`, function absent from `pg_proc`) | COMPLIANT |
| Element Code Exposed on Responses | Listing a community's elements returns each code | e2e asserts the listed element's `code` matches the pattern and equals the created code | COMPLIANT |
| | No new endpoint is added for codes | Route-decorator diff on the controller is empty | COMPLIANT |
| Element Lifecycle Filtering Unchanged | No active field is introduced | No `active` in entity, `schema.prisma`, DTOs or web types | COMPLIANT |
| Create Under a Community (MODIFIED) | Admin creates an element, no warning field | e2e `> creates an element with no warning field when the request body carries no code key` — `expect(body).not.toHaveProperty('warning')`, i.e. absence, not undefined | COMPLIANT |
| | The create contract does not accept a code | `createInspectableElementSchema` has no `code`; `@ApiBody` documents six properties, none of them `code` | COMPLIANT |
| | A supplied code is ignored and warned about | e2e `> creates an element and warns when the request body carries a code key` — 201, stored code is not HACKEDCODE, matches the alphabet, warning equals SUPPLIED_CODE_IGNORED | COMPLIANT |
| | A supplied code is never a validation failure | Same test asserts 201; the schema is deliberately not strict | COMPLIANT |
| | Missing field / non-existent / soft-deleted community | Pre-existing e2e cases, still passing | COMPLIANT |
| Update Inspectable Element (MODIFIED) | Code is not updatable | e2e PATCH-with-code case above; `UpdateInspectableElementUseCase` returns `code: existing.code` | COMPLIANT |
| | Other update scenarios | Pre-existing e2e cases, still passing | COMPLIANT |

### `inspectable-element-admin-ui` (delta)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Element Code Shown in the List | Admin sees each element's code | `CommunityElementsListPage.test.tsx > renders the code column and a per-row Print link to the label route` asserts the row carries the element's code text | COMPLIANT |
| | The code is read-only in the list | The code cell is a plain table cell; no control binds to it | COMPLIANT |
| Per-Element Print Entry Point | Print action opens that element's label | Same test asserts the href equals `/communities/{cid}/inspectable-elements/{eid}/label` for a specific row | COMPLIANT |
| | No list-level print-all action | `> does not render a list-level print-all control` | COMPLIANT (assertion partly vacuous — S-4) |
| List Active Elements (MODIFIED) | Populated list includes the code | As above | COMPLIANT |
| | Empty / error / soft-deleted-never-shown states | Pre-existing cases, still passing | COMPLIANT |
| Edit Inspectable Element (MODIFIED) | The edit form has no code input | Grep for `code` in `apps/web/src/pages/InspectableElementEditPage.tsx` returns ZERO hits — the word does not appear in the file at all, so no input can bind to it and no payload can carry it | COMPLIANT |
| | Prefill / saved edit visible | Pre-existing cases, still passing | COMPLIANT |

**Compliance summary**: 44/47 scenarios COMPLIANT, 3 PARTIAL, 0 FAILING, 0 UNTESTED.

---

## Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| 1 — plain field + pure functions, no VO | Yes | `readonly code: string` on the entity; `domain/element-code.ts` holds constants + predicate. No VO anywhere. |
| 2 — one alphabet declaration in `packages/validation` | Yes | `ELEMENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'` (31 chars), `ELEMENT_CODE_LENGTH = 10`, `elementCodeSchema = /^[2-9A-HJKMNP-Z]{10}$/`, declared once; the domain re-exports and derives from it. |
| 3 — crypto.randomInt, DB-enforced uniqueness, 3 attempts | Yes | `randomInt(0, 31)` per character; `MAX_CODE_GENERATION_ATTEMPTS = 3`; `ElementCodeGenerationFailedError` maps to a plain 500 with no entry in `inspectable-element-error-code.ts`, exactly as the decision's earning test requires. |
| 4 — backfill in-migration, index first, SET NOT NULL last | Yes | `migration.sql` reproduces the design's SQL block statement-for-statement, including the 10-retry DO loop and VARCHAR(10) over CHAR(10). |
| 4a — transitional bridge, mandatory PR3 cleanup | Yes | Bridge added in PR1, dropped in PR3's own migration (DEFAULT first, then the function), with two integration assertions proving it is gone. The deviation is documented in design.md and in both migration files' comments. |
| 5 — qrcode, one rect per module, ECL H | Yes | `QRCode.create(code, { errorCorrectionLevel: 'H' })`, matrix rendered as an inline svg of rects. PR5's review finding (missing quiet zone) IS fixed: `.element-label-qr-wrapper { padding: 6mm }` supplies about 5 modules of quiet zone at 25 mm / version 1, above the 4-module minimum, and applies on screen and in print. |
| 6 — dedicated route, printed on demand | Yes | `/communities/:communityId/inspectable-elements/:elementId/label`, SYSTEM_ADMIN-gated, `window.print()` on click with no auto-print, data via `listInspectableElements` + `listCommunities` under one LoadState; a missing community blocks into `error` and a missing element into `not-found`, exactly as the decision's rationale states. |
| 7 — print rules in index.css | Partial | The `@media print` block is present and scoped to `.label-print`: `@page{margin:10mm}`, the `[data-print-hide]` allowlist, forced black-on-white, crispEdges. PR6's review finding (#root print border) IS fixed via `#root:has(.label-print){border:none}`. But the decision also says to drop `#root`'s BORDER AND CENTERING — `#root`'s `text-align:center`, `margin:0 auto` and `width:1126px` are untouched in print. See W-3. |
| 8 — DTO surface additive, no new endpoint | Yes | `code` added to entity, both mapper directions, all three use-case result types, `InspectableElementResponseDto` with `@ApiProperty`, and the web type. `UpdateInspectableElementRequestDto` and `updateInspectableElementSchema` untouched. No route added. |
| 9 — docs correction ships with the docs PR | Yes | `docs/architecture/domain-model-inspections.md` corrected in PR 7/7 (`638bc40`), the final PR of the chain, mirroring the checklist-management precedent. |
| 10 — raw-body detection via a second unpiped @Body() | Yes | The controller signature matches the design's code block exactly, including `Object.hasOwn(rawBody ?? {}, 'code')`. Both load-bearing invariants still hold: `createInspectableElementSchema` is not strict, and there is still no global ValidationPipe in `main.ts`. |
| 11 — warning on the use-case result | Yes | `SuppliedCodeWarning`, `codeSupplied?: boolean`, conditional spread so the key is ABSENT (never null, never false); `CreateInspectableElementResponseDto extends InspectableElementResponseDto` with `SuppliedCodeWarningDto`. Domain and infrastructure untouched. |
| 12 — still 201, no error mapping | Yes | No `@HttpCode` override; `@ApiCreatedResponse({ type: CreateInspectableElementResponseDto })`; nothing throws and no coded error was added. |

---

## Proposal Success Criteria

| Criterion | Met? |
|---|---|
| Every new element gets a 10-char globally-unique code from the unambiguous alphabet | Yes |
| Every pre-existing element backfilled; column ends NOT NULL UNIQUE | Yes |
| No generated code contains 0, O, 1, I, L, proven over a large sample | Yes (10,000 samples) |
| Collision retried and resolved, proven with a collision-forcing fake | Yes |
| `code` on every response and not changeable; no UI control edits it | Yes |
| `code` never derived from `id`; two elements never share a code | Uniqueness proven; not-derived-from-id is structural only (S-3) |
| Admin can print a label from the list; output has QR + the same code as text | Yes |
| QR encodes exactly the bare code, asserted by decoding the rendered QR | Yes — the decode test reads the DOM output, not the input |
| Print output suppresses app chrome and fits, verified in a real browser print preview | Partial — W-2 / W-4 |
| Soft-deleted elements are not printable and absent from the list | Yes |
| ROLE_PERMISSIONS byte-identical; PermissionChecker.can signature unchanged | Yes (authorization diff is empty) |
| 401 unauthenticated / 403 non-admin / web shows NotAuthorized | Yes |
| No batch print, no by-code lookup, no active field | Yes |
| No PDF or headless-browser dependency | Yes |
| Zero hardcoded UI strings; real en/es/ca, parity-enforced | Yes |
| no-restricted-imports (ADR-013) passes | Yes |
| Unique index survives the migration, proven by reading pg_indexes | Yes |
| Docs no longer specify a URL payload; immutability recorded | Yes |
| API and web suites, lint and build all pass | Yes (integration needs --runInBand, W-5) |
| Every UI criterion browser-verified, including an actual print preview | Partial — W-2 / W-4 |

---

## Strict TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | Degraded | The Engram `sdd/label-printing/apply-progress` topic no longer holds a TDD Cycle Evidence table — see W-1. Reconstructed from git history and `tasks.md`. |
| All tasks have tests | Pass | Every logic-bearing task maps to a named test file that exists on `main`. |
| RED confirmed (test files exist) | Pass | All RED tasks (1.3, 2.4, 3.1, 3.2, 3.8, 4.1, 4.5, 4.6, 5.2, 6.1, 6.5) resolve to real files; RED-before-GREEN ordering is visible in the PR commit sequence. |
| GREEN confirmed (tests pass now) | Pass | Re-run: 580 + 244 + 78 + 514 = 1,416 tests passing on current `main`. |
| Triangulation adequate | Pass | QR decode uses 2 distinct codes; the generator has 4 assertions over 10,000 samples; the warning path has warned-create AND clean-create; the retry path has collide-once AND always-collide. |
| Safety net for modified files | Pass | Pre-existing suites for the touched modules were extended, not replaced; all still pass. |

### Test Layer Distribution (this change)

| Layer | Files | Notes |
|---|---|---|
| Unit (api, Jest) | 3 modified + 1 new | Generator sampling, retry/exhaustion, warning presence/absence |
| Integration (api, Jest + real Postgres) | 2 modified | Migration/schema guards; real P2002 to ElementCodeAlreadyExistsError |
| E2E (api, Jest + supertest) | 1 modified | Create/list/update contract, warning, PATCH immutability |
| Unit + component (web, Vitest + jsdom + Testing Library) | 2 new + 4 modified | QR decode via jsQR, label page states, list wiring, locale parity |
| Browser (manual) | 1 | Task 6.8 — see W-2 / W-4 |

### Assertion Quality

No tautologies, no assertions that never call production code, no ghost loops, no
smoke-test-only cases, no mock-heavy files. The QR test is the strongest kind
available here: it asserts the rendered output, not the input. Two weak spots:

- `CommunityElementsListPage.test.tsx:140` asserts the absence of a testid nothing
  ever defined (S-4). The companion `queryByRole` assertion on the next line is the
  one doing real work.
- The generator's "all 10,000 distinct" assertion is theoretically flaky, but at
  31^10 the collision probability over 10,000 draws is about 6e-8. Not a finding.

**Assertion quality**: 0 CRITICAL, 0 WARNING, 1 SUGGESTION.

### Quality Metrics

**Linter**: 0 errors, 4 pre-existing warnings (all in `auth.controller.spec.ts`, untouched by this change).
**Type checker**: 0 errors — `tsc -b` (web) and `nest build` (api) both clean.
**Coverage**: not configured for this project; skipped, not a failure.

---

## Scope Guards (re-run independently)

| Guard | Result |
|---|---|
| No batch / multi-element print | Clean — only the guard test's own string matches |
| No PDF / headless dependency | Clean |
| Authorization untouched | `git diff` over `apps/api/src/shared/application/authorization/` is empty |
| No by-code lookup or regeneration | Clean |
| Other modules untouched | Only 2 community INTEGRATION SPEC files touched, to supply the now-required `code` on test fixtures — no production code |

**Scope drift: none.** The slice stayed inside its declared boundary, including the
two temptations the proposal explicitly named (the batch sheet and a code-lookup route).

---

## Issues Found

### CRITICAL

None.

### WARNING

**W-1 — The Engram apply-progress mirror lost the change's implementation history.**
`sdd/label-printing/apply-progress` (observation #183, revision 19) currently holds a
four-line "all 7 PRs merged" summary. It contains NO TDD Cycle Evidence table, NO
per-PR deviation record, and NO PR6 browser-verification report — those were
overwritten by successive `topic_key` upserts. Strict TDD verification requires
auditing that table against reality; it does not exist. Equivalent evidence was
reconstructed from git commit messages, `tasks.md`, and by re-running every suite, so
this is a record-keeping loss rather than an implementation defect — but the hybrid
store is now inconsistent: `tasks.md` kept the PR3 review deviation (task 3.5), Engram
did not. The same observation also states "38/38 tasks"; the real count is 45.
Recommendation: for future changes, append PR-by-PR rather than upserting the
apply-progress topic with a terse final summary.

**W-2 — Task 6.8's browser verification predates the print-CSS fix that shipped.**
PR6 (`36823e6`) is a squash of three commits in this order: (a) implementation,
(b) `docs(label-printing): mark task 6.8 done — browser-verified PR6`, (c)
`fix(web): reset #root border when printing the element label`. Commit (c) is a
fresh-context review finding that the printed page still showed `#root`'s
`border-inline` as a stray frame around the label — in its own words "contradicting
design.md Decision 7's stated intent". So the print output was browser-verified BEFORE
the defect in it was found and fixed, and never re-verified afterwards. The spec
scenarios *Printed output excludes app chrome* and *QR and code survive the print
layout* both rest on that stale verification.
Recommendation: one more print preview on current `main` before archiving.

**W-3 — Design Decision 7 is only half-implemented for `#root`.**
Decision 7 says the print block should "drop `#root`'s border/centering"
(`apps/web/src/index.css`). Only the border is reset:
`#root:has(.label-print) { border: none; }`. `#root`'s `text-align: center`,
`margin: 0 auto` and `width: 1126px` all survive into print. `max-width: 100%` and
`.label-print { text-align: left }` mitigate the visible effect, so this is unlikely
to break the label — but it is an unclosed gap against the design's own words, and it
sits exactly where W-2 says nobody looked again.

**W-4 — The recorded browser evidence does not match what the design and proposal asked for.**
design.md's Testing Strategy demands: "Print preview on the real dev server: chrome
suppressed, QR black-on-white in BOTH OS COLOUR SCHEMES, PHONE SCAN yields the code
string." The proposal's success criteria demand "an actual print preview". What commit
(b) actually records is: print CSS hides app chrome (a CSS-level statement), the QR
wrapper "renders unconditional white background (light/dark-scheme AGNOSTIC)" — a
reasoning claim, not an observation under both schemes — and a jsQR decode of the
browser-rendered QR, not a phone camera scan of a printed label. The phone scan is the
single check that proves this slice's entire purpose (a technician walking up to an
extinguisher and scanning it), and it is the one with no evidence. The proposal's own
risk register lists "The printed label is unusable in practice — QR too small or
low-contrast to scan" at Med likelihood, with browser verification as the mitigation.
That mitigation is partly unexecuted.
Recommendation: print one physical label and scan it with a phone before printing at
scale. This is deployment-gating, not archive-gating.

**W-5 — `npm run test:integration` is red as shipped (pre-existing, out of scope).**
`apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts:317`
(`countActiveByRole() excludes soft-deleted users`) asserts `expect(after).toBe(before - 1)`
on a WHOLE-TABLE count against a shared, never-cleaned database (observed count: 1,600
rows). Under Jest's default parallel workers, another suite creating or deleting
COMMUNITY_REPRESENTATIVE users breaks the delta. It passes cleanly with `--runInBand`
(16/16 suites, 78/78 tests). The `users` module is untouched by `label-printing`, so
this is NOT caused by this change — but the documented integration command fails on
`main`, which will hide a real regression the next time it matters.
Recommendation: scope the assertion to the rows the test itself creates, or run the
integration suite serially. Track as its own fix, not a `label-printing` blocker.

### SUGGESTION

**S-1** — `isElementCode()` (`apps/api/src/modules/inspectable-element/domain/element-code.ts:14`)
is exported but called from nowhere in the repo, and has no test. Design Decision 2
mandated it; nothing consumes it because validation happens through the Zod schema on
write. Either wire it or drop it — dead exports rot.

**S-2** — The spec scenario *Migration succeeds against an empty database* has no
automated test; task 1.4 records a manual confirmation. The DO block is a provable
no-op at zero rows, so risk is low, but the assertion would be cheap to add.

**S-3** — The spec scenario *Code is not derived from the element id* has no direct
assertion. `generate()` takes no input and the alphabet excludes lowercase and hyphen,
so a UUID substring is not expressible — but no test states it. One
`expect(code).not.toBe(id)` plus a not-a-substring check in the existing e2e closes it.

**S-4** — `CommunityElementsListPage.test.tsx:140` asserts the absence of the testid
`community-elements-list-print-all`, which nothing has ever defined. That half of the
test can never fail — a future print-all control would almost certainly use a different
testid. The `queryByRole('button', ...)` line beside it is the real guard.

**S-5** — The web bundle is now 764 kB and Vite's 500 kB warning fires. `qrcode` is
this slice's addition. Not introduced solely by this change and not a spec violation,
but worth watching before the deferred batch sheet adds more.

---

## Recommendation

`label-printing` is READY FOR `sdd-archive`. No CRITICAL issue blocks it and no
warning describes broken behaviour.

Two things are worth doing first, neither of which is code:

1. **Re-run the print preview on current `main`** (W-2 / W-3) — the shipped print CSS
   has never been looked at in a browser, only its predecessor.
2. **Print one physical label and scan it with a phone** (W-4) — the proposal itself
   flagged "the printed label is unusable in practice" as a Med-likelihood risk and
   made browser verification the mitigation. Right now that mitigation is partly
   unexecuted, and this is the slice whose artifact is permanent and physical.

W-5 should be filed as its own small fix against the `users` integration test; it has
nothing to do with this change.
