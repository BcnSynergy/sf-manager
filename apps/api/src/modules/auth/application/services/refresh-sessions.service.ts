import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { RefreshRejectedError } from '../../domain/refresh-rejected.error';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../ports/opaque-token-generator.port';
import {
  REFRESH_TOKEN_STORE,
  type RefreshTokenStore,
  type StoredRefreshToken,
} from '../ports/refresh-token-store.port';
import {
  REFRESH_TOKEN_POLICY,
  type RefreshTokenPolicy,
} from './refresh-token-policy';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
}

// TD-5 (ADR-011 Decision 4): refresh-token families. A login starts a family;
// each refresh consumes the presented token and issues the next one in the
// same family. A consumed token presented again after the grace window is
// treated as stolen and kills the whole family (reuse detection).
@Injectable()
export class RefreshSessionsService {
  constructor(
    @Inject(REFRESH_TOKEN_STORE) private readonly store: RefreshTokenStore,
    @Inject(OPAQUE_TOKEN_GENERATOR)
    private readonly tokens: OpaqueTokenGenerator,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REFRESH_TOKEN_POLICY) private readonly policy: RefreshTokenPolicy,
  ) {}

  async start(userId: string): Promise<IssuedRefreshToken> {
    const now = this.clock.now();
    const familyId = this.ids.generate();
    const familyExpiresAt = new Date(now.getTime() + this.policy.absoluteTtlMs);
    return this.issue({ userId, familyId, familyExpiresAt }, now);
  }

  async rotate(token: string): Promise<RotatedRefreshToken> {
    const now = this.clock.now();
    const stored = await this.store.findByHash(this.tokens.hash(token));
    if (!stored) {
      throw new RefreshRejectedError('unknown');
    }
    if (stored.familyRevoked) {
      throw new RefreshRejectedError('revoked');
    }
    // Reuse is checked before expiry: an old stolen token still kills the
    // family, even when it could no longer be exchanged itself.
    if (stored.rotatedAt !== null && !this.withinGrace(stored.rotatedAt, now)) {
      await this.store.revokeFamily(stored.familyId, now);
      throw new RefreshRejectedError('reused');
    }
    if (stored.expiresAt.getTime() <= now.getTime()) {
      throw new RefreshRejectedError('expired');
    }
    // A token consumed a moment ago (or by a request that won the race right
    // now) gets one grace exchange, for two tabs refreshing at once. Once it
    // is spent, further attempts inside the window are turned away without
    // revoking: a replayed token cannot mint more siblings, and a third tab
    // does not log the user out everywhere. Outside the window it is reuse.
    const consumedNow =
      stored.rotatedAt === null &&
      (await this.store.markRotated(stored.id, now));
    if (!consumedNow && !(await this.store.claimGrace(stored.id, now))) {
      throw new RefreshRejectedError('superseded');
    }
    const issued = await this.issue(stored, now);
    return { ...issued, userId: stored.userId };
  }

  // Logout: kills the family of the presented token. Unknown tokens are
  // ignored, so logging out twice is harmless.
  async revoke(token: string): Promise<void> {
    const stored = await this.store.findByHash(this.tokens.hash(token));
    if (stored) {
      await this.store.revokeFamily(stored.familyId, this.clock.now());
    }
  }

  async deleteExpired(): Promise<void> {
    await this.store.deleteExpired(this.clock.now());
  }

  private withinGrace(rotatedAt: Date, now: Date): boolean {
    return now.getTime() - rotatedAt.getTime() <= this.policy.reuseGraceMs;
  }

  private async issue(
    family: Pick<StoredRefreshToken, 'userId' | 'familyId' | 'familyExpiresAt'>,
    now: Date,
  ): Promise<IssuedRefreshToken> {
    const token = this.tokens.generate();
    const idleExpiry = now.getTime() + this.policy.idleTtlMs;
    const expiresAt = new Date(
      Math.min(idleExpiry, family.familyExpiresAt.getTime()),
    );
    await this.store.create({
      id: this.ids.generate(),
      tokenHash: this.tokens.hash(token),
      familyId: family.familyId,
      userId: family.userId,
      createdAt: now,
      expiresAt,
      familyExpiresAt: family.familyExpiresAt,
    });
    return { token, expiresAt };
  }
}
