import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { passwordSchema } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { confirmPasswordReset } from '../api/password-reset';
import { Alert } from '../components/Alert';
import { PublicCard } from '../components/PublicCard';
import { useAlertMessage } from '../components/use-alert-message';
import { passwordResetErrorKey } from './password-reset-error-key';

const INVALID_RESET_TOKEN = 'INVALID_RESET_TOKEN';
const HTTP_BAD_REQUEST = 400;

// The link carries the token in the fragment (`#token=...`), never in the
// query string, so it never reaches a server log or a Referer header. It is
// read once, then dropped from the address bar so it does not linger on
// screen. It moves into the history entry's state (never shown, never sent),
// so the page still has it if it mounts again after the fragment is gone, as
// a lazy route can; a later visit without the link has no such state.
const TOKEN_STATE_KEY = 'passwordResetToken';

function takeTokenFromFragment(): string | null {
  const { hash, pathname, search } = window.location;
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  const fromHash = new URLSearchParams(hash.slice(1)).get('token');
  if (hash) {
    window.history.replaceState(
      fromHash ? { ...state, [TOKEN_STATE_KEY]: fromHash } : state,
      '',
      pathname + search,
    );
  }
  const kept = state[TOKEN_STATE_KEY];
  return fromHash || (typeof kept === 'string' && kept ? kept : null);
}

// Once the token is spent (changed password) or refused (invalid link), it
// has no reason to stay in the history entry.
function forgetToken(): void {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  if (TOKEN_STATE_KEY in state) {
    const rest = { ...state };
    delete rest[TOKEN_STATE_KEY];
    window.history.replaceState(rest, '');
  }
}

// password-reset S8: asks for the new password twice. The strength rule is the
// shared schema's; the messages come from i18n (the schema's are English).
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromFragment);
  const [linkInvalid, setLinkInvalid] = useState(token === null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const error = useAlertMessage();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    error.clear();

    const weak = !passwordSchema.safeParse(password).success;
    const mismatch = password !== confirm;
    setPasswordError(weak);
    setConfirmError(mismatch);
    if (weak || mismatch || token === null) {
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token, password);
      forgetToken();
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === HTTP_BAD_REQUEST) {
        if (err.code === INVALID_RESET_TOKEN) {
          forgetToken();
          setLinkInvalid(true);
        } else {
          error.show('auth.passwordReset.reset.rules');
        }
      } else {
        error.show(passwordResetErrorKey(err));
      }
      setSubmitting(false);
    }
  }

  if (linkInvalid) {
    return (
      <PublicCard title={t('auth.passwordReset.reset.title')}>
        <Alert
          tone="danger"
          testId="reset-invalid-link"
          message={t('auth.passwordReset.reset.invalidLink')}
        />
        <Link to="/forgot-password" data-testid="reset-request-new">
          {t('auth.passwordReset.reset.requestNew')}
        </Link>
      </PublicCard>
    );
  }

  return (
    <PublicCard title={t('auth.passwordReset.reset.title')}>
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <div className="sf-field">
          <label htmlFor="reset-password-input">
            {t('auth.passwordReset.reset.passwordLabel')}
          </label>
          <input
            id="reset-password-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={passwordError}
            aria-describedby="reset-password-rules"
            data-testid="reset-password"
          />
          {/* The rules are the hint; once they are broken the same text turns
              into the field's error instead of appearing twice. */}
          {passwordError ? (
            <p
              id="reset-password-rules"
              role="alert"
              className="sf-field-error"
              data-testid="reset-password-error"
            >
              {t('auth.passwordReset.reset.rules')}
            </p>
          ) : (
            <small
              id="reset-password-rules"
              className="sf-field-hint"
              data-testid="reset-password-rules"
            >
              {t('auth.passwordReset.reset.rules')}
            </small>
          )}
        </div>
        <div className="sf-field">
          <label htmlFor="reset-confirm-input">{t('auth.passwordReset.reset.confirmLabel')}</label>
          <input
            id="reset-confirm-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={confirmError}
            data-testid="reset-password-confirm"
          />
          {confirmError && (
            <p role="alert" className="sf-field-error" data-testid="reset-confirm-error">
              {t('auth.passwordReset.reset.mismatch')}
            </p>
          )}
        </div>
        {error.message && (
          <Alert key={error.key} tone="danger" testId="reset-error" message={t(error.message)} />
        )}
        <button
          type="submit"
          className="sf-btn-primary"
          disabled={submitting}
          data-testid="reset-submit"
        >
          {t('auth.passwordReset.reset.submit')}
        </button>
      </form>
    </PublicCard>
  );
}
