import type en from './locales/en.json';

// Every dotted path to a string in the English resources, for example
// 'common.error.network'. English is the source locale, and a test checks
// that es and ca have the same keys, so a MessageKey exists in all three.
type LeafKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeafKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

// EN-210: an i18n key, never translated text. Alerts store one and translate
// it when they render, so they follow a language switch (EN-203).
export type MessageKey = LeafKeys<typeof en>;
