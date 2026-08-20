import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';

// ADR-007: English default/fallback, Spanish and Catalan as the other
// initial locales. Per-user locale preference wiring happens once the User
// entity/auth exists (ADR-011) — this just proves the mechanism works.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ca: { translation: ca },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
