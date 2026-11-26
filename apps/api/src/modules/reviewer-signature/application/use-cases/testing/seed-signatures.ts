import type { FileStorage } from '../../../../../shared/application/ports/file-storage.port';
import { pngHeader } from '../../../../organization-profile/domain/testing/logo-fixtures';
import type { ReviewerSignatureRepository } from '../../ports/reviewer-signature.repository.port';

// Test helper: registers a small valid PNG signature for each user, as the
// upload use case leaves it (a file under `signatures/` plus the row that
// records its key), so a test that signs reviews has something to sign with.
export async function seedSignatures(
  storage: FileStorage,
  repository: ReviewerSignatureRepository,
  userIds: string[],
): Promise<void> {
  for (const userId of userIds) {
    const key = `signatures/${userId}.png`;
    await storage.put(key, pngHeader(40, 12));
    await repository.save(userId, key);
  }
}
