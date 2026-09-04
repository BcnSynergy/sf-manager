# Design: Element Code and Single-Element Label Printing

## Technical Approach

Extend `apps/api/src/modules/inspectable-element/**` in place (proposal
"Approach"). `code` is a plain `readonly` string on the existing entity — no
Value Object, no new aggregate. Generation is an application-layer port with a
`node:crypto` adapter, mirroring `IdGenerator`/`ID_GENERATOR` verbatim.
Uniqueness is owned by Postgres (`InspectableElement_code_key`) in **both**
directions: the runtime insert path retries on `P2002`, and the backfill loops
against the same index, already created, before `SET NOT NULL` closes the door.
The web adds one route that renders the QR client-side from the existing list
endpoint — zero new API surface.

Verified before designing: `apps/web/package.json` has 5 runtime deps and no QR
or PDF package (proposal confirmed); `code` is absent from
`inspectable-element.entity.ts`, `schema.prisma` and the response DTO;
`ROLE_PERMISSIONS` needs no change.

## Architecture Decisions

### Decision 1: `code` is a plain field + pure functions, not a Value Object

**Choice**: `readonly code: string` on `InspectableElement`; alphabet, length
and format predicate as module-level constants/functions in
`domain/element-code.ts`.
**Alternatives**: an `ElementCode` VO wrapping the string.
**Rationale**: exactly the call `installed-at.ts` already made in this module
("Pure functions, no VO") and the entity comment already records for every
other field. `code` carries no behaviour beyond format validation, and
validation is owned by the Zod schema on write. A VO would be the only one in
the module — ADR-006 says don't.

### Decision 2: one alphabet declaration, in `packages/validation`

**Choice**: `ELEMENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'` (31
chars), `ELEMENT_CODE_LENGTH = 10`, and `elementCodeSchema`
(`/^[2-9A-HJKMNP-Z]{10}$/`) declared once in
`packages/validation/src/inspectable-element/inspectable-element.schema.ts`
(ADR-015, proposal scope). `domain/element-code.ts` re-exports the alphabet and
exposes `isElementCode(value)` deriving from that same schema; the generator
adapter imports the alphabet through the domain re-export.
**Alternatives**: alphabet in the domain with the Zod regex hand-written
alongside it (the `ElementType` three-way-seam shape).
**Rationale**: `ElementType`'s seam exists because Postgres needs its own enum;
`code` has no persistence projection to keep in sync, so a second declaration
would buy only drift. The domain still imports from `@sf-manager/validation`
exactly as `element-type.ts` already does. Alphabet content is the domain
model's, not invented here: `0-9A-Z` minus `0`, `O`, `1`, `I`, `L` = 31 symbols,
31^10 ≈ 8.2×10^14 (~49.6 bits).

### Decision 3: `crypto.randomInt` per character, DB-enforced uniqueness, 3 bounded attempts

**Choice**: `ElementCodeGenerator.generate()` draws 10 indices with
`randomInt(0, 31)` from `node:crypto`.
`CreateInspectableElementUseCase` loops **at most 3 attempts**: generate →
`repository.create()` → on `ElementCodeAlreadyExistsError` regenerate and
retry; after the third, throw `ElementCodeGenerationFailedError`, mapped by the
controller to a plain 500 (`InternalServerErrorException`) with **no** error
code.
**Alternatives**: (a) `SELECT ... WHERE code = ?` before insert — **rejected**,
that is the exact check-then-act race `maintenance-company` PR7 shipped and PR8
fixed; (b) `randomBytes` + `% 31` — rejected, 256 % 31 ≠ 0 so the first 8
symbols are measurably more likely; (c) unbounded retry — rejected, a broken
generator would spin forever instead of failing loudly.
**Rationale**: `randomInt` is rejection-sampled and unbiased. Three attempts is
generous: with 10^5 rows, P(collision on one insert) ≈ 1.2×10^-10, so
exhaustion is not a collision story at all — it is a systemic bug (a constant
generator, a corrupt index), which is why it surfaces as a 500 rather than a
retryable coded error. No `code` in
`inspectable-element-error-code.ts`: the coded-error convention's earning test
is >1 reachable cause on one status, and this has exactly one.

### Decision 4: backfill inside the migration — index first, `SET NOT NULL` last

**Choice**: one hand-written migration, four statements in order: add nullable
`code VARCHAR(10)` → `CREATE UNIQUE INDEX "InspectableElement_code_key"` (a
nullable unique column permits many NULLs, so this is legal pre-backfill) → a
`DO $$` block that per row generates a candidate and retries up to 10 times on
`unique_violation` → `ALTER COLUMN "code" SET NOT NULL`. `code String @unique
@db.VarChar(10)` **is** declared in `schema.prisma`, so this index is
Prisma-visible and needs no invisible-object guard — but the SQL is hand-written
because Prisma cannot express the backfill, and the index name must match
Prisma's canonical `InspectableElement_code_key` exactly or the schema drifts.
**Alternatives**: (a) plain `UPDATE ... SET code = random_string()` then create
the index — rejected, a collision aborts the deploy with no recovery beyond
re-running; (b) a Node data-migration script between two migrations — rejected,
it needs the app runtime at deploy time and cannot share a transaction with the
DDL; (c) `CHAR(10)` — rejected, blank-padded comparison semantics make
`'ABC       '` compare equal to `'ABC'`.
**Rationale**: three independent guarantees inside one transactional migration.
The index makes the backfill's uniqueness DB-enforced (same mechanism as the
runtime path, not a parallel one); the retry loop absorbs the astronomically
unlikely collision; `SET NOT NULL` fails the whole migration closed if any row
was somehow missed. Re-runnable from empty: zero rows means the `DO` block is a
no-op. Backfill uses SQL `random()`, not a CSPRNG — deliberate: the domain model
requires *non-sequential*, not *unguessable*, and every code-bearing surface
stays authenticated.

### Decision 4a: transitional DB default bridges the PR1→PR3 window

**Context**: PR1 makes `code` `NOT NULL`/`UNIQUE` at the schema level, but the
real generation port (Decision 3) is explicit PR3 scope — PR1 must not touch
the create/update use case, entity, mapper, or repository. Left alone, `code
VARCHAR(10) @unique` with no default breaks every pre-existing integration
test that creates an `InspectableElement` without a `code`, and — because
`stacked-to-main` merges PR1 to `main` immediately — leaves a real production
gap: any element created through the live API between PR1 and PR3 merging
would hit a `NOT NULL` violation with no code to supply.

**Choice**: the PR1 migration adds a Postgres function,
`temp_bridge_random_inspectable_element_code()`, as `code`'s column default
(`@default(dbgenerated(...))` in `schema.prisma`). It generates a code with
the same alphabet as the real generator but with **no retry** (unlike the
backfill's 10-retry loop and PR3's 3-attempt application-level retry) — a
collision here surfaces as a raw, unmapped Prisma error, not a clean 409/500,
since the `P2002`→`ElementCodeAlreadyExistsError` mapping is PR3 task 3.5.

**Consequence, stated plainly**: any row created via the real API during the
PR1→PR3 window gets a bridge-generated code. Per the scope-guard in Phase 7
(task 7.5 — no `code` regeneration/reassignment path ever exists), those
codes are **permanent**, not cleaned up once PR3 lands; only the *default*
becomes inert going forward, not any rows already created under it.

**Risk accepted, not eliminated**: collision probability is negligible
(31^10 ≈ 8.2×10^14 combinations), and this repo's chain is implemented and
merged within a single working session, so the real-world window is hours,
not days. This is judged acceptable for a solo/demo project at this data
volume — re-evaluate if deploy cadence or traffic ever make the PR1→PR3 gap
materially longer.

**Follow-up mandated, not optional**: PR3 (task 3.10) MUST drop
`temp_bridge_random_inspectable_element_code()` and the column default as
part of wiring in the real generator — this is not implied by "the default
becomes inert," it must be an explicit migration statement, or the function
becomes permanent, undocumented debris in the schema.

### Decision 5: `qrcode` (npm), rendered as one `<rect>` per module, error correction `H`

**Choice**: one runtime dependency `qrcode` + devDependencies `@types/qrcode`
and `jsqr` (test-only decoder). The label component calls
`QRCode.create(code, { errorCorrectionLevel: 'H' })` and renders the returned
module matrix itself as an inline `<svg>` with one `<rect>` per dark module.
**Alternatives**: `qrcode.react` (React component — rejected, couples the label
to a React major version for no gain); `uqr` (zero-dep, but ~0.1.x and orders of
magnitude less adoption — rejected on maturity for a permanent physical
artifact); `qr-code-styling` / `@bitjson/qr-code` (canvas/web-component, not
assertable in jsdom); `QRCode.toString(..., {type:'svg'})` (rejected — it emits
one merged `<path>`, which cannot be read back into a matrix by the decode test);
`toCanvas`/`toDataURL` (rejected — jsdom has no canvas without the native
`canvas` package).
**Rationale**: `qrcode` is framework-agnostic, a decade old, and its browser
entry (`lib/browser.js`, which Vite and Vitest+jsdom both resolve) pulls in only
the core encoder — `pngjs`/`yargs` stay on the Node/CLI path and never reach the
bundle. Rendering the matrix ourselves is what makes the proposal's "decode the
rendered QR" criterion honest: the test reads rects out of the DOM,
reconstructs the boolean matrix, rasterizes it into an `ImageData` buffer and
lets `jsqr` decode it — no canvas, no native dependency, and it asserts the
*output*, not the input. Level `H` (30% recovery) is affordable because the
payload is 10 uppercase-alphanumeric characters: QR alphanumeric mode, version
1-H holds exactly 10 — a 21×21 grid, the smallest possible symbol, so `H` costs
nothing in module count. (Gotcha: the alphabet being uppercase-only is what
keeps this at version 1; lowercase would force byte mode, cap 7 at `H`, and
bump to version 2.)

### Decision 6: the label is its own route, printed on demand

**Choice**: `/communities/:communityId/inspectable-elements/:elementId/label`,
`ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`, static `label` segment at
depth 5 — the same family as the existing `:elementId/edit` route. A Print
button calls `window.print()`; no auto-print on mount. Data comes from
`listInspectableElements(communityId)` + client-side select plus
`listCommunities()` for the community name, both awaited under one `LoadState`.
**Alternatives**: a modal on the list page, or a hidden print-only region —
both rejected: printing from either means `@media print` must suppress the
entire underlying list ("hide everything except…"), which is exactly the
fragile-across-browsers rule this slice cannot browser-verify cheaply; neither
survives a reload or a shared URL; a hidden region is invisible during
development. Router-state passing was rejected for the same reload reason —
list-and-select is the established precedent (`InspectableElementEditPage`,
`ReviewTemplateDetailPage`) and there is no `GET /:id` in this codebase.
**Rationale**: on a dedicated route the only chrome is the page's own two
controls, so the print stylesheet is an allowlist of things to hide
(`[data-print-hide]`), not a blanket reset. Community name blocks rather than
degrades — one error state, consistent with every other page here; a label
missing its context is worse than a retry.

### Decision 7: print rules live in `index.css`

**Choice**: an `@media print` block appended to `apps/web/src/index.css`,
scoped to `.label-print`: `@page { margin: 10mm }`, hide `[data-print-hide]`,
drop `#root`'s border/centering, and **force `#000` on `#fff`** for the label
and the QR fill.
**Alternatives**: a component-imported `label-print.css`.
**Rationale**: the app has exactly one stylesheet and no component-CSS
convention; introducing one for ~15 rules is scope the slice does not need
(revisit when the deferred batch sheet arrives). The forced black-on-white is
load-bearing, not cosmetic: `index.css` sets `color-scheme: light dark` and a
dark-mode `:root`, so an admin on a dark-mode OS would otherwise print a
light-grey QR on a dark background — unscannable. QR renders at 25 mm (≈1.2 mm
per module at version 1) with `shape-rendering: crispEdges`.

### Decision 8: DTO surface — additive only, no new endpoint

**Choice**: `code` is added to the entity, both mapper directions, the three
use-case result types, `InspectableElementResponseDto` (+`@ApiProperty`) and the
web's `InspectableElement` type. `UpdateInspectableElementRequestDto` and
`updateInspectableElementSchema` are untouched.
**Rationale**: immutability is enforced by the write contract — the Zod object
strips unknown keys, so a `code` in a PATCH body is discarded before the use
case sees it, and `updateById`'s `changes` type has no `code` member. Two
independent gates, neither of them a UI convention. `code` is never in
`CreateInspectableElementRequest`: it is server-generated, like `id`.

### Decision 9: docs correction ships with the docs PR

**Choice**: `docs/architecture/domain-model-inspections.md` §InspectableElement
(lines ~137–141) — replace "Rendered as a QR code encoding a URL
(`.../elements/{code}`)" with the bare-`code` payload, and record `code`
immutability plus the batch-sheet deferral, in the final PR of the chain.
**Rationale**: mirrors `checklist-management` PR 11/11 — the source-of-truth
doc is corrected inside the change that makes it wrong to leave, not in a
separate docs change.

## Data Flow

    CREATE                                            attempt <= 3
    POST /communities/:id/inspectable-elements
      -> CreateInspectableElementUseCase
           -> communityRepository.findById (guard, unchanged)
           -> idGenerator.generate()
           -> elementCodeGenerator.generate() <----------+
           -> repository.create(element)                 |
                -> Prisma INSERT                         |
                -> P2002 on _code_key ------> retry -----+
                -> attempts exhausted -> ElementCodeGenerationFailedError (500)
           -> ResponseDto { ..., code }

    PRINT
    CommunityElementsListPage (code column + Print link)
      -> /communities/:cid/inspectable-elements/:eid/label
           -> listInspectableElements(cid) --+
           -> listCommunities() -------------+--> select by id
           -> QRCode.create(code, {ecl:'H'}) -> <svg> rects (25mm)
           -> [Print] -> window.print() -> @media print (.label-print)

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/validation/src/inspectable-element/inspectable-element.schema.ts` | Modify | `ELEMENT_CODE_ALPHABET`, `ELEMENT_CODE_LENGTH`, `elementCodeSchema` (single declaration) |
| `apps/api/src/modules/inspectable-element/domain/element-code.ts` | Create | Re-export alphabet/length + `isElementCode()` predicate |
| `.../domain/inspectable-element.entity.ts` | Modify | `readonly code: string` (+ props) |
| `.../domain/errors/element-code-generation-failed.error.ts` | Create | Thrown when the 3 attempts are exhausted |
| `.../domain/errors/element-code-already-exists.error.ts` | Create | Repository's `P2002` translation, consumed only by the retry loop |
| `.../application/ports/element-code-generator.port.ts` | Create | `ElementCodeGenerator` + `ELEMENT_CODE_GENERATOR`, shaped like `id-generator.port.ts` |
| `.../infrastructure/code/random-element-code.generator.ts` | Create | `node:crypto` `randomInt` adapter over the alphabet |
| `.../infrastructure/code/random-element-code.generator.spec.ts` | Create | Large-sample alphabet/length assertions |
| `.../application/use-cases/create-inspectable-element.use-case.ts` | Modify | Generate `code`, bounded 3-attempt retry, `code` in the result |
| `.../application/use-cases/{list,update}-*.use-case.ts` | Modify | `code` on the result type |
| `.../application/use-cases/testing/in-memory-inspectable-element.repository.ts` | Modify | Track codes; `create()` throws `ElementCodeAlreadyExistsError` on duplicate |
| `.../infrastructure/persistence/prisma-inspectable-element.repository.ts` | Modify | `create()` maps `P2002` on `InspectableElement_code_key` |
| `.../infrastructure/persistence/inspectable-element.mapper.ts` | Modify | `code` both directions |
| `.../infrastructure/persistence/inspectable-element-migration.integration.spec.ts` | Modify | Unique index present; `code` is `character varying(10)`, `NOT NULL`; every row well-formed and distinct |
| `.../presentation/dto/inspectable-element-response.dto.ts` | Modify | `code` + `@ApiProperty` |
| `.../presentation/inspectable-element.controller.ts` | Modify | Map `ElementCodeGenerationFailedError` to a 500 (no error code) |
| `.../inspectable-element.module.ts` | Modify | Bind `ELEMENT_CODE_GENERATOR` |
| `apps/api/prisma/schema.prisma` | Modify | `code String @unique @db.VarChar(10)` |
| `apps/api/prisma/migrations/<ts>_add_inspectable_element_code/migration.sql` | Create | Add column → unique index → `DO` backfill → `SET NOT NULL` |
| `apps/api/test/inspectable-element.e2e-spec.ts` | Modify | `code` present/well-formed, distinct across creates, unchanged by PATCH |
| `apps/web/package.json` | Modify | `+qrcode`; dev `+@types/qrcode`, `+jsqr` |
| `apps/web/src/api/inspectable-element.ts` | Modify | `code` on the `InspectableElement` type |
| `apps/web/src/inspectable-element/ElementQrCode.tsx` | Create | Matrix → `<svg>` rects, no canvas |
| `apps/web/src/pages/InspectableElementLabelPage.tsx` (+ `.test.tsx`) | Create | QR + code + name/location/community + Print |
| `apps/web/src/pages/CommunityElementsListPage.tsx` (+ test) | Modify | `code` column + per-row Print link |
| `apps/web/src/App.tsx` | Modify | The `:elementId/label` route |
| `apps/web/src/index.css` | Modify | `@media print` block, `.label-print` |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real translations for the label/print keys |
| `docs/architecture/domain-model-inspections.md` | Modify | Bare-`code` QR payload, immutability, batch deferral |

## Interfaces / Contracts

```ts
// application/ports/element-code-generator.port.ts — mirrors IdGenerator
export interface ElementCodeGenerator {
  generate(): string; // 10 chars over ELEMENT_CODE_ALPHABET
}
export const ELEMENT_CODE_GENERATOR = Symbol('ELEMENT_CODE_GENERATOR');
```

```sql
-- migration.sql (order is the design)
ALTER TABLE "InspectableElement" ADD COLUMN "code" VARCHAR(10);
CREATE UNIQUE INDEX "InspectableElement_code_key" ON "InspectableElement"("code");
DO $$
DECLARE r RECORD; candidate TEXT; attempt INT;
BEGIN
  FOR r IN SELECT id FROM "InspectableElement" WHERE "code" IS NULL LOOP
    attempt := 0;
    LOOP
      attempt := attempt + 1;
      SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
             (floor(random() * 31)::int) + 1, 1), '')
        INTO candidate FROM generate_series(1, 10);
      BEGIN
        UPDATE "InspectableElement" SET "code" = candidate WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempt >= 10 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE "InspectableElement" ALTER COLUMN "code" SET NOT NULL;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (api) | Generator | 10,000 codes: length 10, every char in the alphabet, none of `0O1IL`; all distinct |
| Unit (api) | Retry path | Fake generator returns a duplicate then a fresh code; in-memory repo throws `ElementCodeAlreadyExistsError` — assert two `create` calls and the second code stored; a always-duplicate fake asserts `ElementCodeGenerationFailedError` after exactly 3 |
| Integration (api) | Schema + backfill | `pg_indexes` has `InspectableElement_code_key` (UNIQUE); `information_schema` says `character varying(10)`, `is_nullable = 'NO'`; zero rows fail `^[2-9A-HJKMNP-Z]{10}$`; `count(distinct code) = count(*)` |
| Integration (api) | Prisma adapter | Real duplicate insert → `ElementCodeAlreadyExistsError`, not a raw `P2002` |
| E2E (api) | Contract | `code` on create/list/update responses; two creates differ; `PATCH {code}` leaves the stored value untouched |
| Unit (web) | QR output | Read `<rect>`s from the DOM → rebuild matrix → rasterize to `ImageData` → `jsQR` decodes **exactly** the code, not a URL |
| Unit (web) | Label page | Loading/error/not-found states; code + name/location/community rendered; Print calls a spied `window.print`; locales parity |
| Browser | CLAUDE.md | Print preview on the real dev server: chrome suppressed, QR black-on-white in both OS colour schemes, phone scan yields the code string |

## Migration / Rollout

Single forward migration, applied with `prisma migrate deploy` (the
`review-template` precedent — `migrate dev` would offer a reset against the
drifted local checksum). It must run against a database with representative
rows; an empty DB does not exercise the backfill. Rollback = revert the branch
and drop the column with its index — physical labels already printed become
meaningless, so do not print at scale until the slice is browser-verified
(proposal Rollback Plan).

## Open Questions

- [ ] Label stock/size is unspecified — the design targets a single A-page label
      area with a 25 mm QR; if pre-cut label stock is expected, `@page` size and
      margins need a real measurement before the browser-verification task.
- [ ] Proposal question round 3 (what else the label carries) is still open;
      this design assumes name + location + community and nothing more.

---

## Addendum: Supplied-Code Warning Mechanism

Covers only the spec's *Create Inspectable Element Under a Community* rule added
after Decision 1–9 were written: a create body carrying a `code` key is **not**
rejected — the element is created with the generated `code` and the 201 response
additionally carries `warning: { code: 'SUPPLIED_CODE_IGNORED' }`, absent
otherwise. Every other decision above stands unchanged. Decision 8 is unaffected:
`code` is still not a declared create input.

### Why the check is reachable at all (verified, not assumed)

The spec's risk note is real but does not fire here, for two reasons that were
read out of the code:

1. **There is no global `ValidationPipe`.** `apps/api/src/main.ts` registers only
   `cookieParser()`, CORS and Swagger — no `app.useGlobalPipes(...)`, so no
   `whitelist: true` ever touches `req.body`. Validation is per-parameter:
   `@Body(new ZodValidationPipe(createInspectableElementSchema))`.
2. **`ZodValidationPipe` does not mutate `req.body`.**
   `apps/api/src/shared/presentation/pipes/zod-validation.pipe.ts` calls
   `this.schema.safeParse(value)` and returns `result.data` — a *new* stripped
   object. Nest binds that to the handler argument; `req.body` keeps its `code`
   key.

Both are load-bearing invariants, not incidental. They are pinned by the e2e test
below: adding a global whitelisting pipe later would fail it loudly rather than
silently making the warning unreachable.

### Decision 10: raw-body detection via a second, unpiped `@Body()` parameter

**Choice**: the create handler takes two parameters bound to the same
`req.body` — one unpiped (raw), one piped (typed):

```ts
async create(
  @Param('communityId') communityId: string,
  // Raw body, deliberately unpiped: ZodValidationPipe strips `code` out of
  // the typed argument below, so this is the only place the key survives.
  @Body() rawBody: Record<string, unknown>,
  @Body(new ZodValidationPipe(createInspectableElementSchema))
  body: CreateInspectableElementRequestDto,
): Promise<CreateInspectableElementResponseDto> {
  return await this.createInspectableElementUseCase.execute({
    communityId,
    ...body,
    codeSupplied: Object.hasOwn(rawBody ?? {}, 'code'),
  });
}
```

Detection is **key presence**, not truthiness: `Object.hasOwn` warns on
`{"code": null}` and `{"code": ""}` too, which is what "carries a `code` key"
means in the spec.

**Alternatives considered**:

| Option | Why rejected |
|---|---|
| Add `code: z.unknown().optional()` (or `.passthrough()`) to `createInspectableElementSchema` | Directly violates the spec — `code` would become a declared/accepted input field, and the shared schema also feeds the web client |
| A module-local `CreateInspectableElementZodValidationPipe extends ZodValidationPipe` returning `{ ...data, codeSupplied }` (the `MaintenanceCompanyZodValidationPipe` precedent) | That precedent exists to *re-shape a rejection*; here it would smuggle a non-contract field into the Zod-inferred DTO type, breaking ADR-015's "the schema is the type" |
| `@Req() request` and read `request.body` | Only `auth.controller.ts` injects `@Req()`, and only because it needs session/cookie state. A second `@Body()` is narrower and carries no Express typing into this module |
| Detect in the use case from a `code` passed through | Nothing to pass — the key is already gone by then. That is exactly the risk the spec flagged |

**Rationale**: Nest resolves each `@Body()` parameter independently from
`req.body` and applies pipes per parameter, so binding order is irrelevant when
the pipe is non-mutating (point 2 above). The typed contract is untouched —
`CreateInspectableElementRequestDto` remains
`z.infer<typeof createInspectableElementSchema>` with no `code` member, and
`@ApiBody` still documents six properties. Raw-transport inspection stays in the
presentation layer, where it belongs.

**Guard**: `createInspectableElementSchema` MUST NOT become `.strict()`. Zod
objects strip unknown keys by default; `.strict()` would turn a supplied `code`
into a 400 and contradict the spec's "never a 4xx validation error".

### Decision 11: `warning` on the use-case result, mirroring `AddRepresentativeResult`

**Choice**: the warning is produced in the application layer and flows to a
create-specific response DTO. Domain and infrastructure are **untouched** — no
entity field, no column, no mapper change; the warning describes a *request*, not
the element.

```ts
// application/use-cases/create-inspectable-element.use-case.ts
export interface SuppliedCodeWarning {
  code: 'SUPPLIED_CODE_IGNORED';
}

export interface CreateInspectableElementInput {
  /* …unchanged… */ codeSupplied?: boolean;
}

export interface CreateInspectableElementResult {
  /* …unchanged… */ code: string;
  warning?: SuppliedCodeWarning;
}

// emitted with the same conditional-spread as AddRepresentativeUseCase, so the
// key is ABSENT — never null, never false — when no code was supplied:
...(input.codeSupplied ? { warning: { code: 'SUPPLIED_CODE_IGNORED' as const } } : {}),
```

```ts
// presentation/dto/create-inspectable-element-response.dto.ts (new)
export class SuppliedCodeWarningDto {
  @ApiProperty({ enum: ['SUPPLIED_CODE_IGNORED'] })
  code!: 'SUPPLIED_CODE_IGNORED';
}

export class CreateInspectableElementResponseDto extends InspectableElementResponseDto {
  @ApiPropertyOptional({ type: SuppliedCodeWarningDto })
  warning?: SuppliedCodeWarningDto;
}
```

**Alternatives considered**: (a) the controller computing the warning itself and
merging it into the response — rejected, it splits "what happened during create"
across two layers and leaves the use-case result lying about the outcome;
(b) adding `warning?` to the shared `InspectableElementResponseDto` — rejected,
that DTO is also the list and update response and neither can ever carry a
warning. This is verbatim the reasoning already recorded in
`representative-response.dto.ts` ("Named per-representative here because the
technician variant never carries `warning`"), so create gets its own subclass and
`InspectableElementResponseDto` stays warning-free.

**Rationale**: an exact mirror of the one shipped `warning?` convention in this
codebase (`AddRepresentativeResult.warning?: RepresentativeWarning` →
`RepresentativeResponseDto.warning?: RepresentativeWarningDto`). The payload is
the coded object only — the rejected value is **not** echoed back: it is
unvalidated caller input, it adds nothing the caller does not already know, and
keeping the shape minimal keeps the Swagger enum authoritative.

### Decision 12: still 201, still no error mapping

**Choice**: no change to the status code or the error path. `@Post()` has no
`@HttpCode` override, so Nest returns **201**; `@ApiCreatedResponse` changes only
its `type` to `CreateInspectableElementResponseDto`. The warning never reaches
`mapMutationError` because nothing throws — it is not a `buildCodedError` case and
gets no entry in `inspectable-element-error-code.ts` (same earning test as
Decision 3: coded *errors* are for failures, and this is a success).

### Addendum File Changes

| File | Action | Description |
|---|---|---|
| `.../application/use-cases/create-inspectable-element.use-case.ts` | Modify | `SuppliedCodeWarning`, `codeSupplied?: boolean` on the input, `warning?` on the result via conditional spread |
| `.../presentation/dto/create-inspectable-element-response.dto.ts` | Create | `SuppliedCodeWarningDto` + `CreateInspectableElementResponseDto extends InspectableElementResponseDto` |
| `.../presentation/inspectable-element.controller.ts` | Modify | Unpiped `@Body() rawBody` param, `Object.hasOwn(rawBody, 'code')`, create return type + `@ApiCreatedResponse` type |
| `apps/api/test/inspectable-element.e2e-spec.ts` | Modify | The three warning scenarios below |

### Addendum Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (api) | Use case | `codeSupplied: true` → `result.warning.code === 'SUPPLIED_CODE_IGNORED'`; `codeSupplied` false/omitted → `expect('warning' in result).toBe(false)` (absence, not `toBeUndefined`) |
| E2E (api) | Warned create | POST with a valid body **plus** `code: 'HACKEDCODE'` → **201**, `body.warning.code === 'SUPPLIED_CODE_IGNORED'`, `body.code !== 'HACKEDCODE'` and matches `^[2-9A-HJKMNP-Z]{10}$` |
| E2E (api) | Clean create | POST without `code` → 201 and `expect(body).not.toHaveProperty('warning')` — this is the regression fence for the two invariants above (a future global whitelisting pipe fails the warned-create test) |
| E2E (api) | Not a validation error | The warned create is asserted 201, never 4xx, and the row exists afterwards |
