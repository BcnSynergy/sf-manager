import { z } from 'zod';

// design.md Decision 1: the Zod projection of the ElementType three-way
// seam. Authoritative order is domain (apps/api) -> this schema; the domain
// union (`ELEMENT_TYPES`, apps/api/src/modules/inspectable-element/domain/
// element-type.ts) gates against this type via `satisfies`. Only one value
// in v1 (proposal, Out of Scope).
export const elementTypeSchema = z.enum(['EXTINGUISHER']);

export type ElementType = z.infer<typeof elementTypeSchema>;

// design.md Interfaces (POST /communities/:communityId/inspectable-elements)
// + inspectable-element-management spec.md "Create Inspectable Element
// Under a Community": elementType/name/location/installedAt required;
// description/serialNumber optional. `id`/`communityId`/`deletedAt` are
// server-generated or path-derived, never accepted from the request body.
// All plain fields — no Value Objects (design.md Decision 2).
export const createInspectableElementSchema = z.object({
  elementType: elementTypeSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1).optional(),
  // 'YYYY-MM-DD' (design.md Decision 3) — a future date is deliberately
  // allowed, no `.refine()` rejecting it.
  installedAt: z.iso.date(),
});

export type CreateInspectableElementRequest = z.infer<
  typeof createInspectableElementSchema
>;

// design.md Interfaces (PATCH .../inspectable-elements/:elementId) +
// inspectable-element-management spec.md "Update Inspectable Element":
// elementType and communityId are NOT part of this schema — an element does
// not move between communities and does not change type in this slice
// (design.md Interfaces, InspectableElementRepository.updateById comment).
//
// `.nullable()` on description/serialNumber is the ONLY way to clear a
// mistyped serial number or an obsolete description; without it the field
// is write-once forever. Explicit `null` clears the field, an absent key
// leaves it alone.
export const updateInspectableElementSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  location: z.string().trim().min(1).optional(),
  serialNumber: z.string().trim().min(1).nullable().optional(),
  installedAt: z.iso.date().optional(),
});

export type UpdateInspectableElementRequest = z.infer<
  typeof updateInspectableElementSchema
>;
