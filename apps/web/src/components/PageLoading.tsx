import { useTranslation } from 'react-i18next';

// TD-8: the <Suspense> fallback shown while a lazy-loaded page's chunk
// downloads (AppLayout for the authenticated pages, App for /login).
export function PageLoading() {
  const { t } = useTranslation();
  return (
    <main>
      <p data-testid="page-loading">{t('common.pageLoading')}</p>
    </main>
  );
}
