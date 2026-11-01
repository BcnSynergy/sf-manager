import type {
  FoundRefreshToken,
  NewRefreshToken,
  RefreshExchangeKind,
  RefreshTokenStore,
  StoredRefreshToken,
} from '../../ports/refresh-token-store.port';

// In-memory RefreshTokenStore for unit and e2e tests. Same contract as the
// Prisma adapter, including the atomic exchange (nothing is consumed when
// storing the successor fails).
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  readonly tokens = new Map<string, StoredRefreshToken>();

  create(token: NewRefreshToken): Promise<void> {
    this.tokens.set(token.id, {
      ...token,
      rotatedAt: null,
      graceUsedAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<FoundRefreshToken | null> {
    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash) {
        const familyRevoked = [...this.tokens.values()].some(
          (other) =>
            other.familyId === token.familyId && other.revokedAt !== null,
        );
        return Promise.resolve({ ...token, familyRevoked });
      }
    }
    return Promise.resolve(null);
  }

  async exchange(
    id: string,
    kind: RefreshExchangeKind,
    at: Date,
    successor: NewRefreshToken,
  ): Promise<boolean> {
    const token = this.tokens.get(id);
    const field = kind === 'rotation' ? 'rotatedAt' : 'graceUsedAt';
    if (!token || token[field] !== null) {
      return false;
    }
    await this.create(successor);
    token[field] = at;
    return true;
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
      if (token.familyExpiresAt < now) {
        this.tokens.delete(id);
      }
    }
    return Promise.resolve();
  }
}
