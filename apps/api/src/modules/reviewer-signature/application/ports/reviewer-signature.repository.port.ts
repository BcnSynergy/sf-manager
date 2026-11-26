import type { ReviewerSignature } from '../../domain/reviewer-signature';

// One row per user who registered a signature (reviewer-signature).
export interface ReviewerSignatureRepository {
  findByUserId(userId: string): Promise<ReviewerSignature | null>;

  // Records `storageKey` as the user's signature, creating or replacing the
  // row, and resolves it with the time of this write as `updatedAt`.
  save(userId: string, storageKey: string): Promise<ReviewerSignature>;
}

export const REVIEWER_SIGNATURE_REPOSITORY = Symbol(
  'REVIEWER_SIGNATURE_REPOSITORY',
);
