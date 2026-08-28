import type { ApiError } from '../api/client';
import type { MaintenanceCompanyErrorCode } from '../api/maintenance-company';

// Maps a caught ApiError{status,code} to an i18n key — mirrors
// community/error-messages.ts's and users/error-messages.ts's contract
// exactly (spec "No Server-Message String Coupling"). This function reads
// only `status` and `code`; it MUST NEVER read `.message` — the server's
// `message` field is English prose for logs/Swagger, not for UI selection.
const CODE_MESSAGE_KEYS: Record<MaintenanceCompanyErrorCode, string> = {
  TAX_ID_ALREADY_IN_USE: 'maintenanceCompany.error.duplicateTaxId',
  MAINTENANCE_COMPANY_HAS_ACTIVE_USERS: 'maintenanceCompany.error.hasActiveUsers',
};

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

const NETWORK_ERROR_KEY = 'common.error.network';

export function mapApiErrorToMessageKey(error: ApiError): string {
  if (error.code !== undefined && error.code in CODE_MESSAGE_KEYS) {
    return CODE_MESSAGE_KEYS[error.code as MaintenanceCompanyErrorCode];
  }

  switch (error.status) {
    case HTTP_BAD_REQUEST:
      return 'maintenanceCompany.error.validationFailed';
    case HTTP_NOT_FOUND:
      return 'maintenanceCompany.error.notFound';
    default:
      // Covers status 0 (network/parse failure per client.ts) and any
      // other unrecognized status/code combination — fail safe to a
      // generic message rather than guessing a specific one.
      return NETWORK_ERROR_KEY;
  }
}
