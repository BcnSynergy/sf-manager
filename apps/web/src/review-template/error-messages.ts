import type { ApiError } from '../api/client';
import type { ReviewTemplateErrorCode } from '../api/review-template';

// Maps a caught ApiError{status,code} to an i18n key — mirrors
// checklist-question/error-messages.ts's contract exactly (spec "Coded
// Error Handling Without Server-Message Coupling"). This function reads
// only `status` and `code`; it MUST NEVER read `.message`.
const CODE_MESSAGE_KEYS: Record<ReviewTemplateErrorCode, string> = {
  REVIEW_TEMPLATE_NOT_FOUND: 'reviewTemplate.error.notFound',
  REVIEW_TEMPLATE_NOT_EDITABLE: 'reviewTemplate.error.notEditable',
  REVIEW_TEMPLATE_EMPTY: 'reviewTemplate.error.empty',
  REVIEW_TEMPLATE_DRAFT_EXISTS: 'reviewTemplate.error.draftExists',
  REVIEW_TEMPLATE_ACTIVATION_CONFLICT: 'reviewTemplate.error.activationConflict',
  CHECKLIST_QUESTION_NOT_FOUND: 'reviewTemplate.error.questionNotFound',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as ReviewTemplateErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'reviewTemplate.error.validationFailed';
    case HTTP_NOT_FOUND:
      // No `code` present (e.g. an uncoded 404) — still the same generic
      // message per checklist-question's precedent.
      return 'reviewTemplate.error.notFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
