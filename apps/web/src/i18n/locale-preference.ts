// web-locale-switch/design.md D1-D4: pure resolution of the initial UI
// language plus a try/catch-guarded wrapper over localStorage. Only the
// language selector writes storage (D4); initial resolution never does.

export const SUPPORTED_LOCALES = ['en', 'es', 'ca'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = 'sf-manager.locale';

function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '');
}

// A stored value counts only when it is exactly a supported code. Otherwise
// the browser language is reduced to its base ("es-ES" -> "es"), and English
// is the last resort.
export function resolveInitialLocale(
  stored: string | null,
  browserLanguage: string | undefined,
): SupportedLocale {
  if (isSupportedLocale(stored)) {
    return stored;
  }
  const base = (browserLanguage ?? '').toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : 'en';
}

// Primary browser language only (D2); an empty `languages` array falls back
// to `navigator.language`.
export function readBrowserLanguage(): string | undefined {
  return navigator.languages?.[0] || navigator.language;
}

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (privacy modes): the choice then lasts for
    // the session only.
  }
}
