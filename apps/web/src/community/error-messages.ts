import type { ApiError } from '../api/client';
import type { CommunityErrorCode } from '../api/community';

// Maps a caught ApiError{status,code} to an i18n key — mirrors
// users/error-messages.ts's contract exactly (spec "No Server-Message
// String Coupling"). This function reads only `status` and `code`; it MUST
// NEVER read `.message` — the server's `message` field is English prose for
// logs/Swagger, not for UI selection.
//
// INELIGIBLE_ROLE maps to a generic, section-agnostic key here.
// AssignmentSection.tsx (Phase 3, design.md Interfaces/Contracts
// `AssignmentSectionProps.keys.ineligible`) supplies the section-specific
// copy (representative vs technician) for that one cause — this map's
// `INELIGIBLE_ROLE` entry is the fallback, not necessarily the final
// rendered copy.
const CODE_MESSAGE_KEYS: Record<CommunityErrorCode, string> = {
  ASSIGNMENT_ALREADY_EXISTS: 'community.error.assignmentExists',
  INELIGIBLE_ROLE: 'community.error.ineligibleRole',
  TRANSACTION_CONFLICT: 'community.error.tryAgain',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as CommunityErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'community.error.validationFailed';
    case HTTP_NOT_FOUND:
      // Generic Not-Found Handling on Assignment Actions (spec): one
      // message covers unknown community, unknown/ineligible userId, and a
      // stale assignment reference — no cause-specific distinction is
      // attempted.
      return 'community.error.assignmentTargetNotFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
