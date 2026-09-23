// Port (application layer, ADR-002/013), owned by its consumer
// (`review-session`) — module-local and deliberately NOT re-exported by
// review-session.module.ts (review-export/design.md Decision 4;
// review-export/specs/review-document/spec.md "The lookup port is not
// exported"). It backs the document read only, never review-history's
// existing per-element lookups.
//
// Both element and context (community/company) lookups are inclusive of
// state that `CommunityRepository.findById`/`MaintenanceCompanyRepository.
// findById` (ADR-010's default soft-delete filter) and
// `findActiveByCommunityAndType` (drops deactivated elements too) would
// hide. A signed document must still name a community, company or element
// that was decommissioned after the session completed — spec.md "Deleted
// context still labels the document" / "A decommissioned or soft-deleted
// element still labels its entry".
export interface ReviewDocumentElementIdentity {
  code: string;
  name: string;
  location: string;
}

export interface ReviewDocumentNameDirectory {
  // Soft-delete-inclusive: a community has no deactivation state, only
  // `deletedAt` (ADR-010). Absent (no row at all — FK-protected, not
  // expected in practice) resolves `null`, never `''` — the use case owns
  // the `''` fallback (design.md "Fallbacks and letterhead").
  findCommunityName(communityId: string): Promise<string | null>;

  // Same soft-delete-inclusive contract as findCommunityName, for
  // MaintenanceCompany. Called only when the session carries a recorded
  // `performedByCompanyId` — a session with none has no company, not an
  // absent lookup (spec.md "A session without an attributed company has no
  // company").
  findMaintenanceCompanyName(companyId: string): Promise<string | null>;

  // One batched query for the whole set (design.md Data Flow step 3 — "one
  // query"), soft-delete- AND deactivation-inclusive: an
  // InspectableElement deactivated or soft-deleted after the session
  // completed must still be identified by its real code/name/location
  // (spec.md "A decommissioned or soft-deleted element still labels its
  // entry"). An id with no row at all is simply absent from the returned
  // map — the use case falls back to the neutral "unknown element" label
  // (spec.md "An element id with no row falls back to the neutral label"),
  // mirroring how UserDirectory.findEmailsByIds handles an unresolved id.
  findElementsByIds(
    ids: readonly string[],
  ): Promise<Map<string, ReviewDocumentElementIdentity>>;
}

export const REVIEW_DOCUMENT_NAME_DIRECTORY = Symbol(
  'REVIEW_DOCUMENT_NAME_DIRECTORY',
);
