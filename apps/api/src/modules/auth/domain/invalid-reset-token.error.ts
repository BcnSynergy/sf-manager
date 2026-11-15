// password-reset S5: a reset token that cannot be used. Unknown, expired,
// already used, replaced by a newer link and belonging to a soft-deleted
// user are all this one error, so the answer reveals nothing about which.
export class InvalidResetTokenError extends Error {
  constructor() {
    super('The password reset link is invalid or has expired');
    this.name = 'InvalidResetTokenError';
  }
}
