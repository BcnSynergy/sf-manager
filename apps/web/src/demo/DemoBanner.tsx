import { useTranslation } from 'react-i18next';
import { useDemoInfo } from './demo-context';

// demo-instance S6: one bar above every page of the demo, the login page
// included. `.app-demo-banner` is print chrome
// (styles/check-app-nav-print-suppression.ts), so printed documents never
// carry it.
export function DemoBanner() {
  const { t } = useTranslation();
  if (!useDemoInfo()) return null;
  return (
    <p className="app-demo-banner sf-demo-banner" role="note" data-testid="demo-banner">
      {t('demo.banner')}
    </p>
  );
}
