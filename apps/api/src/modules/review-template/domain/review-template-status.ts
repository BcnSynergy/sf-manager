import type { ReviewTemplateStatus as ValidatedReviewTemplateStatus } from '@sf-manager/validation';

// design.md Decision 1 — the `ReviewTemplateStatus` three-way-declaration
// seam, the fourth closed catalog in this slice (design.md Findings #4).
// Mirrors `checklist-question/domain/review-frequency.ts`'s const-array +
// derived-union shape exactly.
//
// `satisfies` is the compile-time gate for the domain ⊆ Zod direction:
// adding a member here without adding it to `reviewTemplateStatusSchema`
// fails the build. This closes the deviation noted at Phase 7 (tasks.md
// 7.1) — Phase 8 (tasks.md 8.8) now exports `ReviewTemplateStatus` from
// `@sf-manager/validation`, so the gate can be wired, mirroring
// `review-frequency.ts`'s own history (Phase 2 domain-only -> Phase 3 gate
// wiring once the validation package exported the type).
export const REVIEW_TEMPLATE_STATUSES = [
  'draft',
  'active',
  'retired',
] as const satisfies readonly ValidatedReviewTemplateStatus[];
export type ReviewTemplateStatus = (typeof REVIEW_TEMPLATE_STATUSES)[number];
