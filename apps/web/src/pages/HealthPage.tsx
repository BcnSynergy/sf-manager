import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

type HealthState = { status: 'checking' } | { status: 'ok' } | { status: 'error' };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export function HealthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [health, setHealth] = useState<HealthState>({ status: 'checking' });

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((res) => (res.ok ? setHealth({ status: 'ok' }) : setHealth({ status: 'error' })))
      .catch(() => setHealth({ status: 'error' }));
  }, []);

  // spec.md "Logout Flow (Web)": trigger the logout endpoint, then redirect
  // to /login once the session is cleared.
  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <main>
      <h1>{t('health.title')}</h1>
      <p data-testid="health-status">
        {health.status === 'checking' && t('health.checking')}
        {health.status === 'ok' && t('health.ok')}
        {health.status === 'error' && t('health.error')}
      </p>
      <button type="button" data-testid="logout-button" onClick={() => void handleLogout()}>
        {t('auth.logoutLabel')}
      </button>
    </main>
  );
}
