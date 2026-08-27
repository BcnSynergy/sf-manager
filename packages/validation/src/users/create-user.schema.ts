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

// maintenance-company design.md Decision 5 / Interfaces: the same predicate
// drives this schema's `.superRefine`, the domain policy
// (users/domain/maintenance-company-assignment.policy.ts), and the web
// form's show/hide of the company selector (Phase 11). Exported so every
// consumer shares one source of truth for "which roles need a company"
// instead of re-deriving the role list (ADR-015).
export const MAINTENANCE_ROLES = [
  'MAINTENANCE_COMPANY_MANAGER',
  'MAINTENANCE_TECHNICIAN',
] as const satisfies readonly Role[];

export function isMaintenanceRole(role: Role): boolean {
  return (MAINTENANCE_ROLES as readonly string[]).includes(role);
}

// Shared by both createUserSchema and updateUserSchema's `.superRefine`
// (update-user.schema.ts) — one source of truth for the "maintenanceCompanyId
// required iff role is maintenance-side, forbidden otherwise" rule, instead
// of two near-identical superRefine bodies with the same issue shapes.
export function applyMaintenanceCompanyRefinement(
  role: Role,
  maintenanceCompanyId: string | undefined,
  ctx: z.RefinementCtx,
): void {
  const requiresCompany = isMaintenanceRole(role);
  if (requiresCompany && maintenanceCompanyId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['maintenanceCompanyId'],
      message: `Role "${role}" requires a maintenanceCompanyId`,
    });
  }
  if (!requiresCompany && maintenanceCompanyId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['maintenanceCompanyId'],
      message: `Role "${role}" does not accept a maintenanceCompanyId`,
    });
  }
}

// design.md Interfaces/Contracts (POST /users). Trim/lowercase before the
// email-format check, mirroring loginRequestSchema. `password` reuses the
// same passwordSchema imported by users/domain/password.ts's PlainPassword
// VO (design.md Decision 6) — one source of truth, both layers validate it.
//
// maintenance-company design.md Decision 5, shapes 1 & 2 — user-management
// spec.md "Create User": `maintenanceCompanyId` is required iff the role is
// maintenance-side, and forbidden otherwise. This is the primary gate for
// the HTTP path (ZodValidationPipe) and the web form; the domain policy
// (assertCompanyMatchesRole) is the backstop for writers that bypass this
// pipe (e.g. `prisma/seed.ts`).
export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: passwordSchema,
    role: roleSchema,
    maintenanceCompanyId: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    applyMaintenanceCompanyRefinement(data.role, data.maintenanceCompanyId, ctx);
  });

export type CreateUserRequest = z.infer<typeof createUserSchema>;
