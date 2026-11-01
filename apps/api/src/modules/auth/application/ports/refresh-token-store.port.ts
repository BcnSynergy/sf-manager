// TD-5 (ADR-011 Decision 4): persistence for rotating refresh tokens. One
// record per issued token; a login starts a family and every refresh adds the
// next token to it. Only the hash of the opaque token is ever stored.
export interface StoredRefreshToken {
  id: string;
  tokenHash: string;
  familyId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  familyExpiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export type NewRefreshToken = Omit<
  StoredRefreshToken,
  'rotatedAt' | 'revokedAt'
>;

export interface RefreshTokenStore {
  create(token: NewRefreshToken): Promise<void>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  // Atomic consume: sets rotatedAt only if it is still null. Returns false
  // when another request rotated the token first.
  markRotated(id: string, at: Date): Promise<boolean>;

  // Revokes every token of the family that is not revoked yet.
  revokeFamily(familyId: string, at: Date): Promise<void>;

  deleteExpired(now: Date): Promise<void>;
}

export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');
