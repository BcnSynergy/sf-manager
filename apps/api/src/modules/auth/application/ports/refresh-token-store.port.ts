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
  // The one grace exchange a consumed token allows (two tabs refreshing at once).
  graceUsedAt: Date | null;
  revokedAt: Date | null;
}

export type NewRefreshToken = Omit<
  StoredRefreshToken,
  'rotatedAt' | 'graceUsedAt' | 'revokedAt'
>;

export interface FoundRefreshToken extends StoredRefreshToken {
  // True when any token of the family is revoked. Revocation is a family
  // state: a token a racing refresh adds after the revoke is dead too.
  familyRevoked: boolean;
}

export interface RefreshTokenStore {
  create(token: NewRefreshToken): Promise<void>;

  findByHash(tokenHash: string): Promise<FoundRefreshToken | null>;

  // Atomic consume: sets rotatedAt only if it is still null. Returns false
  // when another request rotated the token first.
  markRotated(id: string, at: Date): Promise<boolean>;

  // Atomic: sets graceUsedAt only if it is still null. Returns false when the
  // grace exchange was already spent.
  claimGrace(id: string, at: Date): Promise<boolean>;

  // Revokes every token of the family that is not revoked yet.
  revokeFamily(familyId: string, at: Date): Promise<void>;

  // Deletes the tokens of families past their absolute expiry. Consumed
  // tokens are kept until then, so a late reuse is still recognised.
  deleteExpired(now: Date): Promise<void>;
}

export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');
