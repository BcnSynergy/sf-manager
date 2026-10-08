import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  readBrowserLanguage,
  readStoredLocale,
  resolveInitialLocale,
  writeStoredLocale,
} from './locale-preference';

// web-locale-selection spec "Initial Language Resolution" and "Storage
// unavailable": a valid stored choice wins, then the browser language
// reduced to its base, then English. Storage failures never throw.

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('storage unavailable');
  };
  return { getItem: fail, setItem: fail } as unknown as Storage;
}

describe('resolveInitialLocale', () => {
  it.each(['en', 'es', 'ca'] as const)('a stored %s wins over the browser language', (stored) => {
    expect(resolveInitialLocale(stored, 'fr')).toBe(stored);
    expect(resolveInitialLocale(stored, 'es-ES')).toBe(stored);
  });

  it.each(['xx', '', 'ES', 'es-ES'])('ignores the invalid stored value %j', (stored) => {
    expect(resolveInitialLocale(stored, 'ca')).toBe('ca');
  });

  it.each([
    ['es-ES', 'es'],
    ['ca-ES', 'ca'],
    ['CA', 'ca'],
    ['fr', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ])('maps the browser language %j to %s when nothing is stored', (browser, expected) => {
    expect(resolveInitialLocale(null, browser)).toBe(expected);
  });
});

describe('readBrowserLanguage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the primary entry of navigator.languages', () => {
    vi.stubGlobal('navigator', { languages: ['ca-ES', 'es'], language: 'es' });
    expect(readBrowserLanguage()).toBe('ca-ES');
  });

  it('falls back to navigator.language when languages is empty', () => {
    vi.stubGlobal('navigator', { languages: [], language: 'es-ES' });
    expect(readBrowserLanguage()).toBe('es-ES');
  });
});

describe('stored locale', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('round-trips a written locale under the documented key', () => {
    writeStoredLocale('ca');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ca');
    expect(readStoredLocale()).toBe('ca');
  });

  it('reads null when nothing is stored', () => {
    expect(readStoredLocale()).toBeNull();
  });

  it('reads null when storage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(readStoredLocale()).toBeNull();
  });

  it('does not throw when writing to unavailable storage', () => {
    vi.stubGlobal('localStorage', throwingStorage());
    expect(() => writeStoredLocale('es')).not.toThrow();
  });
});
