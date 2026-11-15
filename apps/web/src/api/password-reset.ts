import type { PasswordResetLocale } from '@sf-manager/validation';
import { apiFetch } from './client';

// password-reset S1: the two public endpoints. Neither answers 401, so the
// session refresh in apiFetch never runs for them. The request endpoint
// answers 202 whatever the email is; the caller must not read anything into
// the outcome beyond a 429 or a failure.
export function requestPasswordReset(email: string, locale: PasswordResetLocale): Promise<void> {
  return apiFetch('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email, locale }),
  });
}

// 204 on success; 400 with code INVALID_RESET_TOKEN for an unknown, expired
// or used link, and a 400 without that code for a weak password.
export function confirmPasswordReset(token: string, password: string): Promise<void> {
  return apiFetch('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
