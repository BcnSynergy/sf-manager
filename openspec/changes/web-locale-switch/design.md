# Design: Web language selector (revision 2, post fresh-review)

## Technical Approach

A pure module, `apps/web/src/i18n/locale-preference.ts`, resolves the initial language from the stored value and the browser language, and wraps `localStorage` in try/catch. `i18n/index.ts` calls it synchronously and passes the result as `lng`, replacing `lng: 'en'` (`index.ts:16`). A `languageChanged` listener is registered before `init`, so `<html lang>` follows every change, including the initial one. A shared `LanguageSelector` (a native `<select>`) calls `i18n.changeLanguage` and stores the choice. It is mounted inside `AppLayout`'s `<nav>` (`AppLayout.tsx:49-62`) and at the top of `LoginPage`'s `<main>` (`LoginPage.tsx:61`). Date formatting already reads `i18n.language` (`ReviewSchedulePage.tsx:72,87`, `ReviewDocumentPage.tsx:328,330`), so it follows with no change.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|----------|----------|-----------|
| D1 | `resolveInitialLocale(stored: string \| null, browserLanguage: string \| undefined): SupportedLocale`. A stored value is accepted only when it is exactly `'en'`, `'es'` or `'ca'`. Otherwise the browser language is lowercased and cut at the first `-`; if that base is supported it wins. Otherwise `'en'`. | `i18next-browser-languagedetector`; i18next `supportedLngs` + `nonExplicitSupportedLngs` | The proposal rules out new dependencies. A pure function makes all three rules unit-testable without touching i18next. Mapping by hand keeps `i18n.language` a base code (`es`, never `es-ES`), which is what `Intl.DateTimeFormat` callers and the `<select>` value expect. |
| D2 | The browser language is `navigator.languages?.[0] \|\| navigator.language`: the primary language only. An empty `languages` array falls back to `navigator.language`. | Walking the whole `navigator.languages` list | This is the proposal's literal rule ("the browser language reduced to its base"), and it is predictable: `['fr','es']` opens in EN. Walking the list is a possible later refinement. |
| D3 | Storage key `sf-manager.locale`. `readStoredLocale()` and `writeStoredLocale(locale)` catch every exception: a read failure returns `null`, and a write failure is ignored. | Unguarded `localStorage` | Privacy modes can throw on access. Falling back to rule 2 matches the proposal. |
| D4 | Only the selector writes storage. Initial resolution and `i18n.changeLanguage` calls elsewhere (tests) never write it. | Persisting inside the `languageChanged` listener | A language derived from the browser is not a choice. Storing it would freeze it, and tests calling `changeLanguage` would write storage. |
| D5 | `<html lang>` is set by `i18n.on('languageChanged', (lng) => { document.documentElement.lang = lng; })`, registered before `init`. `index.html` keeps `lang="en"` as the pre-script value. With inline `resources`, i18next v26 `init` is synchronous: it calls `load()` directly instead of `setTimeout` (`dist/esm/i18next.js:1909-1910`), and the resulting `changeLanguage` emits `languageChanged` (`:2024`) before `init` returns. | A `useEffect` in a component | One listener covers both the initial value and every switch, wherever it comes from. That includes the login page, where no shell is mounted. |
| D6 | `apps/web/src/components/LanguageSelector.tsx`: a native `<select>` with `aria-label={t('language.label')}`. Options come from a constant `[['en','English'],['es','Español'],['ca','Català']]`, so they are not translated; each `<option>` carries `lang="en\|es\|ca"` (WCAG 3.1.2). Its value is `useTranslation().i18n.language`, the same base code D1 produces and D4 writes. `onChange` calls `writeStoredLocale` and then `changeLanguage`. `react-i18next` re-renders consumers. | `i18n.resolvedLanguage`; buttons or links; a visible `<label>`; separate container and presentational parts | `language` is what D1/D5 set and what date callers read, so there is a single source of truth. A native select gives keyboard and screen-reader behaviour for free, and endonyms describe themselves. The component is shared by two screens, like `ConfirmDialog` in `components/`. It is about 25 lines, so a container/presentational split would add nothing. |
| D7 | In `AppLayout`, the selector goes inside `<nav>`, after logout. It inherits the existing `.app-nav` flex gap (`index.css:134-137`) and the print suppression (`index.css:158-160`). In `LoginPage`, it is the first child of `<main>`, above the logo. Fallback: if the browser pass shows it competing with the logo, move it after the form. | A new header element | No new layout or CSS. The amended app-navigation requirement permits exactly this control. |
| D8 | A new locale key, `language.label`, with the values EN "Language", ES "Idioma" and CA "Idioma". It is added to a new `REQUIRED_LANGUAGE_KEY_PATHS` list in `locales.test.ts`. | Translated endonyms | Fixed endonyms are a product decision. The existing guard pattern catches a key that is missing from every locale. |
| D9 | The archive PR (`web-locale-switch/02-archive`) hand-edits `openspec/specs/app-navigation/spec.md` Purpose L28-29: "a language switcher (deferred by ADR-007)" becomes "any language switcher other than the single selector defined by `web-locale-selection`". | A delta block targeting Purpose prose | Deltas carry only full `### Requirement:` blocks (as in archived deltas); Purpose prose is not merged automatically, so `sdd-tasks` must create this task explicitly. |

## Data Flow

    load: readStoredLocale() + navigator lang -> resolveInitialLocale -> i18n.init({ lng })
                                                                       -> languageChanged -> <html lang>
    select: onChange(v) -> writeStoredLocale(v) -> i18n.changeLanguage(v) -> re-render + <html lang>

## File Changes

| File | Action | Est. lines |
|------|--------|-----------|
| `apps/web/src/i18n/locale-preference.ts` (+`locale-preference.test.ts`) | Create | code ~35 / test ~100 |
| `apps/web/src/i18n/index.ts` (+`index.test.ts`) | Resolved `lng`, listener, comment L7-9 | code ~8 / test ~40 |
| `apps/web/src/components/LanguageSelector.tsx` (+`LanguageSelector.test.tsx`) | Create | code ~25 / test ~95 |
| `apps/web/src/layout/AppLayout.tsx` (+`AppLayout.test.tsx`) | Mount the selector | code ~2 / test ~25 |
| `apps/web/src/pages/LoginPage.tsx` (+`LoginPage.test.tsx`) | Mount the selector | code ~2 / test ~25 |
| `apps/web/src/i18n/locales/{en,es,ca}.json`, `locales.test.ts` | `language.label`, plus fixes from the browser pass | code ~5+ / test ~8 |
| `docs/adr/ADR-007-i18n-multilanguage-ui-english-codebase.md`, `CLAUDE.md` | Addendum and Open questions; Locale bullet | docs ~30 |

Totals: about 80 lines of code, 270-320 of tests and 30 of docs, roughly 380-430 in all; the excess over 400, if any, is tests. If PR 1 exceeds 400, the CLAUDE.md size-exception rule applies: report the code vs test split and let the user accept it. Never trim coverage to fit.

## Testing Strategy (Strict TDD, RED first)

| Layer | Cases |
|-------|-------|
| Resolver unit (`locale-preference.test.ts`) | Each valid stored value wins over the browser language. A stored `'xx'`, `''`, `'ES'` or `'es-ES'` is ignored. A `null` store with `es-ES` gives es, `ca-ES` gives ca, `CA` gives ca, `fr` gives en, `''` gives en, and `undefined` gives en. Browser-language read: an empty `navigator.languages` array falls back to `navigator.language`. |
| Storage unit | A read or write against a stub `Storage` whose methods throw returns `null` or does not throw. A round trip works. |
| i18n startup (`index.test.ts`) | `vi.resetModules()`, stub `navigator.languages = ['es']` and set/clear `localStorage` BEFORE a dynamic `import('./index')`; assert `document.documentElement.lang === 'es'` (asserting `en` would be vacuous). A stored `ca` wins over `['es']`. After `changeLanguage('ca')`, `<html lang>` is `'ca'`. |
| Selector (`LanguageSelector.test.tsx`) | Three options with fixed endonyms in every active language, each with its `lang` attribute. Selecting Català sets `i18n.language`, stores `ca`, and re-renders `language.label`. The value follows an external `i18n.changeLanguage('es')`. With a storage stub whose `setItem` throws, selecting still changes the language for the session. |
| AppLayout / LoginPage (`AppLayout.test.tsx`, `LoginPage.test.tsx`) | The selector is rendered (inside `nav-root` / on login). Switching to ES changes a visible label (`nav.home` / `auth.loginTitle`). |

Within a file, every test that mounts a writer (the selector, `AppLayout`, `LoginPage`) has `afterEach`: `localStorage.clear()`, `i18n.changeLanguage('en')`, and `document.documentElement.lang = 'en'` where `<html lang>` is asserted; stubbed `navigator` properties are restored.

Existing tests need no change. Each file imports `../i18n` (e.g. `AppLayout.test.tsx:5`). Vitest isolates files by default (`vite.config.ts:15-19` sets no `isolate: false`), so every file gets a fresh jsdom with empty `localStorage` and `navigator.language` `en-US`, which resolves to `en`. The date-format regression is already covered by the locale tests in `ReviewSchedulePage.test.tsx:263` and `UserEditPage.test.tsx:307`.

## Delivery

Use the stacked-to-main chain.
- **PR 1** is `web-locale-switch/01-locale-selector`, titled `feat(web): PR 1/2 — language selector (EN/ES/CA)`.
- **PR 2** is `web-locale-switch/02-archive`; it includes the D9 hand edit.

Browser check (Vite dev server, `claude-in-chrome`):
1. On login, switch to ES and then CA; the texts change and `<html lang>` updates (checked with `javascript_tool`). Check the selector's placement against the logo (D7 fallback).
2. The user logs in. The nav shows the selector. Switch languages and reload; the choice persists.
3. Set `localStorage['sf-manager.locale']='xx'` and reload; the browser language applies.
4. In ES and CA, screenshot the nav, login, one list, the schedule (dates) and the review document, looking for overflow or untranslated strings. Fix what is found.
5. Print: copy the `@media print` rules into a screen `<style>` via `javascript_tool` and screenshot a shell page (e.g. the review document); the selector is hidden with the rest of `.app-nav`.

## Migration / Rollout

No migration is required. Revert the PR to roll back.

## Open Questions

These go in the ADR-007 addendum and are not implemented here (ADR-006).

- [ ] A persisted per-user language preference (`User.locale`, API, validation) is still unmet. The choice is per browser only.
- [ ] Walking the whole `navigator.languages` list instead of using the primary language only (D2).
