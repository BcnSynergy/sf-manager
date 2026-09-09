import { UserDirectory } from '../../ports/user-directory.port';

// Test double for UserDirectory (design.md Decision 5). Configured with a
// static `userId -> companyId | null` map — an id with no seeded entry
// resolves to `null`, mirroring the real adapter's behaviour for an unknown
// or company-less user.
//
// Phase 1 covers `findMaintenanceCompanyId` only (write-path half) —
// `findEmailsByIds` (read-path half) is added in Phase 3.
export class InMemoryUserDirectory implements UserDirectory {
  private readonly companyIdByUserId = new Map<string, string | null>();

  seedCompany(userId: string, companyId: string | null): void {
    this.companyIdByUserId.set(userId, companyId);
  }

  findMaintenanceCompanyId(userId: string): Promise<string | null> {
    return Promise.resolve(this.companyIdByUserId.get(userId) ?? null);
  }
}
