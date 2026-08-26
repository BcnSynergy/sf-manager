import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { createUserSchema, roleSchema, type Role } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createUser } from '../api/users';
import { mapApiErrorToMessageKey } from '../users/error-messages';
import { mapRoleToLabelKey } from '../users/role-labels';

const ROLE_OPTIONS = roleSchema.options;
const DEFAULT_ROLE: Role = 'SYSTEM_ADMIN';

// spec.md "Create User": client-side validation against the shared
// createUserSchema/passwordSchema MUST run before any network request
// (ADR-015 single source of truth, mirrors LoginPage.tsx's pattern). On
// success the caller is sent back to /users, which refetches the list on
// mount — "appears in the list without a manual reload" per the spec.
// Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling"); this
// page never reads ApiError.message.
export function UserCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = createUserSchema.safeParse({ email, password, role });
    if (!result.success) {
      setError(t('users.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createUser(result.data);
      navigate('/users');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t('users.create.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="user-create-email-input">{t('users.create.emailLabel')}</label>
        <input
          id="user-create-email-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="user-create-email"
        />
        <label htmlFor="user-create-password-input">{t('users.create.passwordLabel')}</label>
        <input
          id="user-create-password-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="user-create-password"
        />
        <label htmlFor="user-create-role-input">{t('users.create.roleLabel')}</label>
        <select
          id="user-create-role-input"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          data-testid="user-create-role"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapRoleToLabelKey(option))}
            </option>
          ))}
        </select>
        {error && <p data-testid="user-create-error">{error}</p>}
        <button type="submit" data-testid="user-create-submit" disabled={submitting}>
          {t('users.create.submitLabel')}
        </button>
      </form>
    </main>
  );
}
