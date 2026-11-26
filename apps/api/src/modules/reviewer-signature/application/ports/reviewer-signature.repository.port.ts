import type { ReviewerSignature } from '../../domain/reviewer-signature';

// One row per user who registered a signature (reviewer-signature).
export interface ReviewerSignatureRepository {
  findByUserId(userId: string): Promise<ReviewerSignature | null>;

  // Records `storageKey` as the user's signature, creating or replacing the
  // row, and resolves it with the time of this write as `updatedAt`.
  save(userId: string, storageKey: string): Promise<ReviewerSignature>;

  // EN-243: the subset of `storageKeys` that some user's signature row
  // references. Rows are never deleted (a user is soft-deleted, and the FK
  // refuses a hard delete), so every row keeps its file. Not scoped: the
  // orphan file sweep is a system task, never reached by a request.
  findReferencedStorageKeys(storageKeys: string[]): Promise<Set<string>>;

  // EN-243: whether any signature row exists. The sweep deletes nothing
  // under signatures/ when none does (sweepOrphanFiles).
  hasAnySignature(): Promise<boolean>;
}

export const REVIEWER_SIGNATURE_REPOSITORY = Symbol(
  'REVIEWER_SIGNATURE_REPOSITORY',
);
