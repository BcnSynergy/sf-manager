import { z } from 'zod';

// design.md Interfaces/Contracts (PATCH /organization-profile) +
// organization-profile-management spec.md "Partial Update of the
// Organization Profile" / "A Supplied Field Must Be Non-Blank" / "An Update
// That Changes Nothing Succeeds": all six fields optional; a field PRESENT
// in the body must be non-empty after trim, so `''`, whitespace-only and
// explicit `null` are all rejected (z.string() itself already rejects
// `null` — `.optional()` only widens to `undefined`, never `null`).
// Unrecognized properties (including `logoAssetId`) are stripped by
// z.object's default behaviour, never persisted.
//
// design.md Decision 2: taxId is a LOCAL, trim-only schema — deliberately
// NOT importing `taxIdSchema` from `maintenance-company`, which
// `.toUpperCase()`s to canonicalize for a uniqueness index this singleton
// entity does not have. Upper-casing here would silently rewrite the
// admin's own CIF as typed, for no guarantee in return.
//
// email is trimmed and format-checked (spec.md doesn't relax the format
// rule just because there's no uniqueness to protect) but NOT lower-cased —
// unlike createUserSchema/updateUserSchema's `.toLowerCase()`, which exists
// to canonicalize a unique login index. This value is contact data destined
// for documents; case is meaningful here.
export const updateOrganizationProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  legalName: z.string().trim().min(1).optional(),
  taxId: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).pipe(z.email()).optional(),
  // No logoAssetId key: reserved and inert (ADR-012, design.md Interfaces).
  // Absent here so it is unwritable by construction, not by a rejection
  // rule — any value supplied for it is silently stripped, mirroring the
  // z.object default handling of any other unrecognized property.
});

export type UpdateOrganizationProfileRequest = z.infer<
  typeof updateOrganizationProfileSchema
>;
