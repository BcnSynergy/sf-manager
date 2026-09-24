# Tasks: Review Export — Sign and Print the Completed Review (FR-010, slice 1 of 2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3,600 (design.md Migration/Rollout) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → ... → PR 14 (stacked-to-main, per design.md) |
| Delivery strategy | ask-on-risk (user pre-selected chained PRs) |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

User decision (2026-09-23): keep the full 14-PR chain from design.md, including PR 8
(e2e characterization coverage). No PR dropped, merged or reordered.

### Suggested Work Units

| Unit | Goal | PR | Notes |
|---|---|---|---|
| 1 | Sign copy + commit planning artifacts | PR 1 | Base: main. ~150 lines |
| 2 | History helper extraction | PR 2 | Base: PR 1 branch. ~280 lines |
| 3 | Reader + name-directory ports, fakes | PR 3 | Base: PR 2 branch. ~280 lines |
| 4 | Prisma name directory + integration spec | PR 4 | Base: PR 3 branch. ~300 lines |
| 5 | Use case core | PR 5 | Base: PR 4 branch. ~380 lines |
| 6 | Entry/answer ordering | PR 6 | Base: PR 5 branch. ~200 lines |
| 7 | API wiring + first e2e cases | PR 7 | Base: PR 6 branch. ~360 lines |
| 8 | E2E scope matrix (characterization) | PR 8 | Base: PR 7 branch. ~350 lines. Not test-first (IS the test suite) |
| 9 | Web helpers | PR 9 | Base: PR 8 branch. ~200 lines |
| 10 | Page shell | PR 10 | Base: PR 9 branch. ~300 lines |
| 11 | Header regions | PR 11 | Base: PR 10 branch. ~350 lines |
| 12 | Record and print | PR 12 | Base: PR 11 branch. ~350 lines |
| 13 | "View document" link + browser pass | PR 13 | Base: PR 12 branch. ~100 lines |
| 14 | Docs + archive | PR 14 | Base: PR 13 branch. ~40 lines + archive |

Every PR except PR 8 is test-first (RED → GREEN). PR 8 IS the characterization test
suite locking behaviour PR 7 already ships, so it has no separate RED/GREEN split.

## PR 1 — Sign copy (~150 lines)

- [x] 1.1 Commit currently-untracked planning artifacts: `proposal.md`, `design.md`,
      `specs/**`, `tasks.md` under `openspec/changes/review-export/`
- [x] 1.2 RED: add/extend `ConfirmDialog.test.tsx` asserting `confirmLabel?` prop
      renders and defaults to `t('common.confirm')` — spec: review-session-ui
      *Complete a Session and Explain Its Gaps*
- [x] 1.3 GREEN: add `confirmLabel?: string` to `apps/web/src/components/ConfirmDialog.tsx`
- [x] 1.4 RED: extend `ReviewSessionDetailPage.test.tsx` asserting the complete
      button reads "Sign and close" and the dialog warns the review closes and
      cannot be modified — spec: review-session-ui *Complete a Session and
      Explain Its Gaps*; review-session-management *Completion Is the Signing Act*
- [x] 1.5 GREEN: update `apps/web/src/pages/ReviewSessionDetailPage.tsx` label
      and dialog copy only — no document link (design Decision 6)
- [x] 1.6 Update `apps/web/src/i18n/locales/{en,es,ca}.json` `reviewSession.detail.complete*`
      values; verify `locales.test.ts` parity still passes

## PR 2 — History helper extraction (~280 lines)

- [x] 2.1 RED: `review-history-entries.spec.ts` asserting `buildHistoryEntries`
      maps entries in the order given, sorts answers only when `answerOrder`
      is passed — design Decision 2
- [x] 2.2 GREEN: create `apps/api/.../review-session/application/use-cases/review-history-entries.ts`
      with `ReadReviewHistoryEntry` moved in, `buildHistoryEntries(entries, codeByElementId, answerOrder?)`
- [x] 2.3 GREEN: `read-review-history.use-case.ts` calls the helper, re-exports
      `ReadReviewHistoryEntry`; no behaviour change
- [x] 2.4 Verify `read-review-history.use-case.spec.ts` is green unchanged — spec:
      review-document *The history read-back is unchanged*

## PR 3 — Reader + name-directory ports, fakes (~280 lines)

- [x] 3.1 RED: organization-profile module spec asserting `ORGANIZATION_PROFILE_READER`
      and `ORGANIZATION_PROFILE_REPOSITORY` resolve to one instance — spec:
      review-document *The Organization Profile Gains One Reader, Not a Wider
      Endpoint*; authorization *The Organization Profile Grants Nothing Beyond
      Itself* (narrowed exception)
- [x] 3.2 GREEN: create `organization-profile.reader.port.ts`
      (`OrganizationProfileReader { get() }`); `OrganizationProfileRepository extends` it
- [x] 3.3 GREEN: `organization-profile.module.ts` binds reader via `useExisting`,
      exports only the reader — spec: organization-profile-management
      *An Incomplete Profile Blocks Nothing* (narrowed to one consumer)
- [x] 3.4 RED: `in-memory-review-document-name-directory.spec.ts` asserting
      soft-delete-inclusive community/company lookup and soft-delete- and
      deactivation-inclusive element lookup — spec: review-document
      *Deleted context still labels the document*
- [x] 3.5 GREEN: create `review-document-name-directory.port.ts` (not exported)
      and `testing/in-memory-review-document-name-directory.ts` fake

## PR 4 — Prisma name directory (~300 lines)

- [x] 4.1 RED: `prisma-review-document-name-directory.integration.spec.ts` (real
      Postgres, `test:integration --runInBand`) asserting soft-deleted community
      and company still named, deactivated and soft-deleted elements identified,
      unknown id resolves absent, one batched query — spec: review-document
      *A decommissioned or soft-deleted element still labels its entry*,
      *An element id with no row falls back to the neutral label*
- [x] 4.2 GREEN: create `prisma-review-document-name-directory.ts` implementing
      `ReviewDocumentNameDirectory` (not yet bound in the module)

## PR 5 — Use case core (~380 lines)

- [x] 5.1 RED: `read-review-document.use-case.spec.ts` — rejection issues no
      template/name/email/profile read — spec: review-document *Inclusive Name
      Lookups Run Only Inside the Scope Gate*, *A rejected read issues no name
      lookup*
- [x] 5.2 RED: same spec — lookups use only identifiers from the loaded session
      — spec: *Lookups use only identifiers from the loaded session*
- [x] 5.3 RED: same spec — labels, `''` fallbacks, `null` company, signer =
      performer, six letterhead keys only — spec: review-document *Read the
      Review Document of One Completed Session*, *A session without an
      attributed company has no company*, *A blank profile does not block the
      document*, *A session completed before this change is signed by its
      performer*, *The document exposes only the letterhead fields*
- [x] 5.4 GREEN: create `read-review-document.use-case.ts` — gate first via
      `loadCompletedForActor` (design Decision 1), then `findFrozenWithSnapshot`,
      name-directory batched lookup, `buildHistoryEntries` + enrichment,
      `userDirectory.findEmailsByIds`, `profileReader.get()`
- [x] 5.5 Wire `ReadReviewDocumentResult`/`ReviewDocumentEntry` interfaces per
      design Interfaces/Contracts

## PR 6 — Entry and answer ordering (~200 lines)

- [x] 6.1 RED: `review-document-entry-order.spec.ts` — code ascending, code-less
      last, ties by `recordedAt` then entry `id` — spec: review-document
      *Entries and answers are returned in a deterministic order*
- [x] 6.2 GREEN: create `review-document-entry-order.ts` exporting
      `compareDocumentEntries(elements)`
- [x] 6.3 GREEN: use case sorts a copy of `session.entries` before calling
      `buildHistoryEntries` with `answerOrder` from the frozen template

## PR 7 — API wiring + first e2e cases (~360 lines)

- [x] 7.1 RED: `review-history.e2e-spec.ts` new `describe` block — technician
      reads full document body 200 — spec: review-document *The document
      carries all four parts*, *Each of the five scopes reads an in-scope
      document* (technician case)
- [x] 7.2 RED: same block — out-of-scope, nonexistent, draft all `404
      REVIEW_SESSION_NOT_FOUND` — spec: *Out-of-scope, nonexistent and draft
      are indistinguishable*
- [x] 7.3 GREEN: create `review-document-response.dto.ts` (DTO + entry +
      template + letterhead DTOs, reusing `ReviewSessionEntryAnswerDto`/
      `ReviewHistoryQuestionDto`)
- [x] 7.4 GREEN: add `GET /review-history/:sessionId/document` to
      `review-history.controller.ts` — `@RequirePermission('reviewSession:read')`,
      shared `mapError` — spec: review-document *Document Visibility Is
      Exactly the Review-History Scope*
- [x] 7.5 GREEN: `review-session.module.ts` — import `OrganizationProfileModule`,
      register two providers, no new exports
- [x] 7.6 GREEN: `buildApp` e2e harness gains
      `REVIEW_DOCUMENT_NAME_DIRECTORY` → `InMemoryReviewDocumentNameDirectory`
      and `ORGANIZATION_PROFILE_REPOSITORY` → `InMemoryOrganizationProfileRepository`
      overrides

## PR 8 — E2E scope matrix, characterization coverage (~350 lines)

Not test-first: this PR is the test suite that locks behaviour PR 7 already ships.

- [x] 8.1 Representative, company manager, `SYSTEM_ADMIN`, `MANAGER` holding
      `VIEW_ALL_REVIEWS` each read their in-scope document 200 — spec:
      review-document *Each of the five scopes reads an in-scope document*
      (remaining four)
- [x] 8.2 Ungranted `MANAGER` gets 404, no repository read issued — spec:
      *An ungranted manager reads no document*
- [x] 8.3 Deactivated representative loses the document 404 — spec:
      *A deactivated representative loses the document*
- [x] 8.4 Representative who signed then was unassigned gets 404 — spec:
      *A representative who signed loses the document after reassignment
      (accepted for slice 1)*
- [x] 8.5 Unauthenticated request 401 — spec: review-history
      *The Review Document Read Inherits the Session-Level History Guards*
- [x] 8.6 Document/history-detail parity for every caller — spec:
      *Document and history detail agree for every caller*
- [x] 8.7 Blank profile 200, all six letterhead fields empty string, no
      completeness flag — spec: *A blank profile does not block the document*
- [x] 8.8 Document exposes exactly six letterhead keys, no `id`/`logoAssetId`
      — spec: *The document exposes only the letterhead fields*
- [x] 8.9 `GET /organization-profile` still 403 for every non-admin role —
      spec: *The profile endpoint stays admin-only*; authorization
      *The Organization Profile Grants Nothing Beyond Itself*
- [x] 8.10 Assert `Permission` union and `ROLE_PERMISSIONS` unchanged — spec:
      *No permission is added*

## PR 9 — Web helpers (~200 lines)

- [x] 9.1 RED: `format-date.test.ts` — identical output across runtime time
      zones, in `en`/`es`/`ca`, across a DST boundary — spec: review-document-ui
      *Dates render in a fixed time zone regardless of the viewer's own*
- [x] 9.2 GREEN: create `apps/web/src/review-session/format-date.ts`
      (`Intl.DateTimeFormat`, fixed `Europe/Madrid`, date and date-time `HH:mm`)
      — spec: *The signing date shows both date and time*
- [x] 9.3 RED: `is-profile-incomplete.test.ts` — true when any of the six
      fields is blank
- [x] 9.4 GREEN: create `apps/web/src/organization-profile/is-profile-incomplete.ts`;
      update `OrganizationProfilePage.tsx` to use it, behaviour-preserving

## PR 10 — Page shell (~300 lines)

- [x] 10.1 GREEN: `apps/web/src/api/review-history.ts` — add `ReviewDocument`
      type and `readReviewDocument` client
- [x] 10.2 RED: `authenticated-routes.test.tsx` — route restricted to the five
      history roles, unauthenticated redirected to `/login` — spec:
      review-document-ui *The Document Page Is Gated on the Five History Roles*
- [x] 10.3 GREEN: add route to `authenticated-routes.tsx`
- [x] 10.4 RED: `ReviewDocumentPage.test.tsx` — loading indicator while in
      flight; uniform message for nonexistent/out-of-scope/draft 404, not
      folded with network/5xx — spec: *Loading and Unreachable States*
- [x] 10.5 GREEN: create `apps/web/src/pages/ReviewDocumentPage.tsx` — client
      fetch, loading state, `mapApiErrorToMessageKey` for network/5xx, uniform
      404 message otherwise (page still URL-only until PR 13)
- [x] 10.6 Add `reviewDocument.*` loading/unreachable keys to
      `apps/web/src/i18n/locales/{en,es,ca}.json` and `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS`
      in `locales.test.ts`

## PR 11 — Header regions (~350 lines)

- [x] 11.1 RED: `ReviewDocumentPage.test.tsx` — letterhead renders only
      non-blank fields; warning shown iff any field blank, omitted from print
      — spec: review-document-ui *A Blank or Incomplete Profile Still Prints*
- [x] 11.2 GREEN: render letterhead region using `isProfileIncomplete`,
      `data-print-hide` warning
- [x] 11.3 RED: session-data region — community name, localized element type
      and frequency, template name/version, dates, company line omitted when
      absent — spec: *Document Page Content* (session data row)
- [x] 11.4 GREEN: render session-data region using `mapElementTypeToLabelKey`/
      `mapReviewFrequencyToLabelKey`, `format-date.ts`
- [x] 11.5 RED: signature footer — "signed by" + email + `completedAt` as
      date-time — spec: *Document Page Content* (signature footer)
- [x] 11.6 GREEN: render signature footer; defensive-fallback empty string
      renders localized placeholder, not a blank cell — spec: *A
      defensive-fallback empty value renders a placeholder, not a blank cell*
- [x] 11.7 Add corresponding `reviewDocument.*` keys to all three locale files
      and `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS`

## PR 12 — Record and print (~350 lines)

- [x] 12.1 RED: entries render in server order, deactivated/soft-deleted
      element shows real identity, unresolved element shows neutral label,
      zero entries renders no entry and no error — spec: review-document-ui
      *A decommissioned or soft-deleted element renders its real identity*,
      *An element with no resolvable row renders a neutral label*,
      *A completed session with zero entries still renders*, *Entries are
      rendered in the server's deterministic order*
- [x] 12.2 GREEN: render record region — no client-side hide/sort/truncate
- [x] 12.3 RED: one print control opens `window.print()`; printed output
      excludes navigation, print control and warning — spec: *Print Through
      the Browser, Document Only*
- [x] 12.4 GREEN: add print control; `.review-document-print` rules in
      `apps/web/src/index.css` existing `@media print` block
- [x] 12.5 RED: page offers no edit/reopen/answer/complete/download/email/share
      control — spec: *The Document Page Offers No Other Action*
- [x] 12.6 Verify enum/answer/unreviewed values render through localized
      labels, never raw — spec: *Enum values are never rendered raw*
- [x] 12.7 Add remaining `reviewDocument.*` keys (record, print, neutral
      element label) to all three locales and the required-key list

## PR 13 — "View document" link + browser pass (~100 lines)

- [ ] 13.1 RED: `ReviewHistoryDetailPage.test.tsx` — link reaches the
      document page for all five history roles; no link on `draft` sessions
      — spec: review-document-ui *Exactly One Entry Link Reaches the
      Document Page*, *The history view reaches its session's document*
- [ ] 13.2 GREEN: add the one "View document" link to
      `apps/web/src/pages/ReviewHistoryDetailPage.tsx`
- [ ] 13.3 Verify `ReviewSessionDetailPage` still offers no document link and
      signing does not auto-open it — spec: *The field flow offers no
      document link*, *Signing does not auto-open the document*
- [ ] 13.4 Add link label key to all three locales
- [ ] 13.5 Browser-verify (per CLAUDE.md, `npm run dev` + `claude-in-chrome`):
      sign-and-close flow, all five roles opening the document, print preview
      with blank and filled profile, uniform 404 for out-of-scope/nonexistent/
      draft, dev-server golden path and edge cases from this spec set

## PR 14 — Docs and archive (~40 lines + archive)

- [ ] 14.1 Update `docs/architecture/domain-model-inspections.md` — signing is
      completion, no `signed` status
- [ ] 14.2 Update `docs/requirements/functional-requirements.md` — FR-010
      `identified` → `partial` (slice 2 = signer identity pending)
- [ ] 14.3 Run `sdd-verify` against this change's specs and apply-progress
- [ ] 14.4 `sdd-archive review-export`

## Rules Applied

- Every PR compiles and keeps all suites green at merge (design.md
  Migration/Rollout).
- Chain reverts in reverse order (14 → 1) per proposal Rollback Plan.
- No task in this file adds a `Permission`, `ROLE_PERMISSIONS` grant, schema
  change, migration, PDF/headless-browser/mailer dependency, or email/download/
  share control — all forbidden by review-document *No Server-Generated
  Document Artifact and No Delivery*.
