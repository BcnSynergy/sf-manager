## Verification Report

**Change**: community-minimal-ui
**Mode**: Strict TDD
**Verified against**: main @ b583eb6 (PR1-8 all merged, chain complete)

### Completeness
| Metric | Value |
|---|---|
| Tasks total | 39 |
| Tasks complete | 39 |
| Tasks incomplete | 0 |
| Proposal success criteria | 22/22 checked with evidence |

### Build & Tests Execution (re-run independently by verify, not trusted from apply-progress alone)
**Web tests**: `npm run test --workspace=apps/web` → 23 files, 213/213 passed (matches apply-progress claim exactly).
**API tests**: `npm run test --workspace=apps/api` → 47 suites, 279/279 passed (matches claim exactly).
**Lint**: `npm run lint --workspace=apps/web` → clean, zero errors.
**Build**: `npm run build --workspace=apps/web` → succeeded (same pre-existing >500kB chunk warning as PR6/7, unrelated). `npm run build --workspace=apps/api` was intentionally NOT run full during the verify pass itself (nest build writes dist/) because a live `npm run dev` (`nest start --watch`) was detected running in that environment — this exact conflict is a documented incident from the PR8 session (build wiping dist/ while nest watch reloads crashes the API process). `tsc --noEmit` on apps/api ran clean (zero type errors) as a safe substitute during the verify pass. **Post-verify update**: the dev server was stopped and a full `npm run build` (turbo, all 4 packages, including a real `nest build`) was independently re-run and passed clean — this closes WARNING #1 below.

### Spec Compliance Matrix (community-admin-ui + community-assignments, 13+1 requirements)
All 13 community-admin-ui requirements and the 1 community-assignments ADDED requirement were checked against actual merged code (not just checkbox trust):

| Requirement | Evidence | Result |
|---|---|---|
| Role-Gated Route Access | All 4 routes wrapped `ProtectedRoute allowedRoles={['SYSTEM_ADMIN']}` in App.tsx (verified by reading full routes block) | COMPLIANT |
| List Active Communities | CommunitiesListPage.tsx renders name/address/locale via label map; loading/empty/error states present | COMPLIANT |
| Create Community | CommunityCreatePage.tsx, createCommunitySchema.safeParse before fetch (4 tests) | COMPLIANT |
| Edit Community | CommunityEditPage.tsx, updateCommunitySchema, prefilled via useCommunity (6 tests) | COMPLIANT |
| Soft-Delete Community | ConfirmDialog gated delete + refetch on CommunitiesListPage | COMPLIANT |
| Community Detail View | CommunityDetailPage.tsx composes AssignmentSection×2, raw userId only, no lookup (7 tests) | COMPLIANT |
| Representative Assignment Lifecycle | AssignmentSection.tsx via representativeOps; exclusivity swap tested at both component (AssignmentSection.test.tsx) and page level (CommunityDetailPage.test.tsx); `warning` field typed in api/community.ts but never read anywhere (grepped) | COMPLIANT |
| Technician Assignment Lifecycle | Same component, technicianOps, no exclusivity encoded anywhere | COMPLIANT |
| Cause-Specific Assignment 409 Messaging | error-messages.ts CODE_MESSAGE_KEYS maps 3 distinct codes to 3 distinct i18n keys; differential test exists (error-messages.test.ts, 10 tests); AssignmentSection overrides INELIGIBLE_ROLE with section-specific `keys.ineligible` | COMPLIANT |
| Generic Not-Found Handling | error-messages.ts maps 404 → single `community.error.assignmentTargetNotFound` regardless of cause | COMPLIANT |
| No Server-Message String Coupling | Grepped `apps/web/src` for `.message` reads on ApiError outside comments/test files — zero production violations found | COMPLIANT |
| Internationalization Coverage | en/es/ca all have 9 `community.*` key groups; locales.test.ts's REQUIRED_COMMUNITY_KEY_PATHS (44 paths) asserts non-empty, non-placeholder value in all 3 locales for every referenced key; spot-checked `community.error.*` translations are real, distinct EN/ES/CA text | COMPLIANT |
| Enum Value Label Mapping | `mapLocaleToLabelKey`/`mapAssignmentStatusToLabelKey` used in every rendered cell; raw enum only backs `<option value>` in Create/Edit forms — grepped, zero raw-render violations | COMPLIANT |
| Assignment 409 Error Codes (community-assignments delta) | community.controller.ts `buildConflictException` emits `{statusCode:409,error:'Conflict',message,code}` for all 3 causes; e2e-spec.ts asserts `code` for ASSIGNMENT_ALREADY_EXISTS and INELIGIBLE_ROLE via real HTTP; 404/400 asserted to carry no `code`. TRANSACTION_CONFLICT is covered only by controller.spec.ts (mocked unit test), not by e2e — disclosed, deliberate limitation | COMPLIANT (with disclosed limitation) |

### Design Coherence (4 decisions)
| Decision | Followed? | Evidence |
|---|---|---|
| Decision 1 — Local `CommunityErrorCode`, mirrored (not hoisted) | Yes | `community-error-code.ts` (API) + literal union in `api/community.ts` (web), file-for-file as designed; rule-of-three at n=2 correctly not triggered |
| Decision 2 — No data-fetching library | Yes | `apiFetch` + refetch only; no TanStack Query import anywhere in community/pages code |
| Decision 3 — One `AssignmentSection`, NO behavioral props (hard rule) | Yes, verified directly | `AssignmentSectionProps = { ops, testIdPrefix, keys }` only. Grepped for `isExclusive`/`mode`/`allowsMultipleActive` — zero matches outside comments explaining the rule itself |
| Decision 4 — `useCommunity(id)`, 3 independent parallel requests, not-found guardrail | Yes | `use-community.ts` calls `listCommunities()` + client select; `CommunityDetailPage.tsx` renders both `AssignmentSection` instances independently of `useCommunity`'s load state (only suppressed on `not-found`) |

### Task Spot-Checks (not just checkbox trust)
- Task 1.5 (IneligibleRoleError reachable on technician reactivate): confirmed `ReactivateTechnicianUseCase` calls `assertEligibleFor(user.role, 'TECHNICIAN')` unconditionally.
- Task 7.2 heads-up (ConfirmDialog testid collision): confirmed real and fixed — `CommunityDetailPage.test.tsx` asserts the unscoped `screen.getByTestId('confirm-dialog')` throws, then all dialog assertions use `within(repSection)`/`within(techSection)` scoping.
- Task 8.1 (i18n existence guard): `REQUIRED_COMMUNITY_KEY_PATHS` (44 entries) + `it.each` non-placeholder guard is a real independent check, not relabeled parity test.
- Test counts cross-checked against tasks.md claims (CommunityDetailPage.test.tsx 7, CommunityCreatePage.test.tsx 4, CommunityEditPage.test.tsx 6, AssignmentSection.test.tsx 14, error-messages.test.ts 10, use-community.test.ts 5) — all present, no inflated claims found.
- `ConfirmDialog.tsx`, `apps/web/src/api/client.ts`, `apps/web/src/auth/**` confirmed genuinely unchanged by this PR chain, matching design's "Reused as-is" claim.

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. ~~Full `npm run build` not independently re-run during verify due to live dev-server conflict~~ — **Closed post-verify**: dev server stopped, full `npm run build` (turbo, 4 packages, real `nest build`) re-run clean.
2. TRANSACTION_CONFLICT 409 code has no e2e (real HTTP) coverage, only a mocked controller unit test. Disclosed and deliberate (proposal criterion 15) — not a silent gap.
3. design.md's own "Open Questions" checklist still shows `[ ]` unchecked boxes even though both questions were resolved with findings at tasks.md 1.5 and 8.4. Cosmetic only — resolution lives in tasks.md/proposal.md.

**SUGGESTION**:
1. `apps/web` production build still emits a >500kB main chunk warning (pre-existing since PR6/7) — code-splitting out of scope for this slice, worth a backlog note.
2. Criterion 15 (TransactionConflict) could not be deterministically triggered live via browser — acceptable and already transparently documented.

### Verdict
**PASS WITH WARNINGS** — Zero CRITICAL issues. All 39/39 tasks complete and independently spot-checked against real merged code. All 13+1 spec requirements compliant with runtime test evidence (213 web + 279 api tests passing, independently re-run). All 4 design decisions followed, including Decision 3's hard "no behavioral props" rule verified by direct source read plus grep. All 22 proposal success criteria checked with evidence. Ready for `sdd-archive`.
