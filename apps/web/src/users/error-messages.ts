import type { ApiError } from '../api/client';
import type { UserErrorCode } from '../api/users';

// Maps a caught ApiError{status,code} to an i18n key — the only "cause
// disambiguation" mechanism client code is allowed to use (spec "No
// Server-Message String Coupling"). This function reads only `status` and
// `code`; it MUST NEVER read `.message`, because the server's `message`
// field is English prose meant for logs/Swagger, not for UI selection.
const CODE_MESSAGE_KEYS: Record<UserErrorCode, string> = {
  EMAIL_ALREADY_IN_USE: 'users.error.duplicateEmail',
  LAST_SYSTEM_ADMIN: 'users.error.lastSystemAdmin',
  TRANSACTION_CONFLICT: 'users.error.tryAgain',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as UserErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'users.error.weakPassword';
    case HTTP_NOT_FOUND:
      return 'users.error.notFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
