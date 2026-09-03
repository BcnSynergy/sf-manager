# Design: Checklist Question Pool and Review Template Versioning

## Technical Approach

Two hexagonal modules cloned from `apps/api/src/modules/inspectable-element/**`
(the most recently reviewed module), with `review-template` importing
`ChecklistQuestionModule` for pool reads — the same one-way shape
`inspectable-element → community` already ships. Flat, non-community-scoped
routes. Everything below is the *how*; the *what* is settled in
`proposal.md` and is not re-litigated here.

Five invariants carry the slice, each with a deliberately different
enforcement mechanism depending on what can actually express it:

| Invariant | Mechanism | Decision |
|---|---|---|
| Exactly one `active` version per `(elementType, frequency)` | Serializable `$transaction` (primary) + hand-written **partial unique index** (backstop) | 3 |
| A frozen version never has a missing wording snapshot | `questionText TEXT **NOT NULL**` on rows that exist **only** for frozen versions — structurally unrepresentable, not test-guarded | 2 |
| A frozen version never reads the live pool | Two distinct repository read paths; the frozen one does not reference `"ChecklistQuestion"` at all | 5 |
| At most one `draft` per lineage | Partial unique index `WHERE status='draft' AND deletedAt IS NULL` | 3 |
| `ReviewFrequency` means one thing in Postgres, the domain and Zod | Three compile-time gates + one runtime parity spec, cloned from `element-type.ts` | 1 |

## Architecture Decisions

### Decision 1: closed-catalog types cross module boundaries through `@sf-manager/validation`, never module-to-module

The proposal flags "`ElementType` may have to move to a shared location" as a
reportable finding. **It does not have to move.** `apps/api/src/shared/` has
`application/`, `infrastructure/` and `presentation/` — **no `domain/`** — and
`inspectable-elements` Decision 4 explicitly rejected hoisting into `shared/`
as a boundary inversion. The rule that falls out:

> Every module imports a closed catalog's **type** from `@sf-manager/validation`
> (already a universal dependency, ADR-015). Exactly **one** module owns that
> catalog's `as const satisfies` gate and its parity spec.

`element-type.ts` already imports `ValidatedElementType` from the validation
package, so this is the file's own precedent, not a new pattern. Consequences:
`checklist-question` and `review-template` import `type { ElementType }` from
`@sf-manager/validation`; `inspectable-element` keeps `ELEMENT_TYPES`
untouched; **zero new module-to-module domain imports**, and `review-template`
does not import `checklist-question`'s domain at all.

`checklist-question/domain/review-frequency.ts` owns the new gate, cloning
`element-type.ts` verbatim:

```ts
export const REVIEW_FREQUENCIES = [
  'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL',
] as const satisfies readonly ValidatedReviewFrequency[];
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];
```

`ReviewTemplateStatus` (`draft|active|retired`) gets the identical treatment in
`review-template/domain/review-template-status.ts`. One parity spec under
`checklist-question/infrastructure/persistence/` covers `ReviewFrequency`; one
under `review-template/.../` covers the status enum (placement is what lets
them import `$Enums` without violating ADR-013's `no-restricted-imports`).

`frequencies` is a **Postgres enum array** (`ReviewFrequency[]`), not a join
table: a tag set with no attributes of its own, always read whole, and the
builder's only query is `has:` on it. A join table would be a fourth table
carrying nothing.

### Decision 2: the frozen wording lives in `ReviewTemplateQuestion.questionText NOT NULL`, and those rows exist **only** for frozen versions

The proposal requires the null-snapshot state to be *unrepresentable or
test-guarded*. Unrepresentable is achievable, so test-guarded is not settled for.

| Option | Tradeoff | Verdict |
|---|---|---|
| `questionText` **nullable**, rows present for drafts too, filled at activation | Matches the domain doc's join entity 1:1, but "activated version with a NULL snapshot" is a legal database state. Making it illegal needs a CHECK against the *parent's* status — cross-table, so a trigger, and this schema has none. Test-guarded only | **Rejected** |
| A third table for frozen questions, drafts keep `ReviewTemplateQuestion` | Unrepresentable, but four tables and two near-identical shapes for what the API returns as one list | **Rejected** |
| Draft selection = ordered `draftQuestionIds UUID[]` on `ReviewTemplate`; `ReviewTemplateQuestion` rows written **only at activation** with `questionText TEXT NOT NULL` | The null snapshot cannot be written, spelled, or migrated into existence. Replace-whole-selection (`PUT .../questions`) is a single column write. The soft-delete cascade is a single `array_remove`. The column name says out loud that it is not the audit record | **Chosen** |

The array carries no FK (Postgres cannot FK an array element) — acceptable
because pool rows are **never hard-deleted** (ADR-010), so an id cannot dangle;
a soft-deleted id is removed by Decision 6 *and* filtered by the draft read
path. `draftQuestionIds` is reset to `'{}'` inside the activation transaction,
so a frozen row's array is empty and its snapshot rows are not: no version ever
carries two competing selections.

### Decision 3: activation is one Serializable transaction, with two partial unique indexes as the by-construction backstop

This repo has already paid for the check-then-act bug twice
(`maintenance-company` PR7→PR8, `community` soft-delete). The shipped pattern is
*transaction as primary enforcement, hand-written partial unique index as the
backstop that protects paths bypassing the use case*, with `P2002` on that index
mapping to the same 409 as a `P2034` serialization abort — literally
`CommunityRepresentative_one_active_per_community`'s comment block. Cloned:

```sql
CREATE UNIQUE INDEX "ReviewTemplate_one_active_per_lineage"
  ON "ReviewTemplate"("elementType","frequency") WHERE "status" = 'active';
CREATE UNIQUE INDEX "ReviewTemplate_one_draft_per_lineage"
  ON "ReviewTemplate"("elementType","frequency")
  WHERE "status" = 'draft' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "ReviewTemplate_lineage_version_key"
  ON "ReviewTemplate"("elementType","frequency","version");
```

Both partial indexes are invisible to Prisma's diffing (`@@unique` has no
`WHERE`) — same warning block and same `pg_indexes` integration guard as the
three existing hand-written indexes.

`PrismaReviewTemplateRepository.activate()` runs
`$transaction(..., { isolationLevel: Serializable })`, mirroring
`PrismaUserRepository.transactional` / `PrismaCommunityRepresentativeRepository`.
**Statement order is load-bearing**: the predecessor must be retired *before*
this row is flipped to `active`, because a unique index is checked per
statement and is not deferrable. Writing it the other way round produces a
transient violation on every supersession.

**`version` is `INT NULL`, assigned at activation** (`COALESCE(MAX(version),0)+1`
within the transaction). A draft therefore *cannot* consume a version number —
"a discarded draft leaves no gap" is satisfied by the column being null, not by
a compensating rule. Postgres treats NULLs as distinct, so the lineage-version
unique index tolerates many drafts.

### Decision 4: the snapshot is copied **by the database**, inside the same transaction, via `INSERT … SELECT`

Reading the pool through `checklist-question`'s exported port and passing the
strings in would put the read *outside* `review-template`'s transaction (that
adapter is bound to the root client) — a TOCTOU on the exact fact the slice
exists to guarantee. Instead the copy is one statement over `"ChecklistQuestion"`
inside the transaction; cross-table raw SQL inside an atomic write is
precedented verbatim by `PrismaCommunityRepository.softDeleteById` and
`PrismaMaintenanceCompanyRepository.softDeleteById`.

```sql
INSERT INTO "ReviewTemplateQuestion" ("id","templateId","questionId","order","questionText")
SELECT sel.rid, ${templateId}::uuid, q."id",
       ROW_NUMBER() OVER (ORDER BY sel.ord), q."text"
FROM unnest(${questionIds}::uuid[], ${rowIds}::uuid[]) WITH ORDINALITY AS sel(qid, rid, ord)
JOIN "ChecklistQuestion" q ON q."id" = sel.qid AND q."deletedAt" IS NULL;
```

`rowIds` are **app-generated UUIDv7s** (ADR-009) — `gen_random_uuid()` would be
a v4 and violate it. A question soft-deleted concurrently simply produces no
row (the join drops it), which matches what the draft view was already showing;
the transaction then asserts `insertedRows >= 1` and rolls back to
`REVIEW_TEMPLATE_EMPTY` otherwise. `ROW_NUMBER()` keeps `order` gapless.

### Decision 5: one response shape, two repository read paths

The proposal asks that a client not be able to guess wrong about which wording
it is reading. `status` is already on the wire and already discriminates
(`draft` ⇒ live, `active`/`retired` ⇒ frozen), so a second `wordingSource` field
would be a redundant source of truth. Two DTO types would cost a Swagger/TS
union for zero information gain.

**Chosen**: one `ReviewTemplateResponseDto` with
`questions: { questionId, order, text }[]`, and **two repository methods**:

- `findDraftWithLiveQuestions(id)` — reads `draftQuestionIds`, resolves text via
  the pool (ADR-010 filter applies for free).
- `findFrozenWithSnapshot(id)` — reads `ReviewTemplateQuestion` only. **This
  query does not name `"ChecklistQuestion"`.**

The use case dispatches on `status`. Enforcing the rule in the *query*, not in a
DTO field, is what makes "the frozen path joins the pool for convenience"
impossible rather than discouraged.

### Decision 6: the draft cleanup on question soft-delete mirrors the community→representative cascade — gated, not transactional

`checklist-question` must reach `"ReviewTemplate"`, the reverse of the sanctioned
dependency direction. Registering the reverse module import closes a Nest DI
cycle. Applying `inspectable-elements` Decision 4 inverted: `checklist-question`
owns a **narrow one-method port** plus its own ~12-line adapter
(`PrismaDraftSelectionCleaner` in `checklist-question/infrastructure/persistence/`,
resolving `PrismaService` through the `@Global()` `PrismaModule` with no module
import at all) — the `PrismaInspectableElementCounter` pattern exactly.

```sql
UPDATE "ReviewTemplate"
SET "draftQuestionIds" = array_remove("draftQuestionIds", ${questionId}::uuid)
WHERE "status" = 'draft' AND ${questionId}::uuid = ANY("draftQuestionIds");
```

Run **after** the soft-delete and **gated on it having happened**, exactly as
`SoftDeleteCommunityUseCase` gates the representative cascade on
`wasDeleted === true`. No cross-repository transaction is invented (the seam was
refused twice already), and non-atomicity is safe here in a way the community
cascade is not: the draft read path (Decision 5) filters soft-deleted questions
independently, so a failed cleanup is a convergence lag, never a visible defect.

### Decision 7: no Value Objects — re-derived per field (ADR-006 addendum)

| Field | Invariant | Behaviour beyond validation? | Verdict |
|---|---|---|---|
| `text` | non-empty, trimmed, free admin content | None. Rendered verbatim, never parsed/compared/`t()`-ed | plain `string` |
| `name` | non-empty, trimmed, not unique | None | plain `string` |
| `order` | contiguous within a version | Owned by the array's index / `ROW_NUMBER()`, not by a wrapper | plain `number` |
| `version` | per-lineage, assigned once | The rule is a *set* property enforced by an index, not intrinsic to the integer | `number \| null` |
| `frequencies` | non-empty set | A set with no behaviour; non-emptiness is one Zod `.min(1)` | `ReviewFrequency[]` |

`PlainPassword` remains the only VO in the repo. Entities perform **no
constructor validation**, mirroring every shipped entity; trimming and
non-emptiness live in the shared Zod schemas (ADR-015). Status transitions
(`draft→active`, `active→retired`, `retired` terminal, frozen ⇒ not editable)
*are* domain behaviour and live on the `ReviewTemplate` entity as pure guards,
mirroring `last-admin.policy.ts`' pure-function shape.

### Decision 8: routes, permissions, error codes

| Method | Path | Permission | Result |
|---|---|---|---|
| `POST` | `/checklist-questions` | `checklistQuestion:create` | 201 · 400 |
| `GET` | `/checklist-questions` | `checklistQuestion:read` | 200 (`?elementType=` optional) |

> **PR 4 note**: the `?elementType=` filter listed above was deliberately **not** implemented — no spec.md scenario requires it, and ADR-006 (walking-skeleton discipline) says not to build scope the current slice doesn't need. `GET /checklist-questions` always returns the full pool; add the filter later if a scenario actually calls for it.
| `PATCH` | `/checklist-questions/:id` | `checklistQuestion:update` | 200 · 404 `CHECKLIST_QUESTION_NOT_FOUND` |
| `DELETE` | `/checklist-questions/:id` | `checklistQuestion:delete` | 204 · 404 — **never 409**, no delete guard |
| `POST` | `/review-templates` | `reviewTemplate:create` | 201 · 409 `REVIEW_TEMPLATE_DRAFT_EXISTS` |
| `GET` | `/review-templates` | `reviewTemplate:read` | 200 |
| `GET` | `/review-templates/:id` | `reviewTemplate:read` | 200 · 404 |
| `PUT` | `/review-templates/:id/questions` | `reviewTemplate:update` | 200 · 404 (2 codes) · 409 `REVIEW_TEMPLATE_NOT_EDITABLE` |
| `POST` | `/review-templates/:id/activate` | `reviewTemplate:activate` | 200 · 409 `…NOT_EDITABLE` \| `…EMPTY` \| `…ACTIVATION_CONFLICT` |
| `DELETE` | `/review-templates/:id` | `reviewTemplate:delete` | 204 · 404 · 409 `…NOT_EDITABLE` (frozen versions are undeletable) |

Nine permissions on the `SYSTEM_ADMIN` row only; the four other rows stay `[]`.
`activate` is split from `update`, mirroring `community:assign`.
`buildCodedError` needs **no widening** — `inspectable-elements` already added
`NOT_FOUND`, so 400/404/409 are all available.

`PUT .../questions` validates every id against the pool (unknown or soft-deleted
⇒ 404 `CHECKLIST_QUESTION_NOT_FOUND`), rejects duplicates, and rejects a
question whose `elementType` differs from the template's. **`frequencies` is
never checked** — a cross-frequency pick is legal by settled decision.

### Decision 9: the builder is one page with an inline picker

| Option | Tradeoff | Verdict |
|---|---|---|
| `/review-templates/:id` + a separate `/pick` route | An extra route, an extra load state, and the selection is still one `PUT` that has to be composed somewhere | **Rejected** |
| One page, two panels (selected+ordered / available), one Save | `CommunityDetailPage` + `AssignmentSection` is the shipped precedent for exactly this: a list plus an inline add-from-elsewhere control | **Chosen** |

Six pages, all `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}`:
`/checklist-questions`, `/checklist-questions/new`,
`/checklist-questions/:questionId/edit`, `/review-templates`,
`/review-templates/new`, `/review-templates/:templateId`. Static `new` outranks
the dynamic sibling in React Router regardless of declaration order — recorded
as a comment in the same style as the existing `/communities/new` block.

The detail page renders read-only for frozen versions. For a draft it also calls
`listReviewTemplates()` to find its lineage's current `active` version, so the
Activate `ConfirmDialog` copy can name the version being retired — the
"list-and-select" precedent from `InspectableElementEditPage`, adding **no new
API surface**. The available panel pre-filters by the template's frequency with
a "show all frequencies" toggle. `ReviewFrequency`, `ElementType` and `status`
all render through `Record<T, string>` label maps shipping *with* their pages;
`element-type-labels.ts` is **reused**, not duplicated.

## Data Flow — `POST /review-templates/:id/activate`

    AuthenticatedGuard → PermissionsGuard('reviewTemplate:activate') → Controller
         ▼ ActivateReviewTemplateUseCase
         │ 1. repo.findById(id) → null ⇒ 404 REVIEW_TEMPLATE_NOT_FOUND
         │ 2. entity.assertActivatable()  [pure domain: status must be 'draft']
         │      └ else ⇒ 409 REVIEW_TEMPLATE_NOT_EDITABLE  ✗ STOP
         │ 3. draftQuestionIds empty ⇒ 409 REVIEW_TEMPLATE_EMPTY  ✗ STOP (fast path)
         │ 4. idGenerator.generate() × N  → row ids (ADR-009)
         ▼ 5. repo.activate(id, rowIds)   ← ONE Serializable transaction
             ├ a. SELECT COALESCE(MAX(version),0)+1 FROM "ReviewTemplate" (lineage)
             ├ b. INSERT … SELECT … JOIN "ChecklistQuestion"   ← snapshot copied by
             │      the DB; questionText NOT NULL (Decisions 2/4)
             │      └ 0 rows ⇒ ROLLBACK ⇒ REVIEW_TEMPLATE_EMPTY
             ├ c. UPDATE … SET status='retired' WHERE lineage AND status='active'
             │      ← MUST precede (d): the partial unique index is per-statement
             ├ d. UPDATE … SET status='active', version=<a>, draftQuestionIds='{}'
             │      WHERE id=$id AND status='draft'   → 0 rows ⇒ ROLLBACK ⇒ 409
             └ COMMIT
             ↳ P2034 (serialization abort) or P2002 on the lineage index
               ⇒ TransactionConflictError ⇒ 409 REVIEW_TEMPLATE_ACTIVATION_CONFLICT
         ▼ 200 ReviewTemplateResponseDto (frozen path, Decision 5 — snapshot only)

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | `enum ReviewFrequency`, `enum ReviewTemplateStatus`, 3 models; `@@index` on `ReviewTemplateQuestion.templateId`; comment blocks flagging the Prisma-invisible indexes/FKs |
| `apps/api/prisma/migrations/<ts>_add_checklist_question/migration.sql` | Create | Enum + `ChecklistQuestion` table |
| `apps/api/prisma/migrations/<ts>_add_review_template/migration.sql` | Create | Status enum, 2 tables, 3 hand-written unique indexes (Decision 3), hand-written FK `ReviewTemplateQuestion.templateId → ReviewTemplate(id)` `ON DELETE RESTRICT`. **Delete any `DropForeignKey` Prisma emits for the 6 existing `@relation`-less FKs** |
| `.../checklist-question/domain/{review-frequency.ts,checklist-question.entity.ts,errors/**}` | Create | Decision 1/7 |
| `.../checklist-question/application/ports/{checklist-question.repository.port.ts,draft-selection-cleaner.port.ts}` | Create | Decision 6 |
| `.../checklist-question/application/use-cases/**` | Create | create / list / update / soft-delete (+ gated cleanup) + in-memory fakes |
| `.../checklist-question/infrastructure/persistence/**` | Create | Adapter (`extends SoftDeletableRepository`), mapper, `PrismaDraftSelectionCleaner`, `review-frequency-parity.integration.spec.ts`, migration guard spec |
| `.../checklist-question/presentation/**`, `checklist-question.module.ts` | Create | Controller, DTOs, error codes; **exports** `CHECKLIST_QUESTION_REPOSITORY` |
| `.../review-template/domain/{review-template.entity.ts,review-template-status.ts,review-template-question.ts,errors/**}` | Create | Status machine as pure guards (Decision 7) |
| `.../review-template/application/**` | Create | Port + 6 use cases + in-memory fake reproducing the two read paths |
| `.../review-template/infrastructure/persistence/**` | Create | Adapter with `activate()` (Decision 3/4) + two read paths (Decision 5) + parity/migration guard specs |
| `.../review-template/presentation/**`, `review-template.module.ts` | Create | Controller, DTOs, 5 error codes; imports `ChecklistQuestionModule` |
| `apps/api/src/app.module.ts` | Modify | Register both modules |
| `.../shared/application/authorization/permission.ts` | Modify | +9 permissions (Decision 8) |
| `.../auth/infrastructure/authorization/role-permission.checker.ts` | Modify | `SYSTEM_ADMIN` row only |
| `packages/validation/src/{checklist-question,review-template}/**` + `src/index.ts` | Create/Modify | `reviewFrequencySchema`, `reviewTemplateStatusSchema`, create/update/set-questions schemas |
| `apps/web/src/api/{checklist-question,review-template}.ts` | Create | Typed calls + mirrored error-code unions |
| `apps/web/src/{checklist-question,review-template}/**` | Create | `error-messages.ts` (status+code only), `review-frequency-labels.ts`, `template-status-labels.ts` |
| `apps/web/src/pages/{ChecklistQuestionsListPage,ChecklistQuestionCreatePage,ChecklistQuestionEditPage,ReviewTemplatesListPage,ReviewTemplateCreatePage,ReviewTemplateDetailPage}.tsx` | Create | 6 pages (Decision 9) |
| `apps/web/src/App.tsx` | Modify | 6 role-gated routes + ordering comment |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modify | Real `checklistQuestion.*` / `reviewTemplate.*` + label maps |
| `apps/api/test/{checklist-question,review-template}.e2e-spec.ts` | Create | Full lifecycle + auth matrix + concurrency |
| `docs/architecture/domain-model-inspections.md` | Modify | `text` is admin free text not an i18n key; close the wording-change open question with snapshot-on-freeze; document `draftQuestionIds` + `questionText`; record the `active`-flag deferral |

## Interfaces

```prisma
model ChecklistQuestion {
  id          String            @id @db.Uuid
  elementType ElementType
  frequencies ReviewFrequency[] // Decision 1 — enum array, not a join table
  text        String            // admin free text, rendered verbatim, never t()
  deletedAt   DateTime?         // ADR-010 — the SOLE off state
}

model ReviewTemplate {
  id               String              @id @db.Uuid
  elementType      ElementType
  frequency        ReviewFrequency
  name             String
  version          Int?                // NULL until activation (Decision 3)
  status           ReviewTemplateStatus
  // Decision 2: DRAFT-ONLY, ordered, live pointers. NEVER the audit record —
  // reset to '{}' inside the activation transaction.
  draftQuestionIds String[]            @db.Uuid
  createdAt        DateTime            @default(now())
  deletedAt        DateTime?           // drafts only; frozen versions are undeletable
}

// Decision 2: rows exist ONLY for activated/retired versions. `questionText`
// is NOT NULL, so "frozen version with no snapshot" is unrepresentable.
// `questionId` is PROVENANCE ONLY — never the source of displayed wording.
model ReviewTemplateQuestion {
  id           String @id @db.Uuid
  templateId   String @db.Uuid
  questionId   String @db.Uuid
  order        Int
  questionText String

  @@index([templateId])
}
```

```ts
// review-template/application/ports/review-template.repository.port.ts
export interface ReviewTemplateRepository {
  create(template: ReviewTemplate): Promise<void>;
  findById(id: string): Promise<ReviewTemplate | null>;
  findAll(): Promise<ReviewTemplate[]>;

  // Decision 5 — two paths, one DTO. The frozen query does NOT reference
  // "ChecklistQuestion"; the draft query resolves live text through the pool.
  findDraftWithLiveQuestions(id: string): Promise<TemplateWithQuestions | null>;
  findFrozenWithSnapshot(id: string): Promise<TemplateWithQuestions | null>;

  replaceDraftQuestions(id: string, questionIds: string[]): Promise<boolean>;

  // Decision 3/4 — ONE Serializable transaction: version, snapshot INSERT…
  // SELECT, retire predecessor, freeze. `rowIds` are app-generated UUIDv7s
  // (ADR-009). Rejects with TransactionConflictError on P2034/P2002.
  activate(id: string, rowIds: string[]): Promise<ActivationOutcome>;

  softDeleteDraftById(id: string): Promise<boolean>;
}
```

```ts
// checklist-question/application/ports/draft-selection-cleaner.port.ts
// Decision 6: owned by checklist-question, adapter raw-queries "ReviewTemplate".
// Exact analogue of community's InspectableElementCounter — this is what keeps
// the Nest module graph acyclic without forwardRef().
export interface DraftSelectionCleaner {
  removeQuestionFromDrafts(questionId: string): Promise<void>;
}
export const DRAFT_SELECTION_CLEANER = Symbol('DRAFT_SELECTION_CLEANER');
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (domain) | Status guards (`draft→active` ok; `active`/`retired` reject every mutation and re-activation); empty-selection rejection; duplicate-id rejection; entity stores values verbatim | Pure, table-driven |
| Unit (schema) | `reviewFrequencySchema` rejects unknowns; `frequencies` `.min(1)` rejects `[]`; `text`/`name` trimmed and non-empty | `packages/validation` tests |
| Unit (use case) | Cleanup **not** called when soft-delete returns `false`; activation stops before `activate()` on a frozen template; `PUT questions` rejects an id from another `elementType`; draft read uses the live path and frozen read the snapshot path (assert the pool port is **never called** on the frozen path) | In-memory fakes reproducing both read paths |
| Integration | Three hand-written unique indexes present in `pg_indexes` with their `WHERE` clauses; the FK in `pg_constraint`; the 6 pre-existing FKs survive; `questionText` is `NOT NULL`; **`ReviewFrequency`/`ReviewTemplateStatus` three-way parity**; **two concurrent `activate()` calls on one lineage ⇒ exactly one succeeds, the other raises `TransactionConflictError`, and exactly one `active` row remains** — a real two-connection race, not a vacuous sequential assertion | Real Postgres, cloning `maintenance-company-migration.integration.spec.ts` |
| E2E | Full lifecycle both modules; second draft ⇒ 409 `…DRAFT_EXISTS`; activate with 0 questions ⇒ 409 and **no version consumed**; discard a draft then activate ⇒ **no version gap**; `PUT`/`POST activate` on an `active` template ⇒ 409 `…NOT_EDITABLE`; **edit a question's text after activation ⇒ frozen response byte-identical, draft + pool show the new text**; **soft-delete a referenced question ⇒ 204, frozen version still renders it, draft no longer lists it**; cross-frequency pick accepted; 401/403 on all 10 routes; four non-admin rows still `[]` | `apps/api/test/*.e2e-spec.ts` |
| Component (web) | Empty-pool states on the list **and** the builder; frozen detail is read-only; Activate dialog names the retired version; **assert raw `QUARTERLY`/`draft`/`EXTINGUISHER` are absent from the DOM**; `error-messages.ts` differential test proving `.message` is never read; locale key-set parity | Vitest + RTL; `locales.test.ts` extends to both namespaces |
| Browser | Every UI success criterion incl. the **empty pool → first question → first template → activate** path and the post-activation edit divergence | `npm run dev` + `claude-in-chrome` (CLAUDE.md) |

## Migration / Rollout

Two additive migrations (Phase A: enum + `ChecklistQuestion`; Phase B: status
enum + 2 tables + 3 unique indexes + 1 FK). No existing table is reshaped, no
data is backfilled, **no seed data ships**. Nothing in this slice changes
existing behaviour — no cross-module guard, no signature change to a shipped
port, no widening of `coded-error.ts`.

Rollback = revert the branch and drop the two tables, the enums, the indexes and
the FK. Phase A reverts cleanly without Phase B; not the reverse.

## Open Questions

- [ ] **`sdd-spec` owns the cross-`elementType` selection rule.** Designed as
      *rejected* (a `QUARTERLY` question tagged for another element type cannot
      enter a template of a different type). Unreachable today — `EXTINGUISHER`
      is the only value — so it is a one-line guard with no e2e coverage
      possible. If spec says otherwise, delete the guard.
- [ ] **`sdd-spec` owns whether a frozen version records `activatedAt`.**
      Designed as **not shipped** — the proposal's model list enumerates
      `createdAt` only, and ADR-006 says defer. Flagged because "as of March
      2026" is the slice's own stated audit question and `version` ordering
      answers it only relatively. One nullable column if spec disagrees.
- [ ] Confirm at apply time that `prisma migrate dev --create-only` does not
      emit `DropForeignKey` for any of the **six** existing `@relation`-less
      FKs, nor `DropIndex` for the three existing hand-written indexes.
- [ ] Confirm at apply time that Prisma's `String[] @db.Uuid` maps to
      `UUID[]` (not `TEXT[]`) so `array_remove(…, $1::uuid)` and
      `unnest(…::uuid[])` type-check. If it does not, the column becomes
      `TEXT[]` and the casts drop — no structural change.

## Findings reported to the proposal

1. **`ElementType` does not need to move.** The proposal asked for a ruling.
   Answer: closed-catalog *types* cross module boundaries through
   `@sf-manager/validation` (already ADR-015-universal, and already how
   `element-type.ts` itself imports its gate type); only the owning module
   declares the `as const satisfies` const. `inspectable-element` is untouched
   and **no cross-module domain import is introduced anywhere** (Decision 1).
2. **A sixth error code is required**: `REVIEW_TEMPLATE_ACTIVATION_CONFLICT`
   (409) for the serialization-abort / partial-index-violation path. The
   proposal lists five. Without it a lost activation race is an untyped 500.
   Mirrors `community`'s existing `TransactionConflictError`.
3. **`ReviewTemplateQuestion` is not the domain doc's shape.** It gains
   `questionText NOT NULL` and *loses* its role as the draft's selection
   (which moves to `ReviewTemplate.draftQuestionIds`). The docs correction
   already in scope must cover both halves, not only the snapshot field.
4. **`ReviewTemplateStatus` is a fourth three-way declaration**, not named in
   the proposal's scope list. It needs its own Postgres enum, domain union, Zod
   schema, parity assertion and web label map — same shape as `ReviewFrequency`,
   roughly +40 lines across Phase B.

## Rules Applied

| Rule | Where |
|---|---|
| **ADR-006** walking skeleton | No `active` flag, no `activatedAt`, no per-locale text, no clone/restore/search/pagination, no second `ElementType`. VO call re-derived per field (Decision 7) |
| **ADR-006 addendum** — every slice ships its own minimal UI | Decision 9: six pages, one inline builder, nothing more |
| **ADR-008** — closed catalogs as hand-written unions | Decision 1: TS union first, Postgres enum second, for both new enums |
| **ADR-009** — UUIDv7 from the app | `idGenerator.generate()` for entities *and* for the snapshot rows; no `gen_random_uuid()` (Decision 4) |
| **ADR-010** — soft delete only | `extends SoftDeletableRepository`; `deletedAt IS NULL` in the draft read, the builder list and the snapshot `JOIN`; the filter is **never bypassed** — the frozen path does not read the pool at all |
| **ADR-011** — permissions in the rule table | 9 permissions, `SYSTEM_ADMIN` row only; `PermissionChecker.can` untouched |
| **ADR-013** — zero Prisma in domain | Hand-written entities + mappers; parity specs placed under `infrastructure/persistence/`; no `@relation`, hence hand-written FK/indexes |
| **ADR-015** — one validation source | Shared schemas consumed by the pipe, DTO types and every web form |
| **Coded-error convention** | Per-module local unions; a code only where a status has >1 reachable cause on the same call |
| **`forwardRef()` is not an answer** | Decision 6: one precedented import direction + one narrow consumer-owned port with its own adapter |
| **Prefer an atomic DB statement / transaction over check-then-act** | Decisions 3, 4, 6 — the `maintenance-company` PR7→PR8 lesson applied from day one |
| **Follow the existing pattern** | Serializable `$transaction` cloned from `PrismaUserRepository`; partial-index backstop cloned from `CommunityRepresentative`; inline picker cloned from `AssignmentSection`; list-and-select cloned from `InspectableElementEditPage` |
| **CLAUDE.md — Git & PR conventions** | `stacked-to-main`; `checklist-management/<NN>-<slug>`; `type(scope): PR N/M — …`; independent fresh-context review per PR |
| **CLAUDE.md — Verifying UI changes** | Browser row is mandatory, not optional |
