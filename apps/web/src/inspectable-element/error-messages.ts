import type { ApiError } from '../api/client';
import type { InspectableElementErrorCode } from '../api/inspectable-element';

// Maps a caught ApiError{status,code} to an i18n key — mirrors
// community/error-messages.ts's and maintenance-company/error-messages.ts's
// contract exactly (spec "No Server-Message String Coupling"). This
// function reads only `status` and `code`; it MUST NEVER read `.message` —
// the server's `message` field is English prose for logs/Swagger, not for
// UI selection.
//
// Both codes deliberately map to the SAME key (spec "Generic Not-Found
// Handling"): the admin UI shows one honest "not found" message for a
// create/update/delete action against a community or element that no
// longer exists, without attempting to distinguish the two causes.
const CODE_MESSAGE_KEYS: Record<InspectableElementErrorCode, string> = {
  COMMUNITY_NOT_FOUND: 'inspectableElement.error.notFound',
  INSPECTABLE_ELEMENT_NOT_FOUND: 'inspectableElement.error.notFound',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as InspectableElementErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'inspectableElement.error.validationFailed';
    case HTTP_NOT_FOUND:
      // No `code` present (e.g. an uncoded 404) — still the same generic
      // message per "Generic Not-Found Handling".
      return 'inspectableElement.error.notFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
