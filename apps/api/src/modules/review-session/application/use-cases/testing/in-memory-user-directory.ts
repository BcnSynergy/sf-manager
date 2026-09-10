import { UserDirectory } from '../../ports/user-directory.port';

// Test double for UserDirectory (design.md Decision 5). Configured with a
// static `userId -> companyId | null` map — an id with no seeded entry
// resolves to `null`, mirroring the real adapter's behaviour for an unknown
// or company-less user.
//
// Phase 1 covered `findMaintenanceCompanyId` only (write-path half). Phase 3
// (this) adds `findEmailsByIds` (read-path half) — deliberately
// soft-delete-inclusive, mirrored here by simply having no `deletedAt`
// concept at all: a seeded email always resolves.
export class InMemoryUserDirectory implements UserDirectory {
  private readonly companyIdByUserId = new Map<string, string | null>();
  private readonly emailByUserId = new Map<string, string>();

  seedCompany(userId: string, companyId: string | null): void {
    this.companyIdByUserId.set(userId, companyId);
  }

  seedEmail(userId: string, email: string): void {
    this.emailByUserId.set(userId, email);
  }

  findMaintenanceCompanyId(userId: string): Promise<string | null> {
    return Promise.resolve(this.companyIdByUserId.get(userId) ?? null);
  }

  findEmailsByIds(userIds: readonly string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const userId of userIds) {
      const email = this.emailByUserId.get(userId);
      if (email !== undefined) {
        result.set(userId, email);
      }
    }
    return Promise.resolve(result);
  }
}
