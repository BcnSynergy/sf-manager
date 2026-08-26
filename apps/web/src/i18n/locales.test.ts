import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';

// Structural i18n parity guard (spec "Internationalization Coverage",
// design.md Testing Strategy: "Key-set equality test over the 3 locale
// JSONs"). This does NOT check translation quality/content — only that the
// three locale files expose the identical set of nested key paths, so a key
// added to `en.json` in one PR can never silently ship without its `es`/`ca`
// counterpart.

type LocaleTree = { [key: string]: string | LocaleTree };

function collectKeyPaths(tree: LocaleTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      return [path];
    }
    return collectKeyPaths(value, path);
  });
}

describe('locale key-set parity (en/es/ca)', () => {
  const locales: Record<string, LocaleTree> = {
    en: en as LocaleTree,
    es: es as LocaleTree,
    ca: ca as LocaleTree,
  };

  const keyPathsByLocale = Object.fromEntries(
    Object.entries(locales).map(([name, tree]) => [name, new Set(collectKeyPaths(tree))]),
  );

  it('en and es expose the same nested key paths', () => {
    const missingFromEs = [...keyPathsByLocale.en].filter((k) => !keyPathsByLocale.es.has(k));
    const extraInEs = [...keyPathsByLocale.es].filter((k) => !keyPathsByLocale.en.has(k));

    expect(missingFromEs).toEqual([]);
    expect(extraInEs).toEqual([]);
  });

  it('en and ca expose the same nested key paths', () => {
    const missingFromCa = [...keyPathsByLocale.en].filter((k) => !keyPathsByLocale.ca.has(k));
    const extraInCa = [...keyPathsByLocale.ca].filter((k) => !keyPathsByLocale.en.has(k));

    expect(missingFromCa).toEqual([]);
    expect(extraInCa).toEqual([]);
  });

  it('no locale is missing any key path present in another locale', () => {
    const allKeyPaths = new Set([
      ...keyPathsByLocale.en,
      ...keyPathsByLocale.es,
      ...keyPathsByLocale.ca,
    ]);

    for (const [localeName, keyPaths] of Object.entries(keyPathsByLocale)) {
      const missing = [...allKeyPaths].filter((k) => !keyPaths.has(k));
      expect(missing, `${localeName} is missing key paths: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
