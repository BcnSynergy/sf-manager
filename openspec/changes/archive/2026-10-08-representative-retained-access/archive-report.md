# Archive Report: representative-retained-access

**Archived**: 2026-10-08
**Mode**: hybrid
**Verdict carried from verify**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 3 SUGGESTION)
**Delivery**: PR 1/2 #200 merged at cf8cfb2 (`representative-retained-access/01-retained-own-sessions`); PR 2/2 `representative-retained-access/02-archive`.

## Specs merged

All three deltas were MODIFIED-only; each named requirement was replaced with the delta's version (including `(Previously: ...)` notes), with everything else left untouched.

| Capability | Requirements replaced |
|------------|----------------------|
| `review-history` | A Representative's Community-Scoped Completed Review History; The Five Visibility Scopes Apply at Entry Level; Element Reachability Decides 404 Versus an Empty History; An Out-of-Scope Historical Session Is Indistinguishable From a Nonexistent One; History Access Requires a Currently Active Community Assignment, Except for One's Own Performed Sessions |
| `authorization` | Resource Scope for Review History Reads; Entry-Level Resource Scope for the Element-Keyed Review History Read |
| `review-document` | Document Visibility Is Exactly the Review-History Scope |

Hand edits (design D8):
- B.3 `review-history` Purpose: a representative also sees "the sessions they performed themselves, with or without an assignment".
- B.4 `authorization` Purpose: same addition.
- B.5 confirmed, no edit needed (matched by content, since earlier line numbers shifted after the merge): review-history completed-only draft scenario (now L480-483) and the read-back paragraph (now L506-508, representative "who did not perform it"; the performer clause already covers the own-session case); authorization write-surface scope requirement "Resource Scope — an Active Assignment Is Required Beyond the Permission" (L926-998) and its unassigned-holder/endpoint scenarios, the company-manager row (~L606-612), and the paragraphs on `maintenanceCompanyId` and the "three that still narrow" scopes (still true). The old review-history "Another community's completed session is not disclosed" scenario (was L931-935, now L973-977) carries the "performed by someone other than the representative" qualifier via the merged delta. The L1424/L1446 references in the task do not map to the same text after the merge; the equivalent passages were reviewed by content and need no edit.

## Follow-up debts

1. Field-flow session page document link: deferred (FR-010 note in `docs/requirements/functional-requirements.md`).
2. Write-surface e2e only covers "open" for a deactivated representative.
3. Unit D e2e is acceptance-style.
4. CLAUDE.md mentions `npm run test:integration` at the repo root, but the script exists only in `apps/api` (doc fix candidate).
5. Dev DB now holds one extra completed QA session by `rep@sf-manager.example` (`...e44a`).

## Artifacts

proposal.md, specs/{authorization,review-history,review-document}/spec.md, design.md, tasks.md (B.2-B.5 ticked), verify-report.md, archive-report.md. Engram: `sdd/representative-retained-access/{proposal,spec,design,tasks,apply-progress,verify-report,archive-report}` (observations #495, #496, #497, #498, #500, #502).
