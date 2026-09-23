# Design: Review Export — Sign and Print the Completed Review (FR-010, slice 1 of 2)

## Technical Approach

One scoped read, one printable page, and copy changes.
`ReadReviewDocumentUseCase` lives in `review-session`, behind the **same
scope gate** as `GET /review-history/:sessionId`
(`ReviewHistoryAccessService.loadCompletedForActor`). Only after that gate
passes does it read labels and the letterhead. No schema change, no new
`ReviewSessionRepository` method, no permission row change — the
`authorization` delta records the one narrow exception (six letterhead
fields reachable through the scoped document read).

Signing is copy, not state: `completedAt` and
`performedById`/`performedByEmail` keep their real names. No
`signedAt`/`signedBy` alias exists anywhere.

## Architecture Decisions

| # | Question | Choice | Rejected | Rationale |
|---|---|---|---|---|
| 1 | Where does the read live, and how is it scoped? | `ReadReviewDocumentUseCase` in `review-session`, route on `ReviewHistoryController`. Its **first** call is `loadCompletedForActor`, the single throw site. | A new module (would need the security-critical `ReviewHistoryAccessService` exported). A new repository method (breaks *History Scope Is Carried by the Query*). | Five scopes, fail-closed branches and uniform 404 reused as they are; still exactly two actor-unscoped reads. |
| 2 | How is the history mapping shared? | Extract a pure `buildHistoryEntries` into `review-history-entries.ts`. History calls it as today; the document passes its own sorted copy and the question order. The document has its **own** result type and DTO. | Reusing `ReviewHistoryDetailEntryDto`/`ReadReviewHistoryEntry` **as** the document's entry type (no name/location; `ReviewDocumentEntry` only extends `ReadReviewHistoryEntry` as a base type, which leaves the history type unchanged; adding them changes the history contract and Swagger). Injecting `ReadReviewHistoryUseCase` (same leak: the controller returns its result as is). Copying the mapping (drift). | One mapping of answers and reasons; history DTO, helper output type and Swagger unchanged. |
| 3 | How is the organization profile read without widening its endpoint? | `OrganizationProfileReader { get() }`; `OrganizationProfileRepository extends` it; the module binds `ORGANIZATION_PROFILE_READER` with `useExisting: ORGANIZATION_PROFILE_REPOSITORY` and exports **only the reader**. | Exporting the repository (exposes `update()`). A second Prisma adapter (duplicates the singleton logic). Calling `GetOrganizationProfileUseCase` (no use-case-to-use-case precedent). | Read-only by type; one consumer, checkable by grepping the token; `GET /organization-profile` unchanged. |
| 4 | How are labels resolved? | Module-local port `ReviewDocumentNameDirectory`, **not exported**: community and company names soft-delete-inclusive (neither has a deactivation state); elements soft-delete- **and** deactivation-inclusive, batched in one query. Template data from `findFrozenWithSnapshot`. Enum text on the web via `mapElementTypeToLabelKey`/`mapReviewFrequencyToLabelKey`. | `CommunityRepository.findById`/`MaintenanceCompanyRepository.findById` (ADR-010 default filter hides soft-deleted rows). `findActiveByCommunityAndType` (drops deactivated and soft-deleted elements; history keeps using it, the document does not). Server-side translation. Snapshots (slice 2). | Follows the `UserDirectory` precedent. `ReviewSessionModule` gains one import (`OrganizationProfileModule`, which imports nothing, so no cycle) and two providers. |
| 5 | Endpoint, gate, drafts | `GET /review-history/:sessionId/document`, `@RequirePermission('reviewSession:read')`, same `mapError`. Drafts are filtered by `loadCompletedForActor`. | `/review-sessions/:id/document` (performer-only scope). Any file response. | JSON; response DTO in `presentation/dto`. |
| 6 | Web surface | New `ReviewDocumentPage`; the only link is on `ReviewHistoryDetailPage`. `ReviewSessionDetailPage` gets no link. | Extending `ReviewHistoryDetailPage`. A field-flow link (performer-scoped read: an unassigned representative would reach a uniform 404). | Same shape as `InspectableElementLabelPage`. |
| 7 | Sign copy | Keep the `reviewSession.detail.complete*` keys, change their values. `ConfirmDialog` gets `confirmLabel?: string` (default `t('common.confirm')`). | Renaming keys to `sign*`. | Smaller diff; existing callers unchanged. |

### Entry enrichment and order

`session.entries` returns a fresh array, and `ElementReviewEntry.answers`
is a `ReadonlyArray`, so nothing is sorted in place. After the gate, the
use case:

1. `elements = findElementsByIds(unique element ids of session.entries)`.
2. `ordered = [...session.entries].sort(compareDocumentEntries(elements))`:
   code ascending (ordinal), code-less (no row) last, then `recordedAt`,
   then entry `id`. Sorting happens on domain entries because the entry
   `id` is not in the mapped output.
3. `buildHistoryEntries(ordered, codeById, answerOrder)`: `answerOrder`
   maps `questionId → order` from the frozen template. The helper maps
   entries **in the order given** and returns new answer arrays, sorted by
   `answerOrder` only when it is passed.
4. Enrich each mapped entry with `elementName`/`elementLocation` (`null`
   only when the id has no row) into `ReviewDocumentEntry`.

History still calls `buildHistoryEntries(session.entries, activeCodeById)`
without `answerOrder`, so its output is byte-identical and
`read-review-history.use-case.spec.ts` stays green unchanged.

### Fallbacks and letterhead

- The name directory returns `null`/absent for an id with no row
  (FK-protected, not expected); it never returns `''`. The use case maps a
  missing community name, a recorded company with no row, and a missing
  email to `''`; the web renders a placeholder for `''`.
  `maintenanceCompanyName` is `null` only when no company was recorded.
- The letterhead is always the six raw strings, with no completeness flag
  (org-profile Decision 5). The web uses one shared `isProfileIncomplete`
  predicate (any field blank), extracted from `OrganizationProfilePage`,
  to show a `data-print-hide` warning. The letterhead prints the filled
  fields and is omitted only when all six are blank.

## Data Flow

    GET /review-history/:sessionId/document
    AuthenticatedGuard → PermissionsGuard('reviewSession:read') → ReviewHistoryController
      ▼ ReadReviewDocumentUseCase
      1 loadCompletedForActor(id, actor) ── reject ──→ 404, nothing else read
      2 templateRepo.findFrozenWithSnapshot(session.templateId)
      3 nameDirectory.findElementsByIds(ids from session.entries)   one query
      4 sorted copy → buildHistoryEntries(...) → enrich name/location
      5 userDirectory.findEmailsByIds([session.performedById])
      6 nameDirectory.findCommunityName(session.communityId)
        nameDirectory.findMaintenanceCompanyName(session.performedByCompanyId)  if set
        profileReader.get()
      ▼ ReviewDocumentResponseDto

    Web: ReviewHistoryDetailPage ── Link ──→ /review-history/:id/document → window.print()

## Interfaces / Contracts

```ts
// organization-profile/application/ports/organization-profile.reader.port.ts
export interface OrganizationProfileReader { get(): Promise<OrganizationProfile>; }
export const ORGANIZATION_PROFILE_READER = Symbol('ORGANIZATION_PROFILE_READER');

// review-session/application/ports/review-document-name-directory.port.ts (never exported)
export interface ReviewDocumentElementIdentity { code: string; name: string; location: string; }
export interface ReviewDocumentNameDirectory {
  findCommunityName(communityId: string): Promise<string | null>;
  findMaintenanceCompanyName(companyId: string): Promise<string | null>;
  findElementsByIds(ids: readonly string[]): Promise<Map<string, ReviewDocumentElementIdentity>>;
}
export const REVIEW_DOCUMENT_NAME_DIRECTORY = Symbol('REVIEW_DOCUMENT_NAME_DIRECTORY');

// review-session/application/use-cases/review-history-entries.ts
// ReadReviewHistoryEntry moves here unchanged; read-review-history.use-case.ts re-exports it.
export function buildHistoryEntries(
  entries: readonly ElementReviewEntry[],      // mapped in the given order, never sorted or mutated
  codeByElementId: ReadonlyMap<string, string>,
  answerOrder?: ReadonlyMap<string, number>,   // omitted by the history call site
): ReadReviewHistoryEntry[];

// review-session/application/use-cases/read-review-document.use-case.ts
export interface ReviewDocumentEntry extends ReadReviewHistoryEntry {
  elementName: string | null;                  // null only when the id has no row
  elementLocation: string | null;
}
export interface ReadReviewDocumentResult {
  id: string; communityId: string; communityName: string;
  template: { name: string; elementType: ElementType; frequency: ReviewFrequency; version: number | null };
  maintenanceCompanyName: string | null;       // null = no company recorded
  performedById: string; performedByEmail: string;
  status: ReviewSessionStatus; startedAt: Date; completedAt: Date | null;
  entries: ReviewDocumentEntry[];              // ordered as above
  questions: TemplateQuestionEntry[];
  letterhead: { name: string; legalName: string; taxId: string; address: string; phone: string; email: string };
}
```

`review-document-response.dto.ts` declares `ReviewDocumentResponseDto`,
`ReviewDocumentEntryDto`, `ReviewDocumentTemplateDto` and
`ReviewDocumentLetterheadDto`. It reuses the unchanged
`ReviewSessionEntryAnswerDto` and `ReviewHistoryQuestionDto`, and never
`ReviewHistoryDetailEntryDto`. The document carries no `coverage`: the
page does not need it.

## File Changes

| File | Action |
|---|---|
| `apps/api/src/modules/organization-profile/application/ports/organization-profile.reader.port.ts` | Create |
| `.../organization-profile/application/ports/organization-profile.repository.port.ts` | Modify: `extends OrganizationProfileReader` |
| `.../organization-profile/organization-profile.module.ts` | Modify: `useExisting` binding, export the reader only |
| `.../review-session/application/use-cases/review-history-entries.ts` (+ spec) | Create: pure helper |
| `.../review-session/application/use-cases/read-review-history.use-case.ts` | Modify: call the helper, no behaviour change |
| `.../review-session/application/ports/review-document-name-directory.port.ts` | Create |
| `.../review-session/application/use-cases/testing/in-memory-review-document-name-directory.ts` (+ spec) | Create: fake for unit and e2e tests |
| `.../review-session/infrastructure/persistence/prisma-review-document-name-directory.ts` (+ integration spec) | Create |
| `.../review-session/application/use-cases/review-document-entry-order.ts` (+ spec) | Create: `compareDocumentEntries` |
| `.../review-session/application/use-cases/read-review-document.use-case.ts` (+ spec) | Create |
| `.../review-session/presentation/dto/review-document-response.dto.ts` | Create |
| `.../review-session/presentation/review-history.controller.ts` | Modify: one route |
| `.../review-session/review-session.module.ts` | Modify: one import, two providers, no exports |
| `apps/api/test/review-history.e2e-spec.ts` | Modify: two overrides, new `describe` block |
| `apps/web/src/components/ConfirmDialog.tsx` (+ test) | Modify: `confirmLabel?` |
| `apps/web/src/pages/ReviewSessionDetailPage.tsx` (+ test) | Modify: label and dialog copy only |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` (+ test) | Modify: the only "View document" link |
| `apps/web/src/pages/ReviewDocumentPage.tsx` (+ test) | Create |
| `apps/web/src/organization-profile/is-profile-incomplete.ts` (+ test) | Create: shared predicate |
| `apps/web/src/pages/OrganizationProfilePage.tsx` | Modify: use the predicate, no behaviour change |
| `apps/web/src/review-session/format-date.ts` (+ test) | Create: `Intl.DateTimeFormat`, fixed `Europe/Madrid`, date and date-time (`HH:mm`) |
| `apps/web/src/api/review-history.ts` | Modify: `ReviewDocument` type, `readReviewDocument` |
| `apps/web/src/routes/authenticated-routes.tsx` (+ test) | Modify: one route, five history roles |
| `apps/web/src/index.css` | Modify: `.review-document-print` rules in the existing `@media print` |
| `apps/web/src/i18n/locales/{en,es,ca}.json`, `apps/web/src/i18n/locales.test.ts` | Modify: `reviewDocument.*` keys, new `complete*` values, `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` |
| `docs/architecture/domain-model-inspections.md`, `docs/requirements/functional-requirements.md` | Modify (final PR) |

## Testing Strategy (Strict TDD, ADR-016)

| Layer | What | How |
|---|---|---|
| Unit | Rejection issues no template, name, email or profile read. Lookups use only session ids. Labels, `''` fallbacks, `null` company. Signer = performer. Six letterhead keys only. Order: code, code-less last, `recordedAt`, id; answers by question `order`. One batched element lookup. | In-memory fakes plus existing scope-checker fakes, with call spies |
| Unit | Helper maps in the given order; history output unchanged | Helper spec; `read-review-history.use-case.spec.ts` unchanged |
| Unit | `format-date.ts`: same output regardless of runtime time zone, in `en`/`es`/`ca`, across a DST boundary | Vitest |
| Integration | Soft-deleted community and company named; deactivated and soft-deleted elements identified; unknown id absent; one query | Real Postgres, `test:integration` (`--runInBand`) |
| E2E | Five scopes 200; uniform 404 (out of scope, nonexistent, draft, ungranted `MANAGER`) equal to the history 404; 401; blank profile 200; six-key letterhead; `GET /organization-profile` still 403 for non-admins | `test:e2e` (`jest --config ./test/jest-e2e.json`, not in band) |
| Component | Regions, placeholders, warning `data-print-hide`, `window.print`, states, `confirmLabel`, link host, route roles | Vitest + Testing Library |
| Browser | Every UI criterion, print preview with blank and filled profile | `npm run dev` + `claude-in-chrome` |

**E2E harness.** E2E suites are hermetic: `AppModule` with in-memory
overrides and a stubbed `PrismaService`. The document cases join
`review-history.e2e-spec.ts` as a new `describe` block, following the
per-element history precedent, and reuse its `buildApp` and scope
seeding. `buildApp` gains two overrides:

- `REVIEW_DOCUMENT_NAME_DIRECTORY` → `InMemoryReviewDocumentNameDirectory`.
- `ORGANIZATION_PROFILE_REPOSITORY` → `InMemoryOrganizationProfileRepository`.
  The reader reaches it through `useExisting`, so the reader needs no
  override of its own. PR 7's first case proves this.

A new e2e file was rejected because it would duplicate about 380 lines
of harness and seeding. E2E fakes cannot exercise SQL filters, so
soft-delete and deactivation naming is proven by the integration spec
only.

## Migration / Rollout

**No migration.** `performedByCompanyId`, `completedAt` and the
`OrganizationProfile` row already exist. Stacked-to-main. Each PR
compiles, keeps every suite green and stays at or under about 400
changed lines, counting this repo's dense comments. Every PR except
PR 8 is test-first.

| # | PR | Est. lines |
|---|---|---|
| 1 | Sign copy: `confirmLabel?`, button and dialog copy, three locales | ~150 |
| 2 | History helper extraction, `answerOrder` option, helper spec | ~280 |
| 3 | Ports and fakes: `OrganizationProfileReader` + `useExisting` (module spec: both tokens resolve to one instance); name-directory port + in-memory fake + spec | ~280 |
| 4 | `PrismaReviewDocumentNameDirectory` + integration spec (not bound yet) | ~300 |
| 5 | Use case core: gate first, session data, labels and fallbacks, signer, letterhead, enrichment in session order | ~380 |
| 6 | Ordering: `compareDocumentEntries` + spec, `answerOrder` passed | ~200 |
| 7 | API wiring: DTOs, route, module; e2e overrides + first cases written first (technician 200 with full body; uniform 404 for out of scope, nonexistent, draft) | ~360 |
| 8 | E2E scope matrix, **characterization coverage** (locks behaviour PR 7 already ships): four other scopes, ungranted `MANAGER`, 401, document/history parity, blank profile, six keys, profile 403 | ~350 |
| 9 | Web helpers: `format-date.ts`, `is-profile-incomplete.ts`, `OrganizationProfilePage` switched | ~200 |
| 10 | Page shell: client + type, route + routes test, loading / uniform 404 / mapped error states, keys (URL-only) | ~300 |
| 11 | Header regions: letterhead, warning, session data, signature footer, placeholders, keys | ~350 |
| 12 | Record and print: entries, neutral label, zero entries, print control, print CSS, keys | ~350 |
| 13 | "View document" link on `ReviewHistoryDetailPage` + test + keys; full browser pass | ~100 |
| 14 | Docs (signing note, FR-010 → `partial`, "send" stays manual) and archive | ~40 + archive |

Every PR that touches `apps/web/**` (1 and 9-13) gets a browser check of what it adds, per CLAUDE.md, or states explicitly that it was only test-verified (PR 9-12 pages are reachable by URL). Total is about 3,600 changed lines. The page stays URL-only until PR 13,
so `main` never links to a half-built page. The chain reverts in
reverse order (14 → 1).

## Deviation from ADR-007

ADR-007 (`docs/adr/ADR-007-i18n-multilanguage-ui-english-codebase.md:31-36`)
wants a legal report in the reviewer's chosen locale. No persisted
user-language preference exists, so slice 1 renders in the **viewer's**
UI locale, with `format-date.ts` fixing `Europe/Madrid`. Accepted by the
user on 2026-09-23 (proposal *Out of Scope*).

## Open Questions

- [x] Soft-deleted community or company naming — name directory. Resolved 2026-09-23.
- [x] Incomplete profile — warning if any field is blank; letterhead omitted only when all six are blank. Resolved 2026-09-23.
- [x] Link host — `review-history-ui` only (supersedes proposal question 3). Resolved 2026-09-23.
- [ ] Performer-retained access: a representative unassigned after signing gets the uniform `404` for their own document. Accepted for slice 1, deferred.
