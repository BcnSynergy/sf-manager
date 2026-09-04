# Tasks: Element Code and Single-Element Label Printing

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1250 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 -> PR4 -> PR5 -> PR6 -> PR7 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `code` column: migration + schema | PR 1 | base=main; standalone, migration integration spec only |
| 2 | Code generation port + adapter | PR 2 | base=main; not wired yet, unit tests only |
| 3 | Wire generation into create/list/update + retry | PR 3 | base=main; depends on PR1+PR2 merged |
| 4 | Supplied-code warning mechanism | PR 4 | base=main; depends on PR3 |
| 5 | Web QR rendering component | PR 5 | base=main; depends on PR3 (code in list response) |
| 6 | Web label page + route + list wiring | PR 6 | base=main; depends on PR5 |
| 7 | Docs correction + final scope-guard checks | PR 7 | base=main; depends on all prior |

## Phase 1 (PR 1): `code` Column — Migration + Schema

- [x] 1.1 `apps/api/prisma/schema.prisma`: add `code String @unique @db.VarChar(10)` to `InspectableElement`.
- [x] 1.2 Create `apps/api/prisma/migrations/<ts>_add_inspectable_element_code/migration.sql`: nullable `ADD COLUMN code VARCHAR(10)` -> `CREATE UNIQUE INDEX "InspectableElement_code_key"` -> `DO $$` backfill loop (10 retries/row) -> `ALTER COLUMN code SET NOT NULL`, per design.md interfaces section verbatim.
- [x] 1.3 RED: extend `inspectable-element-migration.integration.spec.ts` — unique index present, column `character varying(10)` `NOT NULL`, seeded rows all match `^[2-9A-HJKMNP-Z]{10}$` and are distinct; run against non-empty seed data (not an empty DB).
- [x] 1.4 GREEN: run migration, confirm spec passes against representative + empty DB.

## Phase 2 (PR 2): Code Generation Port + Adapter

- [x] 2.1 `packages/validation/src/inspectable-element/inspectable-element.schema.ts`: add `ELEMENT_CODE_ALPHABET`, `ELEMENT_CODE_LENGTH`, `elementCodeSchema` (regex `^[2-9A-HJKMNP-Z]{10}$`).
- [x] 2.2 Create `.../domain/element-code.ts`: re-export alphabet/length, `isElementCode()` predicate.
- [x] 2.3 Create `.../application/ports/element-code-generator.port.ts`: `ElementCodeGenerator` + `ELEMENT_CODE_GENERATOR` symbol, mirrors `id-generator.port.ts`.
- [x] 2.4 RED: `random-element-code.generator.spec.ts` — 10,000-sample: length 10, alphabet-only chars, no `0O1IL`, all distinct.
- [x] 2.5 GREEN: create `.../infrastructure/code/random-element-code.generator.ts` using `node:crypto randomInt(0,31)` per char.
- [x] 2.6 Create `.../domain/errors/element-code-already-exists.error.ts` and `.../domain/errors/element-code-generation-failed.error.ts`.

## Phase 3 (PR 3): Wire Generation Into Create/List/Update

- [x] 3.1 RED: unit test on `create-inspectable-element.use-case.spec.ts` — fake generator duplicate-then-fresh; in-memory repo throws `ElementCodeAlreadyExistsError`; asserts 2 `create()` calls, second code stored.
- [x] 3.2 RED: same file — always-duplicate fake asserts `ElementCodeGenerationFailedError` after exactly 3 attempts.
- [x] 3.3 GREEN: modify `create-inspectable-element.use-case.ts` — inject `ElementCodeGenerator`, bounded 3-attempt retry loop, `code` on result.
- [x] 3.4 Modify `.../use-cases/testing/in-memory-inspectable-element.repository.ts`: track codes, throw `ElementCodeAlreadyExistsError` on duplicate `create()`.
- [x] 3.5 Modify `prisma-inspectable-element.repository.ts`: map `P2002` on `InspectableElement_code_key` to `ElementCodeAlreadyExistsError`. Fresh-context review CRITICAL fix: the original `isCodeUniqueViolation()` checked `error.meta.target`, which Prisma 7 + `@prisma/adapter-pg` never populates for P2002s — ported the proven `meta.driverAdapterError.cause.constraint.fields` extraction from `PrismaCommunityRepresentativeRepository`, and added the design.md Testing Strategy-mandated integration test (real duplicate insert -> `ElementCodeAlreadyExistsError`, not a raw `P2002`) that was missing from this task.
- [x] 3.6 Modify `inspectable-element.mapper.ts`: `code` both directions; modify `list`/`update` use-case result types to include `code`.
- [x] 3.7 Modify `inspectable-element-response.dto.ts` (+`@ApiProperty`), `inspectable-element.entity.ts` (`readonly code`), `inspectable-element.controller.ts` (map `ElementCodeGenerationFailedError` -> plain 500), `inspectable-element.module.ts` (bind `ELEMENT_CODE_GENERATOR`).
- [x] 3.8 RED: e2e `inspectable-element.e2e-spec.ts` — `code` present/well-formed on create/list/update responses, two creates differ, PATCH `{code}` leaves stored value untouched.
- [x] 3.9 GREEN: confirm e2e passes end to end.
- [x] 3.10 Migration: `DROP FUNCTION temp_bridge_random_inspectable_element_code()` and `ALTER TABLE "InspectableElement" ALTER COLUMN "code" DROP DEFAULT` — per design.md Decision 4a, this is a mandatory cleanup step of the PR1 transitional bridge, not implied by the generator landing. Confirm via `information_schema` that no default remains on `code` afterward.

## Phase 4 (PR 4): Supplied-Code Warning Mechanism

- [ ] 4.1 RED: unit test on use case — `codeSupplied: true` -> `result.warning.code === 'SUPPLIED_CODE_IGNORED'`; false/omitted -> `expect('warning' in result).toBe(false)`.
- [ ] 4.2 GREEN: modify `create-inspectable-element.use-case.ts` — `SuppliedCodeWarning` interface, `codeSupplied?: boolean` input, conditional-spread `warning?` on result.
- [ ] 4.3 Create `create-inspectable-element-response.dto.ts`: `SuppliedCodeWarningDto`, `CreateInspectableElementResponseDto extends InspectableElementResponseDto`.
- [ ] 4.4 Modify `inspectable-element.controller.ts`: add unpiped `@Body() rawBody: Record<string, unknown>` param, `Object.hasOwn(rawBody ?? {}, 'code')` -> `codeSupplied`, create return type + `@ApiCreatedResponse` type to `CreateInspectableElementResponseDto`. Confirm `createInspectableElementSchema` stays non-`.strict()`.
- [ ] 4.5 RED: e2e — warned create (valid body + `code: 'HACKEDCODE'`) -> 201, `warning.code === 'SUPPLIED_CODE_IGNORED'`, stored `code !== 'HACKEDCODE'` and matches alphabet regex.
- [ ] 4.6 RED: e2e — clean create (no `code`) -> 201, `expect(body).not.toHaveProperty('warning')`.
- [ ] 4.7 GREEN: confirm both e2e scenarios pass; warned create never 4xx and row exists afterward.

## Phase 5 (PR 5): Web QR Rendering Component

- [ ] 5.1 `apps/web/package.json`: add runtime dep `qrcode`; devDeps `@types/qrcode`, `jsqr`.
- [ ] 5.2 RED: `ElementQrCode.test.tsx` — read `<rect>`s from DOM, rebuild boolean matrix, rasterize to `ImageData`, `jsQR` decodes exactly the code (not a URL).
- [ ] 5.3 GREEN: create `apps/web/src/inspectable-element/ElementQrCode.tsx` — `QRCode.create(code, { errorCorrectionLevel: 'H' })`, render matrix as inline `<svg>` with one `<rect>` per dark module.
- [ ] 5.4 Modify `apps/web/src/api/inspectable-element.ts`: add `code` to `InspectableElement` type.

## Phase 6 (PR 6): Label Page, Route, List Wiring

- [ ] 6.1 RED: `InspectableElementLabelPage.test.tsx` — loading/error/not-found states; code + name/location/community rendered; Print button calls spied `window.print`; locale parity across `en`/`es`/`ca`.
- [ ] 6.2 GREEN: create `InspectableElementLabelPage.tsx` — route `/communities/:communityId/inspectable-elements/:elementId/label`, `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, data via `listInspectableElements` + `listCommunities` under one `LoadState`, renders `ElementQrCode` + plain-text code + name/location/community, Print button.
- [ ] 6.3 Modify `apps/web/src/App.tsx`: register the `:elementId/label` route.
- [ ] 6.4 Modify `apps/web/src/index.css`: append `@media print` block scoped to `.label-print` (`@page{margin:10mm}`, hide `[data-print-hide]`, force `#000`/`#fff`, `crispEdges`).
- [ ] 6.5 RED: `CommunityElementsListPage.test.tsx` — asserts `code` column present, per-row Print link, no list-level print-all control.
- [ ] 6.6 GREEN: modify `CommunityElementsListPage.tsx` — add `code` column, per-row Print action linking to the label route.
- [ ] 6.7 Modify `apps/web/src/i18n/locales/{en,es,ca}.json`: real (non-placeholder) translations for all new label/print keys.
- [ ] 6.8 Browser-verify (CLAUDE.md rule): start dev server, print preview shows no app chrome, QR black-on-white in both light/dark OS scheme, phone scan decodes to the bare code string.

## Phase 7 (PR 7): Docs Correction + Final Scope Guards

- [ ] 7.1 Modify `docs/architecture/domain-model-inspections.md` SInspectableElement: replace URL-payload description with bare-`code` payload; record `code` immutability and batch-sheet deferral.
- [ ] 7.2 Scope-guard: grep confirms no batch/multi-element print route or page-break layout exists.
- [ ] 7.3 Scope-guard: grep `package.json` files confirm no `pdfkit`/`puppeteer`/headless-browser dependency added.
- [ ] 7.4 Scope-guard: confirm `ROLE_PERMISSIONS`/`Permission` union unchanged (no new permission, no role newly granted).
- [ ] 7.5 Scope-guard: grep confirms no `code` regeneration/reassignment endpoint or use case exists.
- [ ] 7.6 Final checklist review across all phases; mark this task file complete.
