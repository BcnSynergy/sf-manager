import type { ApiError } from '../api/client';
import type { ChecklistQuestionErrorCode } from '../api/checklist-question';

// Maps a caught ApiError{status,code} to an i18n key — mirrors
// inspectable-element/error-messages.ts's contract exactly (spec "Coded
// Error Handling Without Server-Message Coupling"). This function reads
// only `status` and `code`; it MUST NEVER read `.message` — the server's
// `message` field is English prose for logs/Swagger, not for UI selection.
const CODE_MESSAGE_KEYS: Record<ChecklistQuestionErrorCode, string> = {
  CHECKLIST_QUESTION_NOT_FOUND: 'checklistQuestion.error.notFound',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as ChecklistQuestionErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'checklistQuestion.error.validationFailed';
    case HTTP_NOT_FOUND:
      // No `code` present (e.g. an uncoded 404) — still the same generic
      // message per "404 shows a generic message".
      return 'checklistQuestion.error.notFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
