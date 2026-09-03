// design.md Decision 1 — the `ReviewTemplateStatus` three-way-declaration
// seam, the fourth closed catalog in this slice (design.md Findings #4).
// Mirrors `checklist-question/domain/review-frequency.ts`'s const-array +
// derived-union shape exactly.
//
// UNLIKE `review-frequency.ts`, the `as const satisfies readonly
// ValidatedReviewTemplateStatus[]` compile-time gate is deliberately
// DEFERRED here, not wired: `packages/validation` has no `review-template`
// sub-package yet (that lands in Phase 8, tasks.md 8.8, which exports
// `ReviewTemplateStatus`/`reviewTemplateStatusSchema`). This mirrors
// `review-frequency.ts`'s own history exactly — Phase 2 (tasks.md 2.1)
// shipped it domain-only, plain `as const`, and only Phase 3 (tasks.md 3.7),
// once `@sf-manager/validation` exported the type, wired the `satisfies`
// gate. Phase 8 must add the same gate here once
// `packages/validation/src/review-template/**` exists — do not forget it.
export const REVIEW_TEMPLATE_STATUSES = ['draft', 'active', 'retired'] as const;
export type ReviewTemplateStatus = (typeof REVIEW_TEMPLATE_STATUSES)[number];
