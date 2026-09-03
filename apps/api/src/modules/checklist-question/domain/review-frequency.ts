// design.md Decision 1 — the `ReviewFrequency` three-way-declaration seam.
// This is the authoritative TypeScript union; the Postgres enum
// (`enum ReviewFrequency` in schema.prisma, PR 1) and the Zod schema
// (`reviewFrequencySchema`, packages/validation) are each a separate
// projection of the same set of values. Mirrors the const-array + derived-
// union shape of `ELEMENT_TYPES`
// (inspectable-element/domain/element-type.ts).
//
// The `satisfies readonly ValidatedReviewFrequency[]` compile-time gate
// (design.md Decision 1) is wired once `reviewFrequencySchema` ships from
// `@sf-manager/validation` (Phase 3, tasks.md 3.7) — mirrors
// `element-type.ts`'s own history (Phase 2 domain-only -> Phase 5 gate
// wiring once the validation package exported the type).
export const REVIEW_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];
