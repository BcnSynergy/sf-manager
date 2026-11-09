import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

// app-navigation "An Unknown Path Shows a Not-Found Page" (EN-161): rendered
// by the catch-all route in AppRoutes, under AppLayout and ProtectedRoute, so
// a signed-in user keeps the nav and a signed-out visitor is sent to /login
// before this ever renders.
export function NotFound() {
  const { t } = useTranslation();

  return (
    <main data-testid="not-found">
      <h1>{t('common.notFoundTitle')}</h1>
      <p>{t('common.notFoundMessage')}</p>
      <p>
        <Link to="/">{t('common.goHome')}</Link>
      </p>
    </main>
  );
}
