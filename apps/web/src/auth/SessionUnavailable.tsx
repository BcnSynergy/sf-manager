import { useTranslation } from 'react-i18next';

// authentication spec "Session Check Unavailable on Load (Web)": rendered by
// ProtectedRoute when the session check on load failed for a reason other
// than a signed-out visitor, so a short API outage does not send a user with
// a valid session to the login page.
export function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <main data-testid="session-unavailable">
      <h1>{t('common.sessionUnavailableTitle')}</h1>
      <p>{t('common.sessionUnavailableMessage')}</p>
      <p>
        <button type="button" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </p>
    </main>
  );
}
