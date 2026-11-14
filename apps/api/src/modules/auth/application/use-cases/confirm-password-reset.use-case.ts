import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
} from '../../../../shared/application/ports/clock.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../../../shared/application/ports/password-hasher.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../../users/application/ports/user.repository.port';
import { PlainPassword } from '../../../users/domain/password';
import { InvalidResetTokenError } from '../../domain/invalid-reset-token.error';
import {
  OPAQUE_TOKEN_GENERATOR,
  type OpaqueTokenGenerator,
} from '../ports/opaque-token-generator.port';
import {
  PASSWORD_RESET_TOKEN_STORE,
  type PasswordResetTokenStore,
} from '../ports/password-reset-token-store.port';
import {
  REFRESH_TOKEN_STORE,
  type RefreshTokenStore,
} from '../ports/refresh-token-store.port';

export interface ConfirmPasswordResetInput {
  token: string;
  password: string;
}

// password-reset S4, S5. The password policy runs first (a weak password
// throws WeakPasswordError and leaves the link usable), then the token is
// consumed atomically, then the hash is replaced and every session of the
// user ends. The token is spent even if a later step fails: the user asks
// for a new link.
@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_TOKEN_STORE)
    private readonly resetTokens: PasswordResetTokenStore,
    @Inject(REFRESH_TOKEN_STORE) private readonly sessions: RefreshTokenStore,
    @Inject(OPAQUE_TOKEN_GENERATOR)
    private readonly tokens: OpaqueTokenGenerator,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ConfirmPasswordResetInput): Promise<void> {
    const password = PlainPassword.create(input.password);
    const now = this.clock.now();

    const consumed = await this.resetTokens.consume(
      this.tokens.hash(input.token),
      now,
    );
    if (!consumed) {
      throw new InvalidResetTokenError();
    }
    // A soft-deleted user resolves to null (ADR-010): its link is invalid.
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new InvalidResetTokenError();
    }

    await this.users.updatePasswordHashById(
      user.id,
      await this.hasher.hash(password.value),
    );
    await this.sessions.revokeAllForUser(user.id, now);

    // Opportunistic housekeeping: never gates the reset.
    try {
      await this.resetTokens.deleteExpired(now);
    } catch {
      // swallow: stale rows linger a bit longer, which is harmless.
    }
  }
}
