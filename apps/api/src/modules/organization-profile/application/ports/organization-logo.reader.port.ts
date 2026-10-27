// Port (application layer). organization-logo S8: the logo read another
// module may use, bound in organization-profile.module.ts via `useExisting:
// GetOrganizationLogoUseCase`. Exported next to ORGANIZATION_PROFILE_READER
// so review-session can show the logo on a document without reaching the
// upload or the storage key.
export interface OrganizationLogo {
  content: Buffer;
  contentType: string;
}

export interface OrganizationLogoReader {
  // Resolves null when there is no logo to show.
  execute(): Promise<OrganizationLogo | null>;
}

export const ORGANIZATION_LOGO_READER = Symbol('ORGANIZATION_LOGO_READER');
