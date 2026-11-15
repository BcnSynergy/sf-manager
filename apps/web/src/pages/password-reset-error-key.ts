import { ApiError } from '../api/client';
import { HTTP_TOO_MANY_REQUESTS } from '../api/http-status';

// The message a failed password reset call shows when it is not a page
// specific answer: a 429 has its own text (same pattern as loginErrorKey),
// anything else, a network failure included, is generic.
export function passwordResetErrorKey(err: unknown): string {
  return err instanceof ApiError && err.status === HTTP_TOO_MANY_REQUESTS
    ? 'auth.passwordReset.rateLimited'
    : 'common.error.network';
}
