// Thrown by the maintenance-company create/update use cases (design.md
// Decision 2) when the adapter maps a Postgres `P2002` from the
// hand-written partial unique index (`WHERE "deletedAt" IS NULL`) — the
// SOLE enforcement of "taxId unique among active companies" (spec.md "taxId
// Uniqueness Among Active Companies"); there is no use-case read-check.
// The application layer maps this to 409 { code: TAX_ID_ALREADY_IN_USE }.
export class TaxIdAlreadyInUseError extends Error {
  constructor() {
    super('Tax id is already in use by another active maintenance company');
    this.name = 'TaxIdAlreadyInUseError';
  }
}
