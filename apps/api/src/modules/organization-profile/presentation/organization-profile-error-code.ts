// Machine-readable discriminator for the three 400 causes on
// PUT /organization-profile/logo (organization-logo S2, EN-111), added to the
// shared {statusCode, error, message} body by buildCodedError. The web client
// mirrors it as a literal union (organization-logo PR 2/3).
export type OrganizationProfileErrorCode =
  'LOGO_FILE_MISSING' | 'LOGO_UNSUPPORTED_FORMAT' | 'LOGO_UPLOAD_INVALID';
