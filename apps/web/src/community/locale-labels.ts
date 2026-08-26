import type { Locale } from '@sf-manager/validation';

// Maps a Locale enum value to its i18n key — same "value in, i18n key out"
// shape as users/role-labels.ts's mapRoleToLabelKey, kept as a pure function
// rather than calling useTranslation()'s t() itself so it stays
// independently testable without any i18n runtime/provider. Callers pass
// the returned key to their own t() (spec "Enum Value Label Mapping": locale
// MUST always render through an i18n label map, never the raw enum value).
const LOCALE_LABEL_KEYS: Record<Locale, string> = {
  en: 'community.locale.en',
  es: 'community.locale.es',
  ca: 'community.locale.ca',
};

export function mapLocaleToLabelKey(locale: Locale): string {
  return LOCALE_LABEL_KEYS[locale];
}
