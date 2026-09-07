import type { ReviewSessionStatus as ValidatedReviewSessionStatus } from '@sf-manager/validation';

// design.md Decision 9 — the ReviewSessionStatus three-way-declaration
// seam. This is the authoritative TypeScript union; the Postgres enum
// (`enum ReviewSessionStatus` in schema.prisma) and the Zod schema
// (`packages/validation`, task 4.13) are each a separate projection of the
// same set of values. Mirrors the const-array + derived-union shape of
// `REVIEW_FREQUENCIES` (checklist-question/domain/review-frequency.ts).
//
// `satisfies` is the compile-time gate for the domain ⊆ Zod direction,
// wired here (Phase 4, task 4.13) now that `@sf-manager/validation` exports
// `ReviewSessionStatus` — closes the deviation noted at Phase 3 (tasks.md
// 3.4), mirroring `review-template-status.ts`'s own Phase 7 -> Phase 8
// history.
//
// design.md Decision 8: `signed` is deliberately NOT declared — the enum
// stays binary until FR-010 adds it with one `ALTER TYPE ... ADD VALUE`.
export const REVIEW_SESSION_STATUSES = [
  'draft',
  'completed',
] as const satisfies readonly ValidatedReviewSessionStatus[];
export type ReviewSessionStatus = (typeof REVIEW_SESSION_STATUSES)[number];
