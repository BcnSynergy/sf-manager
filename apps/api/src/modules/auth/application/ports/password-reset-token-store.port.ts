// password-reset S4 (ADR-013): persistence for emailed reset links. One
// record per link; only the SHA-256 of the opaque token is ever stored.
export interface NewPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface PasswordResetTokenStore {
  // In one transaction: marks the user's earlier unused tokens as used (a new
  // request invalidates them), then stores the new token.
  createReplacingUnused(token: NewPasswordResetToken): Promise<void>;

  // Atomic single use: marks the token used only if it exists, is unused and
  // has not expired at `now`, and returns its user. Returns null when it
  // cannot be consumed (unknown, used or expired, all alike). Two concurrent
  // calls cannot both win.
  consume(tokenHash: string, now: Date): Promise<{ userId: string } | null>;

  // Opportunistic cleanup of the tokens past their expiry.
  deleteExpired(now: Date): Promise<void>;
}

export const PASSWORD_RESET_TOKEN_STORE = Symbol('PASSWORD_RESET_TOKEN_STORE');
