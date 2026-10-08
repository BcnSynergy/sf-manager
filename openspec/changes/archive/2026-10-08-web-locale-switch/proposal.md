# Proposal: Web language selector

## Intent

The web UI ships complete EN/ES/CA translations, but `apps/web/src/i18n/index.ts` pins `lng: 'en'`, so no user can see Spanish or Catalan and ES/CA can only be checked by locale tests, never in the browser (CLAUDE.md "Locale" note, tech-debt #7). ADR-007 says users must be able to select their language. This change lets them, per browser.

## Scope

### In Scope
- A language selector on `LoginPage` and in `AppLayout`. It offers fixed endonyms "English / Español / Català", whatever the active language.
- Initial language, in this order:
  1. a valid stored choice;
  2. otherwise the browser language reduced to its base (`es-ES` → `es`, `ca-ES` → `ca`);
  3. otherwise English (the current `fallbackLng`).
- An invalid or corrupt stored value is ignored, and step 2 applies.
- The choice persists per browser in `localStorage`.
- `<html lang>` follows the active language.
- ES/CA strings found untranslated or overflowing in the browser pass are fixed in this change.
- Docs:
  - An ADR-007 addendum stating that the "persisted per-user language preference" remains unmet, with that item added as an open question.
  - The CLAUDE.md "Locale" bullet is updated.

### Out of Scope
- A per-user backend preference (needs a migration, an API and validation; deferred).
- Translating messages that originate in the API.
- Adding locales.

Web-only is deliberate: this is a client UI concern with no backend change.

## Capabilities

### New Capabilities
- `web-locale-selection`: selector placement and options, initial-language resolution, persistence, invalid-value handling, `<html lang>`.

### Modified Capabilities
- `app-navigation`: "The Navigation Stays a Link Bar and Nothing More" currently forbids "a language switcher" and dropdowns. That requirement must permit exactly this selector and still forbid everything else.

## Approach

Hand-rolled, with no new dependency (no `i18next-browser-languagedetector`). A small pure resolver (`stored → navigator → 'en'`) feeds `i18n.init`. A shared selector component calls `i18n.changeLanguage`, writes `localStorage` and sets `document.documentElement.lang`. Date formatting already reads `i18n.language`, so it follows the change. Strict TDD (ADR-016) applies. References: ADR-006, ADR-007.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/i18n/index.ts` | Modified | Resolved initial language |
| `apps/web/src/i18n/locale-preference.ts` | New | Initial-language resolution and guarded persistence |
| `apps/web/src/components/LanguageSelector.tsx` | New | Shared selector component |
| `apps/web/src/layout/AppLayout.tsx`, `apps/web/src/pages/LoginPage.tsx` | Modified | Host the selector |
| `apps/web/src/i18n/locales/{en,es,ca}.json` | Modified | Selector label, browser-pass fixes |
| `docs/adr/ADR-007-i18n-multilanguage-ui-english-codebase.md`, `CLAUDE.md` | Modified | Addendum and open question, Locale note |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ES/CA strings overflow or are missing in real layouts | Med | Browser pass in all three languages, with fixes in scope |
| `localStorage` is unavailable (privacy mode) | Low | Guarded access; falls back to rule 2 |
| Existing tests assume `en` at init | Med | Tests pin the language explicitly |
| Users expect the choice to follow them across devices | Low | Documented as deferred in ADR-007 |

## Rollback Plan

Revert the PR. There is no migration or API change. A leftover `localStorage` key is harmless.

## Dependencies

- None new. The PR must pass the `ci` check (ADR-017).

## Success Criteria

- [ ] Switching language on the login page and in the shell re-renders the UI and updates `<html lang>`, verified in the browser in EN, ES and CA.
- [ ] The choice survives a reload. A first visit with `es-ES`/`ca-ES` opens in ES/CA; `fr` opens in EN; a corrupt stored value is ignored.
- [ ] The ADR-007 addendum and the CLAUDE.md Locale note are updated.

## Size

About 80-120 code lines, 200-300 test lines and about 30 doc lines in one implementation PR (`web-locale-switch/01-locale-selector`), plus an archive PR (`web-locale-switch/02-archive`).
