import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';

// The login page's frame (logo, title, card, credit, language selector) for
// the other public pages: the password reset pages sit outside the app shell
// and look like the login page. LoginPage keeps its own copy of this markup
// on purpose: the password reset slice does not touch its behavior.
export function PublicCard({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="sf-login">
      <div className="sf-login-card">
        <picture className="sf-login-logo">
          <source srcSet="/logo-on-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/logo.svg" alt={t('auth.logoAlt')} data-testid="login-logo" />
        </picture>
        <h1>{title}</h1>
        {children}
        <div className="sf-login-foot">
          <span className="sf-credit" data-testid="login-credit">
            <picture>
              <source srcSet="/bcnsynergy-mark-on-dark.svg" media="(prefers-color-scheme: dark)" />
              <img src="/bcnsynergy-mark.svg" alt="" />
            </picture>
            {t('brand.credit')}
          </span>
          <LanguageSelector />
        </div>
      </div>
    </main>
  );
}
