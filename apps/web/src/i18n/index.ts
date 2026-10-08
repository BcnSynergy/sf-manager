import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';
import { readBrowserLanguage, readStoredLocale, resolveInitialLocale } from './locale-preference';

// ADR-007: English default/fallback, Spanish and Catalan as the other
// initial locales. The initial language is the browser-stored choice, else
// the browser language, else English (web-locale-switch; the per-user
// preference stays an ADR-007 open question). With inline resources, init is
// synchronous, so the listener below also sees the initial language.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ca: { translation: ca },
  },
  lng: resolveInitialLocale(readStoredLocale(), readBrowserLanguage()),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
