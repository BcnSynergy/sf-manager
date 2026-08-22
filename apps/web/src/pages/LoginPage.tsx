import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { loginRequestSchema } from '@sf-manager/validation';
import { useAuth } from '../auth/AuthProvider';

// spec.md "Login Form Validation": empty/invalid fields are blocked
// client-side, before any network call, using the SAME schema the API
// enforces (ADR-015 single source of truth) — no separate reimplementation
// of email-format validation here. Server rejection (401) always shows one
// generic message, never a field-specific hint (anti-enumeration).
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError(t('auth.validationRequired'));
      return;
    }

    const result = loginRequestSchema.safeParse({ email, password });
    if (!result.success) {
      // Both fields are non-empty here, so a schema failure means the email
      // doesn't match the expected format — a distinct, accurate message
      // from "required". This is purely a client-side format check, not the
      // server's anti-enumeration boundary: confirming an email LOOKS
      // syntactically valid never reveals whether an account exists.
      setError(t('auth.validationInvalidEmail'));
      return;
    }

    try {
      await login(result.data.email, result.data.password);
      navigate('/');
    } catch {
      setError(t('auth.loginFailed'));
    }
  }

  return (
    <main>
      <img src="/logo.svg" alt={t('auth.logoAlt')} data-testid="login-logo" />
      <h1>{t('auth.loginTitle')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="login-email-input">{t('auth.emailLabel')}</label>
        <input
          id="login-email-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="login-email"
        />
        <label htmlFor="login-password-input">{t('auth.passwordLabel')}</label>
        <input
          id="login-password-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="login-password"
        />
        {error && <p data-testid="login-error">{error}</p>}
        <button type="submit" data-testid="login-submit">
          {t('auth.submitLabel')}
        </button>
      </form>
    </main>
  );
}
