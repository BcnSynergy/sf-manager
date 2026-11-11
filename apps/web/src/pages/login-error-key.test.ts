import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { loginErrorKey } from './login-error-key';

// EN-175, EN-178: which message a failed login shows. A 4xx is a rejection
// (429 has its own message); no answer, an unreadable answer, a 5xx, or an
// ApiError with status 0 (the client's "unavailable") means the server
// cannot be reached.
describe('loginErrorKey', () => {
  it.each([
    [400, 'auth.loginFailed'],
    [401, 'auth.loginFailed'],
    [429, 'auth.loginRateLimited'],
    [499, 'auth.loginFailed'],
    [500, 'auth.loginUnavailable'],
    [503, 'auth.loginUnavailable'],
    [0, 'auth.loginUnavailable'],
  ])('maps ApiError(%i) to %s', (status, key) => {
    expect(loginErrorKey(new ApiError(status))).toBe(key);
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['an unreadable answer', new SyntaxError('Unexpected end of JSON input')],
  ])('maps %s to auth.loginUnavailable', (_case, error) => {
    expect(loginErrorKey(error)).toBe('auth.loginUnavailable');
  });
});
