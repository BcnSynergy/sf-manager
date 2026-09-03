import type { ReviewFrequency as ValidatedReviewFrequency } from '@sf-manager/validation';

// design.md Decision 1 — the `ReviewFrequency` three-way-declaration seam.
// This is the authoritative TypeScript union; the Postgres enum
// (`enum ReviewFrequency` in schema.prisma, PR 1) and the Zod schema
// (`reviewFrequencySchema`, packages/validation) are each a separate
// projection of the same set of values. Mirrors the const-array + derived-
// union shape of `ELEMENT_TYPES`
// (inspectable-element/domain/element-type.ts).
//
// `satisfies` is the compile-time gate for the domain ⊆ Zod direction:
// adding a member here without adding it to `reviewFrequencySchema` fails
// the build. This closes the deviation noted at Phase 2 (tasks.md 2.1) —
// Phase 3 (tasks.md 3.7) now exports `ReviewFrequency` from
// `@sf-manager/validation`, so the gate can be wired, mirroring
// `element-type.ts`'s own history (Phase 2 domain-only -> Phase 5 gate
// wiring once the validation package exported the type, commit
// `d089817`). The other two gates (Postgres <-> domain via the mapper's
// direct assignment, Zod -> domain via the controller's typed input) land
// in Phase 4 as designed.
export const REVIEW_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
] as const satisfies readonly ValidatedReviewFrequency[];
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];
