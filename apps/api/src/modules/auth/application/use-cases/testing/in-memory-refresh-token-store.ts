import type {
  NewRefreshToken,
  RefreshTokenStore,
  StoredRefreshToken,
} from '../../ports/refresh-token-store.port';

// In-memory RefreshTokenStore for unit and e2e tests. Same contract as the
// Prisma adapter, including the atomic markRotated.
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  readonly tokens = new Map<string, StoredRefreshToken>();

  create(token: NewRefreshToken): Promise<void> {
    this.tokens.set(token.id, { ...token, rotatedAt: null, revokedAt: null });
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash) {
        return Promise.resolve({ ...token });
      }
    }
    return Promise.resolve(null);
  }

  markRotated(id: string, at: Date): Promise<boolean> {
    const token = this.tokens.get(id);
    if (!token || token.rotatedAt !== null) {
      return Promise.resolve(false);
    }
    token.rotatedAt = at;
    return Promise.resolve(true);
  }

  revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const token of this.tokens.values()) {
      if (token.familyId === familyId && token.revokedAt === null) {
        token.revokedAt = at;
      }
    }
    return Promise.resolve();
  }

  deleteExpired(now: Date): Promise<void> {
    for (const [id, token] of this.tokens) {
      if (token.expiresAt < now) {
        this.tokens.delete(id);
      }
    }
    return Promise.resolve();
  }
}
