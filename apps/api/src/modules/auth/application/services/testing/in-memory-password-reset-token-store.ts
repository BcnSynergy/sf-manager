import type {
  NewPasswordResetToken,
  PasswordResetTokenStore,
} from '../../ports/password-reset-token-store.port';

export interface StoredPasswordResetToken extends NewPasswordResetToken {
  usedAt: Date | null;
}

// In-memory PasswordResetTokenStore for unit and e2e tests. Same contract as
// the Prisma adapter: consume claims synchronously, so two concurrent calls
// cannot both win.
export class InMemoryPasswordResetTokenStore implements PasswordResetTokenStore {
  readonly tokens = new Map<string, StoredPasswordResetToken>();

  createReplacingUnused(token: NewPasswordResetToken): Promise<void> {
    // Like the unique index on tokenHash: refuse before invalidating anything.
    for (const existing of this.tokens.values()) {
      if (existing.tokenHash === token.tokenHash) {
        return Promise.reject(new Error('Duplicate password reset token hash'));
      }
    }
    for (const existing of this.tokens.values()) {
      if (existing.userId === token.userId && existing.usedAt === null) {
        existing.usedAt = token.createdAt;
      }
    }
    this.tokens.set(token.id, { ...token, usedAt: null });
    return Promise.resolve();
  }

  consume(tokenHash: string, now: Date): Promise<{ userId: string } | null> {
    for (const token of this.tokens.values()) {
      if (
        token.tokenHash === tokenHash &&
        token.usedAt === null &&
        token.expiresAt > now
      ) {
        token.usedAt = now;
        return Promise.resolve({ userId: token.userId });
      }
    }
    return Promise.resolve(null);
  }

  deleteExpired(now: Date): Promise<void> {
    for (const [id, token] of this.tokens) {
      if (token.expiresAt <= now) {
        this.tokens.delete(id);
      }
    }
    return Promise.resolve();
  }
}
