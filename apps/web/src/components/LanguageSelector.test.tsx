import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { LanguageSelector } from './LanguageSelector';

// web-locale-selection spec: fixed endonym labels, switching, persistence
// and the unavailable-storage case.

afterEach(async () => {
  vi.unstubAllGlobals();
  localStorage.clear();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  document.documentElement.lang = 'en';
});

describe('LanguageSelector', () => {
  it.each(['en', 'es', 'ca'])(
    'shows the three endonyms with lang attributes when the UI is %s',
    async (lng) => {
      await act(async () => {
        await i18n.changeLanguage(lng);
      });
      render(<LanguageSelector />);

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['English', 'Español', 'Català']);
      expect(options.map((o) => o.getAttribute('lang'))).toEqual(['en', 'es', 'ca']);
    },
  );

  it('switches the language, stores the choice and re-renders its label', () => {
    render(<LanguageSelector />);
    expect(screen.getByLabelText('Language')).toHaveValue('en');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ca' } });

    expect(i18n.language).toBe('ca');
    expect(localStorage.getItem('sf-manager.locale')).toBe('ca');
    expect(screen.getByLabelText('Idioma')).toHaveValue('ca');
  });

  it('follows an external language change', async () => {
    render(<LanguageSelector />);

    await act(async () => {
      await i18n.changeLanguage('es');
    });

    expect(screen.getByRole('combobox')).toHaveValue('es');
  });

  it('still switches for the session when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage unavailable');
      },
    });
    render(<LanguageSelector />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });

    expect(i18n.language).toBe('es');
  });
});
