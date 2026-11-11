import { ApiError } from '../api/client';
import { HTTP_SERVER_ERROR_MIN, HTTP_TOO_MANY_REQUESTS } from '../api/http-status';

// The message a failed login shows (EN-175). AuthProvider.login rejects with
// ApiError(status) for an error answer; anything else is a network failure
// or an unreadable answer. ApiError(0) is the client's "unavailable"; login
// does not produce it today, but it must never read as wrong credentials
// (EN-178).
export function loginErrorKey(err: unknown): string {
  if (!(err instanceof ApiError) || err.status === 0 || err.status >= HTTP_SERVER_ERROR_MIN) {
    return 'auth.loginUnavailable';
  }
  return err.status === HTTP_TOO_MANY_REQUESTS ? 'auth.loginRateLimited' : 'auth.loginFailed';
}
