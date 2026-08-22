// Thrown by LoginUseCase for every invalid-credentials outcome — wrong
// password, unknown email, or soft-deleted user (design.md Decision 7) all
// produce this SAME error, mapped by AuthController to one generic 401
// (spec.md "Failed Login — Generic Error").
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}
