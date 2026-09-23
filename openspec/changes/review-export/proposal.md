# Proposal: Review Export — Sign and Print the Completed Review (FR-010, slice 1 of 2)

## Intent

FR-010 is `identified`. Today a reviewer can complete a session and anyone
in scope can read it back in review history, but **there is no document**:
nothing a property manager can print, file or forward as the signed record
of a maintenance visit. The completion step also does not tell the
reviewer that it is the act that makes the record final.

This slice closes that gap and only that gap:

1. **Signing becomes a conscious act.** The existing complete action is
   presented as **Sign and close**, with a confirmation that warns the
   review will be closed and can no longer be modified. The signer is the
   performer (`performedById`); the signing date is `completedAt`.
2. **A printable review document exists.** Every role that can read a
   completed session in review history can open its document and print it,
   or save it as PDF, through the browser.

Success looks like: a technician signs a session, opens its document,
sees the organization letterhead, the session data, every element with its
answers or its unreviewed reason, and a signature footer, and saves it as a
PDF from the browser's print dialog. No server-side file, no email.

Per ADR-006's 2026-08-25 addendum, the minimal web UI ships **in this
change**.

Context: `[[sdd/review-export/explore]]`,
`[[sdd/review-export/product-decisions]]`, `[[decision/fr-010-slicing]]`,
ADR-006, ADR-010, ADR-011, ADR-012, FR-008, FR-010, FR-013.

## Settled product decisions

Closed with the product owner before this proposal. Inputs, not open items.

| Decision | Resolution |
|---|---|
| **What "sign" means** | The existing complete action, made explicit. Button **Sign and close**; the confirmation warns that the review will be closed and can no longer be modified. No new status, no password re-entry, no typed name. Signer = `performedById`, signed at = `completedAt`. |
| **Who signs** | Unchanged: whoever performs the session (`MAINTENANCE_TECHNICIAN`, `COMMUNITY_REPRESENTATIVE`). "Responsable" = community representative. |
| **Who opens the document** | Exactly the five review-history (FR-008) scopes. Out of scope keeps the existing uniform `404`. Only `completed` sessions have a document. |
| **Export mechanism** | Browser print / save as PDF (`window.print()` + `@media print`), following `element-label-printing`. No server PDF, no PDF or headless-browser dependency, no email. |
| **Document contents** | Organization letterhead; session data (community, element type, frequency / template, dates, maintenance company when present); every element with its answers (snapshotted wording) or its unreviewed reason and observations; signature footer with signer and signing date. |
| **Blank organization profile** | Still printable. An on-screen, non-printed warning shows whenever any of the six letterhead fields is blank. The letterhead prints the fields that are filled; it is omitted entirely only when all six are blank. |
| **Sessions completed before this change** | Treated as signed by their performer at `completedAt`. No backfill. |

## Scope

### In Scope

- **Signing (UI only)**: relabel the complete action to **Sign and close**
  and reword its confirmation in `en`/`es`/`ca`. The completion write path,
  its preconditions and the immutability rule are **unchanged**.
- **Document read (API)**: one scoped, read-only request that returns
  everything the document needs as JSON — the recorded session, the
  reference labels non-admin roles cannot read today (community, template
  element type and frequency, maintenance company) and the letterhead.
  Guarded by the existing `reviewSession:read` and the existing
  review-history scope resolution.
- **Document page (web)**: a printable view of that data, a print action,
  print stylesheet rules, the non-printed blank-profile warning, and one
  entry link from the history session view.
- **Docs**: `domain-model-inspections.md` note that signing is completion
  (no `signed` status); FR-010 → `partial` in
  `docs/requirements/functional-requirements.md` in the change's final PR.
- Unit, integration and E2E tests covering all five scopes and the `404`
  path, plus browser verification of every UI criterion (CLAUDE.md).

### Out of Scope

- **Signature image** — slice 2 (planned next change): per-reviewer
  signature upload, file storage (shared with the deferred organization
  logo), and a snapshot onto the session at signing time so later changes
  never alter old documents.
- **Email or any in-app sending** — FR-009 territory; no outbound
  communication infrastructure exists.
- **Server-side PDF**, file download endpoint, logo.
- **`MANAGER` capability routes** (e.g. `MANAGE_ORGANIZATION_PROFILE`).
- **Reviewer-chosen locale for the document — deviation from ADR-007,
  recorded here.** ADR-007 (`docs/adr/ADR-007-i18n-multilanguage-ui-english-codebase.md:31-36`)
  wants a legal report rendered in the reviewer's chosen locale, but no
  persisted user-locale preference exists anywhere in the system yet. In
  slice 1 the document renders in the **viewer's** current UI locale
  (`en`/`es`/`ca`), with dates formatted by a new web date-formatting
  helper (`Intl.DateTimeFormat`, fixed `Europe/Madrid` time zone, so the
  signing date cannot shift by the viewer's own time zone). Rendering in
  the reviewer's own locale is deferred until a persisted user-language
  preference exists.
- **Admin reopen of a signed review — discarded, not deferred.** Completed
  sessions are immutable for every role, `SYSTEM_ADMIN` included
  (*Completed Sessions Are Immutable*, ADR-010). Reopening would break
  RIPCI's five-year documentary retention and create two versions of a
  signed document. Corrections are a new session.

## Capabilities

### New Capabilities

- `review-document`: the scoped, read-only document read — five scopes,
  completed-only, uniform `404`, reference labels and letterhead composed
  server-side, returned as data; no file, PDF or email artifact.
- `review-document-ui`: the printable document page — contents, signature
  footer, print action and stylesheet, blank-profile warning, entry link,
  i18n.

Naming: the capability is named for what ships (a document), not "export",
because an export endpoint is exactly what it forbids. The change slug
stays `review-export`.

### Modified Capabilities

- `review-session-management`: completion is defined as the signing act
  (signer = performer, signed at = `completedAt`); the FR-010 row of
  *Adjacent Review Capabilities Are Not Introduced* is narrowed — a `signed`
  status stays forbidden, document generation moves to `review-document`.
- `review-session-ui`: *Complete a Session and Explain Its Gaps* gains the
  **Sign and close** label and the irreversibility warning; *No Offline,
  History or Scheduling Surface* allows completion as the only signing
  control and explicitly forbids any document link, print, download or
  send control in the field flow.
- `review-history-ui`: *Read-Only Historical Session View* and *No
  Filtering, Analytics or Adjacent Controls Ship* forbid "sign, export"
  controls; narrowed to allow **one** non-mutating link to the document.
- `review-history`: the Purpose deferral of "signing, export" is lifted by
  cross-reference; no requirement weakened. Its "exactly two actor-unscoped
  methods" guard must still hold.
- `organization-profile-management`: *An Incomplete Profile Blocks Nothing*
  says no other module reads the profile; narrowed to exactly one consumer,
  the document read, still with no completeness gating.
- `authorization`: *The Organization Profile Grants Nothing Beyond Itself*
  says no other permission family may be widened to reach the profile;
  narrowed to exactly one exception — the document read returns the six
  letterhead fields (never `id`/`logoAssetId`) to any caller already
  holding `reviewSession:read`, through the scoped document read only,
  with no new permission, `Permission` member or `ROLE_PERMISSIONS` grant.

`app-navigation`: none expected.

## Approach

Three proposal-level choices:

1. **Signing is copy, not state.** The confirm dialog already exists in
   `ReviewSessionDetailPage.tsx` and already says the session cannot be
   edited. The change is wording plus the button label. `ConfirmDialog`
   has no confirm-label prop today; adding one is the only component
   change.
2. **One composed server read, not N client reads.** Evidence: the
   history detail response carries only `communityId`, `templateId` and
   `performedByEmail`; `organizationProfile:read` is granted to
   `SYSTEM_ADMIN` only. A single scoped read lets **one** authorization
   decision, the history scope, govern the whole document, and leaves the
   organization profile's own endpoint permission untouched.
3. **Print exactly like labels.** Dedicated page, `@media print`,
   `[data-print-hide]` for screen-only chrome, following
   `InspectableElementLabelPage`.

### Deferred to `sdd-spec` / `sdd-design` — all resolved

- Route and read — **resolved (design Decisions 5, 6)**: new
  `GET /review-history/:sessionId/document` and a new page; the history
  detail page and DTO are unchanged apart from the one link.
- Module and profile access — **resolved (design Decisions 1, 3)**: the
  read lives in `review-session`; it reaches the profile through a
  read-only `OrganizationProfileReader` port bound with `useExisting`.
- Soft-deleted community or company labels — **resolved (spec
  `review-document`, design Decision 4)**: named through a module-local,
  soft-delete-inclusive lookup; elements through a soft-delete- and
  deactivation-inclusive one.

## Proposal question round

Surfaced by evidence after the product round. All three were answered by
the user on 2026-09-23 and are now settled.

| # | Question | Decision |
|---|---|---|
| 1 | **Signer identity.** `User` has no name field, only `email`. What identifies the signer in the footer? | **Performer's email** in slice 1. The signer's full name moves to slice 2, which becomes "signer identity": full name and signature image, registered together. |
| 2 | **Live vs frozen reference data.** Community name, company name and letterhead are read live, so a reprint after a rename shows the new values. Answers, wording, signer and dates are already frozen. | **Accepted for slice 1.** Snapshotting these values on signing arrives with slice 2, together with the signature image snapshot. |
| 3 | **What the reviewer sees right after signing.** | ~~The completed session in read-only mode with **one "View document" link** to the printable page. No auto-open and no print control there.~~ **Superseded 2026-09-23** — see *Representative reassignment* below: the field-flow session page gets no document link at all; the reviewer sees the completed session read-only with no link, and reaches the document only through review history. |

**Representative reassignment (superseded Q3, decided 2026-09-23).** The
"View document" link ships **only** on the review-history detail view
(`review-history-ui`), never on the field-flow
`ReviewSessionDetailPage`. Reason: a representative who is later
unassigned from the community would still see the link on the field-flow
page — but that read is **performer-scoped**, not history-scoped, so
following it would land on a uniform `404` for a document that exists
and that the history-scoped read would still show correctly. The history
view already applies the right scope, so it is the only host for the
link. This is a slice-1 UX gap for a performer who signs, then loses
access before reading the document again from the field flow; deferred
as an open question (performer-retained access), not solved here.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/api/src/modules/review-session/**` | New/Modified | Document use case, shared history-entries helper, entry-order comparator, name-directory port + Prisma adapter + in-memory fake, controller route, response DTO |
| `apps/api/src/modules/organization-profile/**` | Modified | Read-only `OrganizationProfileReader` port, `useExisting` binding (port wiring only) |
| `apps/api/test/review-history.e2e-spec.ts` | Modified | Two provider overrides and the document `describe` block |
| `apps/web/src/pages/ReviewSessionDetailPage.tsx` | Modified | **Sign and close** label and dialog copy only — no document link (superseded question 3) |
| `apps/web/src/components/ConfirmDialog.tsx` | Modified | Optional confirm-label prop |
| `apps/web/src/pages/ReviewHistoryDetailPage.tsx` | Modified | The only "View document" link |
| `apps/web/src/pages/ReviewDocumentPage.tsx` | New | Printable document |
| `apps/web/src/organization-profile/is-profile-incomplete.ts` | New | Shared `isProfileIncomplete` predicate, extracted from `OrganizationProfilePage` |
| `apps/web/src/review-session/format-date.ts` | New | Date and date-time formatting, fixed `Europe/Madrid` |
| `apps/web/src/pages/OrganizationProfilePage.tsx` | Modified | Uses the extracted predicate, behaviour-preserving |
| `apps/web/src/api/review-history.ts` | Modified | Document read client |
| `apps/web/src/routes/authenticated-routes.tsx` | Modified | One route, five history roles |
| `apps/web/src/index.css` | Modified | Print rules for the document |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Sign dialog and document keys |
| `apps/web/src/i18n/locales.test.ts` | Modified | `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` existence list |
| `docs/architecture/domain-model-inspections.md` | Modified | Signing = completion note |
| `docs/requirements/functional-requirements.md` | Modified | FR-010 → `partial` (final PR) |

No schema change and no migration.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Document read widens scope or leaks existence (non-`404` for out-of-scope) | Med | Reuse the history scope resolution; E2E across all five scopes plus ungranted `MANAGER` |
| A third actor-unscoped repository method appears | Med | Spec restates the *History Scope Is Carried by the Query* bound |
| Scope creep to PDF library, email or signature image | High | Explicit non-goals; `sdd-verify` checks manifests and API surface |
| Signer shown as email reads as weak for a compliance document | Med | Accepted (question 1); slice 2 adds full name and signature image |
| Reprint shows renamed community or updated letterhead | Med | Accepted for slice 1 (question 2); slice 2 snapshots on signing |
| Browser print layout differs across browsers | Low | Same approach already accepted for labels; browser verification |

## Size estimate

Large. About 3,600 changed lines, counting tests, dense comments and
three locales. That is well above the 400-line budget. Stacked-to-main,
14 PRs of about 400 lines or fewer each, identical to design.md
*Migration / Rollout*:

1. Sign copy
2. History helper extraction
3. Reader port and name-directory port, with fakes
4. Prisma name directory and its integration spec
5. Use case core
6. Entry and answer ordering
7. API wiring, e2e overrides and the first test-first cases
8. E2E scope matrix (characterization coverage)
9. Web helpers (date formatting, shared predicate)
10. Page shell
11. Header regions
12. Record and print
13. "View document" link
14. Docs and archive

## Rollback Plan

Revert the chain's PRs. There is no schema change, no migration and no
new persisted state, so reverting restores current behaviour verbatim;
completed sessions are untouched either way. The chain reverts in
reverse order — the last-merged PR first, back to the first — since each
later PR builds on what the earlier ones shipped.

## Dependencies

- None new. Reuses `reviewSession:read`, the review-history scope checkers,
  the organization-profile repository, `ConfirmDialog`, `apiFetch` /
  `ApiError`, and the label-printing print pattern.
- A running dev server and users for all five history roles for browser
  verification.

## Success Criteria

- [ ] The complete action reads **Sign and close**; its confirmation warns
      that the review will be closed and can no longer be modified.
- [ ] Completion preconditions, the resulting `completed` status and
      immutability are unchanged; no `signed` status exists.
- [ ] Each of the five history scopes opens and prints the document of an
      in-scope completed session.
- [ ] Out-of-scope, nonexistent and draft sessions return the same `404`
      as the history read; an ungranted `MANAGER` gets `404`.
- [ ] The document shows letterhead, session data, every entry with
      snapshotted wording or its reason and observations, and a signature
      footer with signer and `completedAt`.
- [ ] A session completed before this change prints with its performer as
      signer.
- [ ] With any letterhead field blank, the screen shows a warning that
      does not appear in print; the letterhead prints the filled fields
      and is omitted entirely only when all six are blank.
- [ ] `GET /organization-profile` is still `SYSTEM_ADMIN`-only.
- [ ] No PDF or headless-browser dependency, no file-returning endpoint,
      no email code.
- [ ] Zero hardcoded strings; real `en`/`es`/`ca` values.
- [ ] Suites, lint and build pass; every UI criterion is
      **browser-verified**.

## Next step

Run `sdd-tasks`. The spec and design are written, and the three questions
in *Proposal question round* are settled.
