import { z } from 'zod';

// design.md Decision 5: `locale` is a plain closed-set field (ADR-007), not
// a Value Object — same precedent as `roleSchema` on the users side. The
// three values mirror the Prisma `enum Locale { en es ca }`
// (apps/api/prisma/schema.prisma) — this schema is the shared source of
// truth (design.md Decision 5).
export const localeSchema = z.enum(['en', 'es', 'ca']);

export type Locale = z.infer<typeof localeSchema>;

// design.md Interfaces/Contracts (POST /communities) + community-management
// spec.md "Create Community": `name`, `address`, `locale` are all required;
// `id`/`deletedAt` are server-generated (never accepted from the request
// body).
export const createCommunitySchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  locale: localeSchema,
});

export type CreateCommunityRequest = z.infer<typeof createCommunitySchema>;

// design.md Interfaces/Contracts (PATCH /communities/:id) +
// community-management spec.md "Update Community": all three fields are
// optional; UpdateCommunityUseCase applies only the fields actually present.
export const updateCommunitySchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  locale: localeSchema.optional(),
});

export type UpdateCommunityRequest = z.infer<typeof updateCommunitySchema>;

// design.md Decision 4 (POST /communities/:id/representatives): only
// `userId` is accepted in the body — `communityId` comes from the route
// param, `id`/`deactivatedAt` are server-managed (tasks.md 8.3).
export const addRepresentativeSchema = z.object({
  userId: z.string().trim().min(1),
});

export type AddRepresentativeRequest = z.infer<typeof addRepresentativeSchema>;

// design.md Decision 4 (POST /communities/:id/technicians): same shape as
// addRepresentativeSchema — only `userId` is accepted in the body
// (tasks.md 9.6). Declared separately, not aliased, so the two request
// types can diverge independently if a future slice adds
// technician-specific fields (ADR-006 — no premature abstraction).
export const addTechnicianSchema = z.object({
  userId: z.string().trim().min(1),
});

export type AddTechnicianRequest = z.infer<typeof addTechnicianSchema>;
