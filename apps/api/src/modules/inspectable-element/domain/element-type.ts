// design.md Decision 1 — the `ElementType` three-way-declaration seam. This
// is the authoritative TypeScript union; the Postgres enum
// (`enum ElementType` in schema.prisma) and the Zod schema
// (`elementTypeSchema`, packages/validation) are each a separate projection
// of the same set of values. Mirrors the const-array + derived-union shape
// of `MAINTENANCE_ROLES` (packages/validation/src/users/create-user.schema.ts).
//
// Deviation from design.md Decision 1, noted (not silent): the domain -> Zod
// compile-time gate (`as const satisfies readonly ValidatedElementType[]`
// against a type imported from `@sf-manager/validation`) cannot be wired
// yet. `@sf-manager/validation` does not export an `ElementType` type until
// Phase 5 creates
// packages/validation/src/inspectable-element/inspectable-element.schema.ts
// (tasks.md Phase 5, item 5.7); importing it now would fail to compile
// against the currently-published package. This file declares the
// authoritative union standalone; Phase 5 adds the `satisfies` gate once the
// Zod schema exists, closing that edge of the seam. The other two gates
// (Prisma <-> domain via the mapper's direct assignment, Zod -> domain via
// the controller's typed input) are unaffected and land in Phases 5-6 as
// designed.
export const ELEMENT_TYPES = ['EXTINGUISHER'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];
