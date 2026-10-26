// Machine-readable discriminator for the two 400 causes on
// PUT /organization-profile/logo (organization-logo S2), added to the
// shared {statusCode, error, message} body by buildCodedError. Mirrored as a
// literal union in apps/web/src/api/organization-profile.ts.
export type OrganizationProfileErrorCode =
  'LOGO_FILE_MISSING' | 'LOGO_UNSUPPORTED_FORMAT';
