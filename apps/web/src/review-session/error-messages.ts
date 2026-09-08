import type { ApiError } from '../api/client';
import type { ReviewSessionErrorCode } from '../api/review-session';

// Maps a caught ApiError{status,code} to an i18n key — same "read only
// status/code, never .message" contract as every other error-messages.ts in
// this app (spec "No Server-Message String Coupling", mirrored here from
// review-session-ui spec "Error handling does not branch on English message
// text"). Never reads ApiError.message.
//
// review-session-ui spec "Rejected Codes Get One Uniform Message": every
// cause a resolved code can fail for — unknown, foreign-community,
// wrong-element-type, decommissioned, soft-deleted — collapses server-side
// to the SAME `ELEMENT_NOT_FOUND` code (review-session/design.md
// Decision 6), so mapping that one code to one message key already IS the
// uniform-message guarantee; this mapper adds no further branching that
// could reintroduce a per-cause message.
const CODE_MESSAGE_KEYS: Record<ReviewSessionErrorCode, string> = {
  COMMUNITY_NOT_IN_SCOPE: 'reviewSession.error.communityNotInScope',
  ACTIVE_TEMPLATE_NOT_FOUND: 'reviewSession.error.activeTemplateNotFound',
  OPEN_DRAFT_ALREADY_EXISTS: 'reviewSession.error.openDraftAlreadyExists',
  REVIEW_SESSION_NOT_FOUND: 'reviewSession.error.sessionNotFound',
  REVIEW_SESSION_NOT_EDITABLE: 'reviewSession.error.sessionNotEditable',
  ELEMENT_NOT_FOUND: 'reviewSession.error.elementNotFound',
  ANSWERS_DO_NOT_MATCH_TEMPLATE: 'reviewSession.error.answersDoNotMatchTemplate',
  MISSING_OBSERVATIONS: 'reviewSession.error.missingObservations',
  MISSING_ANSWERS: 'reviewSession.error.missingAnswers',
  UNREVIEWED_ELEMENTS_WITHOUT_REASON: 'reviewSession.error.unreviewedElementsWithoutReason',
};

const HTTP_BAD_REQUEST = 400;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as ReviewSessionErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'reviewSession.error.validationFailed';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
