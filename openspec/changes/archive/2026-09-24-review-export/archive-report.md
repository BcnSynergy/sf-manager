# Archive Report: review-export

**Change**: review-export — Review Export: Sign and Print the Completed Review (FR-010, slice 1 of 2)
**Archived**: 2026-09-24
**Archived to**: `openspec/changes/archive/2026-09-24-review-export/`
**Verdict carried from sdd-verify**: PASS WITH WARNINGS — 0 CRITICAL, 5 WARNING, 7 SUGGESTION
**Engram traceability**: proposal `sdd/review-export/proposal`, spec deltas under `sdd/review-export/spec`, design `sdd/review-export/design` (#not directly searched — content sourced from the openspec files, which are the source of truth in hybrid mode), tasks `sdd/review-export/tasks` (#318), verify-report `sdd/review-export/verify-report` (#328, mirrored in `openspec/changes/review-export/verify-report.md`)

## Task Completion Gate

Read `openspec/changes/review-export/tasks.md` before starting. All 74 implementation tasks across PR 1–14 were checked (`[x]`), including 14.1–14.3. Task 14.4 (`sdd-archive review-export`) was the only remaining unchecked item — it is this archive step itself, not an implementation task, so the gate passed without any stale-checkbox reconciliation. It is now marked `[x]` in the archived copy of `tasks.md`.

## Specs Synced

| Capability | Action | Requirements added / modified / removed |
|---|---|---|
| `review-document` | Created (new capability, delta was a full spec) | 5 requirements added (Read the Review Document…, Document Visibility Is Exactly the Review-History Scope, Inclusive Name Lookups Run Only Inside the Scope Gate, The Organization Profile Gains One Reader Not a Wider Endpoint, Reference Labels Are Read Live in This Slice, No Server-Generated Document Artifact and No Delivery — 6 requirements, 30 scenarios total) / 0 modified / 0 removed |
| `review-document-ui` | Created (new capability, delta was a full spec) | 7 requirements added (Document Page Is Gated…, Document Page Content, A Blank or Incomplete Profile Still Prints, Print Through the Browser, Loading and Unreachable States, Exactly One Entry Link Reaches the Document Page, The Document Page Offers No Other Action, Internationalization Coverage — 8 requirements, 28 scenarios) / 0 modified / 0 removed |
| `authorization` | Updated | 0 added / 2 modified (*The Organization Profile Grants Nothing Beyond Itself* — narrowed to one exception, 4 new scenarios added; *Installation-Wide Review History Scope for a Manager Holding VIEW_ALL_REVIEWS* — extended to cover the document read, 1 new scenario added) / 0 removed |
| `organization-profile-management` | Updated | 0 added / 1 modified (*An Incomplete Profile Blocks Nothing* — narrowed to exactly one external consumer, 2 new scenarios added) / 0 removed |
| `review-history-ui` | Updated | 0 added / 3 modified (*Read-Only Historical Session View* — gains the one View document link, 2 new scenarios; *Two Entry Links Reach the Element History Page* — host-page-unchanged scenario updated to name the new link; *No Filtering, Analytics or Adjacent Controls Ship* — narrowed exception for the View document link) / 0 removed |
| `review-history` | Updated | 1 added (*The Review Document Read Inherits the Session-Level History Guards*, 4 scenarios) / 0 modified / 0 removed |
| `review-session-management` | Updated | 1 added (*Completion Is the Signing Act*, 5 scenarios) / 1 modified (*Adjacent Review Capabilities Are Not Introduced* — FR-010 row narrowed, 1 scenario reworded, 1 scenario added) / 0 removed |
| `review-session-ui` | Updated | 0 added / 2 modified (*Complete a Session and Explain Its Gaps* — signing copy, confirm/cancel scenarios, no-document-link scenarios added; *No Offline, History or Scheduling Surface* — field-flow document-link prohibition named explicitly) / 0 removed |

All merges preserved every pre-existing requirement not named in the delta. No REMOVED requirements appeared in any of the 8 deltas, so no `(Reason: ...)`/`(Migration: ...)` note was needed.

### S-3 resolution (deferred SUGGESTION from verify-report)

Verify-report S-3 asked the archive agent to check the merged `review-session-ui` base spec for leftover "Complete session" wording that should read "Sign and close". After applying the delta, the full merged file was inspected: the *Complete a Session and Explain Its Gaps* requirement's body and every one of its scenario titles now read "Sign and close" throughout (e.g. "The completing control reads Sign and close", "Signing asks for a conscious confirmation", "Confirming signs and closes the session"). No leftover "Complete session" wording was found anywhere in the merged file. S-3 is resolved with no further edit.

## Archive Contents

- `proposal.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (74/74 tasks complete, including 14.4)
- `verify-report.md` ✅ (both addenda included: W-1 TDD-evidence reconstruction, and this archive's S-3 resolution note appended)
- `specs/authorization/spec.md` ✅
- `specs/organization-profile-management/spec.md` ✅
- `specs/review-document/spec.md` ✅
- `specs/review-document-ui/spec.md` ✅
- `specs/review-history/spec.md` ✅
- `specs/review-history-ui/spec.md` ✅
- `specs/review-session-management/spec.md` ✅
- `specs/review-session-ui/spec.md` ✅

## Source of Truth Updated

- `openspec/specs/review-document/spec.md` (new)
- `openspec/specs/review-document-ui/spec.md` (new)
- `openspec/specs/authorization/spec.md` (merged)
- `openspec/specs/organization-profile-management/spec.md` (merged)
- `openspec/specs/review-history-ui/spec.md` (merged)
- `openspec/specs/review-history/spec.md` (merged)
- `openspec/specs/review-session-management/spec.md` (merged)
- `openspec/specs/review-session-ui/spec.md` (merged)

## Final Verify Verdict (carried forward)

**PASS WITH WARNINGS.** 0 CRITICAL, 5 WARNING, 7 SUGGESTION. All suites, lint, type-check and build were green at the time of verify (main @ e1d0570, worktree `review-export/14-docs` @ 5143dbc — diff limited to docs and `tasks.md`).

### Accepted warnings carried forward as follow-ups
- **W-1** (TDD evidence for PRs 1–12 not retrievable from Engram) — addressed by the reconstructed table in verify-report.md's addendum; no further action.
- **W-3** (review-document scenarios with static-only or partial evidence: "Reading the document changes nothing", "Renamed community shows new name", "Updated letterhead appears on an old document", "Element identity may differ", "Recorded record matches history") — accepted; no test debt tracked separately.
- **W-4** (weak assertions: permission-count lock on a test-local list; es/ca date formatting checked non-empty only) — accepted as a known test-quality gap.
- **W-2 and W-5 were closed before archive**, not carried forward: W-2 by 3 field-flow regression tests (`fc8de37`); W-5 by moving `reviewHistory.detail.documentLink` into `REQUIRED_REVIEW_DOCUMENT_KEY_PATHS` (`2ec081f`).

### Accepted suggestions carried forward as follow-ups
- **S-1**: `ParseUUIDPipe` on `review-history`/`review-history` document `:sessionId` routes — not a spec violation (confirmed via `openspec/specs/review-history/spec.md` scope-to-well-formed-identifiers language); deferred as a hygiene follow-up.
- **S-2**: dev-DB pollution from integration tests — test-infrastructure hygiene, not a spec violation; deferred.
- **S-3**: resolved during this archive (see above) — no further action.
- **S-4**: `ReviewDocumentPage.tsx:205`'s raw `answer.questionId` fallback (unreachable with a frozen snapshot) — deferred, cosmetic.
- **S-5**: triangulate "rejected read issues no lookup" unit test with out-of-scope/draft cases — deferred, test-quality improvement.
- **S-6**: parity e2e could also compare 404 bodies between history and document routes — deferred, test-quality improvement.
- **S-7**: web i18n hardcoded to `lng: 'en'`, so es/ca document rendering is never browser-verified, only locale-tested — known, pre-existing, not a regression.

## PR List

PR chain #143–#156 (stacked-to-main, per user decision 2026-09-23 to keep the full 14-PR chain including PR 8's characterization matrix):

| PR | Scope |
|---|---|
| #143 | PR 1 — Sign copy |
| #144 | PR 2 — History helper extraction |
| #145 | PR 3 — Reader + name-directory ports, fakes |
| #146 | PR 4 — Prisma name directory + integration spec |
| #147 | PR 5 — Use case core |
| #148 | PR 6 — Entry/answer ordering |
| #149 | PR 7 — API wiring + first e2e cases (separate RED commit `2492aa2`) |
| #150 | PR 8 — E2E scope matrix (characterization, not test-first by design) |
| #151 | PR 9 — Web helpers |
| #152 | PR 10 — Page shell |
| #153 | PR 11 — Header regions |
| #154 | PR 12 — Record and print |
| #155 | PR 13 — "View document" link + browser pass (13.5, done 2026-09-24) |
| #156 (this PR, `review-export/14-docs`) | PR 14 — Docs (14.1, 14.2), verify report (14.3, with W-1 addendum), W-2/W-5 follow-up commits (`fc8de37`, `2ec081f`), and this archive (14.4) |

## Deferred Follow-Ups (not part of this change, tracked for future work)

1. **ParseUUIDPipe on review-history `:sessionId` routes** (S-1) — not a spec violation today, but a cheap hardening candidate for a future hygiene pass.
2. **Hermetic integration tests / dev-DB pollution** (S-2) — the integration spec added by this change cleans up after itself, but the broader dev-DB pollution issue across the test suite is pre-existing and unaddressed.
3. **FR-010 slice 2: signer identity** — full signer name and signature image, registered together, plus snapshotting reference labels (community/company names, letterhead) onto the session at signing time. `docs/requirements/functional-requirements.md` now records FR-010 as `partial` pending this slice.
4. **Performer-retained access (open question, design.md)** — a `COMMUNITY_REPRESENTATIVE` who signs a session and is later unassigned from the community loses access to their own signed document (uniform 404, same as any out-of-scope caller). Accepted for slice 1; not solved.
5. **User/community list search** — a UX pain point found during the browser-verification pass (13.5), unrelated to this change's scope; noted for a future slice, not a defect in review-export itself.

## SDD Cycle Complete

The change has been fully planned, implemented, verified and archived. `review-export` (FR-010 slice 1 of 2) is closed. FR-010 slice 2 (signer identity: full name + signature image + reference-label snapshotting) is the recommended next `/sdd-new`.
