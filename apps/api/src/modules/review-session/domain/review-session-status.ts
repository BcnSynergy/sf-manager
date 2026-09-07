// design.md Decision 9 — the ReviewSessionStatus three-way-declaration
// seam. This is the authoritative TypeScript union; the Postgres enum
// (`enum ReviewSessionStatus` in schema.prisma) and the Zod schema
// (`packages/validation`, Phase 5) are each a separate projection of the
// same set of values. Mirrors the const-array + derived-union shape of
// `REVIEW_FREQUENCIES` (checklist-question/domain/review-frequency.ts).
//
// Domain-only for now, mirroring `element-type.ts`'s own Phase-2 history:
// no `satisfies readonly ValidatedReviewSessionStatus[]` gate yet, because
// `@sf-manager/validation` does not export this type until Phase 5
// (tasks.md 5.3). The gate will be wired then, closing this deviation
// explicitly rather than silently.
//
// design.md Decision 8: `signed` is deliberately NOT declared — the enum
// stays binary until FR-010 adds it with one `ALTER TYPE ... ADD VALUE`.
export const REVIEW_SESSION_STATUSES = ['draft', 'completed'] as const;
export type ReviewSessionStatus = (typeof REVIEW_SESSION_STATUSES)[number];
