// Thrown when a create-user attempt targets an email already used by an
// active user (spec.md "Create User", "Duplicate email rejected"; design.md
// Decision 8 — a plain insert's unique-violation surfaces as this error,
// never a silent upsert). The application layer maps this to 409.
export class EmailAlreadyInUseError extends Error {
  constructor() {
    super('Email is already in use');
    this.name = 'EmailAlreadyInUseError';
  }
}
