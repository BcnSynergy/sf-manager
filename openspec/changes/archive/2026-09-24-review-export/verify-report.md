# Verify Report: review-export

Mirrors Engram `sdd/review-export/verify-report` (#328).

**Change**: review-export (FR-010 slice 1 of 2)
**Verified against**: main @ e1d0570 (code). The shared worktree was on `review-export/14-docs` @ 5143dbc during the run. `git diff e1d0570 5143dbc` touches only docs/architecture/domain-model-inspections.md, docs/requirements/functional-requirements.md and openspec/changes/review-export/tasks.md, so the code under test is identical to main.
**Mode**: Strict TDD (ADR-016)
**Artifacts read**: proposal.md, design.md, tasks.md, specs/** (8 deltas), Engram apply-progress #319, deferred-review-notes #321, browser-pass #327
**Verdict**: PASS WITH WARNINGS. 0 CRITICAL, 5 WARNING, 7 SUGGESTION. Ready for sdd-archive once PR 14 docs (14.1/14.2) merge.

### Completeness
| Metric | Value |
|---|---|
| Tasks total | 74 (PR 1-14) |
| Complete on main | 70 (PR 1-13, 13.5 browser pass included) |
| In progress (not implementation) | 14.1, 14.2 (written on `review-export/14-docs`, commits 888cfee + 5143dbc, not yet merged), 14.3 (this report), 14.4 (archive) |
| Incomplete implementation tasks | 0 |

### Build and test execution
| Command | Result |
|---|---|
| `npm run test --workspace=apps/api` | 123 suites / 969 tests passed, exit 0 |
| `npm run test:e2e --workspace=apps/api` | 11 suites / 394 tests passed, exit 0. `app.e2e-spec.ts` health check passed; the DB is live |
| Single integration spec `prisma-review-document-name-directory.integration.spec.ts` (`--runInBand`) | 11/11 passed. The spec deletes its own rows in `afterEach`. The full `test:integration` suite was NOT run, per instructions |
| `npm run test --workspace=apps/web` | 59 files / 938 tests passed, exit 0 |
| API eslint (run as `npx eslint "{src,apps,libs,test}/**/*.ts"`; the npm script uses `--fix`, so it was avoided) | 0 errors, 4 warnings, all in the unrelated, pre-existing `auth/presentation/auth.controller.spec.ts` |
| API type-check `npx tsc --noEmit -p tsconfig.build.json` | 0 errors. Used instead of `npm run build`, whose `prisma generate` step can hit a file lock against a running dev server |
| `npm run lint --workspace=apps/web` | 0 errors, 0 warnings |
| `npm run build --workspace=apps/web` | Passed. Only the pre-existing >500 kB chunk advisory |
| Coverage (API, changed use-case files) | read-review-document.use-case.ts 97.4% lines (uncovered: line 113, the defensive missing-template throw); review-document-entry-order.ts 100% lines / 77.8% branches; review-history-entries.ts 100% lines; in-memory name directory 100%. Web coverage was skipped because no @vitest/coverage package is installed |

### Spec compliance matrix
Evidence key: UT = API unit (Jest), IT = integration (real Postgres), E2E = `apps/api/test/review-history.e2e-spec.ts` document blocks (from line 3200), WT = web Vitest, BR = browser pass 13.5 (tasks.md), ST = static inspection.

**review-document** (30 scenarios)
| Scenario | Evidence | Result |
|---|---|---|
| The document carries all four parts | E2E "a technician reads the full document body…" (full `toEqual` body); UT "carries labels, … six letterhead keys" | COMPLIANT |
| The recorded record matches the history read-back | Shared `buildHistoryEntries` (UT review-history-entries.spec, 6 tests); E2E parity compares status only | PARTIAL (W-3) |
| Element identity may differ from history read-back | IT deactivated/soft-deleted elements identified; history's active-only neutral label covered by pre-existing tests; no single test compares both | PARTIAL (W-3) |
| Entries and answers in deterministic order | UT review-document-entry-order.spec (5 cases incl. code-less ties); UT use-case "orders entries by element code…"; E2E body order | COMPLIANT |
| The history read-back is unchanged | `read-review-history.use-case.spec.ts` and the history DTO untouched by the chain (empty git diff), green | COMPLIANT |
| A session without an attributed company has no company | UT "…a null company…" | COMPLIANT |
| Deleted context still labels the document | IT names soft-deleted community and company; PrismaUserDirectory.findEmailsByIds is soft-delete-inclusive (ST) | COMPLIANT |
| A decommissioned or soft-deleted element still labels its entry | IT "identifies a soft-deleted/deactivated element…" | COMPLIANT |
| An element id with no row falls back to the neutral label | IT "absent from the map"; UT elementCode null; WT neutral label | COMPLIANT |
| A blank profile does not block the document | E2E blank-profile block (200, six empty strings, no flag); UT | COMPLIANT |
| A session completed before this change is signed by its performer | UT signer = performer, signing date = completedAt; no migration (ST) | COMPLIANT |
| Reading the document changes nothing | ST only: GET route, and every port called is read-only | UNTESTED, statically correct (W-3) |
| Each of the five scopes reads an in-scope document | E2E technician test + `it.each` for the 4 other scopes | COMPLIANT |
| Document and history detail agree for every caller | E2E `it.each` over 7 caller/session pairs (status parity) | COMPLIANT |
| Out-of-scope, nonexistent, draft indistinguishable | E2E "…are all 404 REVIEW_SESSION_NOT_FOUND" (body equality) | COMPLIANT |
| An ungranted manager reads no document | E2E 404; "no repository read" is pinned in the pre-existing review-history-access.service.spec; the use case calls `loadCompletedForActor` first (use-case:104) | COMPLIANT |
| A deactivated representative loses the document | E2E | COMPLIANT |
| A representative who signed loses it after reassignment | E2E | COMPLIANT |
| No permission is added | role-permission.checker.spec (`checker.can` per role); ST: auth/, packages/ and prisma/ untouched by the chain | COMPLIANT (see W-4 on assertion strength) |
| A rejected read issues no name lookup | UT spies (nonexistent case only); E2E 404 for all three causes | COMPLIANT (S-5) |
| Lookups use only identifiers from the loaded session | UT `toHaveBeenCalledWith` the session's ids | COMPLIANT |
| The lookup port is not exported | ST: review-session.module has no exports; the token is referenced only by the module and the use case | COMPLIANT |
| The profile endpoint stays admin-only | E2E technician 403; organization-profile e2e (pre-existing) | COMPLIANT |
| The document exposes only the letterhead fields | E2E exact six keys; UT | COMPLIANT |
| A renamed community shows its new name | ST: read live at request time, no cache | UNTESTED, statically correct (W-3) |
| An updated letterhead appears on an old document | ST: `profileReader.get()` on every request | UNTESTED, statically correct (W-3) |
| No file-returning endpoint exists | ST: no StreamableFile, pdf, Content-Disposition or sendFile in apps/api/src; route returns a JSON DTO | COMPLIANT |
| No PDF, headless-browser or mailer dependency | ST: no manifest diff; grep clean | COMPLIANT |
| No sending path exists | ST: no email, share or download control or route | COMPLIANT |
| The schema is unchanged | ST: no diff in schema.prisma or migrations/ | COMPLIANT |

**review-document-ui** (28 scenarios)
| Scenario | Evidence | Result |
|---|---|---|
| All five history roles reach the page | WT authenticated-routes.test (exact 5-role gate); BR all five | COMPLIANT |
| An ungranted manager gets the server's answer | Route is gated on the role only (WT); BR ungranted MANAGER sees "not available" | COMPLIANT |
| Unauthenticated visitor redirected to login | Existing ProtectedRoute behavior, route registered in AUTHENTICATED_ROUTES (WT) | COMPLIANT |
| A completed session's document renders all regions | WT letterhead, session data, record and signature suites; BR | COMPLIANT |
| A session with no company omits the company line | WT "omits the company line entirely…" | COMPLIANT |
| Defensive-fallback empty value renders a placeholder | WT community/company placeholder test and email placeholder test | COMPLIANT |
| Zero entries still renders | WT "renders no entry and no error…" | COMPLIANT |
| Decommissioned or soft-deleted element renders its real identity | WT | COMPLIANT |
| No resolvable row renders a neutral label | WT | COMPLIANT |
| Entries rendered in server order | WT "…exact server order — not code-ascending…" (characterization, PR 12) | COMPLIANT |
| Fully blank profile prints without letterhead | WT "renders no letterhead content at all…"; BR | COMPLIANT |
| Partially filled profile prints its filled fields | WT; BR incomplete-profile print preview (5 lines, no warning in print) | COMPLIANT |
| Complete profile shows no warning | WT | COMPLIANT |
| The print control opens the browser print dialog | WT `window.print` spy | COMPLIANT |
| Print output excludes application chrome | BR real print preview (filled and incomplete profile); the spec requires browser evidence here | COMPLIANT |
| The navigation still shows on screen | Page is rendered inside the authenticated layout; BR | COMPLIANT |
| Every 404 cause shows the same message | WT nonexistent and out-of-scope; BR draft, nonexistent and out-of-scope | COMPLIANT |
| Network error or 5xx not folded into the 404 message | WT (2 tests) | COMPLIANT |
| Loading state renders while in flight | WT | COMPLIANT |
| The history view reaches its session's document | WT ReviewHistoryDetailPage "exactly one View document link…"; BR all five | COMPLIANT |
| The field flow offers no document link | ST (ReviewSessionDetailPage has only gap-element Links); BR | COMPLIANT by browser only; no automated regression (W-2) |
| Signing does not auto-open the document | WT completion test stays on the page (completed notice); no print spy; BR | PARTIAL (W-2) |
| Only print and navigation controls render | WT "offers no control besides print…" | COMPLIANT |
| Every new key translated in all three locales | WT locales parity plus required-key loop | COMPLIANT |
| Every new key asserted to exist | WT REQUIRED_REVIEW_DOCUMENT_KEY_PATHS (22/22 reviewDocument.* keys); documentLink sits in the history list (W-5) | COMPLIANT (W-5) |
| Enum values never rendered raw | WT session-data test (localized type and frequency), answers via mapAnswerValueToLabelKey | COMPLIANT |
| Dates in a fixed time zone regardless of the viewer's | WT format-date TZ-switch test ('en' only) and DST tests ('en'); es/ca only checked non-empty | PARTIAL (W-4) |
| The signing date shows both date and time | WT format-date "HH:mm"; WT signature footer '03:00' | COMPLIANT |

**review-session-management** (15): *Completion Is the Signing Act*, 5 scenarios. The completion use case, repository and schema are untouched (ST), existing completion suites are green, no `signed`/`signedAt`/`signedById` in domain or schema (grep), and no reopen route exists. The UT/E2E signer = performer tests cover "performer signs" and "pre-change session signed". COMPLIANT. *Adjacent Review Capabilities*, 10 scenarios: the document route lives on ReviewHistoryController and the review-document use case, and ReviewSessionController, SessionAccessService and review-session use cases are untouched (ST). Pre-existing guards are green. COMPLIANT.

**review-session-ui** (15): "The completing control reads Sign and close" and "Signing asks for a conscious confirmation" are covered by WT ReviewSessionDetailPage (2 new tests) and WT ConfirmDialog confirmLabel (2 tests), so COMPLIANT. "Confirming signs and closes" is covered by the pre-existing WT completion test: COMPLIANT. "Cancelling leaves the session a draft": ST only (`onCancel={() => setPendingComplete(false)}`, ReviewSessionDetailPage.tsx:296), no page-level test, so UNTESTED, statically correct (W-2). "The completed session offers no document link" and "A draft offers no document link either": ST + BR only (W-2). The remaining gap, no-offline and no-history scenarios are unchanged, with pre-existing tests green: COMPLIANT.

**review-history** (4): "Still exactly two actor-unscoped reads" and "no new caller path": the review-session repository port, the Prisma adapter and ReviewHistoryAccessService are unchanged (empty git diff). "Scoped in the query": the use case reuses `loadCompletedForActor`. "Draft not readable": E2E. All COMPLIANT.

**review-history-ui** (22): "The view offers one View document link" and "The link changes nothing else" are covered by WT ReviewHistoryDetailPage (2 new tests) and BR. The restated pre-existing scenarios are unchanged and their tests are green. COMPLIANT.

**organization-profile-management** (3): "Only the document read consults the profile": the ORGANIZATION_PROFILE_READER token is consumed only by ReadReviewDocumentUseCase (grep), and the module exports only the reader (module spec: one instance). "Blank profile": E2E. "Own endpoints unchanged": the organization-profile presentation layer is untouched and its e2e is green. COMPLIANT.

**authorization** (15): "Four non-admin rows unchanged", "admin untouched" and "no permission added": role-permission.checker.spec plus a static no-diff. "The capability is still undeclared": grep for MANAGE_ORGANIZATION_PROFILE in apps/ and packages/ returns nothing. "One exception = six fields": E2E. "Exception unreachable outside the scoped read": ST (single consumer). "VIEW_ALL_REVIEWS governs the document": E2E granted MANAGER 200. COMPLIANT.

**Compliance summary**: about 132 scenarios. 0 FAILING. 0 CRITICAL-UNTESTED. 5 PARTIAL and 7 UNTESTED-but-statically-correct or browser-only scenarios, recorded as W-2/W-3/W-4 and consistent with project precedent (nav-menu W-2, review-history-manager-capability W1/W2).

### Design coherence
| Decision | Followed? | Notes |
|---|---|---|
| 1 Use case in review-session, gate first via loadCompletedForActor | Yes | use-case:104 is the single throw site |
| 2 Extract pure buildHistoryEntries; separate document result type and DTO | Yes | History spec unchanged; the DTO reuses answer and question DTOs only |
| 3 OrganizationProfileReader via useExisting, export the reader only | Yes | Module spec pins one instance |
| 4 Module-local inclusive name directory, one batched element query | Yes | IT "exactly one batched query"; PrismaService has no global soft-delete filter, so the inclusive reads are real |
| 5 GET /review-history/:sessionId/document, reviewSession:read, shared mapError | Yes | OpenAPI enums match the Prisma enums (the PR 7 frequency fix is in place) |
| 6 New page; the only link is on ReviewHistoryDetailPage | Yes | |
| 7 Keep complete* keys, change values; confirmLabel? prop | Yes | |
| Fallbacks: '' for missing names or email, null company only when none recorded; no `?? ''` on NOT NULL element name/location | Yes | Accepted decision |
| `template.version === null` guard kept in the web page | Yes | Accepted decision (the DTO declares it nullable) |
| No schema change or migration | Yes | |

### TDD compliance (Strict)
| Check | Result | Details |
|---|---|---|
| TDD evidence reported | Partial | #319 (latest of 14 revisions) keeps explicit RED/GREEN evidence only for PR 13 (RED 2/15 → GREEN 15/15). PRs 1-12 are collapsed to "see engram history" and cannot be retrieved (W-1) |
| All tasks have tests | Yes | Every RED task's test file exists |
| GREEN confirmed | Yes | Every listed test file passes now |
| Git ordering | Partial | PR 7 has a standalone RED commit (2492aa2 before 3badcc6); the other PRs committed test and implementation together |
| Characterization exceptions | As planned | PR 8 (e2e matrix) and PR 12 order/h1 tests are documented characterization |
| Triangulation | Mostly adequate | Ordering 5 cases; name directory 7 in-memory + 11 IT cases; format-date weak on es/ca (W-4) |

### Assertion quality
| File | Assertion | Issue | Severity |
|---|---|---|---|
| role-permission.checker.spec.ts (review-export block) | `expect(FULL_PERMISSION_SET).toHaveLength(33)` | Checks a test-local array, not the production `Permission` union. A new member added to the union and granted would slip past unless also added to the list. The sibling test does exercise `checker.can` | WARNING (W-4) |
| format-date.test.ts "locale support" | `.length).toBeGreaterThan(0)` for es/ca | Length-only. The TZ invariance and DST tests run in 'en' only | WARNING (W-4) |
No tautologies, ghost loops or smoke-only tests were found in the change's test files.

### Test layer distribution (change-related)
Unit (API): read-review-document 8, entry-order 5, history-entries 6, in-memory directory 9, module DI 1, permission lock 2. Integration: 11. E2E: document blocks, about 25 including `it.each` expansions. Web component/unit: ReviewDocumentPage 25, format-date 6, is-profile-incomplete 3, ConfirmDialog +2, ReviewSessionDetailPage +2, ReviewHistoryDetailPage +2, routes (updated), locales (22 required keys + 1).

### Issues

**CRITICAL**: None.

**WARNING**
- **W-1 TDD evidence not retrievable for PRs 1-12.** apply-progress #319 was compacted ("unchanged from prior saves — see engram history"), and earlier revisions cannot be read through mem_get_observation. A strict reading of strict-tdd-verify makes a missing table CRITICAL. Downgraded because the evidence was reported per batch (14 revisions, each PR reviewed and merged), every RED test exists and passes, PR 7 has a separate RED commit, and PR 13 records RED. Fix: restore a compact per-PR TDD table into apply-progress (or the archive report) before archive.
- **W-2 Field-flow negative scenarios lack automated regression tests.** No document link on the completed or draft ReviewSessionDetailPage, no auto-open or print after signing, and cancelling Sign and close sends nothing. Implementation is compliant (static check plus browser pass 13.5), but the design-critical "no field-flow link" decision (representative reassignment) has no test guarding it. Fix: add `queryByText('View document')`/print-button absence and `window.print` not-called assertions to the completion test, plus a complete-cancel test.
- **W-3 Review-document scenarios with static-only or partial evidence**: "Reading the document changes nothing", "Renamed community shows new name", "Updated letterhead appears on an old document" (all read live, statically obvious), "Element identity may differ" (proven only by composing the IT with the pre-existing history tests), and "Recorded record matches history" (the parity e2e compares status, not bodies).
- **W-4 Weak assertions**: see the Assertion quality table (permission-count lock on a test-local list; es/ca date formatting only checked non-empty). The spec's "identical across viewers in each of en/es/ca" is PARTIAL.
- **W-5 `reviewHistory.detail.documentLink` is existence-guarded in REQUIRED_REVIEW_HISTORY_KEY_PATHS, not REQUIRED_REVIEW_DOCUMENT_KEY_PATHS.** This departs from the letter of review-document-ui *Internationalization Coverage* ("every key this change introduces MUST be listed in REQUIRED_REVIEW_DOCUMENT_KEY_PATHS"). The intent, an existence guard independent of parity, is met. One-line fix, or accept the deviation in the archive.

**SUGGESTION**
- **S-1 ParseUUIDPipe (deferred #321)**: not a spec violation. The base review-history specs scope the uniform 404 to *well-formed* identifiers (openspec/specs/review-history/spec.md:224, 262, 378, 918), and the document route inherits exactly the history route's handling, so document/history parity holds. With `ReviewSession.id @db.Uuid`, a malformed id likely yields a non-404 on both routes. That leaks no existence information. Keep it as a follow-up.
- **S-2 Dev-DB pollution (deferred)**: test-infrastructure hygiene, not a spec violation. The integration spec this change adds cleans up after itself.
- **S-3 Stale review-session-ui scenario (deferred)**: I could not identify the specific scenario from the Engram notes. I compared the review-session-ui delta against ReviewSessionDetailPage and found no mismatch. The archive merge replaces both MODIFIED requirements wholesale. The archive agent should check the merged base spec for leftover "Complete session" wording.
- **S-4** ReviewDocumentPage.tsx:205 falls back to the raw `answer.questionId` when question text is missing. This is unreachable with a frozen snapshot, but a localized fallback would match the no-raw-identifier rule the spec applies to elements.
- **S-5** Triangulate the unit test "rejected read issues no lookup" with out-of-scope and draft cases (currently nonexistent only).
- **S-6** The parity e2e could also compare 404 bodies between the history and document routes.
- **S-7** Web i18n is hardcoded to `lng: 'en'` (apps/web/src/i18n/index.ts:16), so es/ca document rendering is verified by locale tests only, never in a browser. This is known and not a regression.

### Deferred-notes verdict
None of the three deferred follow-ups (ParseUUIDPipe, dev-DB pollution, stale review-session-ui scenario) is an implementation spec violation.

### PR 14 (in progress, not blocking this verdict)
`review-export/14-docs` (888cfee, 5143dbc) adds the signing-is-completion note to domain-model-inspections.md and moves FR-010 to **partial** with slice 2 pending. Both are consistent with the specs. Nit: the new domain-model paragraph is titled "(`review-export` PR 1)" although it lands in PR 14. It records PR 1's behavior, so this is acceptable.

### Verdict
**PASS WITH WARNINGS.** 0 CRITICAL, 5 WARNING, 7 SUGGESTION. All suites, lint and type-check/build are green, and every spec requirement is implemented. No warning blocks sdd-archive. W-1 (restore the TDD evidence table) and W-2 (field-flow regression tests) are cheap and are recommended before or alongside archive.

## Addendum: W-1 resolution (TDD evidence table)

Reconstructed after verify, from PR bodies, git history and the apply
reports of this chain. Evidence that was not retained is stated as such, not
re-created.

| PR | TDD evidence |
|---|---|
| 1–6 (#143–#148) | Not retained. Tests exist and pass, and each PR had a fresh-context review. RED/GREEN counts were reported per batch but lost when apply-progress was compacted, and the PR bodies do not carry them. |
| 7 (#149) | Separate RED commit `2492aa2` before `3badcc6`. The new e2e cases failed with 404 (unmatched route) before wiring. |
| 8 (#150) | Characterization by design (not test-first). |
| 9 (#151) | RED: module not found (0/5 and 0/3 ran). GREEN: 5/5 and 3/3. |
| 10 (#152) | RED: missing page import. GREEN: 6/6. |
| 11 (#153) | RED: 7 failing against the PR 10 shell. GREEN: full suite 924/924. |
| 12 (#154) | RED: 5 failing. GREEN: 21/21. The order and `h1` print-hide tests are characterization. |
| 13 (#155) | RED: 2/15. GREEN: 15/15. |
| 14 (W-2 follow-up) | Regression tests over correct code. Each was mutation-checked: behaviour broken locally, test failed, change reverted. |

## Addendum: follow-ups applied before archive

- W-2: 3 field-flow regression tests (`fc8de37`).
- W-5: `reviewHistory.detail.documentLink` moved to `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` (`2ec081f`).
- W-3 and W-4, and S-1 to S-7: accepted as-is and carried as follow-ups.

## Addendum: archive-time S-3 resolution

The archive agent (2026-09-24) checked the merged `review-session-ui`
base spec after applying the delta. No leftover "Complete session"
wording was found: the delta's *Complete a Session and Explain Its
Gaps* requirement fully replaces the completing control's label and
copy with **Sign and close** throughout, including every scenario
title and body. S-3 is resolved with no further edit needed.
