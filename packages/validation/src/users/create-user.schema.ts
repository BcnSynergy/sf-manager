import { z } from 'zod';
import { passwordSchema } from './password.schema';

// authorization spec ("Role Enum Declaration") + design.md Decision 5: all 5
// declared roles are assignable at creation even though only SYSTEM_ADMIN is
// operational in this slice — enforcing "operational" is the
// RolePermissionChecker's job (auth/infrastructure/authorization), not this
// schema's. Exported so update-user.schema.ts shares the same rule instead
// of duplicating the literal list (ADR-015).
export const roleSchema = z.enum([
  'SYSTEM_ADMIN',
  'MANAGER',
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
  'COMMUNITY_REPRESENTATIVE',
]);

// Single source of truth for the Role type across every client of this
// package (ADR-015). apps/web imports this type-only — it never imports
// zod directly, keeping the runtime dependency confined to this package.
export type Role = z.infer<typeof roleSchema>;

// design.md Interfaces/Contracts (POST /users). Trim/lowercase before the
// email-format check, mirroring loginRequestSchema. `password` reuses the
// same passwordSchema imported by users/domain/password.ts's PlainPassword
// VO (design.md Decision 6) — one source of truth, both layers validate it.
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: passwordSchema,
  role: roleSchema,
});

export type CreateUserRequest = z.infer<typeof createUserSchema>;
