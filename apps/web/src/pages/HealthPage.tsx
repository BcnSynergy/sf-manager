import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

type HealthState = { status: 'checking' } | { status: 'ok' } | { status: 'error' };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

// review-session/design.md Decision 10: "/" (this page) is already
// reachable by every authenticated role and already has the logout control,
// so the minimum viable landing for the two non-admin roles is a
// role-conditional link here — no navigation component, no layout refactor.
// Satisfies review-session-ui spec "Both Non-Admin Roles Have a Reachable
// Entry Point": the link is offered for MAINTENANCE_TECHNICIAN and
// COMMUNITY_REPRESENTATIVE alike, never a "not authorized" landing for
// either.
const REVIEW_SESSION_ROLES = new Set(['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE']);

// review-history-company-scope design.md Q5/Decision 10: the manager's
// entry point lives here too, but points at /review-history only — never
// at /review-sessions, the write surface this role must never reach.
const REVIEW_HISTORY_ROLES = new Set(['MAINTENANCE_COMPANY_MANAGER']);

export function HealthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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
      {user && REVIEW_SESSION_ROLES.has(user.role) && (
        <Link to="/review-sessions" data-testid="review-sessions-entry-link">
          {t('health.reviewSessionsLink')}
        </Link>
      )}
      {user && REVIEW_HISTORY_ROLES.has(user.role) && (
        <Link to="/review-history" data-testid="review-history-entry-link">
          {t('health.reviewHistoryLink')}
        </Link>
      )}
      <button type="button" data-testid="logout-button" onClick={() => void handleLogout()}>
        {t('auth.logoutLabel')}
      </button>
    </main>
  );
}
