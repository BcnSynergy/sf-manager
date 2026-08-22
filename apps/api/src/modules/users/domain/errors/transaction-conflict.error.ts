// Thrown by PrismaUserRepository.transactional() (design.md Decision 3) when
// the underlying SERIALIZABLE transaction aborts on a concurrency conflict
// (Prisma error code P2034 — Postgres SSI detected a read-write
// antidependency cycle between two concurrent transactions, e.g. two admins
// being demoted/deactivated at the same time). No automatic retry — the
// client resubmits. The presentation layer maps this to 409.
export class TransactionConflictError extends Error {
  constructor() {
    super('The operation conflicted with a concurrent change; please retry');
    this.name = 'TransactionConflictError';
  }
}
