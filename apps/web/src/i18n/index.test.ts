import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// web-locale-switch/design.md D5: the i18n module resolves its initial
// language at import time and keeps <html lang> in step with every change.
// Each test stubs the environment BEFORE a fresh dynamic import, because the
// resolution runs once, at module load.

async function loadI18n() {
  vi.resetModules();
  return (await import('./index')).default;
}

describe('i18n startup', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it('starts in the browser base language and sets <html lang>', async () => {
    vi.stubGlobal('navigator', { languages: ['es'], language: 'es' });

    const i18n = await loadI18n();

    expect(i18n.language).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('prefers a valid stored locale over the browser language', async () => {
    vi.stubGlobal('navigator', { languages: ['es'], language: 'es' });
    localStorage.setItem('sf-manager.locale', 'ca');

    const i18n = await loadI18n();

    expect(i18n.language).toBe('ca');
    expect(document.documentElement.lang).toBe('ca');
  });

  it('updates <html lang> after a language change', async () => {
    vi.stubGlobal('navigator', { languages: ['es'], language: 'es' });
    const i18n = await loadI18n();

    await i18n.changeLanguage('ca');

    expect(document.documentElement.lang).toBe('ca');
  });
});
