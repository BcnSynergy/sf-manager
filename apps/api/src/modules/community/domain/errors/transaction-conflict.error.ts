// Thrown by PrismaCommunityRepresentativeRepository.transactional()
// (design.md Decision 2) when the underlying SERIALIZABLE transaction
// aborts on a concurrency conflict (Prisma error code P2034) or the
// partial unique index backstop rejects a concurrent double-activation
// (P2002 on `CommunityRepresentative_one_active_per_community`). No
// automatic retry — the client resubmits. The presentation layer maps
// this to 409.
//
// Community declares its own copy of this error (design.md Decision 2:
// "Each module owns its errors, as `users` does") rather than importing
// `users`' `TransactionConflictError`, avoiding a cross-module domain
// import for five lines.
export class TransactionConflictError extends Error {
  constructor() {
    super('The operation conflicted with a concurrent change; please retry');
    this.name = 'TransactionConflictError';
  }
}
