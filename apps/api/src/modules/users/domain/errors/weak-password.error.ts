// Thrown by PlainPassword.create() (design.md Decision 6) when a raw
// password fails passwordSchema (packages/validation) — minimum 10 chars,
// at least one letter, at least one digit (spec.md "Password Strength
// Policy"). The application layer maps this to a 4xx validation error
// before any hashing or persistence occurs.
export class WeakPasswordError extends Error {
  constructor() {
    super('Password does not meet the minimum strength policy');
    this.name = 'WeakPasswordError';
  }
}
