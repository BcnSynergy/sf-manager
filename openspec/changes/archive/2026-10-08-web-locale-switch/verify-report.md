## Verification Report

**Change**: web-locale-switch
**Mode**: Strict TDD, hybrid artifact store
**Verified at**: `main` @ c7995d1 (PR #198 merge, branch `web-locale-switch/01-locale-selector`)
**Verdict**: PASS WITH WARNINGS (0 CRITICAL, 2 WARNING, 3 SUGGESTION)

### Completeness

| Item | Status |
|------|--------|
| Phase A tasks A.1-D.5 | All checked |
| G.1 browser verification | Done 2026-10-08, recorded in `tasks.md` |
| G.2 fresh reviews and merge | Done in practice (pre-push READY WITH NITS, CI run 37741038679 green, pre-merge READY TO MERGE, merged). The box is still unchecked in `tasks.md`. |
| B.1 verify | This run. |
| B.2 archive, B.3 D9 hand edit | Pending, PR 2/2. |

### Execution evidence (real runs)

| Command | Result |
|---------|--------|
| `npm run test --workspace=apps/web` | 65 files, 1096 tests, all pass |
| `npm run lint` | 0 errors, 0 warnings (turbo, 5 tasks, cached) |
| `npm run build --workspace=apps/web` | OK (tsc + vite). Only the pre-existing chunk-size warning. |
| `npm run test --workspace=apps/api` (regression smoke) | 140 suites, 1369 tests, all pass |

Web counts match `apply-progress` exactly. The working tree was clean. Coverage tooling was not run (informational).

### Spec compliance matrix

| Requirement / Scenario | Implementation | Covering test (passed) | Status |
|---|---|---|---|
| **Initial Language Resolution** / Valid stored choice wins | `resolveInitialLocale` returns a supported stored value first; `i18n/index.ts` uses it for `lng` | `locale-preference.test` (stored en/es/ca win); `index.test` stored `ca` wins over browser `es` | COMPLIANT |
| Browser base language | Base subtag of `navigator.languages[0]`, fallback `navigator.language` | `locale-preference.test` (`es-ES`, `ca-ES`, `CA`); `index.test` browser `es` gives `<html lang>` `es` | COMPLIANT |
| Unsupported browser language | Falls back to `en` | `locale-preference.test` (`fr`, empty, undefined) | COMPLIANT |
| Corrupt stored value | Exact-match check ignores `xx`, `''`, `ES`, `es-ES` | `locale-preference.test` ignored values; browser-verified with `garbage` | COMPLIANT |
| Storage unavailable | `readStoredLocale`/`writeStoredLocale` wrap try/catch; selector writes then changes language | `locale-preference.test` throwing Storage stub; `LanguageSelector.test` throwing `setItem` still switches | COMPLIANT |
| **Selector Placement and Options** / Present on both surfaces | `<LanguageSelector />` in `AppLayout` nav and first child of `LoginPage` main | `AppLayout.test`, `LoginPage.test` (exactly one selector) | COMPLIANT |
| Labels do not translate | Fixed endonym options with `lang` attrs | `LanguageSelector.test` three options in every active language | COMPLIANT |
| **Switching Applies Immediately and Persists** / Switch updates UI and html lang | `languageChanged` listener sets `document.documentElement.lang`, registered before `init` so startup is covered | `index.test` (startup and after `changeLanguage('ca')`); `LanguageSelector.test` re-render; `AppLayout.test`/`LoginPage.test` ES switch changes text | COMPLIANT |
| Choice survives reload | Selector stores `sf-manager.locale`; resolver reads it at startup | `LanguageSelector.test` stores `ca`; `index.test` stored `ca` wins; browser-verified reload keeps ES | COMPLIANT |
| Dates follow language | Pre-existing date formatting uses the active i18n language | No automated test in this change; browser-verified for schedule and review document dates (EN/ES/CA), accepted | PARTIAL (accepted) |
| **Scope Limits** / No backend or dependency change | Diff of PR #198 outside `openspec/`: `CLAUDE.md`, ADR-007, and 13 files under `apps/web/src/`. No manifest, API, schema or shared-package file. | `git diff --name-only c7995d1^1 c7995d1` | COMPLIANT |
| **app-navigation (MOD)** / Language selector is the only added control | One `<select>` added after logout; no collapse state | `AppLayout.test` single selector inside `nav-root`; existing nav tests pass | COMPLIANT |
| No collapse, menu or dashboard chrome | Unchanged | Existing `AppLayout.test` | COMPLIANT |
| No dependency and no backend change | As above | Diff check | COMPLIANT |

### TDD compliance (strict-tdd-verify)

| Check | Result | Details |
|-------|--------|---------|
| TDD Cycle Evidence table present | Yes | Rows for units A-D with RED failure, GREEN counts and REFACTOR (`tsc -b`). Docs D.4 marked N/A. |
| Tests exist for every code task | Yes | `locale-preference.test.ts`, `index.test.ts`, `LanguageSelector.test.tsx`, `locales.test.ts`, `AppLayout.test.tsx`, `LoginPage.test.tsx` all exist. |
| GREEN confirmed now | Yes | Full web run passes. |
| RED credibility | Good | Missing-module, `en` vs `es`/`ca` mismatches, and combobox-not-found failures. |
| Triangulation | Good | Resolver: valid, invalid-case, regional tags, empty `languages`, throwing storage. Init: three cases. Selector: three languages plus external change. |
| Safety net | Not itemized | Informational. |

**Assertion quality audit** (changed test files, sampled): no tautologies and no ghost loops found. Tests assert concrete locale codes, stored values and translated text. 0 CRITICAL, 0 WARNING.

**Test layers**: unit (resolver), module-level (`i18n/index`), component (selector, layout, login), real browser (G.1).

### Design coherence

Matches design rev 2 per `apply-progress` ("Deviations: none"). Spot-checked: key `sf-manager.locale` (D4), primary-language-only read (D2), listener before `init` (D5), native `<select>` with endonyms, `lang` attrs and `aria-label` (D6), placements (D7).

### Issues

**WARNING**
1. `tasks.md` G.2 and B.1 are unchecked although G.2 is complete (reviews, green CI, merge). Tick G.2 in the archive PR.
2. Scenario "Dates follow language" has no automated test (browser-verified only, accepted by the user).

**SUGGESTION**
1. ES nav wraps to 3 lines with the selector (ten links in constrained width). Follow-up debt, out of scope per `app-navigation`.
2. `ReviewHistoryPage.tsx:85` and `ReviewHistoryDetailPage.tsx:96` render raw ISO `completedAt` in every language (pre-existing).
3. `openspec/specs/app-navigation/spec.md` still says "a language switcher" at L28 and L430. B.3 covers L28-29. Confirm the archive delta merge also resolves L430.

### Result

No CRITICAL issues. Ready for `sdd-archive`.
