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

export type RefreshExchangeKind = 'rotation' | 'grace';

export interface RefreshTokenStore {
  create(token: NewRefreshToken): Promise<void>;

  findByHash(tokenHash: string): Promise<FoundRefreshToken | null>;

  // Atomic exchange, in one transaction: consumes the token (kind
  // 'rotation' sets rotatedAt, 'grace' sets graceUsedAt, each only if still
  // null) and, only when that wins, stores the successor. Returns false and
  // stores nothing when another request got there first. If storing the
  // successor fails, the consume is rolled back.
  exchange(
    id: string,
    kind: RefreshExchangeKind,
    at: Date,
    successor: NewRefreshToken,
  ): Promise<boolean>;

  // Revokes every token of the family that is not revoked yet.
  revokeFamily(familyId: string, at: Date): Promise<void>;

  // Deletes the tokens of families past their absolute expiry. Consumed
  // tokens are kept until then, so a late reuse is still recognised.
  deleteExpired(now: Date): Promise<void>;
}

export const REFRESH_TOKEN_STORE = Symbol('REFRESH_TOKEN_STORE');
