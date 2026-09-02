import type { ElementType as ValidatedElementType } from '@sf-manager/validation';

// design.md Decision 1 — the `ElementType` three-way-declaration seam. This
// is the authoritative TypeScript union; the Postgres enum
// (`enum ElementType` in schema.prisma) and the Zod schema
// (`elementTypeSchema`, packages/validation) are each a separate projection
// of the same set of values. Mirrors the const-array + derived-union shape
// of `MAINTENANCE_ROLES` (packages/validation/src/users/create-user.schema.ts).
//
// `satisfies` is the compile-time gate for the domain ⊆ Zod direction:
// adding a member here without adding it to elementTypeSchema fails the
// build. This closes the deviation noted in Phase 2 (tasks.md 2.1) — Phase 5
// (tasks.md 5.7) now exports `ElementType` from `@sf-manager/validation`, so
// the gate can be wired. The other two gates (Prisma <-> domain via the
// mapper's direct assignment, Zod -> domain via the controller's typed
// input) land in Phase 6 as designed.
export const ELEMENT_TYPES = [
  'EXTINGUISHER',
] as const satisfies readonly ValidatedElementType[];
export type ElementType = (typeof ELEMENT_TYPES)[number];
