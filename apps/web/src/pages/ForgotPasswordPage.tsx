import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PASSWORD_RESET_LOCALES, passwordResetRequestSchema } from '@sf-manager/validation';
import { requestPasswordReset } from '../api/password-reset';
import { Alert, StatusRegion } from '../components/Alert';
import { PublicCard } from '../components/PublicCard';
import { useAlertMessage } from '../components/use-alert-message';
import { passwordResetErrorKey } from './password-reset-error-key';

// password-reset S8: asks for the email and, whatever a 202 meant on the
// server, shows the same confirmation, so the page never reveals whether an
// account exists. The email is checked with the shared schema, which also
// normalizes it; the locale is the language selected in the app.
export function ForgotPasswordPage() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const error = useAlertMessage();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    error.clear();

    const language = PASSWORD_RESET_LOCALES.find((locale) => locale === i18n.language);
    const result = passwordResetRequestSchema.safeParse({ email, locale: language });
    if (!result.success) {
      error.show('auth.validationInvalidEmail');
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(result.data.email, result.data.locale);
      setSent(true);
    } catch (err) {
      error.show(passwordResetErrorKey(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicCard title={t('auth.passwordReset.forgot.title')}>
      {sent ? (
        <StatusRegion>
          <Alert
            tone="success"
            testId="forgot-confirmation"
            message={t('auth.passwordReset.forgot.confirmation')}
          />
        </StatusRegion>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <p>{t('auth.passwordReset.forgot.intro')}</p>
          <label htmlFor="forgot-email-input">{t('auth.emailLabel')}</label>
          <input
            id="forgot-email-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            data-testid="forgot-email"
          />
          {error.message && (
            <Alert key={error.key} tone="danger" testId="forgot-error" message={t(error.message)} />
          )}
          <button
            type="submit"
            className="sf-btn-primary"
            disabled={submitting}
            data-testid="forgot-submit"
          >
            {t('auth.passwordReset.forgot.submit')}
          </button>
        </form>
      )}
      <Link to="/login" data-testid="forgot-back-to-login">
        {t('auth.passwordReset.backToLogin')}
      </Link>
    </PublicCard>
  );
}
