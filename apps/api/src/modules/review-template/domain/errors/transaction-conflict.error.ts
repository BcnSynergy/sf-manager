// Thrown by PrismaReviewTemplateRepository.activate() (design.md Decision
// 3, Phase 9) when the underlying SERIALIZABLE transaction aborts on a
// concurrency conflict (Prisma error code P2034) or the partial unique
// index backstop rejects a concurrent double-activation (P2002 on
// `ReviewTemplate_one_active_per_lineage`). No automatic retry — the client
// resubmits. The presentation layer maps this to 409 { code:
// REVIEW_TEMPLATE_ACTIVATION_CONFLICT } (design.md Findings #2: "A sixth
// error code is required... the proposal lists five").
//
// review-template declares its own copy of this error (same precedent as
// `community/domain/errors/transaction-conflict.error.ts`: "Each module
// owns its errors, as `users` does") rather than importing another module's
// `TransactionConflictError`, avoiding a cross-module domain import for
// five lines.
export class TransactionConflictError extends Error {
  constructor() {
    super('The operation conflicted with a concurrent change; please retry');
    this.name = 'TransactionConflictError';
  }
}
