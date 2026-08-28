import { z } from 'zod';

// design.md Decision 3: a unique index on the raw taxId column means
// "B12345678", "b12345678" and " B12345678 " would be three different tax
// ids, undermining the uniqueness guarantee. Canonicalized the same way
// `email` is (`.trim().toLowerCase()` there) — uppercase here because
// Spanish CIF/NIF are conventionally uppercase; the value is
// case-insensitive alphanumeric either way. Normalization lives in the
// schema, not the column (same accepted exposure as email).
export const taxIdSchema = z.string().trim().toUpperCase().min(1);

// design.md Interfaces/Contracts (POST /maintenance-companies) +
// maintenance-company-management spec.md "Create Maintenance Company":
// `name`, `taxId`, `contactInfo` are all required; `id`/`deletedAt` are
// server-generated (never accepted from the request body). All plain fields
// — no Value Objects (design.md Decision 3).
export const createMaintenanceCompanySchema = z.object({
  name: z.string().trim().min(1),
  taxId: taxIdSchema,
  contactInfo: z.string().trim().min(1),
});

export type CreateMaintenanceCompanyRequest = z.infer<
  typeof createMaintenanceCompanySchema
>;

// design.md Interfaces/Contracts (PATCH /maintenance-companies/:id) +
// maintenance-company-management spec.md "Update Maintenance Company": all
// three fields are optional; UpdateMaintenanceCompanyUseCase applies only
// the fields actually present.
export const updateMaintenanceCompanySchema = z.object({
  name: z.string().trim().min(1).optional(),
  taxId: taxIdSchema.optional(),
  contactInfo: z.string().trim().min(1).optional(),
});

export type UpdateMaintenanceCompanyRequest = z.infer<
  typeof updateMaintenanceCompanySchema
>;
