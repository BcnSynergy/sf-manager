import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { DemoBanner } from './DemoBanner';
import { DemoContext, type DemoAccounts } from './demo-context';

const DEMO: DemoAccounts = {
  enabled: true,
  password: 'sf-manager-demo-1',
  accounts: [{ email: 'gestor@demo.sf-manager.example', role: 'MANAGER' }],
};

// demo-instance S6 (spec `deployment`, "Demo identification").
describe('DemoBanner', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the Demo banner on the demo, as print-free chrome', () => {
    render(
      <DemoContext.Provider value={DEMO}>
        <DemoBanner />
      </DemoContext.Provider>,
    );

    const banner = screen.getByTestId('demo-banner');
    expect(banner).toHaveTextContent('Demo: all data is fictitious and is reset every night.');
    expect(banner).toHaveClass('app-demo-banner');
  });

  it('follows the language', async () => {
    await i18n.changeLanguage('ca');
    render(
      <DemoContext.Provider value={DEMO}>
        <DemoBanner />
      </DemoContext.Provider>,
    );

    expect(screen.getByTestId('demo-banner')).toHaveTextContent(
      'Demo: totes les dades són fictícies i es restableixen cada nit.',
    );
  });

  it('shows nothing outside the demo', () => {
    render(
      <DemoContext.Provider value={null}>
        <DemoBanner />
      </DemoContext.Provider>,
    );

    expect(screen.queryByTestId('demo-banner')).toBeNull();
  });
});
