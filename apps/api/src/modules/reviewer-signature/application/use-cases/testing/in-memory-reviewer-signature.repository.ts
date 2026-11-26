import type { ReviewerSignature } from '../../../domain/reviewer-signature';
import type { ReviewerSignatureRepository } from '../../ports/reviewer-signature.repository.port';

export class InMemoryReviewerSignatureRepository implements ReviewerSignatureRepository {
  private readonly rows = new Map<string, ReviewerSignature>();
  // Test hook: makes the next save fail, to prove the upload cleans up.
  failNextSave: Error | null = null;

  findByUserId(userId: string): Promise<ReviewerSignature | null> {
    const row = this.rows.get(userId);
    return Promise.resolve(row ? { ...row } : null);
  }

  save(userId: string, storageKey: string): Promise<ReviewerSignature> {
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = null;
      return Promise.reject(error);
    }
    const row = { userId, storageKey, updatedAt: new Date() };
    this.rows.set(userId, row);
    return Promise.resolve({ ...row });
  }
}
