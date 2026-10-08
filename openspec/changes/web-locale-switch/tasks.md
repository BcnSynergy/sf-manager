# Tasks: Web language selector (EN/ES/CA)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1 ~380-430 (code ~80, tests ~270-320, docs ~30) plus openspec artifacts; PR 2 archive only (docs) |
| 400-line budget risk | Medium-High (PR 1 only; any excess is tests) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (selector + ADR/CLAUDE.md docs) then PR 2 (archive) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Decision needed: PR 1 may exceed 400 lines at the upper estimate. Code is ~80 lines; the excess is tests (CLAUDE.md size-exception rule). The user accepts it; coverage is never trimmed.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Resolver/storage, i18n init + `<html lang>`, selector, placements, locale keys, ADR-007 addendum, CLAUDE.md Locale | PR 1/2 | Base: main. Branch `web-locale-switch/01-locale-selector`. Title `feat(web): PR 1/2 — language selector (EN/ES/CA)` |
| 2 | Archive, spec merge, D9 hand edit | PR 2/2 | Base: main (after PR 1 merges). Branch `web-locale-switch/02-archive`. Title `docs(openspec): PR 2/2 — archive web-locale-switch` |

Strict TDD: each unit RED, GREEN, REFACTOR; apply records a "TDD Cycle Evidence" table. One commit per work unit (tests with code). Every commit must compile: `npx tsc -b` in apps/web. All paths below are under `apps/web/src/`.

## Phase A: PR 1 (sdd-apply)

Unit A, resolver and storage (D1-D4; Initial Language Resolution, Storage unavailable)
- [ ] A.1 RED: `i18n/locale-preference.test.ts`: stored en/es/ca win; stored `xx`, `''`, `ES`, `es-ES` ignored; `es-ES`/`ca-ES`/`CA` map to base, `fr`/`''`/`undefined` give en; `navigator.languages` empty falls back to `navigator.language`; throwing `Storage` stub: read gives `null`, write does not throw; round trip. RED: missing module.
- [ ] A.2 GREEN: `i18n/locale-preference.ts`: `resolveInitialLocale`, browser-language read, `readStoredLocale`/`writeStoredLocale` (key `sf-manager.locale`, try/catch).
- [ ] A.3 REFACTOR: tidy; `npx tsc -b`.

Unit B, i18n init and `<html lang>` (D5; Switch updates html lang, Browser base language, Valid stored choice wins)
- [ ] B.1 RED: `i18n/index.test.ts`: `vi.resetModules()`, stub `navigator.languages=['es']`, dynamic `import('./index')`, `<html lang>` is `es`; stored `ca` wins; after `changeLanguage('ca')` lang is `ca`. afterEach restores stubs, storage, lang.
- [ ] B.2 GREEN: `i18n/index.ts`: `lng` from resolver, `languageChanged` listener before `init`, update comment L7-9.

Unit C, selector (D6, D8; Labels do not translate, Switch, Choice survives reload, Storage unavailable)
- [ ] C.1 RED: `components/LanguageSelector.test.tsx`: three fixed endonym options with `lang` attrs in every active language; choosing Català sets `i18n.language`, stores `ca`, re-renders `language.label`; follows external `changeLanguage('es')`; throwing `setItem` still switches. afterEach resets.
- [ ] C.2 RED: `i18n/locales.test.ts`: `REQUIRED_LANGUAGE_KEY_PATHS` includes `language.label`.
- [ ] C.3 GREEN: `components/LanguageSelector.tsx` (native `<select>`, `aria-label`, store then change); add `language.label` to `i18n/locales/{en,es,ca}.json` (Language/Idioma/Idioma).
- [ ] C.4 REFACTOR: tidy; `npx tsc -b`.

Unit D, placements (D7; Present on both surfaces, Language selector is the only added control)
- [ ] D.1 RED: `layout/AppLayout.test.tsx` and `pages/LoginPage.test.tsx`: exactly one selector (inside `nav-root` / on login); switching to ES changes `nav.home` / `auth.loginTitle`. afterEach resets.
- [ ] D.2 GREEN: mount in `layout/AppLayout.tsx` `<nav>` after logout; in `pages/LoginPage.tsx` first child of `<main>`.
- [ ] D.3 REFACTOR: run `npx tsc -b`, web lint, `npm run test --workspace=apps/web`. Confirm no manifest, API or schema change (No backend or dependency change).

Docs (TDD N/A)
- [ ] D.4 `docs/adr/ADR-007-i18n-multilanguage-ui-english-codebase.md` addendum with open questions (per-user `User.locale`; walking `navigator.languages`); update `CLAUDE.md` Locale bullet.
- [ ] D.5 Check `git diff --stat`; commit by work unit: resolver, init, selector+keys, placements, docs.

## Gate (orchestrator)

- [ ] G.1 Browser verification (orchestrator + user; the user logs in): Vite dev server, claude-in-chrome. Per design plan: (1) login switch ES then CA, `<html lang>` via `javascript_tool`, check placement vs logo (D7 fallback); (2) logged in, switch and reload persists; (3) `localStorage['sf-manager.locale']='xx'` falls back to browser language; (4) ES/CA screenshots of nav, login, a list, schedule dates, review document; fix findings; (5) print CSS copied into screen `<style>`, selector hidden. Report browser- or test-verified.
- [ ] G.2 Fresh-context PR review before push and before merge; the user confirms push, PR and merge. PR passes `ci`.

## Phase B: Close

- [ ] B.1 `sdd-verify` against spec scenarios after PR 1 merges.
- [ ] B.2 `sdd-archive` via `web-locale-switch/02-archive`: merge both deltas (new `web-locale-selection`, modified `app-navigation`) into `openspec/specs/`; orchestrator does `git mv` and commit.
- [ ] B.3 D9 hand edit in the same PR: `openspec/specs/app-navigation/spec.md` Purpose L28-29, "a language switcher (deferred by ADR-007)" becomes "any language switcher other than the single selector defined by `web-locale-selection`".
