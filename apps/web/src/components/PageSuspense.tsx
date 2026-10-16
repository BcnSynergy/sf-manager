import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// TD-8: every page is a lazy-loaded chunk (routes/authenticated-routes.tsx,
// App.tsx for /login). PageSuspense shows a loading message while a page's
// chunk downloads, and an error with a reload button if it fails to load: a
// network error, or a stale tab asking for a chunk a redeploy removed.
// Without the error boundary such a failure would unmount the whole app.
export function PageSuspense({ resetKey, children }: { resetKey?: string; children: ReactNode }) {
  return (
    <PageLoadBoundary resetKey={resetKey}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </PageLoadBoundary>
  );
}

type BoundaryProps = { resetKey?: string; children: ReactNode };
type BoundaryState = { failed: boolean };

// A class component: React offers error boundaries only through
// getDerivedStateFromError. The error clears when `resetKey` (the current
// path) changes, so navigating away recovers without a reload.
class PageLoadBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? <PageLoadError /> : this.props.children;
  }
}

function PageLoading() {
  const { t } = useTranslation();
  return (
    <main>
      <p data-testid="page-loading">{t('common.pageLoading')}</p>
    </main>
  );
}

function PageLoadError() {
  const { t } = useTranslation();
  return (
    <main>
      <p role="alert" data-testid="page-load-error">
        {t('common.pageLoadError')}
      </p>
      <button type="button" data-testid="page-load-reload" onClick={() => window.location.reload()}>
        {t('common.reload')}
      </button>
    </main>
  );
}
