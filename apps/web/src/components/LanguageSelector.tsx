import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { writeStoredLocale, type SupportedLocale } from '../i18n/locale-preference';

// web-locale-switch/design.md D6: the options are fixed endonyms, never
// translated, so a user who cannot read the current language can still find
// their own. Each carries its own `lang` (WCAG 3.1.2). Storing happens here
// only (D4); a failed write never blocks the switch for the session.
const OPTIONS: ReadonlyArray<readonly [SupportedLocale, string]> = [
  ['en', 'English'],
  ['es', 'Español'],
  ['ca', 'Català'],
];

export function LanguageSelector() {
  const { t, i18n } = useTranslation();

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const locale = event.target.value as SupportedLocale;
    writeStoredLocale(locale);
    void i18n.changeLanguage(locale);
  }

  return (
    <select aria-label={t('language.label')} value={i18n.language} onChange={handleChange}>
      {OPTIONS.map(([code, name]) => (
        <option key={code} value={code} lang={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
